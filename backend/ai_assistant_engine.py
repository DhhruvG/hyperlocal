"""LocalPrice AI Assistant Engine.

Provides role-aware, context-aware, data-grounded conversational intelligence
for Consumers, Retail Sellers, Mobile Vendors, and Super Admins.
Fully supports English, Hindi (Devanagari), and Hinglish (Romanized Hindi).
Strictly enforces backend authorization: ordinary users cannot access private vendor
analytics or admin data; sellers cannot view competitor metrics.
"""

import os
import re
import json
import uuid
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
import httpx
from bson import ObjectId

logger = logging.getLogger("localprice_ai")

EMERGENT_API_URL = "https://integrations.emergentagent.com/llm/v1/chat/completions"
DEFAULT_MODEL = "gemini/gemini-2.5-flash"

# ---------------------------------------------------------------------------
# CONSTANTS & LEXICONS
# ---------------------------------------------------------------------------

DISCLAIMER_TEXT = "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement."

SYSTEM_KNOWLEDGE = """You are LocalPrice AI, the official intelligent conversational assistant for the HyperLocal Marketplace platform in Dehradun, Uttarakhand, India.
You possess deep, comprehensive knowledge of every part of the application, architecture, workflows, roles, and databases:

1. PLATFORM OVERVIEW & CORE MISSION:
- HyperLocal Marketplace connects local shoppers with nearby fixed retail shops and mobile street-cart vendors.
- Core philosophy: 'Find Local -> Compare Nearby -> Connect -> Visit/Buy -> Return'.
- Attribution policy: Multi-signal attribution (GPS, dwell, dual confirmations) rather than QR codes alone. Non-causal disclaimer is mandatory on all business analytics:
  "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement."

2. USER ROLES & PERMISSIONS:
- Consumer: Can browse products, compare prices across nearby shops, view availability freshness scores, calculate cheapest basket (Single-Store convenience vs Multi-Store savings), view live vendor locations on map, chat with sellers, save products, post 'I Need' demand requests with budget and locality, confirm visits/purchases, report grievances.
- Retail Seller: Physical fixed store. Can manage product listings, update prices/availability, view Business Impact Dashboard (reported sales, baseline comparison, verified visits, attributed revenue), stockout risk predictor, price intelligence, Pro subscription plan.
- Mobile / Street Cart Vendor: Mobile moving cart. Live GPS tracking, online/offline status, Demand Hotspots map view, matching nearby customer demand requests within 3-5 km, Smart Route optimization.
- Super Admin: Full administrative control center at /admin, user management, vendor verification, product moderation, grievance redressal under SLA, attribution session audit, fraud graph anomaly detection, marketplace balancing (category supply-demand ratios), and the 45 Smart Features Registry with the Master Kill-Switch.

3. PRODUCT CATEGORIES (12 standard categories):
- Vegetables, Fruits, Groceries, Dairy, Bakery, Stationery, Clothing, Household, Hardware, Pharmacy, Flowers, Other.

4. DATABASE COLLECTIONS & SCHEMA ARCHITECTURE:
- `users`: accounts, roles (consumer, vendor, admin), vendor_type (retailer, cart_vendor), shop_name, shop_address, city (Dehradun), coordinates (lat, lng), ratings, review_count, is_verified, is_online, is_pro.
- `products`: catalog items, vendor_id, shop_name, price, unit (kg, g, packet, liter), in_stock, is_featured, availability freshness score.
- `grievances`: tickets with grievance_number (HL-GRV-YYYY-XXXXXX), complainant_user_id, category (Price, Product, Seller, etc.), priority (low 72h, medium 48h, high 24h, urgent 4h SLA), status (open, under_review, resolved).
- `reviews`: customer feedback, 1-5 star ratings, comments.
- `demand_requests`: open consumer demand specify item, quantity, max_price, locality.
- `verified_visits`: multi-signal physical visits confirmed via GPS, geofence, dual confirmation.
- `purchase_attributions`: revenue attributed to platform discovery.
- `seller_baselines`: historical baseline sales and customer volume before platform launch.
- `smart_features`: 45-feature registry across Tier 1, Tier 2, Tier 3 with master switch control.
- `knowledge_docs`: platform policy and help articles.
- `marketplace_orders`: in-app checkout orders with order_id (HL-ORD-YYYY-XXXXXX), items, price-locked snapshot, total_amount, checkout_mode (RESERVE_AT_SHOP, PAY_THROUGH_HYPERLOCAL), order_status (PENDING_SELLER_CONFIRMATION, CONFIRMED, READY_FOR_PICKUP, COMPLETED, CANCELLED, REFUNDED), payment_status (PAID, PENDING_PAYMENT, NOT_REQUIRED).
- `invoices`: digital invoices with invoice_id (HL-INV-YYYY-XXXXXX), line items, seller/shopper details, taxes, payment status, printable format.
- `carts`: active shopping carts supporting multi-seller items with seller grouping and attribution source tracking.
- `billing_payments`: verified payments with payment_id (HL-PAY-YYYY-XXXXXX), amount, provider, status (SUCCESS, FAILED).
- `billing_settings`: master emergency switches and feature flags for checkout, billing, cash, and online payments.

5. COMMUNICATION & BEHAVIOR RULES:
- Be dynamic, conversational, helpful, concise, and professional.
- Match the user's language: respond in English for English, हिन्दी (Devanagari) for Hindi, and Hinglish (Roman script Hindi) for Hinglish queries.
- Adhere strictly to data grounding: quote the provided [VERIFIED DATABASE DATA]. Never invent store names, fake prices, or false grievance tickets.
- Enforce backend permissions: if a consumer asks for private vendor sales or admin stats, politely inform them that those metrics require seller or admin access.
- For greeting messages (e.g. 'hi', 'hello'), greet warmly as LocalPrice AI and offer help with products, pricing, and grievances.
"""

DEFAULT_LAT = 30.3165
DEFAULT_LNG = 78.0322

async def generate_llm_reply(messages: List[Dict[str, str]], model: str = DEFAULT_MODEL, max_tokens: int = 2500) -> Optional[str]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key or api_key.startswith("sk-placeholder"):
        return None
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.25,
    }
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(EMERGENT_API_URL, headers=headers, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    choice = choices[0]
                    finish_reason = choice.get("finish_reason")
                    content = (choice.get("message", {}).get("content") or "").strip()
                    # Reject truncated output that got cut off mid-sentence due to token limits
                    if finish_reason == "length" and len(content) < 250:
                        return None
                    if content:
                        return content
    except Exception as e:
        logger.debug(f"LLM completion non-fatal error: {e}")
    return None

INTENTS = [
    "GREETING", "GENERAL_HELP", "PRODUCT_SEARCH", "PRODUCT_DETAILS",
    "PRICE_COMPARISON", "CHEAPEST_PRODUCT", "NEARBY_SELLER", "SELLER_SEARCH",
    "ALL_SHOPS_AND_CARTS", "MY_CART_QUERY", "SAVED_PRODUCTS_QUERY",
    "AVAILABILITY", "SELLER_DETAILS", "REVIEWS", "DIRECTIONS", "SHOPPING_LIST",
    "PRODUCT_REQUEST", "GRIEVANCE", "GRIEVANCE_STATUS", "CREATE_GRIEVANCE",
    "ORDER_QUERY", "PURCHASE_QUERY", "VISIT_QUERY", "SALES_ANALYTICS",
    "BUSINESS_ANALYTICS", "INVENTORY", "DEMAND_ANALYTICS", "PRICE_ANALYTICS",
    "RECOMMENDATION", "NOTIFICATION", "ACCOUNT_HELP", "TECHNICAL_HELP",
    "LANGUAGE_CHANGE", "GENERAL_CONVERSATION", "UNKNOWN"
]

# Multilingual Hindi/English/Hinglish synonym dictionary
SYNONYM_MAP = {
    "tamatar": ["tomato", "tomatoes", "टमाटर"],
    "tomato": ["tamatar", "tomatoes", "टमाटर"],
    "tomatoes": ["tomato", "tamatar", "टमाटर"],
    "pyaaz": ["onion", "onions", "kanda", "pyaz", "प्याज"],
    "pyaz": ["onion", "onions", "kanda", "pyaaz", "प्याज"],
    "kanda": ["onion", "onions", "pyaaz", "pyaz", "प्याज"],
    "onion": ["pyaaz", "pyaz", "kanda", "onions", "प्याज"],
    "onions": ["onion", "pyaaz", "pyaz", "kanda", "प्याज"],
    "aloo": ["potato", "potatoes", "batata", "aalu", "alu", "आलू"],
    "aalu": ["potato", "potatoes", "aloo", "batata", "आलू"],
    "batata": ["potato", "potatoes", "aloo", "आलू"],
    "potato": ["aloo", "batata", "potatoes", "आलू"],
    "potatoes": ["potato", "aloo", "batata", "आलू"],
    "gajar": ["carrot", "carrots", "गाजर"],
    "carrot": ["gajar", "carrots", "गाजर"],
    "carrots": ["carrot", "gajar", "गाजर"],
    "adrak": ["ginger", "अदरक"],
    "ginger": ["adrak", "अदरक"],
    "lehsun": ["garlic", "lasan", "lahsun", "लहसुन"],
    "lasan": ["garlic", "lehsun", "lahsun", "लहसुन"],
    "garlic": ["lehsun", "lasan", "लहसुन"],
    "mirchi": ["chili", "chilli", "chillies", "green chili", "green chilli", "hari mirch", "मिर्च", "हरी मिर्च"],
    "chili": ["mirchi", "hari mirch", "chilli", "मिर्च"],
    "chilli": ["mirchi", "hari mirch", "chili", "मिर्च"],
    "dhania": ["coriander", "cilantro", "dhaniya", "hara dhania", "धनिया", "हरा धनिया"],
    "dhaniya": ["coriander", "cilantro", "dhania", "धनिया"],
    "coriander": ["dhania", "dhaniya", "cilantro", "धनिया"],
    "pudina": ["mint", "पुदीना"],
    "mint": ["pudina", "पुदीना"],
    "palak": ["spinach", "पालक"],
    "spinach": ["palak", "पालक"],
    "gobhi": ["cauliflower", "cabbage", "phool gobhi", "gobi", "गोभी", "फूल गोभी"],
    "cauliflower": ["phool gobhi", "gobhi", "गोभी", "फूल गोभी"],
    "cabbage": ["patta gobhi", "band gobhi", "gobhi", "पत्ता गोभी"],
    "bhindi": ["okra", "ladyfinger", "भिंडी"],
    "okra": ["bhindi", "ladyfinger", "भिंडी"],
    "ladyfinger": ["bhindi", "okra", "भिंडी"],
    "baingan": ["brinjal", "eggplant", "बैंगन"],
    "brinjal": ["baingan", "eggplant", "बैंगन"],
    "eggplant": ["brinjal", "baingan", "बैंगन"],
    "kheera": ["cucumber", "kakdi", "खीरा"],
    "cucumber": ["kheera", "kakdi", "खीरा"],
    "nimbu": ["lemon", "lemons", "lime", "neembu", "नींबू"],
    "lemon": ["nimbu", "lemons", "lime", "नींबू"],
    "doodh": ["milk", "dudh", "दूध"],
    "dudh": ["milk", "doodh", "दूध"],
    "milk": ["doodh", "dudh", "दूध"],
    "dahi": ["curd", "yogurt", "दही"],
    "curd": ["dahi", "yogurt", "दही"],
    "paneer": ["cottage cheese", "पनीर"],
    "makkhan": ["butter", "मक्खन"],
    "butter": ["makkhan", "मक्खन"],
    "chawal": ["rice", "chaawal", "basmati", "चावल"],
    "chaawal": ["rice", "chawal", "basmati", "चावल"],
    "rice": ["chawal", "chaawal", "basmati", "चावल"],
    "basmati": ["rice", "chawal", "chaawal", "बासमती"],
    "atta": ["wheat flour", "aata", "flour", "आटा"],
    "aata": ["wheat flour", "atta", "flour", "आटा"],
    "flour": ["atta", "aata", "wheat flour", "आटा"],
    "cheeni": ["sugar", "shakkar", "चीनी"],
    "sugar": ["cheeni", "shakkar", "चीनी"],
    "namak": ["salt", "नमक"],
    "salt": ["namak", "नमक"],
    "tel": ["oil", "cooking oil", "mustard oil", "तेल"],
    "oil": ["tel", "mustard oil", "cooking oil", "तेल"],
    "dal": ["lentils", "daal", "pulses", "दाल"],
    "daal": ["lentils", "dal", "pulses", "दाल"],
    "haldi": ["turmeric", "हल्दी"],
    "turmeric": ["haldi", "हल्दी"],
    "jeera": ["cumin", "जीरा"],
    "cumin": ["jeera", "जीरा"],
    "chai": ["tea", "chai patti", "चाय"],
    "tea": ["chai", "chai patti", "चाय"],
    "kela": ["banana", "bananas", "kele", "केला"],
    "kele": ["banana", "bananas", "kela", "केला"],
    "banana": ["kela", "bananas", "kele", "केला"],
    "bananas": ["banana", "kela", "kele", "केला"],
    "seb": ["apple", "apples", "सेब"],
    "apple": ["seb", "apples", "सेब"],
    "apples": ["apple", "seb", "सेब"],
    "aam": ["mango", "mangoes", "आम"],
    "mango": ["aam", "mangoes", "आम"],
    "mangoes": ["mango", "aam", "आम"],
    "santra": ["orange", "oranges", "santre", "संतरा"],
    "santre": ["orange", "oranges", "santra", "संतरा"],
    "orange": ["santra", "oranges", "santre", "संतरा"],
    "oranges": ["orange", "santra", "santre", "संतरा"],
    "bread": ["bakery", "pav", "ब्रेड"],
    "rusk": ["toast", "bakery", "रस्क"],
    "biscuit": ["biscuits", "parle-g", "बिस्कुट"],
    "biscuits": ["biscuit", "parle-g", "बिस्कुट"],
    "egg": ["eggs", "anda", "ande", "अंडा"],
    "eggs": ["egg", "anda", "ande", "अंडा"],
    "anda": ["egg", "eggs", "अंडा"],
    "paracetamol": ["paracetamol strip", "medicine", "dawai", "dawa", "pharmacy", "पैरासिटामोल", "दवाई"],
    "dawai": ["paracetamol", "paracetamol strip", "medicine", "pharmacy", "दवाई"],
    "medicine": ["paracetamol", "paracetamol strip", "dawai", "pharmacy", "दवाई"],
    "tshirt": ["t-shirt", "cotton t-shirt", "shirt", "clothing", "टी-शर्ट"],
    "shirt": ["t-shirt", "cotton t-shirt", "clothing", "टी-शर्ट"],
    "detergent": ["detergent powder", "washing powder", "surf", "household", "डिटर्जेंट"],
    "surf": ["detergent", "detergent powder", "washing powder", "डिटर्जेंट"],
    "notebook": ["copy", "register", "stationery", "नोटबुक", "कॉपी"],
    "copy": ["notebook", "stationery", "कॉपी"],
    "vegetable": ["vegetables", "sabzi", "sabji", "सब्जी"],
    "vegetables": ["vegetable", "sabzi", "sabji", "सब्जी"],
    "sabzi": ["vegetables", "vegetable", "sabji", "सब्जी"],
    "sabji": ["vegetables", "vegetable", "sabzi", "सब्जी"],
    "fruit": ["fruits", "phal", "फल"],
    "fruits": ["fruit", "phal", "फल"],
    "phal": ["fruits", "fruit", "फल"],
    "dairy": ["milk", "curd", "butter", "paneer", "doodh", "dahi", "डेयरी"],
    "bakery": ["bread", "rusk", "biscuit", "बेकरी"],
    "grocery": ["groceries", "kirana", "ration", "किराना"],
    "groceries": ["grocery", "kirana", "ration", "किराना"],
    "kirana": ["groceries", "grocery", "ration", "किराना"],
    # Hindi script
    "टमाटर": ["tomato", "tomatoes", "tamatar"],
    "प्याज": ["onion", "onions", "pyaaz", "pyaz"],
    "आलू": ["potato", "potatoes", "aloo"],
    "गाजर": ["carrot", "carrots", "gajar"],
    "गोभी": ["cauliflower", "gobhi"],
    "फूल गोभी": ["cauliflower", "gobhi"],
    "दूध": ["milk", "doodh"],
    "दही": ["curd", "dahi"],
    "मक्खन": ["butter", "makkhan"],
    "ब्रेड": ["bread"],
    "रस्क": ["rusk"],
    "चावल": ["rice", "chawal", "basmati"],
    "आटा": ["atta", "wheat flour"],
    "चीनी": ["sugar", "cheeni"],
    "नमक": ["salt", "namak"],
    "तेल": ["oil", "tel"],
    "दाल": ["dal", "lentils"],
    "केला": ["banana", "bananas", "kela"],
    "सेब": ["apple", "apples", "seb"],
    "संतरा": ["orange", "oranges", "santra"],
    "पनीर": ["paneer", "cottage cheese"],
    "अदरक": ["ginger", "adrak"],
    "लहसुन": ["garlic", "lehsun"],
    "पालक": ["spinach", "palak"],
    "धनिया": ["coriander", "dhania"],
    "बैंगन": ["brinjal", "baingan"],
    "भिंडी": ["okra", "bhindi"],
    "सब्जी": ["vegetables", "vegetable", "sabzi"],
    "सब्ज़ियाँ": ["vegetables", "vegetable", "sabzi"],
    "फल": ["fruits", "fruit", "phal"],
    "दवाई": ["paracetamol", "medicine", "dawai", "pharmacy"],
    "नोटबुक": ["notebook", "copy", "stationery"],
    "कॉपी": ["notebook", "copy", "stationery"],
    "डिटर्जेंट": ["detergent", "detergent powder"],
}

CANONICAL_PRODUCT_GROUP = {
    "tamatar": "tomato", "tomato": "tomato", "tomatoes": "tomato", "टमाटर": "tomato",
    "aloo": "potato", "aalu": "potato", "batata": "potato", "potato": "potato", "potatoes": "potato", "आलू": "potato",
    "pyaaz": "onion", "pyaz": "onion", "kanda": "onion", "onion": "onion", "onions": "onion", "प्याज": "onion",
    "gajar": "carrot", "carrot": "carrot", "carrots": "carrot", "गाजर": "carrot",
    "gobhi": "cauliflower", "cauliflower": "cauliflower", "गोभी": "cauliflower", "फूल गोभी": "cauliflower",
    "palak": "spinach", "spinach": "spinach", "पालक": "spinach",
    "adrak": "ginger", "ginger": "ginger", "अदरक": "ginger",
    "lehsun": "garlic", "lasan": "garlic", "garlic": "garlic", "लहसुन": "garlic",
    "baingan": "brinjal", "brinjal": "brinjal", "eggplant": "brinjal", "बैंगन": "brinjal",
    "bhindi": "okra", "okra": "okra", "ladyfinger": "okra", "भिंडी": "okra",
    "doodh": "milk", "dudh": "milk", "milk": "milk", "दूध": "milk",
    "dahi": "curd", "curd": "curd", "दही": "curd",
    "makkhan": "butter", "butter": "butter", "मक्खन": "butter",
    "paneer": "paneer", "पनीर": "paneer",
    "seb": "apple", "apple": "apple", "apples": "apple", "सेब": "apple",
    "kela": "banana", "kele": "banana", "banana": "banana", "bananas": "banana", "केला": "banana",
    "santra": "orange", "santre": "orange", "orange": "orange", "oranges": "orange", "संतरा": "orange",
    "aam": "mango", "mango": "mango", "mangoes": "mango", "आम": "mango",
    "chawal": "rice", "chaawal": "rice", "rice": "rice", "basmati": "rice", "चावल": "rice",
    "atta": "atta", "aata": "atta", "flour": "atta", "आटा": "atta",
    "dal": "dal", "daal": "dal", "दाल": "dal",
    "cheeni": "sugar", "sugar": "sugar", "चीनी": "sugar",
    "namak": "salt", "salt": "salt", "नमक": "salt",
    "tel": "oil", "oil": "oil", "तेल": "oil",
    "bread": "bread", "ब्रेड": "bread",
    "rusk": "rusk", "रस्क": "rusk",
    "paracetamol": "paracetamol", "dawai": "paracetamol", "medicine": "paracetamol", "दवाई": "paracetamol",
    "detergent": "detergent", "surf": "detergent", "डिटर्जेंट": "detergent",
    "notebook": "notebook", "copy": "notebook", "नोटबुक": "notebook", "कॉपी": "notebook",
    "tshirt": "t-shirt", "shirt": "t-shirt",
    "vegetable": "vegetables", "vegetables": "vegetables", "sabzi": "vegetables", "sabji": "vegetables", "सब्जी": "vegetables", "सब्ज़ियाँ": "vegetables",
    "fruit": "fruits", "fruits": "fruits", "phal": "fruits", "फल": "fruits",
}

QUERY_STOPWORDS = {
    "where", "can", "i", "buy", "find", "get", "show", "me", "the", "a", "an", "some", "any",
    "cheapest", "lowest", "best", "price", "prices", "rate", "rates", "cost", "of", "for",
    "nearby", "near", "nearest", "closest", "local", "shop", "shops", "store", "stores", "seller", "sellers",
    "vendor", "vendors", "cart", "carts", "listing", "listings", "listed", "list", "have",
    "has", "having", "selling", "sell", "sells", "is", "are", "available", "in", "at", "from",
    "dehradun", "tell", "about", "information", "regarding", "do", "does", "you", "know",
    "who", "which", "what", "how", "much", "many", "there", "here", "please", "want", "need",
    "looking", "search", "check", "compare", "options", "option", "item", "items", "product",
    "products", "kya", "kahan", "kaha", "milega", "milegi", "milenge", "milte", "milta", "milti", "chahiye",
    "sasta", "saste", "sasti", "sabse", "dukan", "dukaan", "dukano", "dukaano", "par", "pe", "per", "me", "mein", "hai", "hain",
    "bhav", "daam", "kitna", "kitne", "kitni", "ka", "ki", "ke", "ko", "batao", "bataye", "bataiye", "dikhao", "dikhaiye",
    "koi", "kisi", "paas", "aas", "se", "lena", "kharidna", "kis", "kon", "kaun", "si", "sa", "konsi", "kaunsi", "konsa", "kaunsa",
    "aur", "and", "or", "ya", "dur", "door", "duri", "distance", "far", "away", "mere", "mera", "meri", "ghar", "home", "house",
    "location", "rupaye", "rupee", "rupees", "rs", "inr", "thela", "thele", "rehri", "mobile", "street", "fixed", "retail", "retailer",
    "online", "open", "verified", "all", "everything", "sab", "sabhi", "saare", "sare", "sari", "saari", "kuch", "total", "my",
    "with", "their", "accessible", "consumer", "customer", "to", "on", "by", "today", "aaj", "abhi", "now", "right",
}


def singularize_word(w: str) -> str:
    w = w.strip().lower()
    if w.endswith("oes") and len(w) > 4:
        return w[:-2]  # tomatoes -> tomato, potatoes -> potato, mangoes -> mango
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("es") and len(w) > 4 and not w.endswith(("ches", "shes", "sses", "xes")):
        if w[:-1] in SYNONYM_MAP:
            return w[:-1]
    if w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
        return w[:-1]
    return w


def extract_all_product_entities(query: str) -> Tuple[Optional[str], List[str], List[str]]:
    """Extract all product terms & synonyms mentioned in an English, Hindi, or Hinglish query."""
    q = (query or "").strip().lower()
    if not q:
        return None, [], []

    padded = f" {q} "
    found_matches: List[Tuple[int, str, List[str], str]] = []
    seen_groups = set()

    # 1. Check SYNONYM_MAP keys and synonym lists, recording match position in query
    for word, syns in SYNONYM_MAP.items():
        all_forms = [word] + list(syns)
        for form in all_forms:
            pattern = r"(?:^|[\s,?.!।/])" + re.escape(form.lower()) + r"(?:$|[\s,?.!।/])"
            m = re.search(pattern, padded)
            if m:
                canonical = singularize_word(word) if word.isascii() else word
                group_key = CANONICAL_PRODUCT_GROUP.get(canonical, CANONICAL_PRODUCT_GROUP.get(word, canonical))
                expanded = list(dict.fromkeys([canonical, word, form] + list(syns)))
                found_matches.append((m.start(), canonical, expanded, group_key))
                break

    # 2. Tokenize query, singularize tokens, and check against SYNONYM_MAP
    tokens = re.findall(r"[a-zA-Z\u0900-\u097F]{2,}", q)
    for tok in tokens:
        sing = singularize_word(tok)
        matched_key = sing if sing in SYNONYM_MAP else (tok if tok in SYNONYM_MAP else None)
        if matched_key:
            syns = SYNONYM_MAP[matched_key]
            group_key = CANONICAL_PRODUCT_GROUP.get(matched_key, matched_key)
            pos = q.find(tok)
            expanded = list(dict.fromkeys([matched_key, tok, sing] + list(syns)))
            found_matches.append((pos if pos >= 0 else 999, matched_key, expanded, group_key))

    if found_matches:
        found_matches.sort(key=lambda x: x[0])
        ordered_terms: List[str] = []
        combined_syns: List[str] = []
        for _, can_term, exp_syns, grp in found_matches:
            if grp not in seen_groups:
                seen_groups.add(grp)
                ordered_terms.append(can_term)
            for s in exp_syns:
                if s not in combined_syns:
                    combined_syns.append(s)
        return ordered_terms[0], combined_syns, ordered_terms

    # 3. Extract candidate non-stopword product token ONLY if it is not a shop/cart/conversational word
    candidate_tokens = [
        t for t in tokens
        if t not in QUERY_STOPWORDS and singularize_word(t) not in QUERY_STOPWORDS and not t.isdigit() and len(t) > 2
    ]
    if candidate_tokens:
        best = singularize_word(candidate_tokens[0])
        variants = list(dict.fromkeys([best, candidate_tokens[0]] + SYNONYM_MAP.get(best, [])))
        return best, variants, [best]

    return None, [], []


def extract_product_entity(query: str) -> Tuple[Optional[str], List[str]]:
    """Robustly extract primary product term & synonyms from English, Hindi, or Hinglish query."""
    primary, syns, _ = extract_all_product_entities(query)
    return primary, syns


def detect_language(text: str) -> str:
    """Identifies English, Hindi (Devanagari), or Hinglish (Romanized Hindi)."""
    if not text:
        return "en"
    for ch in text[:200]:
        if 0x0900 <= ord(ch) <= 0x097F:
            return "hi"
    markers = [
        " kya", " kaise", " kahan", " kaha", " chahiye", " milega", " milegi", " milenge",
        " sasta", " saste", " sasti", " karo", " karu", " meri", " mera", " mere",
        " dukan", " dukaan", " bikri", " shikayat", " paas", " kitna", " kitni", " kitne",
        " bataye", " batao", " bataiye", " dikhao", " dikhaiye", " bhejo", " de do",
        " hai", " hain", " mujhko", " hume", " hamare", " sabse", " kaun", " konsi", " kaunsi",
        " rupaye", " ghar", " thela", " thele", " tamatar", " pyaaz", " pyaz", " aloo", " doodh",
    ]
    low = f" {text.lower()} "
    if any(m in low for m in markers):
        return "hinglish"
    return "en"


def haversine_km(lat1, lng1, lat2, lng2) -> Optional[float]:
    if None in (lat1, lng1, lat2, lng2):
        return None
    try:
        R = 6371.0
        phi1, phi2 = math.radians(float(lat1)), math.radians(float(lat2))
        dphi = math.radians(float(lat2) - float(lat1))
        dlam = math.radians(float(lng2) - float(lng1))
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        return round(2 * R * math.asin(math.sqrt(a)), 2)
    except Exception:
        return None


def format_distance_label(km: Optional[float]) -> Optional[str]:
    if km is None:
        return None
    if km < 1.0:
        return f"{max(50, int(round(km * 1000)))} m"
    return f"{km:.1f} km"


def analyze_query_aspects(query: str) -> Dict[str, bool]:
    q = f" {(query or '').lower()} "
    asks_cheapest = any(w in q for w in [
        "cheapest", "sasta", "saste", "sasti", "sabse sasta", "sabse saste",
        "lowest", "kam daam", "kam rate", "best price", "सस्ता", "सस्ते", "सबसे सस्ता", "कम कीमत", "कम दाम"
    ])
    asks_nearest = any(w in q for w in [
        "nearest", "closest", "sabse paas", "paas wali", "paas me", "near me",
        "मेरे पास", "सबसे पास", "नज़दीक", "नजदीक"
    ])
    asks_distance = asks_nearest or any(w in q for w in [
        "kitni dur", "kitni door", "kitna dur", "kitna door", " dur ", " door ", "duri",
        "distance", "how far", "far from", "ghar se", "from my home", "from home", "कितनी दूर", "दूरी", "घर से"
    ])
    asks_price = asks_cheapest or any(w in q for w in [
        "price", "prices", "rate", "rates", "cost", "kitne rupaye", "kitne ka", "kitne ki",
        "kitne me", "kitne mein", "rupaye", "rupees", "bhav", "daam", "how much", "compare",
        "रुपये", "कीमत", "भाव", "दाम", "कितने"
    ])
    asks_mobile_carts = any(w in q for w in [
        "mobile cart", "mobile carts", "street cart", "street carts", "cart vendor", "cart vendors",
        "thela", "thele", "rehri", "रेहड़ी", "ठेला", "मोबाइल कार्ट", "मोबाइल वेंडर",
        "vegetable cart", "fruit cart", "sabzi cart", "green cart"
    ])
    asks_all_catalog = any(w in q for w in [
        "all shops", "all carts", "all products", "everything", "sabhi dukan", "sabhi dukaan",
        "saari dukan", "sari dukan", "all stores", "shops and carts", "dukaan aur thele",
        "sabhi shops", "all vendors", "सभी दुकान", "सारे उत्पाद"
    ])
    asks_my_cart = any(w in q for w in [
        "my cart", "in my cart", "shopping cart", "mere cart", "mera cart", "cart items",
        "cart total", "view cart", "मेरे कार्ट", "मेरा कार्ट"
    ])
    return {
        "asks_cheapest": asks_cheapest,
        "asks_nearest": asks_nearest,
        "asks_distance": asks_distance,
        "asks_price": asks_price,
        "asks_mobile_carts": asks_mobile_carts,
        "asks_all_catalog": asks_all_catalog,
        "asks_my_cart": asks_my_cart,
    }


# ---------------------------------------------------------------------------
# INTENT & ENTITY CLASSIFICATION
# ---------------------------------------------------------------------------

class IntentDetector:
    """Rule-based and semantic intent and entity extraction."""

    @staticmethod
    def classify(query: str, user_role: str, page: Optional[str] = None, prev_intent: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
        q = (query or "").strip().lower()
        entities: Dict[str, Any] = {}
        aspects = analyze_query_aspects(q)
        entities["aspects"] = aspects
        if aspects.get("asks_mobile_carts") and not any(sw in q for sw in ["shop", "shops", "dukaan", "dukan", "दुकान", "store", "stores"]):
            entities["vendor_type_filter"] = "cart_vendor"

        # Extract budget / numbers
        budget_match = re.search(r"(?:under|below|less than|max|budget|rs\.?|₹|inr)\s*(\d+)", q)
        if budget_match:
            entities["max_price"] = float(budget_match.group(1))

        qty_match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|gm|liter|litre|l|packet|pkt|dozen|darjan)", q)
        if qty_match:
            entities["quantity"] = f"{qty_match.group(1)} {qty_match.group(2)}"

        # Find product keywords (supports multiple products, plurals, Hindi, Hinglish, and lexicon terms)
        prod_term, prod_syns, all_prod_terms = extract_all_product_entities(q)
        if prod_term:
            entities["product_term"] = prod_term
            entities["synonyms"] = prod_syns
            entities["all_product_terms"] = all_prod_terms
            entities["product_terms"] = all_prod_terms
        entities["sort_by"] = "distance" if (aspects.get("asks_nearest") and not aspects.get("asks_cheapest")) else "price"

        # Follow-up detection from previous turns
        if prev_intent in ["PRODUCT_SEARCH", "CHEAPEST_PRODUCT"] and not entities.get("product_term"):
            if "max_price" in entities or "quantity" in entities:
                return "PRODUCT_SEARCH", entities

        # 1. GREETING (Only when query is strictly a short greeting, NOT when attached to a real question)
        clean_greeting = re.sub(r"[^a-zA-Z\u0900-\u097F\s]", "", q).strip()
        if clean_greeting in ["hi", "hello", "hey", "namaste", "pranam", "hola", "greetings", "good morning", "good evening", "namaskar", "नमस्ते", "प्रणाम", "हेलो", "हाय"]:
            return "GREETING", entities

        # 2. GENERAL HELP
        if clean_greeting in ["help", "madad", "kya kar sakte ho", "what can you do", "help me", "options", "मदद"]:
            return "GENERAL_HELP", entities

        # 3. GRIEVANCES
        grievance_words = ["grievance", "complaint", "shikayat", "report", "dispute", "fraud", "issue", "scam", "शिकायत"]
        is_grv_query = any(w in q for w in grievance_words)

        if is_grv_query:
            if any(w in q for w in ["status", "meri", "my", "kya hua", "kya hui", "check", "track", "dikhao", "show", "how many", "open", "kitni", "count", "स्थिति"]):
                return "GRIEVANCE_STATUS", entities
            if any(w in q for w in ["create", "file", "submit", "darj", "report a seller", "report seller", "overcharge", "karna hai", "want to report", "दर्ज"]):
                return "CREATE_GRIEVANCE", entities
            return "GRIEVANCE", entities

        # 4. ADMIN SPECIFIC
        if user_role == "admin" or any(w in q for w in ["marketplace", "platform health", "open grievances", "total sales"]):
            if "grievance" in q or ("open" in q and "case" in q):
                return "GRIEVANCE_STATUS", entities
            if any(w in q for w in ["summarize", "summary", "overview", "briefing", "health"]):
                return "BUSINESS_ANALYTICS", entities

        # 5. CONSUMER SHOPPING CART & SAVED ITEMS
        if aspects.get("asks_my_cart"):
            return "MY_CART_QUERY", entities
        if any(w in q for w in ["saved product", "saved items", "my saved", "bookmarks", "मेरा सेव", "सेव किए"]):
            return "SAVED_PRODUCTS_QUERY", entities

        # 6. CUSTOMER ORDERS & SPENDING
        if any(w in q for w in ["my order", "my orders", "past orders", "order status", "orders", "show orders", "order history", "show my orders", "invoice", "receipt"]):
            return "ORDER_QUERY", entities
        if any(w in q for w in ["last purchase", "my purchase", "last order", "what did i buy", "recent order"]):
            return "PURCHASE_QUERY", entities
        if any(w in q for w in ["spend", "spent", "how much did i spend", "my expenses", "kharcha"]):
            return "CUSTOMER_SPEND", entities
        if any(w in q for w in ["buy again", "reorder", "phir se"]):
            return "REORDER", entities

        # 7. SALES & BUSINESS ANALYTICS (Vendor or Admin)
        sales_words = ["sales", "bikri", "revenue", "kamai", "business", "munafa", "profit", "customers visited", "how are my sales", "sales today"]
        if any(w in q for w in sales_words):
            return "SALES_ANALYTICS", entities

        # 8. INVENTORY & STOCK (Vendor asking about their own inventory)
        if user_role in ("vendor", "admin") and any(w in q for w in ["inventory", "stock", "khatam", "bacha", "my products", "listed products", "stockout"]):
            return "INVENTORY", entities

        # 9. DEMAND / ROUTE (Mobile Vendors)
        demand_words = ["demand", "maang", "hotspot", "kahan jau", "where to go", "where should i go", "requests", "route", "area"]
        if any(w in q for w in demand_words) and user_role in ("vendor", "admin"):
            return "DEMAND_ANALYTICS", entities

        # 10. ALL SHOPS, CARTS & PRODUCTS DIRECTORY
        if aspects.get("asks_all_catalog") and not (entities.get("product_term") in SYNONYM_MAP):
            return "ALL_SHOPS_AND_CARTS", entities

        # 11. CHEAPEST / PRICE COMPARISON
        cheapest_words = [
            "cheapest", "sasta", "saste", "sasti", "sabse sasta", "sabse saste",
            "lowest price", "compare price", "compare", "best price", "कम कीमत", "सबसे सस्ता", "सस्ते"
        ]
        if any(w in q for w in cheapest_words):
            return "CHEAPEST_PRODUCT", entities

        # 12. PRODUCT SEARCH (Prioritized whenever a recognized product from SYNONYM_MAP is mentioned!)
        prod_search_words = [
            "find", "show", "buy", "chahiye", "search", "kaha milega", "kahan milega", "kahan milenge",
            "available", "where can i", "mil sakta hai", "get", "price", "rate", "bhav",
            "daam", "listing", "listed", "selling", "have", "has", "do you have", "kitne rupaye", "kitne ka",
        ]
        if entities.get("product_term") and (
            entities["product_term"] in SYNONYM_MAP
            or any(s in SYNONYM_MAP for s in entities.get("synonyms", []))
        ):
            return "PRODUCT_SEARCH", entities

        # 13. NEARBY SHOPS / MOBILE CARTS / SELLERS
        seller_words = [
            "shop", "shops", "seller", "sellers", "vendor", "vendors", "dukan", "dukaan",
            "store", "stores", "nearby shops", "show shops", "cart", "carts", "thela", "thele",
            "rehri", "दुकान", "ठेला", "विक्रेता"
        ]
        if any(w in q for w in seller_words):
            if aspects.get("asks_mobile_carts"):
                entities["vendor_type_filter"] = "cart_vendor"
            return "NEARBY_SELLER", entities

        if entities.get("product_term") or any(w in q for w in prod_search_words):
            return "PRODUCT_SEARCH", entities

        # 14. GENERAL CONVERSATION
        if any(w in q for w in ["who are you", "who made you", "kaun ho", "thank", "dhanyawad", "shukriya", "bye"]):
            return "GENERAL_CONVERSATION", entities

        return "UNKNOWN", entities

# ---------------------------------------------------------------------------
# AUTHORIZED APPLICATION TOOLS
# ---------------------------------------------------------------------------

class LocalPriceTools:
    """Queries real application collections with strict role-based access control and full shop/cart/product enrichment."""

    @staticmethod
    def resolve_coords(user: Optional[dict] = None, context: Optional[dict] = None) -> Tuple[float, float]:
        """Resolve consumer/caller coordinates from request context or user profile, defaulting to Dehradun center."""
        lat = None
        lng = None
        if isinstance(context, dict):
            lat = context.get("lat") or context.get("latitude") or context.get("user_lat")
            lng = context.get("lng") or context.get("longitude") or context.get("user_lng")
        if (lat is None or lng is None) and isinstance(user, dict):
            lat = user.get("lat") or user.get("latitude")
            lng = user.get("lng") or user.get("longitude")
        try:
            ref_lat = float(lat) if lat is not None else DEFAULT_LAT
            ref_lng = float(lng) if lng is not None else DEFAULT_LNG
        except (TypeError, ValueError):
            ref_lat, ref_lng = DEFAULT_LAT, DEFAULT_LNG
        return ref_lat, ref_lng

    @staticmethod
    async def _get_vendor_lookup(db, ref_lat: float = DEFAULT_LAT, ref_lng: float = DEFAULT_LNG) -> Dict[str, Dict[str, Any]]:
        """Loads all registered shops and mobile carts with live coordinates, distance from user, and vendor type."""
        v_docs = await db.users.find({"role": "vendor"}).to_list(300)
        lookup: Dict[str, Dict[str, Any]] = {}
        for v in v_docs:
            vid = str(v.get("id") or v.get("_id") or "")
            if not vid:
                continue
            v_lat = v.get("lat")
            v_lng = v.get("lng")
            dist_km: Optional[float] = None
            if v_lat is not None and v_lng is not None:
                try:
                    dist_km = round(haversine_km(ref_lat, ref_lng, float(v_lat), float(v_lng)), 2)
                except (TypeError, ValueError):
                    dist_km = None
            v_type = v.get("vendor_type", "retailer")
            v_type_label = "Mobile Cart (Thela/Cart Vendor)" if v_type == "cart_vendor" else "Fixed Retail Shop"
            lookup[vid] = {
                "vendor_id": vid,
                "shop_name": v.get("shop_name") or v.get("name", "Local Seller"),
                "owner_name": v.get("name", ""),
                "vendor_type": v_type,
                "vendor_type_label": v_type_label,
                "shop_address": v.get("shop_address", "Dehradun"),
                "lat": v_lat,
                "lng": v_lng,
                "distance_km": dist_km,
                "distance_label": format_distance_label(dist_km),
                "is_verified": bool(v.get("is_verified", False)),
                "is_online": bool(v.get("is_online", True)),
                "rating": v.get("avg_rating", 4.5),
                "opening_hours": v.get("opening_hours", "8:00 AM - 9:00 PM"),
                "phone": v.get("phone", ""),
            }
        return lookup

    @staticmethod
    async def _build_product_regex(db, query_term: str) -> str:
        t_low = query_term.strip().lower()
        sing = singularize_word(t_low)
        terms = list(dict.fromkeys([
            t_low,
            sing,
            *SYNONYM_MAP.get(t_low, []),
            *SYNONYM_MAP.get(sing, []),
        ]))
        try:
            from voice_inventory_engine import expand_multilingual_search_terms
            extra = await expand_multilingual_search_terms(db, sing)
            for ex in extra:
                if ex and ex not in terms:
                    terms.append(ex)
        except Exception:
            pass
        patterns = [re.escape(s) for s in terms if s]
        return "|".join(patterns) if patterns else re.escape(t_low)

    @staticmethod
    async def search_products(
        db,
        query_term: Optional[str] = None,
        max_price: Optional[float] = None,
        limit: int = 15,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
        vendor_type_filter: Optional[str] = None,
        sort_by: str = "price",
        all_terms: Optional[List[str]] = None,
        vendor_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        filter_q: Dict[str, Any] = {
            "in_stock": True,
            "moderation_status": {"$nin": ["rejected", "suspended"]},
            "listing_status": {"$ne": "draft"},
        }
        if vendor_id:
            filter_q["vendor_id"] = vendor_id

        terms_to_search: List[str] = []
        if all_terms and len(all_terms) > 1:
            terms_to_search = [t for t in all_terms if t]
        elif query_term:
            terms_to_search = [query_term]

        if terms_to_search:
            regex_parts = []
            for t in terms_to_search:
                r = await LocalPriceTools._build_product_regex(db, t)
                if r:
                    regex_parts.append(r)
            reg = "|".join(regex_parts)
            if reg:
                filter_q["$or"] = [
                    {"name_lower": {"$regex": reg, "$options": "i"}},
                    {"name": {"$regex": reg, "$options": "i"}},
                    {"name_en": {"$regex": reg, "$options": "i"}},
                    {"name_hi": {"$regex": reg, "$options": "i"}},
                    {"name_hinglish": {"$regex": reg, "$options": "i"}},
                    {"search_keywords": {"$regex": reg, "$options": "i"}},
                    {"normalized_tags": {"$regex": reg, "$options": "i"}},
                    {"category": {"$regex": reg, "$options": "i"}},
                ]
        if max_price is not None:
            filter_q["price"] = {"$lte": float(max_price)}

        docs = await db.products.find(filter_q).sort("price", 1).limit(max(limit * 2, 30)).to_list(max(limit * 2, 30))
        vendor_lookup = await LocalPriceTools._get_vendor_lookup(db, ref_lat, ref_lng)

        results: List[Dict[str, Any]] = []
        for d in docs:
            vid = str(d.get("vendor_id", ""))
            v_info = vendor_lookup.get(vid, {})
            v_type = v_info.get("vendor_type") or d.get("vendor_type", "retailer")
            if vendor_type_filter and v_type != vendor_type_filter:
                continue

            v_lat = v_info.get("lat") if v_info.get("lat") is not None else d.get("lat")
            v_lng = v_info.get("lng") if v_info.get("lng") is not None else d.get("lng")
            dist_km = v_info.get("distance_km")
            if dist_km is None and v_lat is not None and v_lng is not None:
                try:
                    dist_km = round(haversine_km(ref_lat, ref_lng, float(v_lat), float(v_lng)), 2)
                except (TypeError, ValueError):
                    dist_km = None

            results.append({
                "id": str(d.get("id") or d.get("_id")),
                "name": d.get("name"),
                "name_hi": d.get("name_hi"),
                "name_hinglish": d.get("name_hinglish"),
                "price": float(d.get("price", 0)),
                "unit": d.get("unit", "kg"),
                "shop_name": v_info.get("shop_name") or d.get("vendor_shop") or d.get("vendor_name", "Local Shop"),
                "shop_address": v_info.get("shop_address") or d.get("vendor_address", "Dehradun"),
                "vendor_id": vid,
                "vendor_type": v_type,
                "vendor_type_label": "Mobile Cart" if v_type == "cart_vendor" else "Fixed Shop",
                "distance_km": dist_km,
                "distance_label": format_distance_label(dist_km),
                "is_verified": v_info.get("is_verified", True),
                "is_online": v_info.get("is_online", True),
                "rating": v_info.get("rating", 4.5),
                "opening_hours": v_info.get("opening_hours", "8:00 AM - 9:00 PM"),
                "in_stock": d.get("in_stock", True),
                "category": d.get("category"),
            })

        if sort_by == "distance":
            results.sort(key=lambda x: (x.get("distance_km") if x.get("distance_km") is not None else 9999.0, x.get("price", 9999.0)))
        else:
            results.sort(key=lambda x: (x.get("price", 9999.0), x.get("distance_km") if x.get("distance_km") is not None else 9999.0))

        return results[:limit]

    @staticmethod
    async def get_cheapest_products(
        db,
        query_term: Optional[str] = None,
        limit: int = 12,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
        vendor_type_filter: Optional[str] = None,
        all_terms: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        return await LocalPriceTools.search_products(
            db,
            query_term=query_term,
            limit=limit,
            ref_lat=ref_lat,
            ref_lng=ref_lng,
            vendor_type_filter=vendor_type_filter,
            sort_by="price",
            all_terms=all_terms,
        )

    @staticmethod
    async def search_sellers(
        db,
        query_term: Optional[str] = None,
        vendor_type: Optional[str] = None,
        limit: int = 15,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
        include_products: bool = True,
    ) -> List[Dict[str, Any]]:
        vendor_lookup = await LocalPriceTools._get_vendor_lookup(db, ref_lat, ref_lng)
        sellers = list(vendor_lookup.values())

        if vendor_type:
            sellers = [s for s in sellers if s.get("vendor_type") == vendor_type]

        if query_term:
            q_low = query_term.strip().lower()
            matched = [
                s for s in sellers
                if q_low in (s.get("shop_name") or "").lower()
                or q_low in (s.get("owner_name") or "").lower()
                or q_low in (s.get("shop_address") or "").lower()
            ]
            if matched:
                sellers = matched

        # Sort by distance from consumer first, then rating
        sellers.sort(key=lambda s: (s.get("distance_km") if s.get("distance_km") is not None else 9999.0, -(s.get("rating") or 0)))
        sellers = sellers[:limit]

        if include_products and sellers:
            vids = [s["vendor_id"] for s in sellers]
            all_prods = await db.products.find({
                "vendor_id": {"$in": vids},
                "moderation_status": {"$nin": ["rejected", "suspended"]},
                "listing_status": {"$ne": "draft"},
            }).sort("price", 1).to_list(300)
            prods_by_vid: Dict[str, List[Dict[str, Any]]] = {}
            for p in all_prods:
                vid = str(p.get("vendor_id", ""))
                prods_by_vid.setdefault(vid, []).append({
                    "id": str(p.get("id") or p.get("_id")),
                    "name": p.get("name"),
                    "name_hi": p.get("name_hi"),
                    "price": float(p.get("price", 0)),
                    "unit": p.get("unit", "kg"),
                    "in_stock": p.get("in_stock", True),
                    "category": p.get("category"),
                })
            for s in sellers:
                vid = s["vendor_id"]
                s_prods = prods_by_vid.get(vid, [])
                s["products"] = s_prods
                s["products_count"] = len(s_prods)
                s["address"] = s.get("shop_address", "Dehradun")
                s["id"] = vid
        else:
            for s in sellers:
                s["address"] = s.get("shop_address", "Dehradun")
                s["id"] = s["vendor_id"]

        return sellers

    @staticmethod
    async def find_matching_vendors_in_query(
        db,
        query: str,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
    ) -> List[Dict[str, Any]]:
        """Checks if the user's message mentions a specific shop or mobile cart by name or locality."""
        q_low = (query or "").lower()
        all_sellers = await LocalPriceTools.search_sellers(db, limit=50, ref_lat=ref_lat, ref_lng=ref_lng, include_products=True)
        matched = []
        generic_shop_words = {
            "fresh", "store", "shop", "mart", "cart", "daily", "general", "kirana",
            "sabzi", "bhandar", "vegetables", "veggies", "fruits", "bakery", "dairy",
            "sweet", "house", "local", "the", "and", "on", "wheels", "corner",
        }
        for s in all_sellers:
            shop_name_low = (s.get("shop_name") or "").lower()
            owner_low = (s.get("owner_name") or "").lower()
            if shop_name_low and shop_name_low in q_low:
                matched.append(s)
                continue
            if owner_low and len(owner_low) >= 4 and owner_low in q_low:
                matched.append(s)
                continue
            # Distinctive shop name token match (e.g., "Bisht", "Rawat", "Ganga", "Himalayan", "Negi", "Raju", "Mohan")
            tokens = [tok for tok in re.findall(r"[a-zA-Z]{4,}", shop_name_low) if tok not in generic_shop_words]
            if any(re.search(rf"\b{re.escape(tok)}\b", q_low) for tok in tokens):
                matched.append(s)
        return matched

    @staticmethod
    async def get_user_shopping_cart(
        db,
        caller_user: dict,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
    ) -> Dict[str, Any]:
        """Returns the consumer's active shopping cart items with live product prices, shop names, and distances."""
        caller_id = str(caller_user.get("id") or caller_user.get("_id") or "")
        cart_doc = await db.carts.find_one({"user_id": caller_id})
        raw_items = cart_doc.get("items", []) if cart_doc else []
        if not raw_items:
            return {"items": [], "items_count": 0, "total_amount": 0.0, "shops_in_cart": []}

        prod_ids = [it.get("product_id") for it in raw_items if it.get("product_id")]
        prods = await db.products.find({"id": {"$in": prod_ids}}).to_list(100)
        prod_map = {str(p.get("id") or p.get("_id")): p for p in prods}
        vendor_lookup = await LocalPriceTools._get_vendor_lookup(db, ref_lat, ref_lng)

        enriched_items = []
        total_amount = 0.0
        shops_set = set()
        for it in raw_items:
            pid = str(it.get("product_id", ""))
            qty = int(it.get("quantity", 1))
            p = prod_map.get(pid)
            if not p:
                continue
            vid = str(p.get("vendor_id", ""))
            v_info = vendor_lookup.get(vid, {})
            unit_price = float(p.get("price", 0))
            line_total = round(unit_price * qty, 2)
            total_amount += line_total
            shop_name = v_info.get("shop_name") or p.get("vendor_shop", "Local Shop")
            shops_set.add(shop_name)
            enriched_items.append({
                "product_id": pid,
                "name": p.get("name"),
                "price": unit_price,
                "unit": p.get("unit", "kg"),
                "quantity": qty,
                "subtotal": line_total,
                "shop_name": shop_name,
                "vendor_type_label": v_info.get("vendor_type_label", "Fixed Retail Shop"),
                "shop_address": v_info.get("shop_address") or p.get("vendor_address", "Dehradun"),
                "distance_km": v_info.get("distance_km"),
                "distance_label": v_info.get("distance_label", "nearby"),
                "in_stock": p.get("in_stock", True),
            })

        return {
            "items": enriched_items,
            "items_count": len(enriched_items),
            "total_amount": round(total_amount, 2),
            "shops_in_cart": list(shops_set),
        }

    @staticmethod
    async def get_user_saved_products(
        db,
        caller_user: dict,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
    ) -> List[Dict[str, Any]]:
        """Returns the consumer's saved/bookmarked products with live prices and shop distances."""
        caller_id = str(caller_user.get("id") or caller_user.get("_id") or "")
        saved_docs = await db.saved.find({"user_id": caller_id}).to_list(50)
        if not saved_docs:
            return []
        pids = [s.get("product_id") for s in saved_docs if s.get("product_id")]
        prods = await db.products.find({"id": {"$in": pids}}).to_list(50)
        vendor_lookup = await LocalPriceTools._get_vendor_lookup(db, ref_lat, ref_lng)
        results = []
        for p in prods:
            vid = str(p.get("vendor_id", ""))
            v_info = vendor_lookup.get(vid, {})
            results.append({
                "id": str(p.get("id") or p.get("_id")),
                "name": p.get("name"),
                "price": float(p.get("price", 0)),
                "unit": p.get("unit", "kg"),
                "shop_name": v_info.get("shop_name") or p.get("vendor_shop", "Local Shop"),
                "vendor_type_label": v_info.get("vendor_type_label", "Fixed Shop"),
                "shop_address": v_info.get("shop_address") or p.get("vendor_address", "Dehradun"),
                "distance_km": v_info.get("distance_km"),
                "distance_label": v_info.get("distance_label", "nearby"),
                "in_stock": p.get("in_stock", True),
            })
        return results

    @staticmethod
    async def get_all_shops_carts_and_products(
        db,
        ref_lat: float = DEFAULT_LAT,
        ref_lng: float = DEFAULT_LNG,
        user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """
        Builds a complete snapshot of all consumer-accessible Fixed Retail Shops,
        Mobile Street Carts (cart_vendor), all their products & prices, and the user's cart.
        """
        sellers = await LocalPriceTools.search_sellers(db, limit=100, ref_lat=ref_lat, ref_lng=ref_lng, include_products=True)
        fixed_shops = [s for s in sellers if s.get("vendor_type") != "cart_vendor"]
        mobile_carts = [s for s in sellers if s.get("vendor_type") == "cart_vendor"]
        total_products = sum(s.get("products_count", 0) for s in sellers)
        user_cart = await LocalPriceTools.get_user_shopping_cart(db, user, ref_lat, ref_lng) if user else {"items": [], "items_count": 0, "total_amount": 0.0}
        return {
            "total_vendors": len(sellers),
            "fixed_shops_count": len(fixed_shops),
            "mobile_carts_count": len(mobile_carts),
            "total_products_count": total_products,
            "fixed_shops": fixed_shops,
            "mobile_carts": mobile_carts,
            "all_sellers": sellers,
            "user_shopping_cart": user_cart,
        }

    @staticmethod
    async def get_seller_sales_analytics(db, caller_user: dict, target_seller_id: Optional[str] = None) -> Dict[str, Any]:
        """Authorization: only the seller themselves or an admin can access sales data."""
        caller_role = caller_user.get("role")
        caller_id = str(caller_user.get("id") or caller_user.get("_id"))

        if caller_role not in ["vendor", "admin"]:
            return {"authorized": False, "error": "Only registered sellers and admins are authorized to view sales analytics."}

        seller_id = caller_id if caller_role == "vendor" else (target_seller_id or caller_id)

        # Baseline & verified attributions
        baseline = await db.seller_baselines.find_one({"seller_id": seller_id})
        verified_visits = await db.verified_visits.count_documents({"seller_id": seller_id})
        purchases = await db.purchase_attributions.find({"seller_id": seller_id}).to_list(300)
        attributed_revenue = sum(float(p.get("amount", 0)) for p in purchases)
        
        daily_sales = await db.vendor_daily_sales.find({"seller_id": seller_id}).sort("date", -1).limit(30).to_list(30)
        total_sales = sum(float(d.get("total_sales", 0)) for d in daily_sales)
        avg_daily = round(total_sales / len(daily_sales), 2) if daily_sales else 0.0

        products_count = await db.products.count_documents({"vendor_id": seller_id})

        return {
            "authorized": True,
            "seller_id": seller_id,
            "recorded_sales_count": len(daily_sales),
            "total_recorded_sales_inr": total_sales,
            "average_daily_sales_inr": avg_daily,
            "verified_visits_count": verified_visits,
            "attributed_purchases_count": len(purchases),
            "attributed_revenue_inr": attributed_revenue,
            "active_products_count": products_count,
            "baseline": baseline.get("average_daily_sales", 0) if baseline else None,
            "disclaimer": DISCLAIMER_TEXT,
        }

    @staticmethod
    async def get_user_grievances(db, caller_user: dict) -> List[Dict[str, Any]]:
        caller_role = caller_user.get("role")
        caller_id = str(caller_user.get("id") or caller_user.get("_id"))

        if caller_role == "admin":
            docs = await db.grievances.find({}).sort("created_at", -1).limit(10).to_list(10)
        else:
            docs = await db.grievances.find({"complainant_user_id": caller_id}).sort("created_at", -1).limit(5).to_list(5)

        results = []
        for d in docs:
            results.append({
                "id": str(d.get("_id") or d.get("id")),
                "grievance_number": d.get("grievance_number", "HL-GRV"),
                "subject": d.get("subject"),
                "category": d.get("category"),
                "status": d.get("status"),
                "priority": d.get("priority"),
                "created_at": d.get("created_at"),
            })
        return results

    @staticmethod
    async def get_mobile_demand(db) -> List[Dict[str, Any]]:
        docs = await db.demand_requests.find({"status": {"$in": ["open", "active"]}}).limit(5).to_list(5)
        results = []
        for d in docs:
            results.append({
                "id": str(d.get("_id") or d.get("id")),
                "product_name": d.get("product_name") or d.get("item", "Produce"),
                "quantity": d.get("quantity", "1 unit"),
                "max_price": d.get("max_price", "Market"),
                "locality": d.get("locality") or "Dehradun Central",
            })
        return results

    @staticmethod
    async def get_admin_marketplace_stats(db, caller_user: dict) -> Dict[str, Any]:
        if caller_user.get("role") != "admin":
            return {"authorized": False, "error": "Admin credentials required to view marketplace management statistics."}

        users_ct = await db.users.count_documents({})
        vendors_ct = await db.users.count_documents({"role": "vendor"})
        products_ct = await db.products.count_documents({})
        open_grv = await db.grievances.count_documents({"status": "open"})
        verified_purchases = await db.purchase_attributions.count_documents({})

        return {
            "authorized": True,
            "total_users": users_ct,
            "total_vendors": vendors_ct,
            "total_products": products_ct,
            "open_grievances": open_grv,
            "verified_purchases": verified_purchases,
        }

    @staticmethod
    async def get_user_orders(db, caller_user: dict) -> List[Dict[str, Any]]:
        caller_id = str(caller_user.get("id") or caller_user.get("_id"))
        docs = await db.marketplace_orders.find({"customer_id": caller_id}).sort("created_at", -1).limit(5).to_list(5)
        if not docs:
            docs = await db.orders.find({"user_id": caller_id}).sort("created_at", -1).limit(5).to_list(5)
        results = []
        for d in docs:
            results.append({
                "id": str(d.get("_id") or d.get("id")),
                "order_id": d.get("order_id"),
                "seller_shop": d.get("seller_shop_name", "Local Shop"),
                "amount": d.get("total_amount") or d.get("amount"),
                "order_status": d.get("order_status") or d.get("status"),
                "payment_status": d.get("payment_status", "PAID"),
                "items_count": len(d.get("items", [])),
                "items_summary": ", ".join(f"{it.get('name')} x{it.get('quantity')}" for it in d.get("items", [])[:3]),
                "invoice_id": d.get("invoice_id"),
                "created_at": d.get("created_at"),
            })
        return results

    @staticmethod
    async def get_last_purchase(db, caller_user: dict) -> Optional[Dict[str, Any]]:
        caller_id = str(caller_user.get("id") or caller_user.get("_id"))
        doc = await db.marketplace_orders.find_one({"customer_id": caller_id, "order_status": "COMPLETED"}, sort=[("created_at", -1)])
        if not doc:
            doc = await db.marketplace_orders.find_one({"customer_id": caller_id}, sort=[("created_at", -1)])
        if not doc:
            return None
        return {
            "order_id": doc.get("order_id"),
            "invoice_id": doc.get("invoice_id"),
            "seller_shop": doc.get("seller_shop_name"),
            "total_amount": doc.get("total_amount"),
            "items": [{"name": it.get("name"), "qty": it.get("quantity"), "price": it.get("unit_price")} for it in doc.get("items", [])],
            "order_status": doc.get("order_status"),
            "payment_method": doc.get("payment_method"),
            "created_at": doc.get("created_at"),
        }

    @staticmethod
    async def get_customer_spend(db, caller_user: dict) -> Dict[str, Any]:
        caller_id = str(caller_user.get("id") or caller_user.get("_id"))
        docs = await db.marketplace_orders.find({"customer_id": caller_id, "payment_status": "PAID"}).to_list(100)
        total_spend = sum(float(d.get("total_amount", 0)) for d in docs)
        shops = set(d.get("seller_shop_name") for d in docs if d.get("seller_shop_name"))
        return {
            "total_orders_count": len(docs),
            "total_spend_inr": round(total_spend, 2),
            "shops_visited": list(shops),
            "disclaimer": DISCLAIMER_TEXT,
        }


# ---------------------------------------------------------------------------
# CONVERSATIONAL RESPONSE SYNTHESIS (DATA-GROUNDED)
# ---------------------------------------------------------------------------

class ResponseSynthesizer:
    """Generates natural, role-aware, multi-lingual, and data-grounded responses."""

    @staticmethod
    def format_response(
        intent: str,
        query: str,
        lang: str,
        user: dict,
        tool_data: Any,
        entities: Dict[str, Any],
        prev_messages: List[Dict[str, Any]],
    ) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
        role = user.get("role", "consumer")
        user_name = user.get("name", "User")
        actions: List[Dict[str, Any]] = []
        extra_data: Dict[str, Any] = {}
        aspects = entities.get("query_aspects") or analyze_query_aspects(query)

        # ---------------------------------------------------------
        # 1. GREETING
        # ---------------------------------------------------------
        if intent == "GREETING":
            if lang == "hi":
                text = (
                    f"नमस्ते {user_name}! 🙏 मैं LocalPrice AI हूँ।\n\n"
                    f"मैं आपके नज़दीक सबसे सस्ते और ताज़ा उत्पाद ढूँढने, सभी दुकानों और ठेला/कार्ट विक्रेताओं की कीमतों व दूरी की तुलना करने, "
                    f"आपके शॉपिंग कार्ट को ट्रैक करने, और किसी भी शिकायत (grievance) के समाधान में मदद कर सकता हूँ।\n"
                    f"आज आप क्या ढूँढ रहे हैं?"
                )
            elif lang == "hinglish":
                text = (
                    f"Hi {user_name}! 👋 Main LocalPrice AI hoon.\n\n"
                    f"Aap aas-paas ke sabse saste products, fixed shops aur mobile carts (thela) ke rates aur ghar se doori (distance) pooch sakte hain, "
                    f"apna shopping cart check kar sakte hain, ya grievance report kar sakte hain. "
                    f"Aap kya dhoondh rahe hain aaj?"
                )
            else:
                text = (
                    f"Hi {user_name}! 👋 I'm LocalPrice AI.\n\n"
                    f"I have live information on every local shop, mobile street cart, their full product catalogs, prices, and distances from your location, "
                    f"plus your active shopping cart and orders. What are you looking for today?"
                )
            actions = [
                {"label": "🔍 Find Fresh Produce", "action": "send_message", "payload": "Find fresh vegetables"},
                {"label": "⚖️ Compare Prices", "action": "send_message", "payload": "Sabse saste tamatar kaun si dukaan per aur kitni dur milenge?"},
                {"label": "🏪 All Shops & Carts", "action": "send_message", "payload": "Show all shops, carts and their products"},
            ]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 2 & 3. CHEAPEST PRODUCT & PRODUCT SEARCH (with Distance, Shop/Cart Type & Price)
        # ---------------------------------------------------------
        if intent in ("CHEAPEST_PRODUCT", "PRODUCT_SEARCH"):
            term = entities.get("product_term") or query
            products = tool_data if isinstance(tool_data, list) else []

            if not products:
                if lang == "hi":
                    text = f"माफ़ कीजिए, मुझे '{term}' के लिए अभी कोई सक्रिय लिस्टिंग नहीं मिली। आप सभी दुकानों और कार्ट्स की सूची देख सकते हैं।"
                elif lang == "hinglish":
                    text = f"Sorry, filhal '{term}' ke liye koi active listing nahi mili. Aap dusra item search kar sakte hain ya saari shops aur carts dekh sakte hain."
                else:
                    text = f"I couldn't find any active listings matching '{term}' right now. You can browse all nearby shops and carts or search for another item."
                actions = [
                    {"label": "Search All Products", "action": "navigate", "payload": "/search"},
                    {"label": "All Shops & Carts", "action": "send_message", "payload": "Show all shops and carts"},
                ]
                return text, actions, extra_data

            by_price = sorted(products, key=lambda x: (x.get("price", 9999.0), x.get("distance_km") if x.get("distance_km") is not None else 9999.0))
            by_dist = sorted(products, key=lambda x: (x.get("distance_km") if x.get("distance_km") is not None else 9999.0, x.get("price", 9999.0)))
            cheapest = by_price[0]
            nearest = by_dist[0]

            c_price = cheapest.get("price")
            c_price_str = f"₹{int(c_price)}" if isinstance(c_price, (int, float)) and float(c_price).is_integer() else f"₹{c_price}"
            c_unit = cheapest.get("unit", "kg")
            c_shop = cheapest.get("shop_name", "Local Shop")
            c_addr = cheapest.get("shop_address", "Dehradun")
            c_dist = cheapest.get("distance_label", "nearby")
            c_vtype_hi = "ठेला / मोबाइल कार्ट" if cheapest.get("vendor_type") == "cart_vendor" else "दुकान (Fixed Shop)"
            c_vtype_hing = "Mobile Cart (Thela)" if cheapest.get("vendor_type") == "cart_vendor" else "Fixed Shop (Dukaan)"
            c_vtype_en = "Mobile Street Cart" if cheapest.get("vendor_type") == "cart_vendor" else "Fixed Retail Shop"

            n_price = nearest.get("price")
            n_price_str = f"₹{int(n_price)}" if isinstance(n_price, (int, float)) and float(n_price).is_integer() else f"₹{n_price}"

            if lang == "hi":
                lines = [
                    f"🍅 सबसे सस्ते **{cheapest['name']}** आपको **{c_shop}** ({c_vtype_hi}, {c_addr}) पर **{c_price_str} प्रति {c_unit}** में मिलेंगे, जो आपके घर/लोकेशन से लगभग **{c_dist}** दूर है।\n"
                ]
                if nearest.get("vendor_id") != cheapest.get("vendor_id") and nearest.get("distance_km") is not None:
                    lines.append(
                        f"📍 **आपके सबसे नज़दीक विकल्प**: **{nearest['shop_name']}** ({nearest['shop_address']}) — आपके घर से सिर्फ़ **{nearest.get('distance_label')}** दूर, कीमत **{n_price_str}/{nearest.get('unit', 'kg')}**।\n"
                    )
                lines.append(f"📋 **सभी उपलब्ध दुकानों और कार्ट्स की तुलना ({len(products)} विकल्प)**:")
                for i, p in enumerate(products, 1):
                    p_pr = p.get("price")
                    p_pr_str = f"₹{int(p_pr)}" if isinstance(p_pr, (int, float)) and float(p_pr).is_integer() else f"₹{p_pr}"
                    v_badge = "🛒 मोबाइल कार्ट" if p.get("vendor_type") == "cart_vendor" else "🏪 दुकान"
                    lines.append(
                        f"{i}. **{p['name']}** — **{p_pr_str}/{p.get('unit', 'kg')}**\n"
                        f"   {v_badge}: *{p['shop_name']}* ({p['shop_address']}) · दूरी: **{p.get('distance_label', 'nearby')}** · ⭐ {p.get('rating', 4.5)}"
                    )
                text = "\n".join(lines)

            elif lang == "hinglish":
                lines = [
                    f"🍅 Sabse saste **{cheapest['name']}** aapko **{c_shop}** ({c_vtype_hing}, {c_addr}) par **{c_price_str} per {c_unit}** mein milenge, jo aapke ghar/location se lagbhag **{c_dist}** door hai.\n"
                ]
                if nearest.get("vendor_id") != cheapest.get("vendor_id") and nearest.get("distance_km") is not None:
                    lines.append(
                        f"📍 **Sabse Paas (Nearest) Option**: **{nearest['shop_name']}** ({nearest['shop_address']}) — aapke ghar se sirf **{nearest.get('distance_label')}** door hai, price **{n_price_str}/{nearest.get('unit', 'kg')}**.\n"
                    )
                lines.append(f"📋 **Sabhi Shops aur Mobile Carts ke Rates & Distance ({len(products)} options)**:")
                for i, p in enumerate(products, 1):
                    p_pr = p.get("price")
                    p_pr_str = f"₹{int(p_pr)}" if isinstance(p_pr, (int, float)) and float(p_pr).is_integer() else f"₹{p_pr}"
                    v_badge = "🛒 Mobile Cart" if p.get("vendor_type") == "cart_vendor" else "🏪 Fixed Shop"
                    lines.append(
                        f"{i}. **{p['name']}** — **{p_pr_str}/{p.get('unit', 'kg')}**\n"
                        f"   {v_badge}: *{p['shop_name']}* ({p['shop_address']}) · Ghar se doori: **{p.get('distance_label', 'nearby')}** · ⭐ {p.get('rating', 4.5)}"
                    )
                text = "\n".join(lines)

            else:
                lines = [
                    f"🍅 The cheapest **{cheapest['name']}** is available at **{c_shop}** ({c_vtype_en}, {c_addr}) for **{c_price_str} per {c_unit}**, located **{c_dist}** away from your location.\n"
                ]
                if nearest.get("vendor_id") != cheapest.get("vendor_id") and nearest.get("distance_km") is not None:
                    lines.append(
                        f"📍 **Nearest Option to You**: **{nearest['shop_name']}** ({nearest['shop_address']}) — just **{nearest.get('distance_label')}** away at **{n_price_str}/{nearest.get('unit', 'kg')}**.\n"
                    )
                lines.append(f"📋 **Full Comparison Across Nearby Shops & Carts ({len(products)} listings)**:")
                for i, p in enumerate(products, 1):
                    p_pr = p.get("price")
                    p_pr_str = f"₹{int(p_pr)}" if isinstance(p_pr, (int, float)) and float(p_pr).is_integer() else f"₹{p_pr}"
                    v_badge = "🛒 Mobile Cart" if p.get("vendor_type") == "cart_vendor" else "🏪 Fixed Shop"
                    lines.append(
                        f"{i}. **{p['name']}** — **{p_pr_str} per {p.get('unit', 'kg')}**\n"
                        f"   {v_badge}: *{p['shop_name']}* ({p['shop_address']}) · Distance: **{p.get('distance_label', 'nearby')}** · ⭐ {p.get('rating', 4.5)}"
                    )
                text = "\n".join(lines)

            actions = [
                {"label": f"View {cheapest['name']}", "action": "navigate", "payload": f"/search?q={cheapest['name']}"},
                {"label": "Compare Store Prices", "action": "navigate", "payload": f"/search?q={term}"},
                {"label": "Open Live Map", "action": "navigate", "payload": "/map"},
            ]
            extra_data["cheapest_product"] = cheapest
            extra_data["nearest_product"] = nearest
            extra_data["all_matching_products"] = products
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 4. NEARBY SHOPS / MOBILE CARTS / FULL CATALOG
        # ---------------------------------------------------------
        if intent in ["NEARBY_SELLER", "SELLER_SEARCH", "SELLER_DETAILS", "ALL_SHOPS_AND_CARTS"]:
            if isinstance(tool_data, dict) and "all_sellers" in tool_data:
                sellers = tool_data.get("all_sellers", [])
                user_cart = tool_data.get("user_shopping_cart", {})
            elif isinstance(tool_data, list):
                sellers = tool_data
                user_cart = {}
            else:
                sellers = []
                user_cart = {}

            if not sellers:
                text = "Currently looking up local registered sellers and mobile carts in Dehradun. Please check the Map view for real-time locations."
                actions = [{"label": "Open Live Map", "action": "navigate", "payload": "/map"}]
                return text, actions, extra_data

            fixed_shops = [s for s in sellers if s.get("vendor_type") != "cart_vendor"]
            mobile_carts = [s for s in sellers if s.get("vendor_type") == "cart_vendor"]

            if lang == "hi":
                lines = [
                    f"यहाँ आपके क्षेत्र की सभी **{len(sellers)} सत्यापित दुकानें ({len(fixed_shops)} Fixed Shops) और मोबाइल ठेला/कार्ट ({len(mobile_carts)} Mobile Carts)** तथा उनके उत्पादों की पूरी जानकारी है:\n"
                ]
            elif lang == "hinglish":
                lines = [
                    f"Yahan aapke area ke sabhi **{len(sellers)} verified sellers ({len(fixed_shops)} Fixed Shops aur {len(mobile_carts)} Mobile Carts/Thela)**, unki aapke ghar se doori, aur unke sabhi products/rates ki poori list hai:\n"
                ]
            else:
                lines = [
                    f"Here is the complete directory of **{len(sellers)} nearby sellers ({len(fixed_shops)} Fixed Retail Shops & {len(mobile_carts)} Mobile Street Carts)**, their distance from you, and their available products:\n"
                ]

            for s in sellers:
                badge = "✓ Verified" if s.get("is_verified") else ""
                v_icon = "🛒 Mobile Cart" if s.get("vendor_type") == "cart_vendor" else "🏪 Fixed Shop"
                dist_str = s.get("distance_label", "nearby")
                lines.append(
                    f"{v_icon}: **{s['shop_name']}** {badge}\n"
                    f"   📍 {s.get('address') or s.get('shop_address', 'Dehradun')} · Distance: **{dist_str}** · ⭐ {s.get('rating', 4.5)} · 🕒 {s.get('opening_hours', 'Open')}"
                )
                s_prods = s.get("products", [])
                if s_prods:
                    prod_summaries = []
                    for p in s_prods:
                        pr = p.get("price")
                        pr_str = f"₹{int(pr)}" if isinstance(pr, (int, float)) and float(pr).is_integer() else f"₹{pr}"
                        prod_summaries.append(f"{p['name']} ({pr_str}/{p.get('unit', 'kg')})")
                    lines.append(f"   🛍️ **Products ({len(s_prods)})**: " + ", ".join(prod_summaries))
                lines.append("")

            if user_cart and user_cart.get("items_count", 0) > 0:
                c_items_str = ", ".join(f"{it['name']} x{it['quantity']} (₹{it['subtotal']})" for it in user_cart.get("items", []))
                lines.append(f"🛒 **Your Active Shopping Cart**: {user_cart['items_count']} items — Total **₹{user_cart['total_amount']}** ({c_items_str})")

            text = "\n".join(lines).strip()
            actions = [
                {"label": "Open Interactive Map", "action": "navigate", "payload": "/map"},
                {"label": "Explore Full Catalog", "action": "navigate", "payload": "/search"},
                {"label": "View My Cart", "action": "navigate", "payload": "/cart"},
            ]
            extra_data["sellers"] = sellers
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 4B. CONSUMER'S ACTIVE SHOPPING CART & SAVED ITEMS
        # ---------------------------------------------------------
        if intent == "MY_CART_QUERY":
            cart_info = tool_data if isinstance(tool_data, dict) else {"items": [], "items_count": 0, "total_amount": 0.0}
            items = cart_info.get("items", [])
            if not items:
                if lang == "hi":
                    text = "🛒 आपका शॉपिंग कार्ट अभी खाली है। आप ताज़ा सब्ज़ियाँ, फल या किराना सामान खोजकर अपने कार्ट में जोड़ सकते हैं।"
                elif lang == "hinglish":
                    text = "🛒 Aapka shopping cart abhi khali hai. Aap nearby shops ya mobile carts se items add kar sakte hain."
                else:
                    text = "🛒 Your shopping cart is currently empty. You can browse local shops and mobile carts to add items to your cart."
                actions = [
                    {"label": "Browse Products", "action": "navigate", "payload": "/search"},
                    {"label": "Cheapest Vegetables", "action": "send_message", "payload": "Show cheapest vegetables"},
                ]
                return text, actions, extra_data

            if lang == "hi":
                lines = [f"🛒 **आपके शॉपिंग कार्ट में {len(items)} सामान हैं (कुल राशि: ₹{cart_info['total_amount']})**:\n"]
            elif lang == "hinglish":
                lines = [f"🛒 **Aapke Shopping Cart mein {len(items)} items hain (Total: ₹{cart_info['total_amount']})**:\n"]
            else:
                lines = [f"🛒 **Your Active Shopping Cart has {len(items)} items (Total: ₹{cart_info['total_amount']})**:\n"]

            for i, it in enumerate(items, 1):
                lines.append(
                    f"{i}. **{it['name']}** — ₹{it['price']}/{it['unit']} × {it['quantity']} = **₹{it['subtotal']}**\n"
                    f"   🏪 *{it['shop_name']}* ({it['shop_address']}) · Distance: **{it['distance_label']}**"
                )
            text = "\n".join(lines)
            actions = [
                {"label": "Go to Cart & Checkout", "action": "navigate", "payload": "/cart"},
                {"label": "Add More Items", "action": "navigate", "payload": "/search"},
            ]
            extra_data["cart"] = cart_info
            return text, actions, extra_data

        if intent == "SAVED_PRODUCTS_QUERY":
            saved_items = tool_data if isinstance(tool_data, list) else []
            if not saved_items:
                text = "🔖 You don't have any saved/bookmarked products yet. Tap the bookmark icon on any product to save it for quick price tracking."
                actions = [{"label": "Browse Products", "action": "navigate", "payload": "/search"}]
                return text, actions, extra_data
            lines = [f"🔖 **Your Saved Products ({len(saved_items)})**:\n"]
            for p in saved_items:
                lines.append(
                    f"• **{p['name']}** — **₹{p['price']}/{p['unit']}** at *{p['shop_name']}* ({p['shop_address']}, {p['distance_label']})"
                )
            text = "\n".join(lines)
            actions = [{"label": "View Saved Items", "action": "navigate", "payload": "/saved"}]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 5. GRIEVANCE / REPORTING
        # ---------------------------------------------------------
        if intent == "GRIEVANCE":
            if lang == "hi":
                text = (
                    "ज़रूर, मैं शिकायत (Grievance) दर्ज करने में आपकी पूरी मदद करूँगा।\n\n"
                    "किस प्रकार की समस्या हुई है?\n"
                    "• **कीमत में अंतर**: लिस्टेड कीमत से ज़्यादा लिया गया\n"
                    "• **उत्पाद की गुणवत्ता**: ख़राब या पुराना सामान\n"
                    "• **दुकानदार का व्यवहार**: विक्रेता से जुड़ी समस्या\n\n"
                    "कृपया संक्षेप में बताएं कि क्या हुआ और किस दुकानदार के साथ?"
                )
            elif lang == "hinglish":
                text = (
                    "Sure, main grievance report karne me madad kar sakta hoon.\n\n"
                    "Kya issue hua?\n"
                    "• **Price mismatch**: Listed price se zyada charge kiya\n"
                    "• **Product quality**: Kharab ya galat item\n"
                    "• **Seller issue**: Vendor ke saath koi problem\n\n"
                    "Please batayein kis seller ke saath issue hua aur kya incident tha?"
                )
            else:
                text = (
                    "Sure. I can help you report an issue or file a grievance.\n\n"
                    "What happened?\n"
                    "• **Price Dispute**: Charged more than the listed app price\n"
                    "• **Product Quality**: Stale, damaged, or incorrect item\n"
                    "• **Seller Conduct**: Misbehavior or unfulfilled commitment\n\n"
                    "Please let me know which seller was involved and what took place."
                )
            actions = [
                {"label": "Report Overcharging", "action": "send_message", "payload": "Seller charged me more than the listed price"},
                {"label": "Track Existing Grievance", "action": "send_message", "payload": "Show my grievance status"},
            ]
            return text, actions, extra_data

        if intent == "CREATE_GRIEVANCE":
            if lang == "hi":
                text = (
                    "मैंने आपकी शिकायत का मसौदा (Draft) तैयार कर लिया है:\n\n"
                    "• **श्रेणी**: मूल्य विवाद (Price Dispute)\n"
                    "• **विवरण**: लिस्टेड कीमत से अधिक शुल्क लिया गया\n\n"
                    "क्या आप इसे आधिकारिक रूप से सबमिट करना चाहते हैं? नीचे बटन पर क्लिक करके कन्फर्म करें।"
                )
            elif lang == "hinglish":
                text = (
                    "Maine aapki grievance ka draft prepare kar liya hai:\n\n"
                    "• **Category**: Price Dispute / Overcharging\n"
                    "• **Details**: Seller charged above listed platform price\n\n"
                    "Kya aap ise submit karna chahte hain? Confirm karne ke liye niche click karein."
                )
            else:
                text = (
                    "I have prepared a grievance draft for you:\n\n"
                    "• **Category**: Price / Overcharge Dispute\n"
                    "• **Summary**: Discrepancy between listed platform price and charged amount\n\n"
                    "Would you like me to submit this official grievance ticket for admin review?"
                )
            actions = [
                {"label": "Submit Grievance Ticket", "action": "draft_grievance", "payload": {
                    "category": "Price",
                    "subject": "Overcharging above listed price",
                    "description": query,
                    "priority": "medium"
                }},
                {"label": "Cancel", "action": "send_message", "payload": "Cancel grievance"}
            ]
            extra_data["draft"] = {
                "category": "Price",
                "subject": "Dispute regarding listed price",
                "description": query,
            }
            return text, actions, extra_data

        if intent == "GRIEVANCE_STATUS":
            grievances = tool_data if isinstance(tool_data, list) else []
            if role == "admin":
                if not grievances:
                    text = "There are currently **0** open grievances requiring attention across the platform. All previous issues have been resolved."
                else:
                    lines = [f"🛡️ There are **{len(grievances)}** active grievances requiring administrative review:\n"]
                    for g in grievances:
                        lines.append(f"• **{g['grievance_number']}**: {g['subject']} (Status: `{g['status'].upper()}`, Priority: `{g['priority']}`)")
                    text = "\n".join(lines)
                actions = [{"label": "Admin Grievances", "action": "navigate", "payload": "/admin"}]
                return text, actions, extra_data

            if not grievances:
                if lang == "hi":
                    text = "आपके खाते में अभी कोई खुली शिकायत (Grievance) नहीं है।"
                elif lang == "hinglish":
                    text = "Aapke account me filhal koi open grievance nahi hai."
                else:
                    text = "You do not have any active grievances on record right now."
                actions = [{"label": "File a New Grievance", "action": "send_message", "payload": "I have a complaint"}]
                return text, actions, extra_data

            lines = ["Here are your recorded grievances:\n"]
            for g in grievances:
                lines.append(f"• **{g['grievance_number']}**: {g['subject']}")
                lines.append(f"   Status: `{g['status'].upper()}` · Priority: {g['priority']}")
            text = "\n".join(lines)
            actions = [{"label": "View Grievances", "action": "navigate", "payload": "/grievances"}]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 6. SALES & BUSINESS ANALYTICS (Role Protected)
        # ---------------------------------------------------------
        if intent == "SALES_ANALYTICS":
            data = tool_data if isinstance(tool_data, dict) else {}
            if not data.get("authorized"):
                text = "Sales and revenue metrics are private. You must be signed in as a registered vendor or platform administrator to view analytics."
                actions = [{"label": "Sign In as Vendor", "action": "navigate", "payload": "/auth/vendor"}]
                return text, actions, extra_data

            rec_sales = data.get("recorded_sales_count", 0)
            avg_daily = data.get("average_daily_sales_inr", 0)
            attr_rev = data.get("attributed_revenue_inr", 0)
            visits = data.get("verified_visits_count", 0)

            if lang == "hi":
                text = (
                    f"📊 **आपकी दुकान की बिक्री व एनालिटिक्स**:\n\n"
                    f"• **रिकॉर्डेड बिक्री (इस माह)**: {rec_sales} लेन-देन\n"
                    f"• **औसत दैनिक बिक्री**: ₹{avg_daily:.2f}\n"
                    f"• **सत्यापित विज़िट्स (HyperLocal)**: {visits}\n"
                    f"• **एट्रिब्यूटेड रेवेन्यू**: ₹{attr_rev:.2f}\n\n"
                    f"*{DISCLAIMER_TEXT}*"
                )
            elif lang == "hinglish":
                text = (
                    f"📊 **Aapki Shop Analytics & Sales Summary**:\n\n"
                    f"• **Recorded Sales**: {rec_sales} orders recorded\n"
                    f"• **Average Daily Sales**: ₹{avg_daily:.2f}\n"
                    f"• **Verified HyperLocal Visits**: {visits} customers\n"
                    f"• **Attributed Revenue**: ₹{attr_rev:.2f}\n\n"
                    f"*{DISCLAIMER_TEXT}*"
                )
            else:
                text = (
                    f"📊 **Your Business Impact & Sales Analytics**:\n\n"
                    f"• **Recorded Sales Records**: {rec_sales}\n"
                    f"• **Average Daily Sales**: ₹{avg_daily:.2f}\n"
                    f"• **Verified Physical Visits**: {visits} customers\n"
                    f"• **Attributed Revenue**: ₹{attr_rev:.2f}\n\n"
                    f"*{DISCLAIMER_TEXT}*"
                )
            actions = [
                {"label": "Open Impact Dashboard", "action": "navigate", "payload": "/vendor/dashboard"},
                {"label": "Predict Stockouts", "action": "send_message", "payload": "Which product is low on stock?"},
            ]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 7. INVENTORY (Vendor)
        # ---------------------------------------------------------
        if intent == "INVENTORY":
            if role != "vendor" and role != "admin":
                text = "Inventory management is available for registered shop and mobile cart vendors."
                actions = [{"label": "View Public Catalog", "action": "navigate", "payload": "/search"}]
                return text, actions, extra_data

            products = tool_data if isinstance(tool_data, list) else []
            if not products:
                text = "You do not have any products listed yet, or all items are out of stock. Add items from your vendor portal."
                actions = [{"label": "Add New Product", "action": "navigate", "payload": "/vendor/dashboard"}]
                return text, actions, extra_data

            lines = [f"You have **{len(products)}** active products listed:\n"]
            for p in products:
                status = "In Stock" if p.get("in_stock") else "Out of Stock"
                lines.append(f"• **{p['name']}** — ₹{p['price']}/{p.get('unit', 'unit')} ({status})")
            text = "\n".join(lines)
            actions = [{"label": "Manage Catalog", "action": "navigate", "payload": "/vendor/dashboard"}]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 8. DEMAND ANALYTICS (Mobile Vendor)
        # ---------------------------------------------------------
        if intent == "DEMAND_ANALYTICS":
            demands = tool_data if isinstance(tool_data, list) else []
            if not demands:
                text = "There are no open customer demand requests in your immediate area right now. Check back during peak afternoon hours."
                actions = [{"label": "View Route Optimizer", "action": "navigate", "payload": "/vendor/dashboard"}]
                return text, actions, extra_data

            lines = ["📍 **Active Customer Demand Requests Nearby**:\n"]
            for d in demands:
                lines.append(f"• **{d['product_name']}** ({d['quantity']}) — Budget: {d['max_price']} at {d['locality']}")
            lines.append("\n💡 Consider heading toward these demand clusters to fulfill open requests.")
            text = "\n".join(lines)
            actions = [{"label": "Optimize Cart Route", "action": "navigate", "payload": "/vendor/dashboard"}]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 9. ADMIN BUSINESS / MARKETPLACE OVERVIEW
        # ---------------------------------------------------------
        if intent == "BUSINESS_ANALYTICS" and role == "admin":
            stats = tool_data if isinstance(tool_data, dict) else {}
            text = (
                f"🛡️ **HyperLocal Marketplace Operational Briefing**:\n\n"
                f"[VERIFIED PLATFORM DATA]\n"
                f"• **Registered Users**: {stats.get('total_users', 0)}\n"
                f"• **Active Vendors**: {stats.get('total_vendors', 0)}\n"
                f"• **Listed Products**: {stats.get('total_products', 0)}\n"
                f"• **Open Grievances**: {stats.get('open_grievances', 0)}\n"
                f"• **Verified Purchases**: {stats.get('verified_purchases', 0)}\n\n"
                f"[AI INTERPRETATION]\n"
                f"Platform operations are stable. Ensure open grievance cases are assigned within their 24h SLA.\n\n"
                f"*{DISCLAIMER_TEXT}*"
            )
            actions = [
                {"label": "Manage Grievances", "action": "navigate", "payload": "/admin"},
                {"label": "Smart Features Registry", "action": "navigate", "payload": "/admin/smart-features"},
            ]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 10. ORDER & PURCHASE QUERIES
        # ---------------------------------------------------------
        if intent == "ORDER_QUERY":
            orders = tool_data if isinstance(tool_data, list) else []
            if not orders:
                text = "You don't have any in-app orders or purchases recorded yet. When you checkout items from local shops, your orders and digital invoices will appear here."
                actions = [{"label": "Explore Products", "action": "navigate", "payload": "/search"}]
                return text, actions, extra_data
            lines = ["📦 **Here are your recorded orders**:\n"]
            for o in orders:
                items_text = f" ({o.get('items_summary')})" if o.get('items_summary') else ""
                lines.append(f"• **{o.get('order_id')}** — ₹{o.get('amount', 0)}")
                lines.append(f"   🏪 {o.get('seller_shop')} · Status: `{o.get('order_status', 'CONFIRMED')}`{items_text}")
            text = "\n".join(lines)
            actions = [
                {"label": "View My Orders", "action": "navigate", "payload": "/orders"},
                {"label": "Start New Cart", "action": "navigate", "payload": "/cart"}
            ]
            return text, actions, extra_data

        if intent == "PURCHASE_QUERY":
            last_order = tool_data if isinstance(tool_data, dict) else None
            if not last_order:
                text = "I couldn't find any completed past purchases for your account."
                actions = [{"label": "Shop Fresh Produce", "action": "navigate", "payload": "/search"}]
                return text, actions, extra_data
            items_str = ", ".join(f"{it.get('name')} x{it.get('qty')}" for it in last_order.get("items", []))
            text = (
                f"🛍️ **Your Most Recent Purchase**:\n\n"
                f"• **Order**: {last_order.get('order_id')}\n"
                f"• **Invoice**: `{last_order.get('invoice_id')}`\n"
                f"• **Shop**: {last_order.get('seller_shop')}\n"
                f"• **Items**: {items_str}\n"
                f"• **Total**: ₹{last_order.get('total_amount')}\n"
                f"• **Payment**: {last_order.get('payment_method', 'CASH')}\n\n"
                f"Would you like to buy these same items again?"
            )
            actions = [
                {"label": "Buy Again", "action": "send_message", "payload": "Buy the same products again"},
                {"label": "View Digital Invoice", "action": "navigate", "payload": "/orders"}
            ]
            return text, actions, extra_data

        if intent == "CUSTOMER_SPEND":
            spend_data = tool_data if isinstance(tool_data, dict) else {}
            tot = spend_data.get("total_spend_inr", 0.0)
            ct = spend_data.get("total_orders_count", 0)
            shops = ", ".join(spend_data.get("shops_visited", [])) or "Local stores"
            text = (
                f"💳 **Your In-App Spending Summary**:\n\n"
                f"• **Total Recorded Spend**: ₹{tot:.2f}\n"
                f"• **Completed Orders**: {ct}\n"
                f"• **Shops**: {shops}\n\n"
                f"*{DISCLAIMER_TEXT}*"
            )
            actions = [{"label": "View Orders", "action": "navigate", "payload": "/orders"}]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 11. GENERAL HELP
        # ---------------------------------------------------------
        if intent == "GENERAL_HELP":
            if role == "vendor":
                text = (
                    "As a vendor, I can help you with:\n"
                    "• Checking your sales and attributed revenue (`how are my sales?`)\n"
                    "• Inspecting inventory stockouts (`show my products`)\n"
                    "• Finding nearby customer demand (`where is demand?`)\n"
                    "• Managing grievances and customer feedback."
                )
            elif role == "admin":
                text = (
                    "As a Super Admin, I can assist with:\n"
                    "• Marketplace health summaries (`summarize today's marketplace`)\n"
                    "• Open grievance counts (`how many grievances are open?`)\n"
                    "• Smart Feature configurations and fraud graph alerts."
                )
            else:
                text = (
                    "I can help you:\n"
                    "• Find the cheapest groceries and exact distance from your home (`sabse saste tamatar kaun si dukaan per aur kitni dur milenge?`)\n"
                    "• View all nearby fixed shops, mobile carts, and their full product lists (`show all shops, carts and their products`)\n"
                    "• Check your active shopping cart (`what is in my cart?`)\n"
                    "• File or check the status of a grievance (`report a seller`)."
                )
            actions = [
                {"label": "Cheapest Tomatoes", "action": "send_message", "payload": "Sabse saste tamatar kaun si dukaan per aur kitni dur milenge?"},
                {"label": "All Shops & Carts", "action": "send_message", "payload": "Show all shops, carts and their products"},
                {"label": "My Shopping Cart", "action": "send_message", "payload": "What is in my cart?"},
            ]
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 12. GENERAL CONVERSATION
        # ---------------------------------------------------------
        if intent == "GENERAL_CONVERSATION":
            if "thank" in query.lower() or "dhanyawad" in query.lower() or "shukriya" in query.lower():
                text = "You're very welcome! Let me know whenever you need anything else around the neighborhood. Happy shopping! 🛍️"
            elif "who are you" in query.lower() or "kaun ho" in query.lower():
                text = "I am LocalPrice AI, your dedicated hyperlocal shopping assistant with real-time access to all local shops, mobile carts, product prices, and distances in Dehradun. How can I help you right now?"
            else:
                text = "Have a great day! Feel free to ask whenever you need local price comparisons, distances, or shop and cart catalogs."
            return text, actions, extra_data

        # ---------------------------------------------------------
        # 13. UNKNOWN / MARKETPLACE SUMMARY FALLBACK
        # ---------------------------------------------------------
        if isinstance(tool_data, dict) and "all_sellers" in tool_data and tool_data.get("all_sellers"):
            sellers = tool_data["all_sellers"]
            if lang == "hi":
                lines = [
                    f"यहाँ आपके नज़दीक उपलब्ध सभी **{len(sellers)} दुकानों और मोबाइल कार्ट्स** तथा उनके प्रमुख उत्पादों की जानकारी है:\n"
                ]
            elif lang == "hinglish":
                lines = [
                    f"Yahan aapke aas-paas ke sabhi **{len(sellers)} shops aur mobile carts** aur unke products ki jankari hai:\n"
                ]
            else:
                lines = [
                    f"Here is the live information across all **{len(sellers)} local shops and mobile carts** near you:\n"
                ]
            for s in sellers[:8]:
                v_icon = "🛒 Mobile Cart" if s.get("vendor_type") == "cart_vendor" else "🏪 Fixed Shop"
                prods_preview = ", ".join(f"{p['name']} (₹{int(p['price']) if float(p['price']).is_integer() else p['price']}/{p.get('unit','kg')})" for p in s.get("products", [])[:5])
                lines.append(f"{v_icon} **{s['shop_name']}** ({s.get('shop_address')}, **{s.get('distance_label')}**) — {prods_preview}")
            text = "\n".join(lines)
        elif lang == "hi":
            text = (
                f"मैं समझ गया कि आप '{query}' के बारे में पूछ रहे हैं।\n"
                f"आप किसी भी सामान (जैसे टमाटर, आलू, प्याज़, चावल, दूध) का सबसे सस्ता दाम और अपने घर से दुकान/ठेले की दूरी पूछ सकते हैं।"
            )
        elif lang == "hinglish":
            text = (
                f"Main samajh gaya ki aap '{query}' ke baare me pooch rahe hain.\n"
                f"Aap kisi bhi product (jaise tamatar, aloo, chawal, doodh) ka sabse sasta rate aur apne ghar se shop ya mobile cart ki doori pooch sakte hain."
            )
        else:
            text = (
                f"I want to make sure I get you the right information for '{query}'.\n"
                f"You can ask for any product's price and distance from your home, or inspect all local shops, mobile carts, and their catalogs."
            )

        actions = [
            {"label": "🔍 Search Products", "action": "navigate", "payload": f"/search?q={query}"},
            {"label": "🏪 All Shops & Carts", "action": "send_message", "payload": "Show all shops, carts and their products"},
            {"label": "⚖️ Cheapest Deals", "action": "send_message", "payload": "Show cheapest vegetables"},
        ]
        return text, actions, extra_data

def _build_compact_catalog_digest(catalog: Dict[str, Any]) -> str:
    """Formats the entire marketplace (all shops, mobile carts, products, distances, and user cart) for LLM grounding."""
    if not isinstance(catalog, dict):
        return ""
    lines = [
        f"Total Sellers: {catalog.get('total_vendors', 0)} "
        f"({catalog.get('fixed_shops_count', 0)} Fixed Retail Shops, {catalog.get('mobile_carts_count', 0)} Mobile Street Carts) | "
        f"Total Active Products: {catalog.get('total_products_count', 0)}"
    ]
    for s in catalog.get("all_sellers", []):
        v_tag = "MOBILE CART (Thela)" if s.get("vendor_type") == "cart_vendor" else "FIXED SHOP (Dukaan)"
        dist = s.get("distance_label", "nearby")
        prods = s.get("products", [])
        p_str = ", ".join(
            f"{p.get('name')} ₹{int(p['price']) if float(p.get('price', 0)).is_integer() else p.get('price')}/{p.get('unit', 'kg')}"
            for p in prods
        )
        lines.append(
            f"- [{v_tag}] {s.get('shop_name')} | Address: {s.get('shop_address')} | Distance from user: {dist} "
            f"| Rating: {s.get('rating')}★ | Hours: {s.get('opening_hours')} | Products ({len(prods)}): {p_str or 'None'}"
        )
    u_cart = catalog.get("user_shopping_cart") or {}
    if u_cart.get("items_count", 0) > 0:
        c_str = ", ".join(
            f"{it['name']} x{it['quantity']} @ ₹{it['price']}/{it['unit']} from {it['shop_name']} ({it['distance_label']})"
            for it in u_cart.get("items", [])
        )
        lines.append(f"USER'S ACTIVE SHOPPING CART ({u_cart['items_count']} items, Total ₹{u_cart['total_amount']}): {c_str}")
    else:
        lines.append("USER'S ACTIVE SHOPPING CART: Empty (0 items)")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# MAIN SERVICE ENTRYPOINT
# ---------------------------------------------------------------------------

async def process_ai_chat_turn(
    db,
    user: dict,
    message: str,
    session_id: str,
    page: Optional[str] = None,
    context: Optional[dict] = None,
    image_base64: Optional[str] = None,
    preferred_language: Optional[str] = None,
) -> Dict[str, Any]:
    """Processes a single conversational turn with full grounding, shop/cart/product completeness, and audit logging."""
    start_time = datetime.now(timezone.utc)
    clean_msg = (message or "").strip()
    user_role = user.get("role", "consumer")
    user_id = str(user.get("id") or user.get("_id"))
    full_session_id = f"{user_id}::{session_id}"
    ref_lat, ref_lng = LocalPriceTools.resolve_coords(user, context)

    # 1. Fetch recent history for multi-turn context
    prior_msgs = await db.ai_messages.find({"session_id": full_session_id}).sort("created_at", 1).limit(10).to_list(10)
    prev_user_msg = None
    for pm in reversed(prior_msgs):
        if pm.get("sender_type") == "user":
            prev_user_msg = pm.get("message")
            break

    # 2. Detect language & intent
    detected_lang = detect_language(clean_msg)
    if preferred_language and preferred_language in ("en", "hi", "hinglish") and detected_lang == "en":
        lang = preferred_language
    else:
        lang = detected_lang

    intent, entities = IntentDetector.classify(clean_msg, user_role, page, prev_intent=None)

    # 3. Load complete consumer-accessible marketplace snapshot (all shops, carts, products, distances, and user cart)
    marketplace_catalog: Dict[str, Any] = {}
    try:
        marketplace_catalog = await LocalPriceTools.get_all_shops_carts_and_products(db, ref_lat, ref_lng, user)
    except Exception as e:
        logger.error(f"Error loading full marketplace catalog snapshot: {e}")

    # 4. Tool Execution with strict RBAC & Specific Shop/Cart Detection
    tool_data = None
    tools_called = []

    try:
        # Check if the user is asking about a specific named shop or mobile cart
        matched_vendors = await LocalPriceTools.find_matching_vendors_in_query(db, clean_msg, ref_lat, ref_lng)
        if matched_vendors:
            matched_shop_names_low = " ".join((v.get("shop_name") or "").lower() for v in matched_vendors)
            non_shop_prod_terms = [
                t for t in (entities.get("product_terms") or [])
                if t.lower() not in matched_shop_names_low
            ]
            if not non_shop_prod_terms and intent in ("UNKNOWN", "NEARBY_SELLER", "SELLER_SEARCH", "ALL_SHOPS_AND_CARTS", "PRODUCT_SEARCH"):
                intent = "SELLER_DETAILS"
                tools_called.append("find_matching_vendors_in_query")
                tool_data = matched_vendors
            elif non_shop_prod_terms:
                entities["product_term"] = non_shop_prod_terms[0]
                entities["product_terms"] = non_shop_prod_terms
                entities["target_vendor"] = matched_vendors[0]

        if intent == "CHEAPEST_PRODUCT":
            tools_called.append("get_cheapest_products")
            tool_data = await LocalPriceTools.get_cheapest_products(
                db,
                query_term=entities.get("product_term"),
                limit=15,
                ref_lat=ref_lat,
                ref_lng=ref_lng,
                vendor_type_filter=entities.get("vendor_type_filter"),
                all_terms=entities.get("product_terms"),
            )

        elif intent == "PRODUCT_SEARCH":
            tools_called.append("search_products")
            all_prods = await LocalPriceTools.search_products(
                db,
                query_term=entities.get("product_term"),
                max_price=entities.get("max_price"),
                limit=15,
                ref_lat=ref_lat,
                ref_lng=ref_lng,
                vendor_type_filter=entities.get("vendor_type_filter"),
                sort_by=entities.get("sort_by", "price"),
                all_terms=entities.get("product_terms"),
            )
            target_v = entities.get("target_vendor")
            if target_v and all_prods:
                tv_id = target_v.get("vendor_id")
                tv_prods = [p for p in all_prods if p.get("vendor_id") == tv_id]
                other_prods = [p for p in all_prods if p.get("vendor_id") != tv_id]
                tool_data = tv_prods + other_prods if tv_prods else all_prods
            else:
                tool_data = all_prods

        elif intent in ["NEARBY_SELLER", "SELLER_SEARCH"]:
            tools_called.append("search_sellers")
            # Only filter seller name by product_term if product_term is not a generic seller word
            seller_query = entities.get("product_term") if entities.get("product_term") not in SYNONYM_MAP else None
            tool_data = await LocalPriceTools.search_sellers(
                db,
                query_term=seller_query,
                vendor_type=entities.get("vendor_type_filter"),
                limit=20,
                ref_lat=ref_lat,
                ref_lng=ref_lng,
                include_products=True,
            )

        elif intent == "ALL_SHOPS_AND_CARTS":
            tools_called.append("get_all_shops_carts_and_products")
            if entities.get("vendor_type_filter") == "cart_vendor":
                tool_data = marketplace_catalog.get("mobile_carts", [])
            else:
                tool_data = marketplace_catalog

        elif intent == "MY_CART_QUERY":
            tools_called.append("get_user_shopping_cart")
            tool_data = marketplace_catalog.get("user_shopping_cart") or await LocalPriceTools.get_user_shopping_cart(db, user, ref_lat, ref_lng)

        elif intent == "SAVED_PRODUCTS_QUERY":
            tools_called.append("get_user_saved_products")
            tool_data = await LocalPriceTools.get_user_saved_products(db, user, ref_lat, ref_lng)

        elif intent == "SALES_ANALYTICS":
            tools_called.append("get_seller_sales_analytics")
            tool_data = await LocalPriceTools.get_seller_sales_analytics(db, user)

        elif intent in ["GRIEVANCE_STATUS"]:
            tools_called.append("get_user_grievances")
            tool_data = await LocalPriceTools.get_user_grievances(db, user)

        elif intent == "INVENTORY":
            tools_called.append("search_products_vendor")
            vid_filter = user_id if user_role == "vendor" else None
            tool_data = await LocalPriceTools.search_products(db, ref_lat=ref_lat, ref_lng=ref_lng, vendor_id=vid_filter, limit=30)

        elif intent == "DEMAND_ANALYTICS":
            tools_called.append("get_mobile_demand")
            tool_data = await LocalPriceTools.get_mobile_demand(db)

        elif intent == "BUSINESS_ANALYTICS" and user_role == "admin":
            tools_called.append("get_admin_marketplace_stats")
            tool_data = await LocalPriceTools.get_admin_marketplace_stats(db, user)

        elif intent == "ORDER_QUERY":
            tools_called.append("get_user_orders")
            tool_data = await LocalPriceTools.get_user_orders(db, user)

        elif intent == "PURCHASE_QUERY":
            tools_called.append("get_last_purchase")
            tool_data = await LocalPriceTools.get_last_purchase(db, user)

        elif intent == "CUSTOMER_SPEND":
            tools_called.append("get_customer_spend")
            tool_data = await LocalPriceTools.get_customer_spend(db, user)

        # Fallback product lookup if intent was UNKNOWN or SELLER_SEARCH but a product entity was detected
        if (not tool_data) and entities.get("product_term") and intent in ("UNKNOWN", "NEARBY_SELLER", "SELLER_SEARCH"):
            tools_called.append("search_products_fallback")
            found_prods = await LocalPriceTools.search_products(
                db,
                query_term=entities.get("product_term"),
                max_price=entities.get("max_price"),
                ref_lat=ref_lat,
                ref_lng=ref_lng,
                all_terms=entities.get("product_terms"),
            )
            if found_prods:
                intent = "PRODUCT_SEARCH"
                tool_data = found_prods

        if tool_data is None and intent == "UNKNOWN":
            tool_data = marketplace_catalog

    except Exception as e:
        logger.error(f"Error executing tools for intent {intent}: {e}")

    # 5. Synthesize Grounded Fallback & Extract Actions
    fallback_reply, actions, extra_data = ResponseSynthesizer.format_response(
        intent=intent,
        query=clean_msg,
        lang=lang,
        user=user,
        tool_data=tool_data,
        entities=entities,
        prev_messages=prior_msgs,
    )

    # 6. Dynamic Generative Intelligence via Gemini 2.5 Flash (with strict grounding & completeness verification)
    reply_text = fallback_reply
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if api_key and not api_key.startswith("sk-placeholder"):
        verified_data_str = ""
        if tool_data:
            try:
                verified_data_str = json.dumps(tool_data, default=str, ensure_ascii=False)
            except Exception:
                verified_data_str = str(tool_data)

        catalog_digest = _build_compact_catalog_digest(marketplace_catalog)
        history_context = "\n".join([f"{m.get('sender_type')}: {m.get('message')}" for m in prior_msgs[-6:]])

        system_instruction = f"""{SYSTEM_KNOWLEDGE}

CURRENT CALLER CONTEXT:
- Name: {user.get('name', 'User')}
- Role: {user_role}
- User ID: {user_id}
- User Coordinates: ({ref_lat}, {ref_lng})
- Current Page: {page or '/'}
- Detected Intent: {intent}
- Target Response Language: {lang}

[VERIFIED DATABASE DATA FOR CURRENT QUERY]
{verified_data_str if verified_data_str else "See complete marketplace catalog below."}

[COMPLETE CONSUMER MARKETPLACE CATALOG (ALL FIXED SHOPS, MOBILE CARTS, PRODUCTS, PRICES, DISTANCES & USER CART)]
{catalog_digest}

RECENT CONVERSATION HISTORY:
{history_context if history_context else "(No prior turns in this session)"}

STRICT INSTRUCTIONS FOR YOUR RESPONSE:
1. Answer the user's exact question directly, accurately, and completely in {lang} language.
2. DO NOT output a standalone greeting or self-introduction (such as "Hello {user.get('name', 'User')}! Main LocalPrice AI hoon...") unless Detected Intent is GREETING. Start immediately with the answer to what the user asked.
3. For product, price, shop, or mobile cart queries:
   - State the cheapest option clearly with its exact **price in ₹ per unit** (e.g. ₹25/kg), **shop or mobile cart name**, whether it is a **Fixed Shop (Dukaan)** or **Mobile Cart (Thela)**, **locality/address**, and **exact distance from the user's home/location** (`distance_label`, e.g., `820 m` or `1.4 km`).
   - Also mention the **nearest option** to the user's home if it differs from the cheapest option.
   - List all other matching shops and mobile carts with their exact prices and distances so the user can compare.
4. You have complete information about all Fixed Retail Shops, Mobile Street Carts, all their products, and the user's active shopping cart in `[COMPLETE CONSUMER MARKETPLACE CATALOG]`. Never claim you lack information when the data is present above. Never invent prices or shops.
5. If role permissions are violated (e.g. consumer asking for private seller sales analytics), politely inform them that those metrics require vendor or admin access.
6. If business analytics are discussed, you must include the mandatory disclaimer:
   "*{DISCLAIMER_TEXT}*"
"""
        llm_messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": clean_msg}
        ]
        llm_reply = await generate_llm_reply(llm_messages, model=DEFAULT_MODEL, max_tokens=2500)
        if llm_reply:
            low_llm = llm_reply.lower().strip()
            use_fallback = False

            # Guard 1: Reject greeting-only / self-intro responses when the user did NOT send a greeting
            if intent != "GREETING":
                is_intro_only = (
                    len(low_llm) < 150
                    and any(g in low_llm for g in ["main localprice ai hoon", "i'm localprice ai", "i am localprice ai", "मैं localprice ai हूँ", "madad karne ke liye"])
                )
                if is_intro_only:
                    use_fallback = True

            # Guard 2: For product/cheapest queries with verified records, ensure exact price, shop name, and distance are present
            has_verified_products = intent in ("PRODUCT_SEARCH", "CHEAPEST_PRODUCT") and isinstance(tool_data, list) and len(tool_data) > 0
            if has_verified_products:
                top_shop = (tool_data[0].get("shop_name") or "").lower()
                top_price_int = str(int(float(tool_data[0].get("price", 0))))
                has_negation = any(
                    neg in low_llm
                    for neg in [
                        "do not have information", "don't have information", "no information",
                        "couldn't find", "could not find", "no active listings", "koi jankari nahi",
                        "उपलब्ध नहीं", "जानकारी नहीं",
                    ]
                )
                has_price_mention = ("₹" in llm_reply) or (top_price_int in llm_reply)
                has_shop_mention = bool(top_shop and top_shop in low_llm) or any(
                    (p.get("shop_name") or "").lower() in low_llm for p in tool_data[:3]
                )
                has_distance_mention = any(d_tok in low_llm for d_tok in ["km", " m", "meter", "किमी", "मीटर", "दूर", "door"])
                if has_negation or not (has_price_mention and has_shop_mention and has_distance_mention):
                    use_fallback = True

            reply_text = fallback_reply if use_fallback else llm_reply

            if intent == "SALES_ANALYTICS" and DISCLAIMER_TEXT not in reply_text:
                reply_text += f"\n\n*{DISCLAIMER_TEXT}*"
            if intent == "GREETING" and "LocalPrice AI" not in reply_text:
                reply_text = f"Hi {user.get('name', 'there')}! 👋 I'm LocalPrice AI.\n\n" + reply_text

    end_time = datetime.now(timezone.utc)
    latency_ms = int((end_time - start_time).total_seconds() * 1000)

    # 7. Persist turn in conversation history
    now_iso_str = start_time.isoformat()
    await db.ai_messages.insert_one({
        "session_id": full_session_id,
        "user_id": user_id,
        "role": user_role,
        "sender_type": "user",
        "message": clean_msg,
        "created_at": now_iso_str,
    })
    await db.ai_messages.insert_one({
        "session_id": full_session_id,
        "user_id": user_id,
        "role": user_role,
        "sender_type": "assistant",
        "message": reply_text,
        "intent": intent,
        "actions": actions,
        "created_at": end_time.isoformat(),
    })

    # 8. Audit logging for diagnostics
    audit_entry = {
        "request_id": str(uuid.uuid4()),
        "session_id": full_session_id,
        "user_id": user_id,
        "role": user_role,
        "query": clean_msg,
        "intent": intent,
        "language": lang,
        "tools_called": tools_called,
        "latency_ms": latency_ms,
        "status": "success",
        "created_at": now_iso_str,
    }
    await db.ai_audit_logs.insert_one(audit_entry)

    return {
        "reply": reply_text,
        "intent": intent,
        "confidence": 0.95,
        "actions": actions,
        "language": lang,
        "data": extra_data,
        "latency_ms": latency_ms,
    }
