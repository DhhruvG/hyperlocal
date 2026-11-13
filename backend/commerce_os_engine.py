"""
HyperLocal Commerce Operating System — Master Upgrade Engine (Points 1 to 40)
=============================================================================
Additive, non-destructive domain engine implementing:
- Point 1: Feature Priority & Product Control (CORE, GROWTH, MONETIZATION, EXPERIMENTAL)
- Point 2: Inventory Trust & Confidence System (0-100 score, CONFIRMED_RECENTLY / PROBABLY_AVAILABLE / POSSIBLY_STALE)
- Point 3: Frictionless Merchant Inventory (Multi-item Voice, CSV/XLSX, Barcode, Invoice Extraction, Copy Previous, Onboarding Tracker)
- Point 4: Cheapest Basket Engine (CHEAPEST, CONVENIENT, NEAREST with real prices, distances & inventory confidence)
- Point 5: Smart Shopping Lists (CRUD, voice add, duplicate, optimize, convert to cart)
- Point 6: Upgraded "I Need" Structured Buyer Lead Engine (lifecycle, structured offers, accept offer)
- Point 7: Buyer Lead Monetization (plan entitlements, privacy protection, lead funnel analytics)
- Points 8 & 9: Database-Driven Subscription Plans (FREE, PRO, GROWTH, BUSINESS + grandfathering, preserving 30-day trial, ₹199/mo, ₹1,499/yr)
- Points 10, 11 & 36: Merchant Revenue Hero KPI, 8-Stage Attribution Funnel & Merchant ROI North Star
- Point 12: Privacy-Preserving Merchant CRM Foundation
- Points 13 & 14: Hyperlocal Demand Intelligence & Demand Gap Engine (Opportunity Score)
- Points 15 & 16: Mobile Cart Vendor Mode & Real Geographic Cluster Route Optimization
- Point 17: AI Maturity Framework Registry (PROTOTYPE, RULE_BASED, DATA_DRIVEN, MODEL_ASSISTED, PRODUCTION_AI)
- Points 18 & 19: Official WhatsApp Business Adapter & Intelligent Notification Engine
- Points 20 & 21: Self-Service Promoted Listings & Local Advertising Engine (SPONSORED separation, ROAS, moderation)
- Point 22: Multi-Engine Revenue Control Center & Traceable Financial Ledger
- Point 23: Consumer Free Core Guarantee & Optional Consumer Premium Config
- Point 24: Referral & Viral Loop Engine (Consumer & Merchant referrals + anti-abuse)
- Points 25 & 26: Locality-First Expansion Engine & Marketplace Density Readiness Score
- Point 27: Merchant Acquisition CRM Pipeline
- Point 28: Physical QR System (Store Profile, Live Products, Check-In, Verified Badge, revocation & scan tracking)
- Point 29: Explainable Merchant Reliability Score
- Point 30: Multi-Signal Fraud & Abuse Intelligence Queue
- Point 33: Idempotent Domain Event Architecture (19 canonical events)
- Point 34: A/B Experimentation Framework
- Points 35, 37, 38: CEO Executive Dashboard, KPI Target/Health System & Execution Roadmap
- Granular Admin RBAC (9 roles) & Immutable Audit Logging with before/after state capture
"""

import csv
import hashlib
import io
import math
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def haversine_km(lat1: Optional[float], lng1: Optional[float], lat2: Optional[float], lng2: Optional[float]) -> Optional[float]:
    if lat1 is None or lng1 is None or lat2 is None or lng2 is None:
        return None
    try:
        r = 6371.0
        p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
        dp = math.radians(float(lat2) - float(lat1))
        dl = math.radians(float(lng2) - float(lng1))
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * r * math.asin(math.sqrt(a))
    except Exception:
        return None


def mask_phone_str(phone: Optional[str]) -> str:
    if not phone:
        return "—"
    s = str(phone).strip()
    if len(s) <= 4:
        return "****"
    return f"{s[:2]}******{s[-2:]}"


def mask_email_str(email: Optional[str]) -> str:
    if not email or "@" not in str(email):
        return "—"
    local, domain = str(email).split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[:2]}***@{domain}"


# ============================================================================
# GRANULAR ADMIN RBAC DEFINITIONS (9 Roles)
# ============================================================================

ADMIN_ROLES_PERMISSIONS: Dict[str, Dict[str, Any]] = {
    "SUPER_ADMIN": {
        "label": "Super Admin",
        "description": "Full unrestricted governance across all 11 Super Admin domains.",
        "domains": ["*"],
        "can_reveal_pii": True,
        "can_impersonate": True,
        "can_mutate_finance": True,
        "can_mutate_security": True,
    },
    "OPERATIONS_ADMIN": {
        "label": "Operations Admin",
        "description": "Manages merchants, catalog, inventory trust, localities, mobile vendors, and buyer requests.",
        "domains": ["overview", "merchants", "consumers", "catalog", "growth", "attribution"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
    },
    "FINANCE_ADMIN": {
        "label": "Finance Admin",
        "description": "Manages subscriptions, billing, invoices, refunds, revenue ledger, and ad billing.",
        "domains": ["overview", "revenue", "monetization"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": True,
        "can_mutate_security": False,
    },
    "SUPPORT_ADMIN": {
        "label": "Support Admin",
        "description": "Manages grievances, disputes, consumer/vendor support, and order issues.",
        "domains": ["overview", "support", "consumers", "merchants"],
        "can_reveal_pii": True,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
    },
    "AI_ADMIN": {
        "label": "AI Governance Admin",
        "description": "Manages AI Control Center, prompts, voice lexicon, AI maturity registry, and model guardrails.",
        "domains": ["overview", "ai", "platform_control"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
    },
    "MARKETING_ADMIN": {
        "label": "Marketing & Promotions Admin",
        "description": "Moderates promoted listings, ad campaigns, referral programs, and notification templates.",
        "domains": ["overview", "monetization", "growth"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
    },
    "SALES_ADMIN": {
        "label": "Sales & Acquisition Admin",
        "description": "Manages Merchant Acquisition CRM, onboarding pipeline, locality expansion, and trial conversions.",
        "domains": ["overview", "growth", "merchants"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
    },
    "RISK_ADMIN": {
        "label": "Risk, Fraud & Trust Admin",
        "description": "Investigates fraud flags, attribution anomalies, reliability overrides, and audit logs.",
        "domains": ["overview", "risk", "attribution", "support"],
        "can_reveal_pii": True,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": True,
    },
    "ANALYST": {
        "label": "Read-Only Executive Analyst",
        "description": "Read-only access to executive dashboards, KPIs, experiments, and marketplace analytics.",
        "domains": ["overview", "attribution", "growth"],
        "can_reveal_pii": False,
        "can_impersonate": False,
        "can_mutate_finance": False,
        "can_mutate_security": False,
        "read_only": True,
    },
}


# ============================================================================
# POINT 33: CANONICAL DOMAIN EVENT TYPES
# ============================================================================

CANONICAL_DOMAIN_EVENTS = [
    "PRODUCT_SEARCHED",
    "PRODUCT_VIEWED",
    "SELLER_VIEWED",
    "DIRECTIONS_REQUESTED",
    "TRIP_STARTED",
    "STORE_VISITED",
    "QR_CHECKED_IN",
    "CART_CREATED",
    "CART_UPDATED",
    "ORDER_PLACED",
    "ORDER_CONFIRMED",
    "PURCHASE_CONFIRMED",
    "RECEIPT_UPLOADED",
    "REQUEST_CREATED",
    "REQUEST_RESPONDED",
    "CAMPAIGN_CLICKED",
    "SUBSCRIPTION_STARTED",
    "SUBSCRIPTION_RENEWED",
    "SUBSCRIPTION_CANCELLED",
]


async def emit_domain_event(
    db,
    event_type: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    seller_id: Optional[str] = None,
    product_id: Optional[str] = None,
    order_id: Optional[str] = None,
    request_id: Optional[str] = None,
    campaign_id: Optional[str] = None,
    locality: Optional[str] = "Dehradun",
    payload: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Emits an idempotent, privacy-safe domain event into `domain_events`."""
    if idempotency_key:
        existing = await db.domain_events.find_one({"idempotency_key": idempotency_key})
        if existing:
            existing["id"] = str(existing.get("id") or existing.get("_id"))
            existing.pop("_id", None)
            return {**existing, "deduplicated": True}

    safe_payload = dict(payload or {})
    # Strip any accidental raw PII fields from event payload
    for pii_field in ("password", "password_hash", "raw_phone", "raw_email", "token"):
        safe_payload.pop(pii_field, None)

    doc = {
        "id": f"evt_{uuid.uuid4().hex[:16]}",
        "schema_version": "1.0",
        "event_type": event_type,
        "actor_id": actor_id,
        "actor_role": actor_role or "anonymous",
        "seller_id": seller_id,
        "product_id": product_id,
        "order_id": order_id,
        "request_id": request_id,
        "campaign_id": campaign_id,
        "locality": locality or "Dehradun",
        "payload": safe_payload,
        "idempotency_key": idempotency_key or f"auto_{uuid.uuid4().hex}",
        "created_at": now_iso(),
    }
    try:
        await db.domain_events.insert_one(doc)
    except Exception:
        pass
    doc.pop("_id", None)
    return doc


# ============================================================================
# IMMUTABLE ADMIN AUDIT LOG HELPER
# ============================================================================

async def record_immutable_audit_log(
    db,
    admin: dict,
    action: str,
    entity_type: str,
    entity_id: str,
    reason: str = "Administrative action",
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    target_name: Optional[str] = None,
) -> Dict[str, Any]:
    ts = now_iso()
    admin_role = admin.get("admin_role") or ("SUPER_ADMIN" if admin.get("role") == "admin" else admin.get("role", "SUPER_ADMIN"))
    payload_str = f"{admin.get('id')}|{action}|{entity_type}|{entity_id}|{ts}|{reason}"
    integrity_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    doc = {
        "id": str(uuid.uuid4()),
        "admin_id": admin.get("id"),
        "admin_email": admin.get("email"),
        "admin_role": admin_role,
        "action": action,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "target_name": target_name or str(entity_id),
        "reason": reason,
        "before_state": before_state,
        "after_state": after_state,
        "integrity_hash": integrity_hash,
        "timestamp": ts,
    }
    await db.admin_audit_logs.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ============================================================================
# POINT 2: INVENTORY TRUST & CONFIDENCE ENGINE
# ============================================================================

DEFAULT_INVENTORY_TRUST_CONFIG = {
    "_id": "inventory_trust_config",
    "confirmed_recently_hours": 24,
    "probably_available_hours": 72,
    "stale_duration_hours": 168,
    "weights": {
        "recency": 0.45,
        "merchant_confirmation": 0.20,
        "verified_order_signal": 0.15,
        "historical_accuracy": 0.10,
        "stock_clarity": 0.10,
    },
    "ranking_impact_weight": 0.35,  # Prevents stale cheap items from automatically outranking fresh items
    "auto_expire_after_hours": 720,
    "updated_at": now_iso(),
}


def compute_inventory_trust_sync(
    prod: Dict[str, Any],
    vendor: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Deterministic, explainable Inventory Confidence Score (0-100) using real product & merchant signals.
    Never fabricates signals.
    """
    cfg = config or DEFAULT_INVENTORY_TRUST_CONFIG
    confirmed_hrs = float(cfg.get("confirmed_recently_hours", 24))
    probable_hrs = float(cfg.get("probably_available_hours", 72))
    stale_hrs = float(cfg.get("stale_duration_hours", 168))

    in_stock = bool(prod.get("in_stock", True))
    now = now_utc()

    # Best confirmation timestamp: last_confirmed_at > last_order_at > updated_at > created_at
    best_ts_str = (
        prod.get("last_confirmed_at")
        or prod.get("last_order_confirmed_at")
        or prod.get("updated_at")
        or prod.get("created_at")
    )
    hours_since_update = 48.0
    if best_ts_str:
        try:
            dt = datetime.fromisoformat(str(best_ts_str).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            hours_since_update = max(0.0, (now - dt).total_seconds() / 3600.0)
        except Exception:
            hours_since_update = 48.0

    # 1. Recency component (0-45 pts)
    if hours_since_update <= 6:
        recency_pts = 45.0
    elif hours_since_update <= confirmed_hrs:
        recency_pts = 40.0 - ((hours_since_update - 6.0) / max(1.0, confirmed_hrs - 6.0)) * 8.0
    elif hours_since_update <= probable_hrs:
        recency_pts = 31.0 - ((hours_since_update - confirmed_hrs) / max(1.0, probable_hrs - confirmed_hrs)) * 13.0
    elif hours_since_update <= stale_hrs:
        recency_pts = 17.0 - ((hours_since_update - probable_hrs) / max(1.0, stale_hrs - probable_hrs)) * 10.0
    else:
        recency_pts = max(4.0, 7.0 - (hours_since_update - stale_hrs) / 72.0)

    # 2. Explicit merchant confirmation signal (0-20 pts)
    conf_count = int(prod.get("confirmation_count") or 0)
    has_recent_confirm = bool(prod.get("last_confirmed_at") and hours_since_update <= confirmed_hrs)
    if has_recent_confirm:
        confirm_pts = 20.0
    elif conf_count > 0:
        confirm_pts = min(15.0, 8.0 + conf_count * 2.0)
    elif prod.get("source") in ("voice_inventory", "csv_import", "pos_import"):
        confirm_pts = 12.0
    else:
        confirm_pts = 8.0

    # 3. Verified order / purchase / customer availability signal (0-15 pts)
    verified_orders = int(prod.get("verified_order_count") or 0)
    customer_confirms = int(prod.get("customer_availability_confirms") or 0)
    if verified_orders > 0 or customer_confirms > 0:
        order_pts = min(15.0, 9.0 + (verified_orders + customer_confirms) * 2.0)
    else:
        order_pts = 6.0

    # 4. Vendor historical accuracy / verification (0-10 pts)
    v_acc = float((vendor or {}).get("inventory_accuracy_score") or 80.0)
    if (vendor or {}).get("is_verified"):
        accuracy_pts = min(10.0, (v_acc / 100.0) * 10.0)
    else:
        accuracy_pts = min(7.0, (v_acc / 100.0) * 7.0)

    # 5. Stock quantity clarity (0-10 pts)
    stock_qty = prod.get("stock_quantity")
    if not in_stock:
        stock_pts = 0.0
    elif stock_qty is not None and float(stock_qty or 0) > 0:
        stock_pts = 10.0
    else:
        stock_pts = 7.0

    raw_score = recency_pts + confirm_pts + order_pts + accuracy_pts + stock_pts
    if not in_stock:
        score = 0
        state = "OUT_OF_STOCK"
        badge_text = "Out of stock"
        badge_icon = "🔴"
    else:
        score = int(round(max(5.0, min(100.0, raw_score))))
        if score >= 75 and hours_since_update <= confirmed_hrs:
            state = "CONFIRMED_RECENTLY"
            badge_text = "Confirmed recently"
            badge_icon = "🟢"
        elif score >= 45 and hours_since_update <= probable_hrs:
            state = "PROBABLY_AVAILABLE"
            badge_text = "Probably available"
            badge_icon = "🟡"
        else:
            state = "POSSIBLY_STALE"
            badge_text = "Information may be outdated"
            badge_icon = "🟠"

    signals_used = ["last_product_update"]
    if prod.get("last_confirmed_at"):
        signals_used.append("merchant_confirmation")
    if verified_orders > 0:
        signals_used.append("verified_purchase")
    if prod.get("source") in ("csv_import", "pos_import"):
        signals_used.append("pos_or_csv_import")
    if stock_qty is not None:
        signals_used.append("explicit_stock_quantity")

    return {
        "inventory_confidence_score": score,
        "inventory_freshness_state": state,
        "inventory_badge_label": f"{badge_icon} {badge_text}",
        "inventory_badge_text": badge_text,
        "inventory_badge_icon": badge_icon,
        "hours_since_last_verification": round(hours_since_update, 1),
        "signals_used": signals_used,
    }


# ============================================================================
# POINT 3: MULTI-ITEM VOICE & INVOICE INVENTORY EXTRACTOR
# ============================================================================

KNOWN_BRANDS = [
    "Maggi", "Amul", "Dairy Milk", "Cadbury", "Surf Excel", "Parle-G", "Parle",
    "Aashirvaad", "Tata", "Fortune", "MDH", "Everest", "Haldiram", "Britannia",
    "Mother Dairy", "Nestle", "Patanjali", "Dettol", "Lifebuoy", "Colgate",
    "Clinic Plus", "Sunfeast", "Kurkure", "Lays", "Kissan", "Red Label", "Bru",
]

CATEGORY_KEYWORDS = {
    "vegetables": ["tomato", "tamatar", "potato", "aloo", "onion", "pyaaz", "spinach", "palak", "bhindi", "cauliflower", "gobhi", "carrot", "gajar", "chilli", "mirch", "ginger", "adrak", "garlic", "lehsun"],
    "fruits": ["apple", "seb", "banana", "kela", "mango", "aam", "orange", "santra", "papaya", "grapes", "angoor", "pomegranate", "anaar"],
    "dairy": ["milk", "doodh", "paneer", "curd", "dahi", "butter", "makhan", "ghee", "cheese", "amul"],
    "bakery": ["bread", "biscuit", "parle", "cake", "rusk", "cookies", "dairy milk", "cadbury", "chocolate"],
    "household": ["surf excel", "detergent", "soap", "sabun", "dettol", "lifebuoy", "colgate", "toothpaste", "cleaner", "phenyl"],
    "groceries": ["maggi", "noodles", "rice", "chawal", "atta", "flour", "dal", "sugar", "cheeni", "salt", "namak", "oil", "tel", "masala", "tea", "chai"],
}

NUMBER_WORDS = {
    "one": 1, "ek": 1, "two": 2, "do": 2, "three": 3, "teen": 3, "four": 4, "chaar": 4,
    "five": 5, "paanch": 5, "six": 6, "chhe": 6, "seven": 7, "saat": 7, "eight": 8, "aath": 8,
    "nine": 9, "nau": 9, "ten": 10, "das": 10, "twelve": 12, "barah": 12, "fifteen": 15, "pandrah": 15,
    "twenty": 20, "bees": 20, "twenty five": 25, "pachis": 25, "thirty": 30, "tees": 30,
    "forty": 40, "chalis": 40, "fifty": 50, "pachaas": 50, "hundred": 100, "sau": 100,
}


def parse_multi_item_voice_inventory(transcript: str, existing_products: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """
    Parses multi-item natural Hinglish/Hindi/English voice utterances such as:
    '10 packet Maggi 14 rupees, 20 Dairy Milk 20 rupees, Surf Excel one kilo 135'
    into structured product candidates with duplicate matching and confidence scoring.
    """
    if not transcript or not transcript.strip():
        return []

    text = transcript.strip()
    # Split on commas, semicolons, ' and ', ' aur ', or newlines
    segments = re.split(r"[,;\n]+|\b(?:and|aur)\b", text, flags=re.IGNORECASE)
    extracted: List[Dict[str, Any]] = []
    existing_list = existing_products or []

    unit_patterns = [
        (r"\b(packets?|packs?|pkt|पैकेट)\b", "packet"),
        (r"\b(kilos?|kilograms?|kg|किलो)\b", "kg"),
        (r"\b(grams?|gm|g|ग्राम)\b", "g"),
        (r"\b(litres?|liters?|ltr|l|लीटर)\b", "L"),
        (r"\b(ml|millilitres?)\b", "ml"),
        (r"\b(dozens?|दर्जन)\b", "dozen"),
        (r"\b(boxes?|dabba|बॉक्स)\b", "box"),
        (r"\b(bottles?|बोतल)\b", "bottle"),
        (r"\b(pieces?|pcs?|nag|पीस|नग)\b", "piece"),
    ]

    for raw_seg in segments:
        seg = raw_seg.strip(" .")
        if not seg:
            continue

        working = seg
        # Replace number words (e.g. "one kilo" -> "1 kilo", "das kilo" -> "10 kilo")
        for word, num in sorted(NUMBER_WORDS.items(), key=lambda x: -len(x[0])):
            working = re.sub(rf"\b{re.escape(word)}\b", str(num), working, flags=re.IGNORECASE)

        # Detect pack size like "1 kg", "500 g", "250 ml"
        pack_size = None
        pack_match = re.search(r"(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram|ml|l|litre|liter)\b", working, flags=re.IGNORECASE)
        if pack_match:
            pack_size = f"{pack_match.group(1)} {pack_match.group(2).lower()}"

        # Detect unit
        detected_unit = "piece"
        for pat, norm_u in unit_patterns:
            if re.search(pat, working, flags=re.IGNORECASE):
                detected_unit = norm_u
                break

        # Extract price (e.g., "14 rupees", "₹135", "at 20", or trailing number)
        price: Optional[float] = None
        price_match = re.search(
            r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rupees?|rupaye|rs\.?|रुपये|रुपए)\b|(?:at|@|for)\s*(\d+(?:\.\d+)?)\b",
            working,
            flags=re.IGNORECASE,
        )
        if price_match:
            p_str = price_match.group(1) or price_match.group(2) or price_match.group(3)
            price = float(p_str)
            # Remove matched price phrase from working string for cleaner product name
            working_no_price = working[:price_match.start()] + " " + working[price_match.end():]
        else:
            # Check if last token is a standalone number (e.g., "Surf Excel 1 kilo 135")
            nums = list(re.finditer(r"\b(\d+(?:\.\d+)?)\b", working))
            if len(nums) >= 2:
                last_num = nums[-1]
                price = float(last_num.group(1))
                working_no_price = working[:last_num.start()] + " " + working[last_num.end():]
            elif len(nums) == 1:
                # Single number could be price or quantity; treat as price if > 10 and no unit right after
                only_num = nums[0]
                val = float(only_num.group(1))
                after_text = working[only_num.end():].strip().lower()
                if any(after_text.startswith(u) for u in ("packet", "pack", "kg", "kilo", "g", "litre", "piece", "box")):
                    working_no_price = working
                else:
                    price = val
                    working_no_price = working[:only_num.start()] + " " + working[only_num.end():]
            else:
                working_no_price = working

        # Extract quantity (first number in remaining text)
        qty: float = 1.0
        qty_match = re.search(r"\b(\d+(?:\.\d+)?)\b", working_no_price)
        if qty_match:
            qty = float(qty_match.group(1))
            working_name = working_no_price[:qty_match.start()] + " " + working_no_price[qty_match.end():]
        else:
            working_name = working_no_price

        # Clean unit & filler words from product name
        for pat, _ in unit_patterns:
            working_name = re.sub(pat, " ", working_name, flags=re.IGNORECASE)
        working_name = re.sub(
            r"\b(add|daal|dalo|rupees|rupaye|rs|per|each|of|mein|me|at|for|in)\b",
            " ",
            working_name,
            flags=re.IGNORECASE,
        )
        clean_name = re.sub(r"\s+", " ", working_name).strip(" -.,").title()
        if not clean_name:
            clean_name = "General Item"

        # Detect Brand
        detected_brand = None
        for brand in KNOWN_BRANDS:
            if brand.lower() in clean_name.lower():
                detected_brand = brand
                break

        # Detect Category
        detected_cat = "groceries"
        lower_name = clean_name.lower()
        for cat, kw_list in CATEGORY_KEYWORDS.items():
            if any(kw in lower_name for kw in kw_list):
                detected_cat = cat
                break

        # Duplicate detection against vendor's existing catalog
        matched_dup = None
        for ex in existing_list:
            ex_name = str(ex.get("name") or "").lower().strip()
            if ex_name and (ex_name == lower_name or lower_name in ex_name or ex_name in lower_name):
                matched_dup = {
                    "id": str(ex.get("id") or ex.get("_id")),
                    "name": ex.get("name"),
                    "price": ex.get("price"),
                    "unit": ex.get("unit"),
                }
                break

        # Calculate extraction confidence
        conf = 0.55
        if clean_name != "General Item":
            conf += 0.20
        if price is not None and price > 0:
            conf += 0.15
        if qty > 0:
            conf += 0.10
        conf = round(min(0.98, conf), 2)
        requires_confirmation = bool(conf < 0.80 or price is None or price <= 0 or matched_dup is not None)

        extracted.append({
            "raw_segment": seg,
            "product": clean_name,
            "brand": detected_brand,
            "quantity": qty,
            "unit": detected_unit,
            "pack_size": pack_size,
            "price": price,
            "category": detected_cat,
            "availability": True,
            "confidence": conf,
            "requires_confirmation": requires_confirmation,
            "duplicate_match": matched_dup,
            "extraction_method": "RULE_BASED_LEXICON_PARSER",
        })

    return extracted


# ============================================================================
# SEED DEFAULTS: FEATURES, SUBSCRIPTION PLANS, AI MATURITY, LOCALITIES, ROADMAP
# ============================================================================

DEFAULT_PLATFORM_FEATURES = [
    {
        "feature_key": "core_auth_rbac",
        "name": "Authentication & Role-Based Access Control",
        "category": "CORE",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["consumer", "vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": [],
        "is_essential_security": True,
        "description": "Essential JWT authentication, session management, and RBAC enforcement. Cannot be disabled.",
    },
    {
        "feature_key": "inventory_trust_engine",
        "name": "Inventory Confidence & Freshness System",
        "category": "CORE",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["consumer", "vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["core_auth_rbac"],
        "is_essential_security": False,
        "description": "Computes 0-100 inventory confidence score and freshness badges from real merchant & order signals.",
    },
    {
        "feature_key": "frictionless_merchant_inventory",
        "name": "Frictionless Inventory (Voice, CSV, Barcode, Bulk Confirm)",
        "category": "CORE",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["inventory_trust_engine"],
        "is_essential_security": False,
        "description": "Multilingual voice extraction, CSV/XLSX bulk import, barcode registry, and 1-click inventory confirmation.",
    },
    {
        "feature_key": "cheapest_basket_engine",
        "name": "Cheapest Basket & Multi-Store Optimizer",
        "category": "GROWTH",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["consumer", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["inventory_trust_engine"],
        "is_essential_security": False,
        "description": "Compares CHEAPEST (multi-store), CONVENIENT (single-store), and NEAREST basket options with real savings.",
    },
    {
        "feature_key": "smart_shopping_lists",
        "name": "Persistent Smart Shopping Lists",
        "category": "GROWTH",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["consumer", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["cheapest_basket_engine"],
        "is_essential_security": False,
        "description": "Reusable household grocery lists with voice add, basket optimization, and 1-click cart conversion.",
    },
    {
        "feature_key": "structured_buyer_leads",
        "name": "Structured 'I Need' Buyer Lead Broadcasts",
        "category": "GROWTH",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["consumer", "vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["core_auth_rbac"],
        "is_essential_security": False,
        "description": "Real-time buyer demand broadcasting with structured merchant offer comparison and acceptance.",
    },
    {
        "feature_key": "merchant_subscriptions_v2",
        "name": "Multi-Tier Retailer & Cart Subscriptions",
        "category": "MONETIZATION",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["core_auth_rbac"],
        "is_essential_security": False,
        "description": "Database-driven FREE, PRO, GROWTH, BUSINESS plans with 30-day free trial, ₹199/mo, and ₹1,499/yr.",
    },
    {
        "feature_key": "promoted_listings_ads",
        "name": "Self-Service Promoted Listings & Local Ads",
        "category": "MONETIZATION",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["vendor", "consumer", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["inventory_trust_engine"],
        "is_essential_security": False,
        "description": "Clearly labeled SPONSORED store/product promotions with budget pacing, ROAS tracking, and moderation.",
    },
    {
        "feature_key": "buyer_lead_monetization",
        "name": "Buyer Lead Response Entitlements",
        "category": "MONETIZATION",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["structured_buyer_leads", "merchant_subscriptions_v2"],
        "is_essential_security": False,
        "description": "Plan-based monthly buyer lead credits and lead-to-sale conversion tracking.",
    },
    {
        "feature_key": "mobile_vendor_cluster_routing",
        "name": "Mobile Cart Hotspot Clustering & Route Engine",
        "category": "GROWTH",
        "status": "ENABLED",
        "beta_status": False,
        "allowed_roles": ["vendor", "admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["structured_buyer_leads"],
        "is_essential_security": False,
        "description": "Privacy-safe geographic demand clustering and stop ranking for street-cart vendors.",
    },
    {
        "feature_key": "whatsapp_business_bridge",
        "name": "WhatsApp Business Notification Adapter",
        "category": "EXPERIMENTAL",
        "status": "BETA",
        "beta_status": True,
        "allowed_roles": ["vendor", "consumer", "admin"],
        "allowed_cities": ["Dehradun"],
        "allowed_localities": ["*"],
        "rollout_percentage": 100,
        "dependencies": ["core_auth_rbac"],
        "is_essential_security": False,
        "description": "Template-based WhatsApp alerts for buyer requests and order confirmations with in-app fallback.",
    },
    {
        "feature_key": "ab_experimentation_engine",
        "name": "A/B Experimentation & Conversion Guardrails",
        "category": "EXPERIMENTAL",
        "status": "BETA",
        "beta_status": True,
        "allowed_roles": ["admin"],
        "allowed_cities": ["*"],
        "allowed_localities": ["*"],
        "rollout_percentage": 50,
        "dependencies": ["core_auth_rbac"],
        "is_essential_security": False,
        "description": "Deterministic traffic bucket assignment and sample-size-aware experiment tracking.",
    },
]


DEFAULT_SUBSCRIPTION_PLANS = [
    {
        "plan_code": "FREE",
        "name": "Free Plan (Retailer: 30 items · Mobile Cart: 20 items)",
        "vendor_tier": "retailer",
        "monthly_price": 0,
        "annual_price": 0,
        "trial_duration_days": 30,
        "product_limit": 30,
        "cart_product_limit": 20,
        "branch_limit": 1,
        "lead_limit": 30,
        "ai_entitlement": "BASIC_VOICE_INVENTORY",
        "analytics_entitlement": "BASIC_OVERVIEW",
        "promotion_entitlement": "NONE",
        "integration_entitlement": "SMART_TEMPLATES_AND_VOICE",
        "active": True,
        "display_order": 1,
        "grandfathering_enabled": True,
        "features": [
            "30-day full Pro trial included on signup",
            "Up to 30 active listings (Retailer) or 20 active listings (Mobile Cart)",
            "Free Live Location sharing & Start/Stop Selling for Mobile Carts",
            "Unlimited customer orders, customer requests & messaging",
            "Basic voice product entry & smart product templates",
        ],
    },
    {
        "plan_code": "PRO",
        "name": "Retailer Pro (₹199/mo or ₹1,499/yr)",
        "vendor_tier": "retailer",
        "monthly_price": 199,
        "promo_monthly_price": 199,
        "annual_price": 1499,
        "trial_duration_days": 30,
        "product_limit": None,  # Unlimited
        "branch_limit": 5,
        "lead_limit": 500,
        "ai_entitlement": "FULL_COPILOT_AND_VOICE",
        "analytics_entitlement": "FULL_ATTRIBUTION_AND_ROI",
        "promotion_entitlement": "SELF_SERVE_ADS",
        "integration_entitlement": "CSV_XLSX_BARCODE",
        "active": True,
        "display_order": 2,
        "grandfathering_enabled": True,
        "features": [
            "Unlimited product listings & advanced bulk/voice inventory",
            "Understand which products customers want most (Demand & Stockout Intelligence)",
            "Get advanced sales insights, Attribution & Customer Retention CRM",
            "Multi-branch management & priority local discovery",
        ],
    },
    {
        "plan_code": "GROWTH",
        "name": "Retailer Growth",
        "vendor_tier": "retailer",
        "monthly_price": 499,
        "annual_price": 4499,
        "trial_duration_days": 30,
        "product_limit": None,
        "branch_limit": 10,
        "lead_limit": 1000,
        "ai_entitlement": "FULL_AI_SUITE_AND_DEMAND_GAPS",
        "analytics_entitlement": "CRM_COHORTS_AND_DEMAND_INTELLIGENCE",
        "promotion_entitlement": "PRIORITY_SPONSORED_CREDITS",
        "integration_entitlement": "POS_WEBHOOKS_AND_BULK_SYNC",
        "active": True,
        "display_order": 3,
        "grandfathering_enabled": True,
        "features": [
            "Everything in Pro + Demand Gap Opportunity Engine",
            "Privacy-preserving Customer CRM & Repeat Cohorts",
            "Up to 10 branches + WhatsApp order alerts",
        ],
    },
    {
        "plan_code": "BUSINESS",
        "name": "Enterprise / Multi-Store Business",
        "vendor_tier": "retailer",
        "monthly_price": 999,
        "annual_price": 8999,
        "trial_duration_days": 30,
        "product_limit": None,
        "branch_limit": 50,
        "lead_limit": 999999,
        "ai_entitlement": "ENTERPRISE_AI_AND_CUSTOM_LEXICON",
        "analytics_entitlement": "EXECUTIVE_MULTI_BRANCH_BI",
        "promotion_entitlement": "DEDICATED_SPOTLIGHT_AND_ADS",
        "integration_entitlement": "FULL_ERP_POS_API",
        "active": True,
        "display_order": 4,
        "grandfathering_enabled": True,
        "features": [
            "Unlimited products, unlimited buyer leads, up to 50 branches",
            "Dedicated Category Spotlight & Promoted Campaigns",
            "Full POS/ERP inventory sync & priority support",
        ],
    },
    {
        "plan_code": "CART_PRO",
        "name": "Mobile Cart Vendor Pro (₹99/mo or ₹799/yr)",
        "vendor_tier": "cart_vendor",
        "weekly_price": 25,
        "monthly_price": 99,
        "annual_price": 799,
        "trial_duration_days": 30,
        "product_limit": None,
        "branch_limit": 1,
        "lead_limit": 500,
        "ai_entitlement": "VOICE_AND_ROUTE_OPTIMIZER",
        "analytics_entitlement": "CART_HOTSPOT_ANALYTICS",
        "promotion_entitlement": "ARRIVAL_BROADCASTS",
        "integration_entitlement": "VOICE_QUICK_STOCK",
        "active": True,
        "display_order": 5,
        "grandfathering_enabled": True,
        "features": [
            "Unlimited product listings (vs. 20 on Free)",
            "Discover better selling locations (AI Route Optimization & Demand Hotspots)",
            "7-Day Demand Forecasting & Advanced Earnings Analytics",
            "Advanced multilingual voice inventory automation",
        ],
    },
]


DEFAULT_AI_MATURITY_REGISTRY = [
    {
        "capability_key": "hyperlocal_ai_copilot",
        "name": "Multilingual HyperLocal Shopping & Vendor Copilot",
        "maturity_level": "MODEL_ASSISTED",
        "engine_type": "Gemini LLM + Deterministic Catalog & Haversine Grounding",
        "input_signals": ["live_products", "live_vendors", "user_cart", "haversine_distance", "hinglish_lexicon"],
        "fallback_behavior": "Deterministic catalog & price-sorted synthesis when LLM key is absent or times out",
        "human_override_supported": True,
        "cost_status": "Free Tier / Grounded Context",
    },
    {
        "capability_key": "voice_inventory_parser",
        "name": "Multilingual Voice Inventory Extraction",
        "maturity_level": "RULE_BASED",
        "engine_type": "Multilingual Lexicon + Regex + Number/Unit Normalizer (with confirmation gate)",
        "input_signals": ["voice_transcript", "hindi_hinglish_dictionary", "vendor_existing_catalog"],
        "fallback_behavior": "Draft verification modal requiring explicit merchant confirmation for confidence < 0.80",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
    {
        "capability_key": "inventory_trust_scoring",
        "name": "Inventory Confidence & Freshness Scoring",
        "maturity_level": "DATA_DRIVEN",
        "engine_type": "Weighted Multi-Signal Freshness & Order Verification Formula",
        "input_signals": ["updated_at", "last_confirmed_at", "verified_orders", "vendor_accuracy"],
        "fallback_behavior": "Defaults to time-decay since last product update",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
    {
        "capability_key": "cheapest_basket_optimizer",
        "name": "Multi-Store Cheapest Basket & Convenience Optimizer",
        "maturity_level": "DATA_DRIVEN",
        "engine_type": "Combinatorial Price, Distance & Inventory Confidence Optimizer",
        "input_signals": ["product_prices", "vendor_coordinates", "inventory_confidence_score"],
        "fallback_behavior": "Single-store partial match with missing-item replacement suggestions",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
    {
        "capability_key": "mobile_cart_route_optimizer",
        "name": "Mobile Cart Demand Hotspot & Stop Sequencer",
        "maturity_level": "DATA_DRIVEN",
        "engine_type": "Geospatial Grid Clustering + Commercial Opportunity per KM Scorer",
        "input_signals": ["open_buyer_requests", "product_searches", "cart_inventory", "haversine_distance"],
        "fallback_behavior": "Haversine distance estimation (1.28x road factor) when external road-routing API is unconfigured",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
    {
        "capability_key": "demand_gap_engine",
        "name": "Hyperlocal Unmet Demand Gap & Opportunity Scorer",
        "maturity_level": "DATA_DRIVEN",
        "engine_type": "Search & Request vs. Local Supply Ratio Scorer",
        "input_signals": ["domain_events:PRODUCT_SEARCHED", "requests", "nearby_products"],
        "fallback_behavior": "Displays 'Insufficient Data' until minimum privacy cohort threshold is reached",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
    {
        "capability_key": "fraud_anomaly_detector",
        "name": "Multi-Signal Attribution & Referral Fraud Detector",
        "maturity_level": "RULE_BASED",
        "engine_type": "Deterministic Velocity, Self-Dealing & Spike Rule Engine",
        "input_signals": ["attribution_sessions", "vendor_daily_sales", "referrals", "ad_clicks"],
        "fallback_behavior": "Flags into Admin Risk Queue for mandatory human review before account suspension",
        "human_override_supported": True,
        "cost_status": "Zero External API Cost",
    },
]


DEFAULT_DEHRADUN_LOCALITIES = [
    {"locality_id": "loc_paltan_bazaar", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "Central", "name": "Paltan Bazaar & Clock Tower", "lat": 30.3244, "lng": 78.0418, "radius_km": 2.0, "status": "LIVE"},
    {"locality_id": "loc_rajpur_road", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "North", "name": "Rajpur Road & Jakhan", "lat": 30.3610, "lng": 78.0690, "radius_km": 2.5, "status": "LIVE"},
    {"locality_id": "loc_ballupur", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "West", "name": "Ballupur & Chakrata Road", "lat": 30.3340, "lng": 78.0110, "radius_km": 2.5, "status": "LIVE"},
    {"locality_id": "loc_clement_town", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "South", "name": "Clement Town & ISBT", "lat": 30.2680, "lng": 78.0080, "radius_km": 3.0, "status": "BETA"},
    {"locality_id": "loc_prem_nagar", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "West", "name": "Prem Nagar", "lat": 30.3350, "lng": 77.9600, "radius_km": 2.5, "status": "MERCHANT_ONBOARDING"},
    {"locality_id": "loc_nehru_colony", "country": "India", "state": "Uttarakhand", "city": "Dehradun", "zone": "East", "name": "Nehru Colony & Dharampur", "lat": 30.2980, "lng": 78.0550, "radius_km": 2.5, "status": "LIVE"},
]


DEFAULT_EXECUTION_ROADMAP = [
    {
        "milestone_id": "phase_1_trust_core",
        "phase": "Phase 1 — Trust & Core Loop",
        "title": "Inventory Freshness, Frictionless Voice/CSV Catalog & Unified Admin Governance",
        "owner": "Core Platform Team",
        "status": "COMPLETED",
        "target_date": "2026-Q4",
        "linked_kpis": ["fresh_inventory_pct", "active_merchants"],
        "blockers": "None",
        "notes": "Inventory confidence badges, multi-item voice parser, CSV import, and 19 domain events live.",
    },
    {
        "milestone_id": "phase_2_consumer_utility",
        "phase": "Phase 2 — Consumer Utility",
        "title": "Cheapest Basket Optimizer, Smart Shopping Lists & Structured 'I Need' Broadcasts",
        "owner": "Consumer Growth Team",
        "status": "COMPLETED",
        "target_date": "2026-Q4",
        "linked_kpis": ["search_to_order_conversion", "lead_response_rate"],
        "blockers": "None",
        "notes": "CHEAPEST/CONVENIENT/NEAREST basket modes, reusable shopping lists, and structured buyer leads active.",
    },
    {
        "milestone_id": "phase_3_monetization",
        "phase": "Phase 3 — Merchant Monetization",
        "title": "Revenue Hero KPI, Multi-Tier Subscriptions, Self-Serve Local Ads & Lead Credits",
        "owner": "Monetization & Billing Team",
        "status": "COMPLETED",
        "target_date": "2026-Q4",
        "linked_kpis": ["merchant_roi", "mrr", "paid_merchants"],
        "blockers": "None",
        "notes": "FREE/PRO/GROWTH/BUSINESS tiers, SPONSORED ad engine, and traceable multi-engine revenue ledger live.",
    },
    {
        "milestone_id": "phase_4_scale_intelligence",
        "phase": "Phase 4 — Scale & Intelligence",
        "title": "Demand Gap Engine, Mobile Cart Hotspot Routing, Locality Density & Fraud Queue",
        "owner": "AI & Marketplace Ops Team",
        "status": "IN_PROGRESS",
        "target_date": "2027-Q1",
        "linked_kpis": ["locality_readiness_score", "repeat_customer_rate"],
        "blockers": "Expanding merchant density in outer Dehradun zones (Prem Nagar, Clement Town).",
        "notes": "Geospatial clustering, WhatsApp Business adapter, and A/B experimentation framework operational.",
    },
]


# ============================================================================
# POINT 29: EXPLAINABLE MERCHANT RELIABILITY SCORE ENGINE
# ============================================================================

async def compute_merchant_reliability(db, vendor: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes an explainable 0-100 Merchant Reliability Score from real signals:
    - inventory freshness & confirmation consistency
    - buyer request / message response rate
    - order completion vs cancellation rate
    - customer ratings & grievance history
    - verified transactions
    Never penalizes new merchants unfairly (returns 'Developing History' when sample size is small).
    """
    vid = str(vendor.get("id") or vendor.get("_id"))
    override = vendor.get("reliability_override")
    if override and isinstance(override, dict) and override.get("score") is not None:
        sc = int(override["score"])
        return {
            "vendor_id": vid,
            "reliability_score": sc,
            "consumer_label": override.get("label") or ("Highly Reliable" if sc >= 80 else "Reliable"),
            "is_overridden": True,
            "override_reason": override.get("reason"),
            "sample_size": "admin_override",
        }

    prods = await db.products.find({"vendor_id": vid}).to_list(200)
    orders = await db.marketplace_orders.find({"vendor_id": vid}).to_list(200)
    reviews = await db.reviews.find({"vendor_id": vid}).to_list(100)
    grievances = await db.grievances.count_documents({"against_user_id": vid, "status": {"$in": ["open", "escalated"]}})
    verified_purchases = await db.purchase_attributions.count_documents({"seller_id": vid})
    replies_count = await db.request_replies.count_documents({"vendor_id": vid})

    total_interactions = len(orders) + len(reviews) + verified_purchases + replies_count

    # 1. Inventory freshness & confirmation consistency (0-30 pts)
    if prods:
        trust_scores = [compute_inventory_trust_sync(p, vendor)["inventory_confidence_score"] for p in prods]
        avg_trust = sum(trust_scores) / len(trust_scores)
        inv_pts = round((avg_trust / 100.0) * 30.0, 1)
    else:
        inv_pts = 15.0

    # 2. Order completion & low cancellation (0-25 pts)
    if orders:
        completed = sum(1 for o in orders if o.get("status") in ("COMPLETED", "PAID", "READY_FOR_PICKUP", "CONFIRMED"))
        cancelled = sum(1 for o in orders if o.get("status") in ("REJECTED", "CANCELLED"))
        comp_rate = completed / max(1, len(orders))
        canc_penalty = min(10.0, cancelled * 3.0)
        order_pts = round(max(5.0, comp_rate * 25.0 - canc_penalty), 1)
    else:
        order_pts = 18.0

    # 3. Customer ratings & grievance penalty (0-25 pts)
    if reviews:
        avg_rating = sum(float(r.get("rating") or 4.5) for r in reviews) / len(reviews)
        rating_pts = round((avg_rating / 5.0) * 25.0, 1)
    else:
        rating_pts = 18.0
    grievance_penalty = min(15.0, grievances * 5.0)
    rating_pts = max(0.0, rating_pts - grievance_penalty)

    # 4. Responsiveness & verified physical activity (0-20 pts)
    resp_pts = min(20.0, 10.0 + (verified_purchases * 2.0) + (replies_count * 2.0) + (4.0 if vendor.get("is_verified") else 0.0))

    total_score = int(round(max(10.0, min(100.0, inv_pts + order_pts + rating_pts + resp_pts))))

    if total_interactions < 2 and len(prods) < 3:
        consumer_label = "Developing History"
        status_tier = "DEVELOPING_HISTORY"
    elif total_score >= 80:
        consumer_label = "Highly Reliable"
        status_tier = "HIGHLY_RELIABLE"
    elif total_score >= 60:
        consumer_label = "Reliable"
        status_tier = "RELIABLE"
    else:
        consumer_label = "Developing History"
        status_tier = "NEEDS_IMPROVEMENT"

    return {
        "vendor_id": vid,
        "reliability_score": total_score,
        "consumer_label": consumer_label,
        "status_tier": status_tier,
        "total_evidence_interactions": total_interactions,
        "breakdown": {
            "inventory_freshness_pts": inv_pts,
            "order_fulfillment_pts": order_pts,
            "customer_satisfaction_pts": rating_pts,
            "responsiveness_and_verification_pts": resp_pts,
            "open_grievances_penalty": grievance_penalty,
        },
        "explanation": (
            f"Based on {len(prods)} products, {len(orders)} orders, {len(reviews)} reviews, "
            f"and {verified_purchases} verified store purchases."
            if total_interactions >= 2
            else "Developing History: Merchant is new or accumulating verified marketplace interactions."
        ),
    }


# ============================================================================
# POINT 4: CHEAPEST BASKET OPTIMIZER (CHEAPEST, CONVENIENT, NEAREST)
# ============================================================================

async def optimize_grocery_basket(
    db,
    items: List[Dict[str, Any]],
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
    city: str = "Dehradun",
) -> Dict[str, Any]:
    """
    Evaluates real vendor inventory, real prices, real distances, and inventory_confidence_score.
    Produces 3 modes:
    - CHEAPEST (multi-store split for lowest cost)
    - CONVENIENT (single store with best item coverage & confidence)
    - NEAREST (closest store(s) with available stock)
    Never fabricates savings.
    """
    if not items:
        return {
            "status": "empty",
            "modes": {},
            "missing_products": [],
            "low_confidence_products": [],
            "replacement_suggestions": [],
        }

    vendors_docs = await db.users.find({"role": "vendor"}).to_list(300)
    vendor_map = {str(v["_id"]): v for v in vendors_docs}
    trust_cfg = await db.admin_settings.find_one({"_id": "inventory_trust_config"}) or DEFAULT_INVENTORY_TRUST_CONFIG

    all_in_stock_prods = await db.products.find({"in_stock": True}).to_list(1500)

    # Map each requested item to matching products across stores
    item_candidates: Dict[str, List[Dict[str, Any]]] = {}
    missing_products: List[str] = []
    low_confidence_products: List[Dict[str, Any]] = []
    replacement_suggestions: List[Dict[str, Any]] = []

    for req_item in items:
        raw_name = str(req_item.get("item_name") or req_item.get("name") or "").strip()
        req_qty = float(req_item.get("quantity") or 1.0)
        if not raw_name:
            continue

        q_lower = raw_name.lower()
        tokens = [t for t in re.split(r"\s+", q_lower) if len(t) >= 2]
        matches = []
        for p in all_in_stock_prods:
            p_Text = " ".join([
                str(p.get("name") or ""),
                str(p.get("name_hi") or ""),
                str(p.get("name_hinglish") or ""),
                str(p.get("category") or ""),
            ]).lower()
            if q_lower in p_Text or (tokens and all(t in p_Text for t in tokens)):
                vid = str(p.get("vendor_id") or "")
                v_doc = vendor_map.get(vid, {})
                trust = compute_inventory_trust_sync(p, v_doc, trust_cfg)
                dist_km = haversine_km(user_lat, user_lng, v_doc.get("lat"), v_doc.get("lng"))
                unit_price = float(p.get("price") or 0.0)
                line_total = round(unit_price * req_qty, 2)
                cand = {
                    "requested_item": raw_name,
                    "requested_quantity": req_qty,
                    "product_id": str(p["_id"]),
                    "product_name": p.get("name"),
                    "unit": p.get("unit", "unit"),
                    "unit_price": unit_price,
                    "line_total": line_total,
                    "vendor_id": vid,
                    "vendor_shop": v_doc.get("shop_name") or v_doc.get("name") or "Local Seller",
                    "vendor_type": v_doc.get("vendor_type", "retailer"),
                    "distance_km": round(dist_km, 2) if dist_km is not None else None,
                    "inventory_confidence_score": trust["inventory_confidence_score"],
                    "inventory_freshness_state": trust["inventory_freshness_state"],
                    "inventory_badge_label": trust["inventory_badge_label"],
                    "category": p.get("category", "groceries"),
                }
                matches.append(cand)

        if not matches:
            missing_products.append(raw_name)
            # Suggest real in-stock replacement from related category if any
            fallback_prods = all_in_stock_prods[:3]
            for fp in fallback_prods:
                fvid = str(fp.get("vendor_id") or "")
                fv = vendor_map.get(fvid, {})
                replacement_suggestions.append({
                    "for_missing_item": raw_name,
                    "suggested_product_id": str(fp["_id"]),
                    "suggested_product_name": fp.get("name"),
                    "price": fp.get("price"),
                    "vendor_shop": fv.get("shop_name") or fv.get("name"),
                })
        else:
            # Sort candidates so fresh/high-confidence items beat stale items at identical prices
            matches.sort(key=lambda x: (
                0 if x["inventory_freshness_state"] != "POSSIBLY_STALE" else 1,
                x["unit_price"],
                -x["inventory_confidence_score"],
                x["distance_km"] if x["distance_km"] is not None else 99.0,
            ))
            item_candidates[raw_name] = matches
            best_c = matches[0]
            if best_c["inventory_freshness_state"] == "POSSIBLY_STALE" or best_c["inventory_confidence_score"] < 50:
                low_confidence_products.append(best_c)

    # 1. Mode CHEAPEST (Multi-Store Split: lowest price per item, preferring non-stale)
    cheapest_items = []
    cheapest_stores = set()
    cheapest_total = 0.0
    max_single_item_sum = 0.0

    for raw_name, cands in item_candidates.items():
        best_price_cand = min(cands, key=lambda x: (0 if x["inventory_freshness_state"] != "POSSIBLY_STALE" else 1, x["line_total"]))
        highest_price_cand = max(cands, key=lambda x: x["line_total"])
        cheapest_items.append(best_price_cand)
        cheapest_stores.add(best_price_cand["vendor_id"])
        cheapest_total += best_price_cand["line_total"]
        max_single_item_sum += highest_price_cand["line_total"]

    # 2. Mode CONVENIENT (Best Single Store: maximum items covered, then lowest total cost & highest confidence)
    store_baskets: Dict[str, Dict[str, Any]] = {}
    for raw_name, cands in item_candidates.items():
        seen_vids = set()
        for c in cands:
            vid = c["vendor_id"]
            if vid in seen_vids:
                continue
            seen_vids.add(vid)
            if vid not in store_baskets:
                store_baskets[vid] = {
                    "vendor_id": vid,
                    "vendor_shop": c["vendor_shop"],
                    "vendor_type": c["vendor_type"],
                    "distance_km": c["distance_km"],
                    "items": [],
                    "total_cost": 0.0,
                    "confidence_sum": 0,
                }
            store_baskets[vid]["items"].append(c)
            store_baskets[vid]["total_cost"] = round(store_baskets[vid]["total_cost"] + c["line_total"], 2)
            store_baskets[vid]["confidence_sum"] += c["inventory_confidence_score"]

    single_store_list = list(store_baskets.values())
    for sb in single_store_list:
        cnt = len(sb["items"])
        sb["items_found"] = cnt
        sb["total_items_requested"] = len(items)
        sb["avg_confidence_score"] = int(round(sb["confidence_sum"] / max(1, cnt)))
        sb["missing_from_this_store"] = [
            str(it.get("item_name") or it.get("name"))
            for it in items
            if str(it.get("item_name") or it.get("name")) not in {x["requested_item"] for x in sb["items"]}
        ]

    single_store_list.sort(
        key=lambda s: (
            -s["items_found"],
            s["total_cost"],
            -s["avg_confidence_score"],
            s["distance_km"] if s["distance_km"] is not None else 99.0,
        )
    )
    convenient_option = single_store_list[0] if single_store_list else None

    # 3. Mode NEAREST (Closest store(s) per item or closest single store)
    nearest_items = []
    nearest_stores = set()
    nearest_total = 0.0
    for raw_name, cands in item_candidates.items():
        closest_cand = min(
            cands,
            key=lambda x: (
                x["distance_km"] if x["distance_km"] is not None else 99.0,
                x["line_total"],
            ),
        )
        nearest_items.append(closest_cand)
        nearest_stores.add(closest_cand["vendor_id"])
        nearest_total += closest_cand["line_total"]

    # Honest savings calculation: compare multi-store split against convenient single-store (when covering same items) or highest observed local prices
    comparable_single_cost = 0.0
    if convenient_option and convenient_option["items_found"] == len(cheapest_items):
        comparable_single_cost = convenient_option["total_cost"]
    else:
        comparable_single_cost = max_single_item_sum

    real_savings = round(max(0.0, comparable_single_cost - cheapest_total), 2)

    return {
        "status": "ok" if item_candidates else "insufficient_inventory",
        "requested_items_count": len(items),
        "matched_items_count": len(item_candidates),
        "missing_products": missing_products,
        "low_confidence_products": low_confidence_products,
        "replacement_suggestions": replacement_suggestions[:5],
        "modes": {
            "CHEAPEST": {
                "mode": "CHEAPEST",
                "label": "Cheapest Multi-Store Split",
                "total_cost": round(cheapest_total, 2),
                "stores_required": len(cheapest_stores),
                "potential_savings": real_savings,
                "items": cheapest_items,
            },
            "CONVENIENT": {
                "mode": "CONVENIENT",
                "label": "Most Convenient (Single Store)",
                "vendor_id": convenient_option["vendor_id"] if convenient_option else None,
                "vendor_shop": convenient_option["vendor_shop"] if convenient_option else None,
                "distance_km": convenient_option["distance_km"] if convenient_option else None,
                "total_cost": convenient_option["total_cost"] if convenient_option else 0.0,
                "items_found": convenient_option["items_found"] if convenient_option else 0,
                "stores_required": 1 if convenient_option else 0,
                "avg_confidence_score": convenient_option["avg_confidence_score"] if convenient_option else 0,
                "items": convenient_option["items"] if convenient_option else [],
                "missing_from_this_store": convenient_option["missing_from_this_store"] if convenient_option else missing_products,
            },
            "NEAREST": {
                "mode": "NEAREST",
                "label": "Nearest Available Stores",
                "total_cost": round(nearest_total, 2),
                "stores_required": len(nearest_stores),
                "items": nearest_items,
            },
        },
        # Backward compatibility fields for existing `/api/ai/cheapest-basket` consumers
        "option_a_single_store": {
            "vendor_id": convenient_option["vendor_id"] if convenient_option else None,
            "vendor_name": convenient_option["vendor_shop"] if convenient_option else "No matching store",
            "distance_meters": round(convenient_option["distance_km"] * 1000, 1) if (convenient_option and convenient_option.get("distance_km") is not None) else None,
            "items_found": convenient_option["items_found"] if convenient_option else 0,
            "total_items_requested": len(items),
            "total_cost": convenient_option["total_cost"] if convenient_option else 0.0,
            "items": convenient_option["items"] if convenient_option else [],
        } if convenient_option else None,
        "option_b_multi_store": {
            "total_cost": round(cheapest_total, 2),
            "stores_count": len(cheapest_stores),
            "items": cheapest_items,
            "savings_vs_single": real_savings,
        },
        "tradeoff_summary": (
            f"CHEAPEST mode splits across {len(cheapest_stores)} store(s) for ₹{cheapest_total:.2f} (saving ₹{real_savings:.2f}). "
            f"CONVENIENT mode covers {convenient_option['items_found'] if convenient_option else 0}/{len(items)} items in 1 stop at {convenient_option['vendor_shop'] if convenient_option else 'N/A'} for ₹{convenient_option['total_cost'] if convenient_option else 0:.2f}."
        ),
    }


# ============================================================================
# POINTS 18 & 19: OFFICIAL WHATSAPP ADAPTER & INTELLIGENT NOTIFICATIONS
# ============================================================================

WHATSAPP_TEMPLATES = {
    "buyer_request_alert": {
        "template_name": "hl_buyer_request_alert",
        "category": "UTILITY",
        "body": "Namaste {{1}}! A shopper near {{2}} needs {{3}} (Qty: {{4}}). Reply with your price on HyperLocal: {{5}}",
    },
    "order_confirmation": {
        "template_name": "hl_order_confirmation",
        "category": "UTILITY",
        "body": "Order {{1}} confirmed at {{2}} for ₹{{3}}. Fulfillment: {{4}}.",
    },
    "order_ready": {
        "template_name": "hl_order_ready_pickup",
        "category": "UTILITY",
        "body": "Your order {{1}} at {{2}} is packed and ready for pickup!",
    },
    "daily_inventory_reminder": {
        "template_name": "hl_daily_inventory_confirm",
        "category": "UTILITY",
        "body": "Namaste {{1}}, confirm your store inventory in 1 tap so your products rank higher today: {{2}}",
    },
    "weekly_performance_summary": {
        "template_name": "hl_weekly_roi_digest",
        "category": "UTILITY",
        "body": "Weekly HyperLocal Summary for {{1}}: {{2}} verified visits & ₹{{3}} attributed revenue.",
    },
}


async def dispatch_intelligent_notification(
    db,
    user_id: str,
    title: str,
    body: str,
    notif_type: str = "system",
    priority: Literal["LOW", "NORMAL", "HIGH", "URGENT"] = "NORMAL",
    cta_label: Optional[str] = None,
    deep_link: Optional[str] = None,
    source_event: Optional[str] = None,
    channels: Optional[List[str]] = None,
    deduplication_key: Optional[str] = None,
    whatsapp_template: Optional[str] = None,
    whatsapp_params: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Dispatches an intelligent notification with anti-spam deduplication, user channel preferences,
    and graceful fallback when WhatsApp Cloud API credentials are not configured.
    """
    if deduplication_key:
        existing = await db.consumer_notifications.find_one({"user_id": user_id, "deduplication_key": deduplication_key})
        if existing:
            return {"ok": True, "deduplicated": True, "notification_id": existing.get("id")}

    prefs = await db.notification_preferences.find_one({"user_id": user_id}) or {}
    if prefs.get("muted_all"):
        return {"ok": True, "skipped": "user_muted_all"}

    req_channels = channels or ["in_app"]
    wa_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    wa_phone_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()

    delivery_status = {"in_app": "DELIVERED"}
    if "whatsapp" in req_channels or whatsapp_template:
        if prefs.get("whatsapp_opt_in", True) is False:
            delivery_status["whatsapp"] = "SKIPPED_OPT_OUT"
        elif wa_token and wa_phone_id:
            delivery_status["whatsapp"] = "QUEUED_OFFICIAL_CLOUD_API"
        else:
            delivery_status["whatsapp"] = "FALLBACK_TO_IN_APP_NO_PROVIDER_CREDENTIALS"

    nid = f"notif_{uuid.uuid4().hex[:14]}"
    now_s = now_iso()
    exp_s = (now_utc() + timedelta(days=14)).isoformat()

    doc = {
        "id": nid,
        "user_id": user_id,
        "type": notif_type,
        "title": title,
        "body": body,
        "priority": priority,
        "cta_label": cta_label or "View Details",
        "deep_link": deep_link or "/",
        "link": deep_link or "/",
        "source_event": source_event,
        "channels": req_channels,
        "delivery_status": delivery_status,
        "whatsapp_template": whatsapp_template,
        "whatsapp_params": whatsapp_params or [],
        "deduplication_key": deduplication_key,
        "read": False,
        "created_at": now_s,
        "expires_at": exp_s,
    }
    await db.consumer_notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ============================================================================
# PYDANTIC SCHEMAS FOR COMMERCE OS ENDPOINTS
# ============================================================================

class PlatformFeaturePatchIn(BaseModel):
    status: Optional[Literal["ENABLED", "DISABLED", "BETA"]] = None
    beta_status: Optional[bool] = None
    allowed_roles: Optional[List[str]] = None
    allowed_cities: Optional[List[str]] = None
    allowed_localities: Optional[List[str]] = None
    rollout_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    category: Optional[Literal["CORE", "GROWTH", "MONETIZATION", "EXPERIMENTAL"]] = None
    description: Optional[str] = None
    reason: Optional[str] = "Admin feature configuration update"


class InventoryConfirmIn(BaseModel):
    product_id: str
    action: Literal["CONFIRM_AVAILABLE", "MARK_OUT_OF_STOCK", "UPDATE_QUANTITY", "QUICK_PRICE_UPDATE"] = "CONFIRM_AVAILABLE"
    stock_quantity: Optional[float] = None
    price: Optional[float] = None


class BulkInventoryConfirmIn(BaseModel):
    product_ids: List[str]
    in_stock: bool = True


class QuickProductUpdateIn(BaseModel):
    price: Optional[float] = Field(default=None, gt=0)
    stock_quantity: Optional[float] = Field(default=None, ge=0)
    in_stock: Optional[bool] = None


class InventoryTrustConfigPatchIn(BaseModel):
    confirmed_recently_hours: Optional[int] = Field(default=None, ge=1, le=168)
    probably_available_hours: Optional[int] = Field(default=None, ge=12, le=336)
    stale_duration_hours: Optional[int] = Field(default=None, ge=24, le=720)
    ranking_impact_weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    auto_expire_after_hours: Optional[int] = Field(default=None, ge=48, le=2160)
    reason: Optional[str] = "Updated inventory trust thresholds"


class MultiItemVoiceExtractIn(BaseModel):
    transcript: str
    auto_publish_high_confidence: bool = False


class CSVInventoryImportIn(BaseModel):
    csv_text: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = None
    duplicate_policy: Literal["update_existing", "skip", "create_new"] = "update_existing"


class BarcodeRegisterIn(BaseModel):
    barcode: str
    product_name: str
    brand: Optional[str] = None
    category: str = "groceries"
    unit: str = "piece"
    pack_size: Optional[str] = None
    default_price: Optional[float] = None
    add_to_my_inventory: bool = True
    selling_price: Optional[float] = None
    stock_quantity: Optional[float] = 10.0


class InvoiceExtractIn(BaseModel):
    raw_invoice_text: str
    supplier_name: Optional[str] = None


class BasketOptimizeIn(BaseModel):
    items: List[Dict[str, Any]]
    lat: Optional[float] = None
    lng: Optional[float] = None
    city: str = "Dehradun"


class BasketConvertToCartIn(BaseModel):
    mode: Literal["CHEAPEST", "CONVENIENT", "NEAREST"] = "CONVENIENT"
    items: List[Dict[str, Any]]


class ShoppingListItemModel(BaseModel):
    item_id: Optional[str] = None
    item_name: str
    quantity: float = 1.0
    unit: str = "unit"
    notes: Optional[str] = None
    checked: bool = False


class ShoppingListCreateIn(BaseModel):
    name: str
    template_type: Literal["MONTHLY_RATION", "WEEKLY_VEGETABLES", "DAILY_ESSENTIALS", "FESTIVAL", "CUSTOM"] = "CUSTOM"
    items: List[ShoppingListItemModel] = []


class ShoppingListPatchIn(BaseModel):
    name: Optional[str] = None
    items: Optional[List[ShoppingListItemModel]] = None
    archived: Optional[bool] = None


class SubscriptionPlanCreateOrPatchIn(BaseModel):
    plan_code: Optional[str] = None
    name: Optional[str] = None
    vendor_tier: Optional[Literal["retailer", "cart_vendor"]] = None
    monthly_price: Optional[float] = Field(default=None, ge=0)
    annual_price: Optional[float] = Field(default=None, ge=0)
    trial_duration_days: Optional[int] = Field(default=None, ge=0, le=365)
    product_limit: Optional[int] = None
    branch_limit: Optional[int] = None
    lead_limit: Optional[int] = None
    ai_entitlement: Optional[str] = None
    analytics_entitlement: Optional[str] = None
    promotion_entitlement: Optional[str] = None
    integration_entitlement: Optional[str] = None
    active: Optional[bool] = None
    display_order: Optional[int] = None
    grandfathering_enabled: Optional[bool] = None
    features: Optional[List[str]] = None
    reason: Optional[str] = "Subscription plan update"


class DemandGapActionIn(BaseModel):
    item_name: str
    action: Literal["ADD_PRODUCT", "SAVE_OPPORTUNITY", "DISMISS", "NOTIFY_ME"]
    price: Optional[float] = None
    unit: Optional[str] = "kg"
    category: Optional[str] = "groceries"


class MobileCartStatusIn(BaseModel):
    live_status: Literal["ONLINE", "MOVING", "STOPPED_SELLING", "OFFLINE"] = "ONLINE"
    lat: Optional[float] = None
    lng: Optional[float] = None
    current_locality: Optional[str] = None
    broadcast_arrival: bool = False


class MobileCartMarkServedIn(BaseModel):
    stop_name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    customers_served: int = 1
    sales_amount: float = 0.0
    notes: Optional[str] = None


class AdCampaignCreateIn(BaseModel):
    title: str
    campaign_type: Literal["STORE_PROMOTION", "PRODUCT_PROMOTION", "OFFER_PROMOTION", "FEATURED_PLACEMENT", "CATEGORY_SPOTLIGHT"] = "PRODUCT_PROMOTION"
    pricing_model: Literal["FIXED_BUDGET", "CPM", "CPC"] = "CPC"
    product_id: Optional[str] = None
    category: Optional[str] = None
    locality: str = "Dehradun"
    radius_km: float = Field(default=5.0, ge=0.5, le=50.0)
    daily_budget: float = Field(default=100.0, ge=10.0)
    total_budget: float = Field(default=500.0, ge=50.0)
    bid_amount: float = Field(default=5.0, ge=1.0)
    offer_headline: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class AdCampaignModerateIn(BaseModel):
    action: Literal["APPROVE", "REJECT", "PAUSE", "RESUME", "TERMINATE", "CREDIT"]
    credit_amount: Optional[float] = None
    reason: str = "Admin campaign moderation"


class RevenueAdjustmentIn(BaseModel):
    stream: Literal["SUBSCRIPTIONS", "ADVERTISING", "TRANSACTION_FEES", "LEADS", "PREMIUM_INTELLIGENCE"]
    adjustment_type: Literal["CREDIT", "REFUND", "MANUAL_RECONCILIATION"]
    amount: float
    vendor_id: Optional[str] = None
    reference_id: Optional[str] = None
    reason: str = Field(min_length=3)


class ReferralApplyIn(BaseModel):
    referral_code: str


class LocalityUpsertIn(BaseModel):
    locality_id: Optional[str] = None
    country: str = "India"
    state: str = "Uttarakhand"
    city: str = "Dehradun"
    zone: str = "Central"
    name: str
    lat: float
    lng: float
    radius_km: float = 2.5
    status: Literal["PLANNED", "MERCHANT_ONBOARDING", "BETA", "LIVE", "PAUSED"] = "PLANNED"


class MerchantCRMLeadIn(BaseModel):
    shop_name: str
    owner_name: str
    phone: str
    locality: str = "Dehradun"
    category: str = "groceries"
    vendor_type: Literal["retailer", "cart_vendor"] = "retailer"
    stage: Literal["LEAD", "CONTACTED", "DEMO_DONE", "ONBOARDED", "CATALOG_UPLOADED", "ACTIVE", "TRIAL", "PAID", "CHURNED", "LOST"] = "LEAD"
    assigned_to: Optional[str] = None
    follow_up_date: Optional[str] = None
    notes: Optional[str] = None


class QRGenerateIn(BaseModel):
    qr_type: Literal["STORE_PROFILE", "LIVE_PRODUCTS", "CHECK_IN", "VERIFIED_BADGE"] = "CHECK_IN"
    label: Optional[str] = "Main Counter Poster"


class ReliabilityOverrideIn(BaseModel):
    score: int = Field(ge=0, le=100)
    label: Optional[str] = None
    reason: str = Field(min_length=3)


class FraudResolveIn(BaseModel):
    resolution: Literal["RESOLVED_SAFE", "WARN_USER", "SUSPEND_FEATURE", "REJECT_ATTRIBUTION"]
    notes: str = Field(min_length=3)


class ExperimentUpsertIn(BaseModel):
    experiment_key: str
    name: str
    hypothesis: str
    variants: List[str] = ["CONTROL", "VARIANT_A"]
    traffic_allocation_pct: int = Field(default=50, ge=1, le=100)
    min_sample_size: int = Field(default=30, ge=5)
    status: Literal["DRAFT", "RUNNING", "PAUSED", "COMPLETED"] = "RUNNING"


class KPITargetUpsertIn(BaseModel):
    kpi_key: str
    name: str
    scope: Literal["GLOBAL", "CITY", "LOCALITY", "SEGMENT"] = "GLOBAL"
    scope_value: str = "ALL"
    target_value: float
    unit: str = "count"
    period: Literal["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"] = "MONTHLY"
    owner: str = "Operations"


class RoadmapMilestonePatchIn(BaseModel):
    status: Optional[Literal["PLANNED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]] = None
    owner: Optional[str] = None
    target_date: Optional[str] = None
    blockers: Optional[str] = None
    notes: Optional[str] = None


# ============================================================================
# ROUTER BUILDER — HYPERLOCAL COMMERCE OPERATING SYSTEM (POINTS 1 TO 40)
# ============================================================================

def build_commerce_os_router(
    db,
    get_current_user,
    require_vendor,
    require_consumer,
    require_admin,
    get_optional_user,
):
    router = APIRouter()

    def check_admin_domain(admin: dict, domain: str, mutate: bool = False):
        """Enforces Granular Admin RBAC across all 9 admin roles."""
        admin_role = admin.get("admin_role") or ("SUPER_ADMIN" if admin.get("role") == "admin" else "SUPER_ADMIN")
        role_cfg = ADMIN_ROLES_PERMISSIONS.get(admin_role, ADMIN_ROLES_PERMISSIONS["SUPER_ADMIN"])
        if mutate and role_cfg.get("read_only"):
            raise HTTPException(status_code=403, detail=f"Admin role {admin_role} is read-only and cannot perform mutations.")
        allowed_domains = role_cfg.get("domains", ["*"])
        if "*" not in allowed_domains and domain not in allowed_domains:
            raise HTTPException(status_code=403, detail=f"Admin role {admin_role} does not have permission for domain '{domain}'.")
        return admin_role

    # ------------------------------------------------------------------------
    # POINT 1: FEATURE PRIORITY & PRODUCT CONTROL (CORE, GROWTH, MONETIZATION, EXPERIMENTAL)
    # ------------------------------------------------------------------------

    @router.get("/admin/platform-features")
    async def list_platform_features(
        category: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "platform_control", mutate=False)
        q = {}
        if category and category != "ALL":
            q["category"] = category.upper()
        docs = await db.platform_features.find(q).sort("category", 1).to_list(100)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("feature_key"))
            d.pop("_id", None)
        return {
            "total": len(docs),
            "categories": ["CORE", "GROWTH", "MONETIZATION", "EXPERIMENTAL"],
            "features": docs,
        }

    @router.patch("/admin/platform-features/{feature_key}")
    async def update_platform_feature(
        feature_key: str,
        payload: PlatformFeaturePatchIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "platform_control", mutate=True)
        existing = await db.platform_features.find_one({"feature_key": feature_key})
        if not existing:
            raise HTTPException(status_code=404, detail=f"Feature '{feature_key}' not found")

        if existing.get("is_essential_security") and payload.status == "DISABLED":
            raise HTTPException(
                status_code=400,
                detail="Essential security and authentication mechanisms cannot be disabled.",
            )

        before_state = {k: v for k, v in existing.items() if k != "_id"}
        updates = {k: v for k, v in payload.model_dump(exclude_none=True).items() if k != "reason"}
        updates["updated_at"] = now_iso()
        updates["updated_by"] = admin.get("email")

        await db.platform_features.update_one({"feature_key": feature_key}, {"$set": updates})
        updated = await db.platform_features.find_one({"feature_key": feature_key})
        updated.pop("_id", None)

        await record_immutable_audit_log(
            db,
            admin=admin,
            action="update_platform_feature",
            entity_type="platform_feature",
            entity_id=feature_key,
            reason=payload.reason or f"Updated feature {feature_key}",
            before_state=before_state,
            after_state=updated,
            target_name=existing.get("name"),
        )
        return updated

    # ------------------------------------------------------------------------
    # POINT 2: INVENTORY TRUST & CONFIDENCE SYSTEM
    # ------------------------------------------------------------------------

    @router.post("/vendor/inventory/confirm")
    async def vendor_confirm_inventory_item(
        payload: InventoryConfirmIn,
        vendor: dict = Depends(require_vendor),
    ):
        try:
            oid = ObjectId(payload.product_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid product_id")

        prod = await db.products.find_one({"_id": oid, "vendor_id": vendor["id"]})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found in your inventory")

        now_s = now_iso()
        updates: Dict[str, Any] = {
            "updated_at": now_s,
            "last_confirmed_at": now_s,
        }
        if payload.action == "CONFIRM_AVAILABLE":
            updates["in_stock"] = True
        elif payload.action == "MARK_OUT_OF_STOCK":
            updates["in_stock"] = False
            updates["stock_quantity"] = 0
        elif payload.action == "UPDATE_QUANTITY":
            if payload.stock_quantity is not None:
                updates["stock_quantity"] = float(payload.stock_quantity)
                updates["in_stock"] = float(payload.stock_quantity) > 0
        elif payload.action == "QUICK_PRICE_UPDATE":
            if payload.price is not None and payload.price > 0:
                updates["price"] = float(payload.price)

        await db.products.update_one(
            {"_id": oid},
            {"$set": updates, "$inc": {"confirmation_count": 1}},
        )
        updated = await db.products.find_one({"_id": oid})
        trust = compute_inventory_trust_sync(updated, vendor)
        updated["id"] = str(updated.pop("_id"))
        return {**updated, **trust}

    @router.post("/vendor/inventory/bulk-confirm")
    async def vendor_bulk_confirm_inventory(
        payload: BulkInventoryConfirmIn,
        vendor: dict = Depends(require_vendor),
    ):
        oids = []
        for pid in payload.product_ids:
            try:
                oids.append(ObjectId(pid))
            except Exception:
                pass
        if not oids:
            raise HTTPException(status_code=400, detail="No valid product IDs provided")

        now_s = now_iso()
        res = await db.products.update_many(
            {"_id": {"$in": oids}, "vendor_id": vendor["id"]},
            {
                "$set": {
                    "in_stock": payload.in_stock,
                    "updated_at": now_s,
                    "last_confirmed_at": now_s,
                },
                "$inc": {"confirmation_count": 1},
            },
        )
        return {
            "ok": True,
            "confirmed_count": res.modified_count,
            "last_confirmed_at": now_s,
            "inventory_freshness_state": "CONFIRMED_RECENTLY" if payload.in_stock else "OUT_OF_STOCK",
        }

    @router.post("/vendor/inventory/confirm-all-unchanged")
    async def vendor_confirm_all_unchanged(vendor: dict = Depends(require_vendor)):
        now_s = now_iso()
        res = await db.products.update_many(
            {"vendor_id": vendor["id"], "in_stock": True},
            {
                "$set": {"updated_at": now_s, "last_confirmed_at": now_s},
                "$inc": {"confirmation_count": 1},
            },
        )
        await db.users.update_one(
            {"_id": ObjectId(vendor["id"])},
            {"$set": {"last_inventory_confirmed_at": now_s}},
        )
        return {
            "ok": True,
            "confirmed_products_count": res.modified_count,
            "last_confirmed_at": now_s,
            "message": f"All {res.modified_count} in-stock products marked as Confirmed Recently (🟢).",
        }

    @router.patch("/vendor/inventory/{product_id}/quick-update")
    async def vendor_quick_update_product(
        product_id: str,
        payload: QuickProductUpdateIn,
        vendor: dict = Depends(require_vendor),
    ):
        try:
            oid = ObjectId(product_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid product ID")

        prod = await db.products.find_one({"_id": oid, "vendor_id": vendor["id"]})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")

        now_s = now_iso()
        updates: Dict[str, Any] = {"updated_at": now_s, "last_confirmed_at": now_s}
        if payload.price is not None:
            updates["price"] = float(payload.price)
        if payload.stock_quantity is not None:
            updates["stock_quantity"] = float(payload.stock_quantity)
            if payload.in_stock is None:
                updates["in_stock"] = float(payload.stock_quantity) > 0
        if payload.in_stock is not None:
            updates["in_stock"] = bool(payload.in_stock)

        await db.products.update_one({"_id": oid}, {"$set": updates, "$inc": {"confirmation_count": 1}})
        updated = await db.products.find_one({"_id": oid})
        trust = compute_inventory_trust_sync(updated, vendor)
        updated["id"] = str(updated.pop("_id"))
        return {**updated, **trust}

    @router.get("/admin/inventory-trust")
    async def admin_inventory_trust_overview(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "catalog", mutate=False)
        cfg = await db.admin_settings.find_one({"_id": "inventory_trust_config"}) or dict(DEFAULT_INVENTORY_TRUST_CONFIG)
        cfg.pop("_id", None)

        prods = await db.products.find({}).to_list(2000)
        vendors = await db.users.find({"role": "vendor"}).to_list(500)
        vmap = {str(v["_id"]): v for v in vendors}

        if not prods:
            return {
                "status": "Awaiting Marketplace Activity",
                "config": cfg,
                "analytics": {
                    "total_products": 0,
                    "fresh_inventory_pct": 0.0,
                    "probably_available_pct": 0.0,
                    "stale_inventory_pct": 0.0,
                    "average_inventory_age_hours": 0.0,
                    "average_confidence_score": 0.0,
                },
                "merchant_accuracy": [],
            }

        fresh_cnt = 0
        probable_cnt = 0
        stale_cnt = 0
        age_sum = 0.0
        score_sum = 0
        vendor_scores: Dict[str, List[int]] = {}

        for p in prods:
            vid = str(p.get("vendor_id") or "")
            t = compute_inventory_trust_sync(p, vmap.get(vid), cfg)
            st = t["inventory_freshness_state"]
            if st == "CONFIRMED_RECENTLY":
                fresh_cnt += 1
            elif st == "PROBABLY_AVAILABLE":
                probable_cnt += 1
            else:
                stale_cnt += 1
            age_sum += t["hours_since_last_verification"]
            score_sum += t["inventory_confidence_score"]
            vendor_scores.setdefault(vid, []).append(t["inventory_confidence_score"])

        total = len(prods)
        merchant_acc = []
        for vid, sc_list in vendor_scores.items():
            v = vmap.get(vid, {})
            merchant_acc.append({
                "vendor_id": vid,
                "shop_name": v.get("shop_name") or v.get("name") or "Vendor",
                "products_count": len(sc_list),
                "avg_inventory_confidence": round(sum(sc_list) / len(sc_list), 1),
            })
        merchant_acc.sort(key=lambda x: -x["avg_inventory_confidence"])

        return {
            "config": cfg,
            "analytics": {
                "total_products": total,
                "fresh_inventory_pct": round((fresh_cnt / total) * 100.0, 1),
                "probably_available_pct": round((probable_cnt / total) * 100.0, 1),
                "stale_inventory_pct": round((stale_cnt / total) * 100.0, 1),
                "average_inventory_age_hours": round(age_sum / total, 1),
                "average_confidence_score": round(score_sum / total, 1),
            },
            "merchant_accuracy": merchant_acc[:25],
        }

    @router.patch("/admin/inventory-trust/config")
    async def admin_update_inventory_trust_config(
        payload: InventoryTrustConfigPatchIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "catalog", mutate=True)
        existing = await db.admin_settings.find_one({"_id": "inventory_trust_config"}) or dict(DEFAULT_INVENTORY_TRUST_CONFIG)
        before_state = {k: v for k, v in existing.items() if k != "_id"}
        updates = {k: v for k, v in payload.model_dump(exclude_none=True).items() if k != "reason"}
        updates["updated_at"] = now_iso()
        await db.admin_settings.update_one(
            {"_id": "inventory_trust_config"},
            {"$set": updates},
            upsert=True,
        )
        after_doc = await db.admin_settings.find_one({"_id": "inventory_trust_config"})
        after_doc.pop("_id", None)
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="update_inventory_trust_config",
            entity_type="admin_settings",
            entity_id="inventory_trust_config",
            reason=payload.reason or "Updated inventory trust thresholds",
            before_state=before_state,
            after_state=after_doc,
        )
        return after_doc

    # ------------------------------------------------------------------------
    # POINT 3: FRICTIONLESS MERCHANT INVENTORY & ONBOARDING PROGRESS
    # ------------------------------------------------------------------------

    @router.post("/vendor/inventory/voice-extract")
    async def vendor_multi_item_voice_extract(
        payload: MultiItemVoiceExtractIn,
        vendor: dict = Depends(require_vendor),
    ):
        existing_prods = await db.products.find({"vendor_id": vendor["id"]}).to_list(300)
        extracted = parse_multi_item_voice_inventory(payload.transcript, existing_prods)
        return {
            "transcript": payload.transcript,
            "extracted_count": len(extracted),
            "requires_confirmation_count": sum(1 for item in extracted if item["requires_confirmation"]),
            "items": extracted,
        }

    @router.post("/vendor/inventory/import")
    async def vendor_import_inventory_csv_or_rows(
        payload: CSVInventoryImportIn,
        vendor: dict = Depends(require_vendor),
    ):
        rows: List[Dict[str, Any]] = []
        if payload.rows:
            rows = payload.rows
        elif payload.csv_text:
            f = io.StringIO(payload.csv_text.strip())
            reader = csv.DictReader(f)
            for r in reader:
                rows.append(dict(r))

        if not rows:
            raise HTTPException(status_code=400, detail="No inventory rows found to import.")

        existing_prods = await db.products.find({"vendor_id": vendor["id"]}).to_list(500)
        existing_by_name = {str(p.get("name") or "").lower().strip(): p for p in existing_prods}

        now_s = now_iso()
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for r in rows:
            name = str(r.get("name") or r.get("product") or r.get("Product") or r.get("item") or "").strip()
            price_raw = r.get("price") or r.get("Price") or r.get("selling_price") or 0
            unit = str(r.get("unit") or r.get("Unit") or "kg").strip()
            cat = str(r.get("category") or r.get("Category") or "groceries").strip().lower()
            qty_raw = r.get("quantity") or r.get("stock_quantity") or r.get("Quantity") or 10
            brand = str(r.get("brand") or r.get("Brand") or "").strip() or None
            barcode = str(r.get("barcode") or r.get("Barcode") or "").strip() or None

            if not name:
                skipped_count += 1
                continue
            try:
                price = float(price_raw)
            except Exception:
                price = 0.0
            if price <= 0:
                skipped_count += 1
                continue
            try:
                qty = float(qty_raw)
            except Exception:
                qty = 10.0

            ex = existing_by_name.get(name.lower())
            if ex:
                if payload.duplicate_policy == "skip":
                    skipped_count += 1
                    continue
                elif payload.duplicate_policy == "update_existing":
                    await db.products.update_one(
                        {"_id": ex["_id"]},
                        {
                            "$set": {
                                "price": price,
                                "unit": unit,
                                "category": cat,
                                "stock_quantity": qty,
                                "in_stock": qty > 0,
                                "brand": brand,
                                "barcode": barcode,
                                "source": "csv_import",
                                "updated_at": now_s,
                                "last_confirmed_at": now_s,
                            },
                            "$inc": {"confirmation_count": 1},
                        },
                    )
                    updated_count += 1
                    continue

            new_doc = {
                "vendor_id": vendor["id"],
                "name": name,
                "brand": brand,
                "barcode": barcode,
                "category": cat,
                "price": price,
                "unit": unit,
                "stock_quantity": qty,
                "in_stock": qty > 0,
                "is_featured": False,
                "source": "csv_import",
                "views": 0,
                "clicks": 0,
                "confirmation_count": 1,
                "last_confirmed_at": now_s,
                "created_at": now_s,
                "updated_at": now_s,
            }
            await db.products.insert_one(new_doc)
            created_count += 1

        return {
            "ok": True,
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
        }

    @router.get("/vendor/inventory/barcode/{barcode}")
    async def lookup_barcode(barcode: str, vendor: dict = Depends(require_vendor)):
        clean_bc = barcode.strip()
        reg = await db.barcode_catalog.find_one({"barcode": clean_bc})
        my_prod = await db.products.find_one({"vendor_id": vendor["id"], "barcode": clean_bc})
        if my_prod:
            my_prod["id"] = str(my_prod.pop("_id"))
        if reg:
            reg["id"] = str(reg.pop("_id"))
        return {
            "barcode": clean_bc,
            "found_in_global_registry": bool(reg),
            "registry_entry": reg,
            "found_in_my_inventory": bool(my_prod),
            "my_product": my_prod,
        }

    @router.post("/vendor/inventory/barcode")
    async def register_or_add_barcode_product(
        payload: BarcodeRegisterIn,
        vendor: dict = Depends(require_vendor),
    ):
        now_s = now_iso()
        bc = payload.barcode.strip()
        await db.barcode_catalog.update_one(
            {"barcode": bc},
            {
                "$set": {
                    "barcode": bc,
                    "product_name": payload.product_name,
                    "brand": payload.brand,
                    "category": payload.category,
                    "unit": payload.unit,
                    "pack_size": payload.pack_size,
                    "default_price": payload.default_price or payload.selling_price,
                    "updated_at": now_s,
                },
                "$setOnInsert": {"created_at": now_s},
            },
            upsert=True,
        )

        added_product = None
        if payload.add_to_my_inventory:
            price = float(payload.selling_price or payload.default_price or 20.0)
            pdoc = {
                "vendor_id": vendor["id"],
                "name": payload.product_name,
                "brand": payload.brand,
                "barcode": bc,
                "category": payload.category,
                "price": price,
                "unit": payload.unit,
                "pack_size": payload.pack_size,
                "stock_quantity": float(payload.stock_quantity or 10.0),
                "in_stock": True,
                "is_featured": False,
                "source": "barcode_scan",
                "views": 0,
                "clicks": 0,
                "confirmation_count": 1,
                "last_confirmed_at": now_s,
                "created_at": now_s,
                "updated_at": now_s,
            }
            res = await db.products.insert_one(pdoc)
            pdoc["id"] = str(res.inserted_id)
            pdoc.pop("_id", None)
            added_product = pdoc

        return {
            "ok": True,
            "barcode": bc,
            "added_to_inventory": bool(added_product),
            "product": added_product,
        }

    @router.post("/vendor/inventory/extract-invoice")
    async def extract_invoice_inventory(
        payload: InvoiceExtractIn,
        vendor: dict = Depends(require_vendor),
    ):
        existing_prods = await db.products.find({"vendor_id": vendor["id"]}).to_list(300)
        items = parse_multi_item_voice_inventory(payload.raw_invoice_text, existing_prods)
        for it in items:
            it["requires_confirmation"] = True
            it["extraction_method"] = "INVOICE_LINE_EXTRACTOR"
        return {
            "supplier_name": payload.supplier_name,
            "extracted_items_count": len(items),
            "requires_merchant_confirmation": True,
            "items": items,
        }

    @router.post("/vendor/inventory/copy-previous")
    async def copy_previous_inventory(vendor: dict = Depends(require_vendor)):
        now_s = now_iso()
        res = await db.products.update_many(
            {"vendor_id": vendor["id"], "in_stock": False},
            {
                "$set": {
                    "in_stock": True,
                    "updated_at": now_s,
                    "last_confirmed_at": now_s,
                },
                "$inc": {"confirmation_count": 1},
            },
        )
        return {
            "ok": True,
            "restored_products_count": res.modified_count,
            "last_confirmed_at": now_s,
        }

    @router.get("/vendor/onboarding-progress")
    async def get_vendor_onboarding_progress(vendor: dict = Depends(require_vendor)):
        prods = await db.products.find({"vendor_id": vendor["id"]}).to_list(200)
        prod_count = len(prods)
        confirmed_recently = sum(
            1 for p in prods if compute_inventory_trust_sync(p, vendor)["inventory_freshness_state"] == "CONFIRMED_RECENTLY"
        )
        has_profile = bool(vendor.get("shop_name") and vendor.get("phone") and vendor.get("shop_address"))
        has_location = bool(vendor.get("lat") is not None and vendor.get("lng") is not None)

        milestones = [
            {"key": "profile_complete", "label": "Profile Complete", "completed": has_profile},
            {"key": "location_complete", "label": "Location Complete", "completed": has_location},
            {"key": "products_10", "label": "10 Products Listed", "completed": prod_count >= 10, "current": prod_count, "target": 10},
            {"key": "products_25", "label": "25 Products Listed", "completed": prod_count >= 25, "current": prod_count, "target": 25},
            {"key": "products_50", "label": "50 Products Listed", "completed": prod_count >= 50, "current": prod_count, "target": 50},
            {"key": "inventory_confirmed", "label": "Inventory Confirmed", "completed": confirmed_recently > 0},
        ]
        done_count = sum(1 for m in milestones if m["completed"])
        return {
            "vendor_id": vendor["id"],
            "completion_percentage": int(round((done_count / len(milestones)) * 100)),
            "products_count": prod_count,
            "confirmed_recently_count": confirmed_recently,
            "milestones": milestones,
        }

    # ------------------------------------------------------------------------
    # POINT 4 & POINT 5: CHEAPEST BASKET ENGINE & SMART SHOPPING LISTS
    # ------------------------------------------------------------------------

    @router.post("/basket/optimize")
    async def api_optimize_basket(
        payload: BasketOptimizeIn,
        user: Optional[dict] = Depends(get_optional_user),
    ):
        result = await optimize_grocery_basket(
            db,
            items=payload.items,
            user_lat=payload.lat,
            user_lng=payload.lng,
            city=payload.city,
        )
        await emit_domain_event(
            db,
            event_type="PRODUCT_SEARCHED",
            actor_id=user["id"] if user else None,
            actor_role=user.get("role") if user else "consumer",
            locality=payload.city,
            payload={"source": "basket_optimizer", "items_count": len(payload.items)},
        )
        return result

    @router.post("/basket/convert-to-cart")
    async def convert_optimized_basket_to_cart(
        payload: BasketConvertToCartIn,
        user: dict = Depends(require_consumer),
    ):
        if not payload.items:
            raise HTTPException(status_code=400, detail="No basket items provided to add to cart.")

        added_count = 0
        now_s = now_iso()
        for it in payload.items:
            pid = it.get("product_id")
            qty = max(1, int(round(float(it.get("requested_quantity") or it.get("quantity") or 1))))
            if not pid:
                continue
            try:
                prod = await db.products.find_one({"_id": ObjectId(pid)})
            except Exception:
                prod = None
            if not prod or not prod.get("in_stock", True):
                continue

            vid = str(prod["vendor_id"])
            vendor = await db.users.find_one({"_id": ObjectId(vid)})
            cart = await db.carts.find_one({"user_id": user["id"], "vendor_id": vid, "status": "ACTIVE"})
            item_entry = {
                "product_id": pid,
                "name": prod.get("name"),
                "unit": prod.get("unit", "unit"),
                "unit_price": float(prod.get("price") or 0.0),
                "quantity": qty,
                "subtotal": round(float(prod.get("price") or 0.0) * qty, 2),
            }
            if not cart:
                await db.carts.insert_one({
                    "id": f"cart_{uuid.uuid4().hex[:12]}",
                    "user_id": user["id"],
                    "vendor_id": vid,
                    "vendor_name": (vendor or {}).get("shop_name") or (vendor or {}).get("name") or "Seller",
                    "vendor_type": (vendor or {}).get("vendor_type", "retailer"),
                    "status": "ACTIVE",
                    "items": [item_entry],
                    "created_at": now_s,
                    "updated_at": now_s,
                })
            else:
                existing_items = cart.get("items", [])
                merged = False
                for ex in existing_items:
                    if ex.get("product_id") == pid:
                        ex["quantity"] += qty
                        ex["subtotal"] = round(ex["unit_price"] * ex["quantity"], 2)
                        merged = True
                        break
                if not merged:
                    existing_items.append(item_entry)
                await db.carts.update_one(
                    {"_id": cart["_id"]},
                    {"$set": {"items": existing_items, "updated_at": now_s}},
                )
            added_count += 1

        await emit_domain_event(
            db,
            event_type="CART_UPDATED",
            actor_id=user["id"],
            actor_role="consumer",
            payload={"source": "basket_convert", "mode": payload.mode, "items_added": added_count},
        )
        return {"ok": True, "added_items_count": added_count}

    @router.get("/shopping-lists")
    async def list_shopping_lists(
        include_archived: bool = False,
        user: dict = Depends(get_current_user),
    ):
        q: Dict[str, Any] = {"user_id": user["id"]}
        if not include_archived:
            q["archived"] = {"$ne": True}
        docs = await db.shopping_lists.find(q).sort("updated_at", -1).to_list(50)
        for d in docs:
            d["id"] = str(d.get("id") or d.get("_id"))
            d.pop("_id", None)
        return docs

    @router.post("/shopping-lists")
    async def create_shopping_list(
        payload: ShoppingListCreateIn,
        user: dict = Depends(get_current_user),
    ):
        now_s = now_iso()
        lid = f"slist_{uuid.uuid4().hex[:12]}"
        items_out = []
        for it in payload.items:
            d = it.model_dump()
            d["item_id"] = d.get("item_id") or f"item_{uuid.uuid4().hex[:8]}"
            items_out.append(d)

        doc = {
            "id": lid,
            "user_id": user["id"],
            "name": payload.name.strip(),
            "template_type": payload.template_type,
            "items": items_out,
            "archived": False,
            "created_at": now_s,
            "updated_at": now_s,
        }
        await db.shopping_lists.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/shopping-lists/{list_id}")
    async def update_shopping_list(
        list_id: str,
        payload: ShoppingListPatchIn,
        user: dict = Depends(get_current_user),
    ):
        doc = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="Shopping list not found")

        updates: Dict[str, Any] = {"updated_at": now_iso()}
        if payload.name is not None:
            updates["name"] = payload.name.strip()
        if payload.archived is not None:
            updates["archived"] = bool(payload.archived)
        if payload.items is not None:
            items_out = []
            for it in payload.items:
                d = it.model_dump()
                d["item_id"] = d.get("item_id") or f"item_{uuid.uuid4().hex[:8]}"
                items_out.append(d)
            updates["items"] = items_out

        await db.shopping_lists.update_one({"id": list_id, "user_id": user["id"]}, {"$set": updates})
        updated = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        updated.pop("_id", None)
        return updated

    @router.post("/shopping-lists/{list_id}/voice-add")
    async def voice_add_to_shopping_list(
        list_id: str,
        payload: MultiItemVoiceExtractIn,
        user: dict = Depends(get_current_user),
    ):
        doc = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="Shopping list not found")

        parsed = parse_multi_item_voice_inventory(payload.transcript)
        existing_items = doc.get("items", [])
        for p in parsed:
            existing_items.append({
                "item_id": f"item_{uuid.uuid4().hex[:8]}",
                "item_name": p["product"],
                "quantity": float(p.get("quantity") or 1.0),
                "unit": p.get("unit") or "unit",
                "notes": f"Voice added ({p.get('raw_segment', '')})",
                "checked": False,
            })

        await db.shopping_lists.update_one(
            {"id": list_id, "user_id": user["id"]},
            {"$set": {"items": existing_items, "updated_at": now_iso()}},
        )
        updated = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        updated.pop("_id", None)
        return updated

    @router.post("/shopping-lists/{list_id}/duplicate")
    async def duplicate_shopping_list(
        list_id: str,
        user: dict = Depends(get_current_user),
    ):
        doc = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="Shopping list not found")

        now_s = now_iso()
        new_doc = {
            "id": f"slist_{uuid.uuid4().hex[:12]}",
            "user_id": user["id"],
            "name": f"{doc.get('name', 'List')} (Copy)",
            "template_type": doc.get("template_type", "CUSTOM"),
            "items": doc.get("items", []),
            "archived": False,
            "created_at": now_s,
            "updated_at": now_s,
        }
        await db.shopping_lists.insert_one(new_doc)
        new_doc.pop("_id", None)
        return new_doc

    @router.post("/shopping-lists/{list_id}/optimize")
    async def optimize_shopping_list(
        list_id: str,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        user: dict = Depends(get_current_user),
    ):
        doc = await db.shopping_lists.find_one({"id": list_id, "user_id": user["id"]})
        if not doc:
            raise HTTPException(status_code=404, detail="Shopping list not found")

        opt = await optimize_grocery_basket(
            db,
            items=doc.get("items", []),
            user_lat=lat,
            user_lng=lng,
        )
        return {
            "list_id": list_id,
            "list_name": doc.get("name"),
            "estimated_total_cheapest": opt.get("modes", {}).get("CHEAPEST", {}).get("total_cost", 0.0),
            "estimated_total_convenient": opt.get("modes", {}).get("CONVENIENT", {}).get("total_cost", 0.0),
            "potential_savings": opt.get("modes", {}).get("CHEAPEST", {}).get("potential_savings", 0.0),
            "stores_required_cheapest": opt.get("modes", {}).get("CHEAPEST", {}).get("stores_required", 0),
            "missing_products": opt.get("missing_products", []),
            "low_confidence_products": opt.get("low_confidence_products", []),
            "optimization": opt,
        }

    @router.delete("/shopping-lists/{list_id}")
    async def delete_shopping_list(
        list_id: str,
        user: dict = Depends(get_current_user),
    ):
        res = await db.shopping_lists.delete_one({"id": list_id, "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Shopping list not found")
        return {"ok": True}


    # ------------------------------------------------------------------------
    # POINT 6 & POINT 7: STRUCTURED "I NEED" OFFERS & BUYER LEAD MONETIZATION
    # ------------------------------------------------------------------------

    @router.post("/requests/{req_id}/replies/{reply_id}/accept")
    async def accept_buyer_request_offer(
        req_id: str,
        reply_id: str,
        user: dict = Depends(require_consumer),
    ):
        try:
            req_oid = ObjectId(req_id)
            rep_oid = ObjectId(reply_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request or reply ID")

        req = await db.requests.find_one({"_id": req_oid, "consumer_id": user["id"]})
        if not req:
            raise HTTPException(status_code=404, detail="Buyer request not found")

        reply = await db.request_replies.find_one({"_id": rep_oid, "request_id": req_id})
        if not reply:
            raise HTTPException(status_code=404, detail="Merchant offer reply not found")

        now_s = now_iso()
        await db.requests.update_one(
            {"_id": req_oid},
            {
                "$set": {
                    "status": "OFFER_ACCEPTED",
                    "accepted_reply_id": reply_id,
                    "accepted_vendor_id": reply.get("vendor_id"),
                    "accepted_price": reply.get("price"),
                    "accepted_at": now_s,
                    "updated_at": now_s,
                }
            },
        )
        await db.request_replies.update_one(
            {"_id": rep_oid},
            {"$set": {"status": "ACCEPTED", "accepted_at": now_s}},
        )

        # Notify vendor that their offer was accepted
        await dispatch_intelligent_notification(
            db,
            user_id=reply["vendor_id"],
            title=f"Offer Accepted: {req.get('item')}!",
            body=f"{user.get('name', 'A shopper')} accepted your ₹{reply.get('price')} offer for {req.get('item')}.",
            notif_type="lead_accepted",
            priority="HIGH",
            cta_label="View Buyer Request",
            deep_link="/i-need",
            source_event="REQUEST_RESPONDED",
            channels=["in_app", "whatsapp"],
        )

        await emit_domain_event(
            db,
            event_type="REQUEST_RESPONDED",
            actor_id=user["id"],
            actor_role="consumer",
            seller_id=reply.get("vendor_id"),
            request_id=req_id,
            payload={"action": "OFFER_ACCEPTED", "price": reply.get("price"), "item": req.get("item")},
        )
        return {
            "ok": True,
            "request_id": req_id,
            "reply_id": reply_id,
            "status": "OFFER_ACCEPTED",
            "vendor_id": reply.get("vendor_id"),
            "vendor_shop": reply.get("vendor_shop"),
            "accepted_price": reply.get("price"),
        }

    @router.post("/requests/{req_id}/status")
    async def update_buyer_request_lifecycle_status(
        req_id: str,
        status: Literal["OPEN", "FULFILLED", "CANCELLED"] = Query(...),
        user: dict = Depends(require_consumer),
    ):
        try:
            req_oid = ObjectId(req_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request ID")

        req = await db.requests.find_one({"_id": req_oid, "consumer_id": user["id"]})
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")

        now_s = now_iso()
        await db.requests.update_one(
            {"_id": req_oid},
            {"$set": {"status": status, "updated_at": now_s}},
        )
        return {"ok": True, "request_id": req_id, "status": status}

    @router.get("/vendor/leads/entitlement")
    async def get_vendor_lead_entitlement(vendor: dict = Depends(require_vendor)):
        plan_code = vendor.get("subscription_plan_code") or ("PRO" if vendor.get("is_pro") else "FREE")
        plan_doc = await db.subscription_plans.find_one({"plan_code": plan_code})
        monthly_limit = (plan_doc or {}).get("lead_limit") or (150 if vendor.get("is_pro") or vendor.get("trial_active") else 10)

        month_prefix = now_utc().strftime("%Y-%m")
        used_this_month = await db.request_replies.count_documents({
            "vendor_id": vendor["id"],
            "created_at": {"$regex": f"^{month_prefix}"},
        })
        accepted_count = await db.request_replies.count_documents({
            "vendor_id": vendor["id"],
            "status": "ACCEPTED",
        })
        return {
            "vendor_id": vendor["id"],
            "plan_code": plan_code,
            "monthly_lead_limit": monthly_limit,
            "leads_responded_this_month": used_this_month,
            "leads_remaining_this_month": max(0, monthly_limit - used_this_month),
            "total_accepted_offers": accepted_count,
            "auto_charge_enabled": False,
        }

    @router.get("/admin/leads/analytics")
    async def admin_lead_monetization_analytics(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "monetization", mutate=False)
        reqs = await db.requests.find({}).to_list(1000)
        replies = await db.request_replies.find({}).to_list(2000)

        total_leads = len(reqs)
        if total_leads == 0:
            return {
                "status": "Awaiting Marketplace Activity",
                "leads_generated": 0,
                "merchant_response_rate_pct": 0.0,
                "median_response_time_minutes": None,
                "lead_to_offer_accepted_rate_pct": 0.0,
                "fulfilled_leads_count": 0,
                "estimated_revenue_from_leads": 0.0,
            }

        req_map = {str(r["_id"]): r for r in reqs}
        responded_reqs = sum(1 for r in reqs if (r.get("reply_count") or 0) > 0 or r.get("status") in ("RESPONDED", "OFFER_ACCEPTED", "FULFILLED"))
        accepted_reqs = [r for r in reqs if r.get("status") in ("OFFER_ACCEPTED", "FULFILLED")]
        lead_rev = sum(float(r.get("accepted_price") or 0.0) for r in accepted_reqs)

        response_times_mins = []
        for rep in replies:
            parent = req_map.get(str(rep.get("request_id")))
            if parent and parent.get("created_at") and rep.get("created_at"):
                try:
                    t1 = datetime.fromisoformat(str(parent["created_at"]).replace("Z", "+00:00"))
                    t2 = datetime.fromisoformat(str(rep["created_at"]).replace("Z", "+00:00"))
                    diff_m = max(0.5, (t2 - t1).total_seconds() / 60.0)
                    response_times_mins.append(diff_m)
                except Exception:
                    pass
        response_times_mins.sort()
        median_mins = round(response_times_mins[len(response_times_mins) // 2], 1) if response_times_mins else None

        return {
            "leads_generated": total_leads,
            "total_merchant_replies": len(replies),
            "merchant_response_rate_pct": round((responded_reqs / total_leads) * 100.0, 1),
            "median_response_time_minutes": median_mins,
            "lead_to_offer_accepted_rate_pct": round((len(accepted_reqs) / total_leads) * 100.0, 1),
            "fulfilled_leads_count": sum(1 for r in reqs if r.get("status") == "FULFILLED"),
            "estimated_revenue_from_leads": round(lead_rev, 2),
        }

    # ------------------------------------------------------------------------
    # POINTS 8 & 9: DATABASE-DRIVEN SUBSCRIPTION PLANS & GRANDFATHERING
    # ------------------------------------------------------------------------

    @router.get("/subscription-plans")
    async def list_public_subscription_plans(vendor_tier: Optional[str] = None):
        q: Dict[str, Any] = {"active": True}
        if vendor_tier:
            q["vendor_tier"] = vendor_tier
        docs = await db.subscription_plans.find(q).sort("display_order", 1).to_list(30)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("plan_code"))
            d.pop("_id", None)
        return {
            "trial_guaranteed_days": 30,
            "retailer_core_monthly_inr": 199,
            "retailer_core_annual_inr": 1499,
            "plans": docs,
        }

    @router.get("/admin/subscription-plans")
    async def admin_list_subscription_plans(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "monetization", mutate=False)
        docs = await db.subscription_plans.find({}).sort("display_order", 1).to_list(50)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("plan_code"))
            d.pop("_id", None)
        return docs

    @router.post("/admin/subscription-plans")
    async def admin_create_subscription_plan(
        payload: SubscriptionPlanCreateOrPatchIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "monetization", mutate=True)
        if not payload.plan_code or not payload.name:
            raise HTTPException(status_code=400, detail="plan_code and name are required")
        code = payload.plan_code.strip().upper()
        if await db.subscription_plans.find_one({"plan_code": code}):
            raise HTTPException(status_code=409, detail=f"Plan {code} already exists")

        doc = {
            "plan_code": code,
            "name": payload.name,
            "vendor_tier": payload.vendor_tier or "retailer",
            "monthly_price": payload.monthly_price or 199,
            "annual_price": payload.annual_price or 1499,
            "trial_duration_days": payload.trial_duration_days if payload.trial_duration_days is not None else 30,
            "product_limit": payload.product_limit,
            "branch_limit": payload.branch_limit or 1,
            "lead_limit": payload.lead_limit or 100,
            "ai_entitlement": payload.ai_entitlement or "FULL_COPILOT_AND_VOICE",
            "analytics_entitlement": payload.analytics_entitlement or "FULL_ATTRIBUTION_AND_ROI",
            "promotion_entitlement": payload.promotion_entitlement or "SELF_SERVE_ADS",
            "integration_entitlement": payload.integration_entitlement or "CSV_IMPORT",
            "active": payload.active if payload.active is not None else True,
            "display_order": payload.display_order or 10,
            "grandfathering_enabled": True,
            "features": payload.features or [],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.subscription_plans.insert_one(doc)
        doc.pop("_id", None)
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="create_subscription_plan",
            entity_type="subscription_plan",
            entity_id=code,
            reason=payload.reason or f"Created subscription plan {code}",
            after_state=doc,
        )
        return doc

    @router.patch("/admin/subscription-plans/{plan_code}")
    async def admin_update_subscription_plan(
        plan_code: str,
        payload: SubscriptionPlanCreateOrPatchIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "monetization", mutate=True)
        code = plan_code.strip().upper()
        existing = await db.subscription_plans.find_one({"plan_code": code})
        if not existing:
            raise HTTPException(status_code=404, detail="Subscription plan not found")

        before_state = {k: v for k, v in existing.items() if k != "_id"}
        updates = {k: v for k, v in payload.model_dump(exclude_none=True).items() if k not in ("plan_code", "reason")}
        updates["updated_at"] = now_iso()

        await db.subscription_plans.update_one({"plan_code": code}, {"$set": updates})
        updated = await db.subscription_plans.find_one({"plan_code": code})
        updated.pop("_id", None)

        await record_immutable_audit_log(
            db,
            admin=admin,
            action="update_subscription_plan",
            entity_type="subscription_plan",
            entity_id=code,
            reason=payload.reason or f"Updated subscription plan {code}",
            before_state=before_state,
            after_state=updated,
        )
        return updated

    @router.post("/admin/subscription-plans/{plan_code}/archive")
    async def admin_archive_subscription_plan(
        plan_code: str,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "monetization", mutate=True)
        code = plan_code.strip().upper()
        existing = await db.subscription_plans.find_one({"plan_code": code})
        if not existing:
            raise HTTPException(status_code=404, detail="Plan not found")

        await db.subscription_plans.update_one(
            {"plan_code": code},
            {"$set": {"active": False, "archived": True, "archived_at": now_iso()}},
        )
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="archive_subscription_plan",
            entity_type="subscription_plan",
            entity_id=code,
            reason="Archived plan without deleting historical records",
        )
        return {"ok": True, "plan_code": code, "active": False, "archived": True}

    # ------------------------------------------------------------------------
    # POINTS 10, 11 & 36: MERCHANT REVENUE HERO KPI, 8-STAGE FUNNEL & ROI NORTH-STAR
    # ------------------------------------------------------------------------

    @router.get("/vendor/revenue-hero")
    async def get_vendor_revenue_hero_and_roi(
        days: int = Query(30, ge=1, le=365),
        vendor: dict = Depends(require_vendor),
    ):
        vid = vendor["id"]
        since_iso = (now_utc() - timedelta(days=days)).isoformat()

        # 1. Gather real orders (avoiding double counting with purchase_attributions via order_id/session_id)
        orders = await db.marketplace_orders.find({
            "vendor_id": vid,
            "created_at": {"$gte": since_iso},
        }).to_list(500)

        purchases = await db.purchase_attributions.find({
            "seller_id": vid,
            "purchased_at": {"$gte": since_iso},
        }).to_list(500)

        verified_visits_count = await db.verified_visits.count_documents({
            "seller_id": vid,
            "created_at": {"$gte": since_iso},
        })

        sessions = await db.attribution_sessions.find({
            "seller_id": vid,
            "created_at": {"$gte": since_iso},
        }).to_list(1000)

        events = await db.attribution_events.find({
            "seller_id": vid,
            "timestamp": {"$gte": since_iso},
        }).to_list(2000)

        # Deduplicated revenue buckets by confidence tier:
        # VERIFIED (1.0x), HIGH_CONFIDENCE (0.85x), LIKELY (0.60x), POSSIBLE (0.25x)
        seen_order_ids = set()
        seen_session_ids = set()
        verified_rev = 0.0
        high_conf_rev = 0.0
        likely_rev = 0.0
        possible_rev = 0.0
        verified_orders_count = 0

        for o in orders:
            st = o.get("status", "")
            pay_st = o.get("payment_status", "")
            if st in ("COMPLETED", "PAID", "READY_FOR_PICKUP", "CONFIRMED") or pay_st in ("PAID", "CASH_COLLECTED"):
                oid = str(o.get("order_id") or o.get("id"))
                seen_order_ids.add(oid)
                if o.get("attribution_session_id"):
                    seen_session_ids.add(str(o["attribution_session_id"]))
                amt = float(o.get("total_amount") or 0.0)
                verified_rev += amt
                verified_orders_count += 1

        for p in purchases:
            sid = str(p.get("attribution_session_id") or "")
            if sid and sid in seen_session_ids:
                continue
            if sid:
                seen_session_ids.add(sid)
            amt = float(p.get("amount") or 0.0)
            conf = str(p.get("confidence_level") or p.get("verification_status") or "VERIFIED").upper()
            src = str(p.get("purchase_source") or "").lower()
            if "VERIFIED" in conf or src in ("customer_confirmation", "qr_code", "receipt_ocr", "in_app_checkout", "cash_collected_at_shop"):
                verified_rev += amt
                verified_orders_count += 1
            elif "HIGH" in conf:
                high_conf_rev += amt
            elif "LIKELY" in conf:
                likely_rev += amt
            else:
                possible_rev += amt

        # Confidence-adjusted attributable revenue
        confidence_adjusted_rev = round(
            (verified_rev * 1.0)
            + (high_conf_rev * 0.85)
            + (likely_rev * 0.60)
            + (possible_rev * 0.25),
            2,
        )

        # 8-Stage Attribution Funnel
        prods = await db.products.find({"vendor_id": vid}).to_list(300)
        total_prod_views = sum(int(p.get("views") or 0) for p in prods) + sum(1 for e in events if e.get("event_type") == "product_view")
        profile_views = int(vendor.get("profile_views") or 0) + sum(1 for e in events if e.get("event_type") == "seller_profile_view")
        directions_cnt = sum(1 for e in events if e.get("event_type") in ("directions_clicked", "navigation_started"))
        probable_visits = sum(1 for s in sessions if s.get("attribution_status") in ("likely_visit", "verified_visit", "purchase_attributed"))
        high_intent_leads = sum(1 for s in sessions if s.get("intent_level") in ("HIGH", "VERY_HIGH"))
        rels = await db.customer_seller_relationships.find({"seller_id": vid}).to_list(500)
        repeat_customers = sum(1 for r in rels if (r.get("visit_count") or 0) > 1 or (r.get("purchase_count") or 0) > 1)

        funnel_8_stage = [
            {"stage": 1, "name": "Discovery", "count": max(total_prod_views + profile_views, len(sessions))},
            {"stage": 2, "name": "Product View", "count": total_prod_views},
            {"stage": 3, "name": "Profile View", "count": profile_views},
            {"stage": 4, "name": "Directions", "count": directions_cnt},
            {"stage": 5, "name": "Probable Visit", "count": max(probable_visits, verified_visits_count)},
            {"stage": 6, "name": "Verified Visit", "count": verified_visits_count},
            {"stage": 7, "name": "Confirmed Purchase", "count": verified_orders_count},
            {"stage": 8, "name": "Revenue (₹)", "count": round(verified_rev + high_conf_rev, 2)},
        ]

        # Merchant Spend (subscriptions + ad spend in period)
        sub_orders = await db.orders.find({
            "user_id": vid,
            "status": "paid",
            "created_at": {"$gte": since_iso},
        }).to_list(50)
        sub_spend = sum(float(o.get("amount") or 0.0) / 100.0 for o in sub_orders)

        ad_camps = await db.ad_campaigns.find({"vendor_id": vid}).to_list(100)
        ad_spend = sum(float(c.get("spend") or 0.0) for c in ad_camps)
        total_merchant_spend = round(sub_spend + ad_spend, 2)

        # Formal Merchant ROI North-Star Calculation (Point 36)
        if confidence_adjusted_rev == 0 and total_merchant_spend == 0:
            roi_multiple = None
            roi_status = "Insufficient Data"
            roi_summary = "Awaiting Marketplace Activity — confirm visits or receive orders to measure ROI."
        elif total_merchant_spend == 0:
            roi_multiple = None
            roi_status = "Free Trial / Zero Spend Gain"
            roi_summary = f"₹{confidence_adjusted_rev:,.2f} generated on ₹0 platform spend (Free Trial / Starter)."
        else:
            roi_multiple = round(confidence_adjusted_rev / total_merchant_spend, 2)
            roi_status = "Measured ROI"
            roi_summary = f"{roi_multiple}x Return on Spend (₹{confidence_adjusted_rev:,.2f} revenue / ₹{total_merchant_spend:,.2f} spend)."

        return {
            "vendor_id": vid,
            "period_days": days,
            "hero_kpi_title": "Incremental Revenue Generated by HyperLocal",
            "estimated_revenue_generated": confidence_adjusted_rev,
            "confidence_tiers": {
                "VERIFIED": {"revenue": round(verified_rev, 2), "weight": 1.0, "label": "Verified Orders, QR & Receipts"},
                "HIGH_CONFIDENCE": {"revenue": round(high_conf_rev, 2), "weight": 0.85, "label": "High-Confidence Multi-Signal"},
                "LIKELY": {"revenue": round(likely_rev, 2), "weight": 0.60, "label": "Directions + Geofence Dwell"},
                "POSSIBLE": {"revenue": round(possible_rev, 2), "weight": 0.25, "label": "Discovery Intent Signals"},
            },
            "metrics": {
                "verified_orders": verified_orders_count,
                "verified_store_visits": verified_visits_count,
                "high_intent_leads": high_intent_leads,
                "repeat_customers": repeat_customers,
            },
            "merchant_roi": {
                "formula": "confidence_adjusted_attributable_revenue / merchant_hyperlocal_spend",
                "confidence_adjusted_attributable_revenue": confidence_adjusted_rev,
                "merchant_hyperlocal_spend": total_merchant_spend,
                "subscription_spend": round(sub_spend, 2),
                "advertising_spend": round(ad_spend, 2),
                "roi_multiple": roi_multiple,
                "roi_status": roi_status,
                "roi_summary": roi_summary,
            },
            "funnel_8_stage": funnel_8_stage,
        }

    # ------------------------------------------------------------------------
    # POINT 12: PRIVACY-PRESERVING MERCHANT CRM FOUNDATION
    # ------------------------------------------------------------------------

    @router.get("/vendor/crm-analytics")
    async def get_vendor_crm_analytics(vendor: dict = Depends(require_vendor)):
        vid = vendor["id"]
        rels = await db.customer_seller_relationships.find({"seller_id": vid}).to_list(1000)
        orders = await db.marketplace_orders.find({"vendor_id": vid}).to_list(500)

        # Only include customers who have actually visited or purchased (never expose mere profile viewers!)
        transacting_rels = [
            r for r in rels
            if (r.get("visit_count") or 0) > 0 or (r.get("purchase_count") or 0) > 0 or float(r.get("total_spent") or 0) > 0
        ]

        if not transacting_rels and not orders:
            return {
                "status": "Insufficient Data",
                "message": "No verified customer visits or orders yet. Privacy guardrails prevent displaying non-transacting profile viewers.",
                "segments": {
                    "new_customers": 0,
                    "returning_customers": 0,
                    "high_value_customers": 0,
                    "frequent_customers": 0,
                    "inactive_customers": 0,
                    "hyperlocal_acquired_customers": 0,
                },
                "metrics": {
                    "repeat_purchase_rate_pct": 0.0,
                    "average_order_value": 0.0,
                    "average_visit_frequency": 0.0,
                },
            }

        thirty_days_ago = (now_utc() - timedelta(days=30)).isoformat()
        new_c = 0
        returning_c = 0
        high_val_c = 0
        frequent_c = 0
        inactive_c = 0
        total_spent_sum = 0.0
        total_purchases_sum = 0
        total_visits_sum = 0

        for r in transacting_rels:
            vc = int(r.get("visit_count") or 0)
            pc = int(r.get("purchase_count") or 0)
            spent = float(r.get("total_spent") or 0.0)
            last_act = r.get("last_purchase_at") or r.get("last_visit_at") or r.get("created_at") or ""

            total_spent_sum += spent
            total_purchases_sum += max(1, pc)
            total_visits_sum += max(1, vc)

            if vc <= 1 and pc <= 1:
                new_c += 1
            else:
                returning_c += 1
            if spent >= 500.0:
                high_val_c += 1
            if vc >= 3 or pc >= 3:
                frequent_c += 1
            if last_act and last_act < thirty_days_ago:
                inactive_c += 1

        total_cust = max(1, len(transacting_rels))
        return {
            "status": "ok",
            "privacy_notice": "Customer identities are anonymized into cohorts. Profile viewers without visits/orders are excluded.",
            "segments": {
                "new_customers": new_c,
                "returning_customers": returning_c,
                "high_value_customers": high_val_c,
                "frequent_customers": frequent_c,
                "inactive_customers": inactive_c,
                "hyperlocal_acquired_customers": len(transacting_rels),
            },
            "metrics": {
                "repeat_purchase_rate_pct": round((returning_c / total_cust) * 100.0, 1),
                "average_order_value": round(total_spent_sum / max(1, total_purchases_sum), 2),
                "average_visit_frequency": round(total_visits_sum / total_cust, 2),
                "total_attributed_segment_revenue": round(total_spent_sum, 2),
            },
        }

    # ------------------------------------------------------------------------
    # POINTS 13 & 14: HYPERLOCAL DEMAND INTELLIGENCE & DEMAND GAP ENGINE
    # ------------------------------------------------------------------------

    @router.get("/vendor/demand-gaps")
    async def get_vendor_demand_gaps_and_intelligence(
        radius_km: float = Query(5.0, ge=0.5, le=25.0),
        vendor: dict = Depends(require_vendor),
    ):
        vid = vendor["id"]
        my_prods = await db.products.find({"vendor_id": vid}).to_list(300)
        my_names_lower = {str(p.get("name") or "").lower() for p in my_prods if p.get("in_stock", True)}

        all_prods = await db.products.find({"in_stock": True}).to_list(1500)
        open_reqs = await db.requests.find({"status": {"$in": ["open", "OPEN", "RESPONDED"]}}).to_list(300)
        demand_reqs = await db.demand_requests.find({"status": "open"}).to_list(300)
        search_events = await db.domain_events.find({"event_type": "PRODUCT_SEARCHED"}).sort("created_at", -1).limit(500).to_list(500)

        saved_actions = await db.vendor_demand_gap_actions.find({"vendor_id": vid}).to_list(200)
        dismissed_items = {a["item_name"].lower() for a in saved_actions if a.get("action") == "DISMISS"}

        # Aggregate demand signals by normalized product keyword
        demand_signals: Dict[str, Dict[str, Any]] = {}

        def record_signal(raw_term: str, cat: str, is_request: bool = False):
            term = str(raw_term or "").strip().title()
            if not term or len(term) < 2 or term.lower() in dismissed_items:
                return
            key = term.lower()
            if key not in demand_signals:
                demand_signals[key] = {
                    "item_name": term,
                    "category": cat or "groceries",
                    "search_count": 0,
                    "buyer_request_count": 0,
                }
            if is_request:
                demand_signals[key]["buyer_request_count"] += 1
            else:
                demand_signals[key]["search_count"] += 1

        for r in open_reqs:
            record_signal(r.get("item"), r.get("category", "groceries"), is_request=True)
        for dr in demand_reqs:
            record_signal(dr.get("product_name"), dr.get("category", "groceries"), is_request=True)
        for ev in search_events:
            q_term = (ev.get("payload") or {}).get("query")
            if q_term:
                record_signal(q_term, (ev.get("payload") or {}).get("category", "groceries"), is_request=False)

        if not demand_signals:
            return {
                "status": "Insufficient Data",
                "message": "Awaiting Marketplace Activity — not enough local search or buyer request cohorts yet.",
                "opportunities": [],
                "high_demand_categories": [],
            }

        opportunities = []
        cat_counts: Dict[str, int] = {}
        for key, sig in demand_signals.items():
            total_demand = sig["search_count"] + (sig["buyer_request_count"] * 3)
            cat_counts[sig["category"]] = cat_counts.get(sig["category"], 0) + total_demand

            # Count nearby supply across marketplace
            local_supply_prods = [p for p in all_prods if key in str(p.get("name") or "").lower()]
            local_supply_count = len(local_supply_prods)
            in_my_catalog = any(key in mn or mn in key for mn in my_names_lower)

            # Opportunity Score (0-100): High Demand + Low Supply = High Opportunity
            demand_pts = min(65.0, total_demand * 12.0)
            supply_scarcity_pts = max(0.0, 35.0 - (local_supply_count * 7.0))
            opp_score = int(round(min(100.0, demand_pts + supply_scarcity_pts)))

            prices = [float(p.get("price") or 0) for p in local_supply_prods if p.get("price")]
            median_price = round(sum(prices) / len(prices), 2) if prices else None

            opportunities.append({
                "item_name": sig["item_name"],
                "category": sig["category"],
                "search_count": sig["search_count"],
                "buyer_request_count": sig["buyer_request_count"],
                "local_supply_listings_count": local_supply_count,
                "already_in_my_catalog": in_my_catalog,
                "observed_median_price": median_price,
                "opportunity_score": opp_score,
                "opportunity_tier": "HIGH_OPPORTUNITY" if opp_score >= 70 else ("MEDIUM_OPPORTUNITY" if opp_score >= 45 else "COMPETITIVE"),
                "recommendation": (
                    f"High unmet demand ({sig['buyer_request_count']} requests, {sig['search_count']} searches) with only {local_supply_count} local seller(s)."
                    if local_supply_count <= 2
                    else f"Active neighborhood demand ({total_demand} signals). Competitive median price: ₹{median_price or 'N/A'}."
                ),
            })

        opportunities.sort(key=lambda x: (-x["opportunity_score"], -x["buyer_request_count"]))
        top_cats = [
            {"category": k, "demand_score": v}
            for k, v in sorted(cat_counts.items(), key=lambda item: -item[1])
        ]

        return {
            "status": "ok",
            "radius_km": radius_km,
            "privacy_cohort_note": "Aggregated across neighborhood searches and open buyer requests without exposing individual user identities.",
            "opportunities": opportunities[:20],
            "high_demand_categories": top_cats[:8],
        }

    @router.post("/vendor/demand-gaps/action")
    async def handle_vendor_demand_gap_action(
        payload: DemandGapActionIn,
        vendor: dict = Depends(require_vendor),
    ):
        now_s = now_iso()
        await db.vendor_demand_gap_actions.update_one(
            {"vendor_id": vendor["id"], "item_name": payload.item_name},
            {
                "$set": {
                    "vendor_id": vendor["id"],
                    "item_name": payload.item_name,
                    "action": payload.action,
                    "updated_at": now_s,
                }
            },
            upsert=True,
        )

        created_product = None
        if payload.action == "ADD_PRODUCT":
            price = float(payload.price or 40.0)
            pdoc = {
                "vendor_id": vendor["id"],
                "name": payload.item_name,
                "category": payload.category or "groceries",
                "price": price,
                "unit": payload.unit or "kg",
                "stock_quantity": 10.0,
                "in_stock": True,
                "is_featured": False,
                "source": "demand_gap_engine",
                "views": 0,
                "clicks": 0,
                "confirmation_count": 1,
                "last_confirmed_at": now_s,
                "created_at": now_s,
                "updated_at": now_s,
            }
            res = await db.products.insert_one(pdoc)
            pdoc["id"] = str(res.inserted_id)
            pdoc.pop("_id", None)
            created_product = pdoc

        return {
            "ok": True,
            "action": payload.action,
            "item_name": payload.item_name,
            "created_product": created_product,
        }

    # ------------------------------------------------------------------------
    # POINTS 15 & 16: MOBILE CART VENDOR MODE & REAL HOTSPOT ROUTE OPTIMIZATION
    # ------------------------------------------------------------------------

    @router.get("/vendor/mobile-cart/dashboard")
    async def get_mobile_cart_dashboard(vendor: dict = Depends(require_vendor)):
        vid = vendor["id"]
        prods = await db.products.find({"vendor_id": vid}).to_list(100)
        for p in prods:
            p["id"] = str(p.pop("_id"))

        today_str = now_utc().strftime("%Y-%m-%d")
        today_sales_doc = await db.vendor_daily_sales.find_one({"seller_id": vid, "date": today_str})
        served_stops = await db.mobile_cart_stops.find({
            "vendor_id": vid,
            "served_at": {"$regex": f"^{today_str}"},
        }).to_list(50)
        for s in served_stops:
            s["id"] = str(s.pop("_id"))

        return {
            "vendor_id": vid,
            "shop_name": vendor.get("shop_name"),
            "vendor_type": vendor.get("vendor_type", "cart_vendor"),
            "live_status": vendor.get("cart_live_status") or ("ONLINE" if vendor.get("is_online") else "OFFLINE"),
            "current_locality": vendor.get("current_locality") or vendor.get("shop_address") or "Dehradun",
            "lat": vendor.get("lat"),
            "lng": vendor.get("lng"),
            "products_count": len(prods),
            "in_stock_count": sum(1 for p in prods if p.get("in_stock")),
            "today_sales_amount": float((today_sales_doc or {}).get("total_sales") or sum(float(s.get("sales_amount") or 0) for s in served_stops)),
            "today_stops_served": served_stops,
            "products": prods,
        }

    @router.post("/vendor/mobile-cart/status")
    async def update_mobile_cart_live_status(
        payload: MobileCartStatusIn,
        vendor: dict = Depends(require_vendor),
    ):
        now_s = now_iso()
        updates: Dict[str, Any] = {
            "cart_live_status": payload.live_status,
            "is_online": payload.live_status != "OFFLINE",
            "last_location_update_at": now_s,
        }
        if payload.lat is not None and payload.lng is not None:
            updates["lat"] = float(payload.lat)
            updates["lng"] = float(payload.lng)
        if payload.current_locality:
            updates["current_locality"] = payload.current_locality

        await db.users.update_one({"_id": ObjectId(vendor["id"])}, {"$set": updates})
        return {
            "ok": True,
            "live_status": payload.live_status,
            "is_online": updates["is_online"],
            "current_locality": payload.current_locality or vendor.get("current_locality"),
            "updated_at": now_s,
        }

    @router.post("/vendor/mobile-cart/route-optimize")
    async def optimize_mobile_cart_route(
        lat: Optional[float] = Query(None),
        lng: Optional[float] = Query(None),
        radius_km: float = Query(6.0, ge=1.0, le=25.0),
        vendor: dict = Depends(require_vendor),
    ):
        """
        Point 16: Real Route Optimization Foundation.
        Aggregates real open buyer requests, demand requests, and locality clusters matching the cart's inventory.
        Never uses fake predetermined waypoints or exposes exact consumer home coordinates.
        """
        v_lat = float(lat if lat is not None else (vendor.get("lat") or 30.3255))
        v_lng = float(lng if lng is not None else (vendor.get("lng") or 78.0436))

        my_prods = await db.products.find({"vendor_id": vendor["id"], "in_stock": True}).to_list(100)
        my_cats = {str(p.get("category") or "").lower() for p in my_prods}
        my_names = [str(p.get("name") or "").lower() for p in my_prods]

        localities = await db.localities.find({"status": {"$in": ["LIVE", "BETA", "MERCHANT_ONBOARDING"]}}).to_list(30)
        open_reqs = await db.requests.find({"status": {"$in": ["open", "OPEN", "RESPONDED"]}}).to_list(200)
        demand_reqs = await db.demand_requests.find({"status": "open"}).to_list(200)

        # Build privacy-safe clusters around real Dehradun localities + blurred demand grid cells
        clusters: Dict[str, Dict[str, Any]] = {}
        for loc in localities:
            lid = loc["locality_id"]
            clusters[lid] = {
                "cluster_id": lid,
                "zone_name": loc["name"],
                # Privacy-safe zone center (never an individual house)
                "lat": float(loc["lat"]),
                "lng": float(loc["lng"]),
                "demand_signals": 0,
                "matching_inventory_signals": 0,
                "requested_items": [],
            }

        # Map open requests into nearest locality cluster (or 500m blurred grid cell)
        for r in open_reqs + demand_reqs:
            item_str = str(r.get("item") or r.get("product_name") or "").strip()
            r_cat = str(r.get("category") or "").lower()
            r_lat = r.get("lat")
            r_lng = r.get("lng")

            target_cid = None
            if r_lat is not None and r_lng is not None:
                # Blur to ~500m grid if not near a named locality
                best_loc = None
                best_d = 999.0
                for cid, cl in clusters.items():
                    d = haversine_km(r_lat, r_lng, cl["lat"], cl["lng"]) or 999.0
                    if d < best_d:
                        best_d = d
                        best_loc = cid
                if best_loc and best_d <= 2.5:
                    target_cid = best_loc
                else:
                    # Privacy-safe 500m blurred grid cell (rounds lat/lng to 2 decimal places ~1.1km)
                    b_lat = round(float(r_lat), 2)
                    b_lng = round(float(r_lng), 2)
                    target_cid = f"grid_{b_lat}_{b_lng}"
                    if target_cid not in clusters:
                        clusters[target_cid] = {
                            "cluster_id": target_cid,
                            "zone_name": f"Neighborhood Cluster ({b_lat}°N, {b_lng}°E)",
                            "lat": b_lat,
                            "lng": b_lng,
                            "demand_signals": 0,
                            "matching_inventory_signals": 0,
                            "requested_items": [],
                        }
            else:
                # Default to Central Paltan Bazaar / Clock Tower cluster when request has city-level location
                target_cid = "loc_paltan_bazaar" if "loc_paltan_bazaar" in clusters else (next(iter(clusters.keys()), None))

            if target_cid and target_cid in clusters:
                clusters[target_cid]["demand_signals"] += 1
                if item_str and item_str not in clusters[target_cid]["requested_items"]:
                    clusters[target_cid]["requested_items"].append(item_str)
                if r_cat in my_cats or any(item_str.lower() in mn or mn in item_str.lower() for mn in my_names):
                    clusters[target_cid]["matching_inventory_signals"] += 1

        # Score and sequence clusters with real demand
        candidate_stops = []
        for cid, cl in clusters.items():
            if cl["demand_signals"] == 0 and cl["matching_inventory_signals"] == 0:
                continue
            dist_km = haversine_km(v_lat, v_lng, cl["lat"], cl["lng"]) or 1.0
            if dist_km > radius_km:
                continue
            road_est_km = round(dist_km * 1.28, 2)  # Honest Haversine-to-road multiplier
            opp_score = round(
                ((cl["demand_signals"] * 15.0) + (cl["matching_inventory_signals"] * 25.0))
                / max(0.6, road_est_km),
                1,
            )
            candidate_stops.append({
                "cluster_id": cid,
                "zone_name": cl["zone_name"],
                "lat": cl["lat"],
                "lng": cl["lng"],
                "haversine_distance_km": round(dist_km, 2),
                "estimated_road_distance_km": road_est_km,
                "demand_signals_count": cl["demand_signals"],
                "matching_inventory_signals": cl["matching_inventory_signals"],
                "top_requested_items": cl["requested_items"][:5],
                "opportunity_score_per_km": opp_score,
                "suggested_dwell_mins": min(60, 20 + cl["demand_signals"] * 8),
            })

        candidate_stops.sort(key=lambda x: -x["opportunity_score_per_km"])
        top_stops = candidate_stops[:5]
        for idx, st in enumerate(top_stops):
            st["stop"] = idx + 1
            st["name"] = st["zone_name"]
            st["expected_demand"] = f"{st['demand_signals_count']} active request(s) · {', '.join(st['top_requested_items'][:3]) or 'General Groceries'}"

        has_external_routing = bool(os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("OSRM_URL"))
        return {
            "status": "ok" if top_stops else "Awaiting Marketplace Activity",
            "vendor_id": vendor["id"],
            "routing_mode": "ROAD_NETWORK_API" if has_external_routing else "HAVERSINE_ESTIMATE_1_28X",
            "privacy_protection": "Zone-level aggregation active. Exact customer home addresses are never exposed.",
            "start_coordinates": {"lat": v_lat, "lng": v_lng},
            "recommended_stops": len(top_stops),
            "route": top_stops,
            "total_estimated_time_mins": sum(s["suggested_dwell_mins"] + int(round(s["estimated_road_distance_km"] * 6)) for s in top_stops),
            "rationale": (
                f"Ranked {len(top_stops)} neighborhood zone(s) by real open buyer demand and cart inventory match per km."
                if top_stops
                else "No active buyer requests within radius right now. Awaiting Marketplace Activity."
            ),
        }

    @router.post("/vendor/mobile-cart/mark-area-served")
    async def mark_mobile_cart_area_served(
        payload: MobileCartMarkServedIn,
        vendor: dict = Depends(require_vendor),
    ):
        now_s = now_iso()
        doc = {
            "vendor_id": vendor["id"],
            "stop_name": payload.stop_name,
            "lat": payload.lat or vendor.get("lat"),
            "lng": payload.lng or vendor.get("lng"),
            "customers_served": payload.customers_served,
            "sales_amount": float(payload.sales_amount),
            "notes": payload.notes,
            "served_at": now_s,
        }
        res = await db.mobile_cart_stops.insert_one(doc)
        doc["id"] = str(res.inserted_id)
        doc.pop("_id", None)
        return {"ok": True, "stop_record": doc}


    # ------------------------------------------------------------------------
    # POINT 17: AI MATURITY FRAMEWORK REGISTRY
    # ------------------------------------------------------------------------

    @router.get("/admin/ai-maturity-registry")
    async def list_ai_maturity_registry(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "ai", mutate=False)
        docs = await db.ai_maturity_registry.find({}).to_list(50)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("capability_key"))
            d.pop("_id", None)
        return {
            "maturity_levels": ["PROTOTYPE", "RULE_BASED", "DATA_DRIVEN", "MODEL_ASSISTED", "PRODUCTION_AI"],
            "capabilities": docs,
        }

    # ------------------------------------------------------------------------
    # POINTS 18 & 19: WHATSAPP ADAPTER & INTELLIGENT NOTIFICATIONS
    # ------------------------------------------------------------------------

    @router.get("/admin/whatsapp/status")
    async def get_whatsapp_adapter_status(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "platform_control", mutate=False)
        wa_token = bool(os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip())
        wa_phone = bool(os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip())
        return {
            "provider": "Official WhatsApp Business Cloud API Adapter",
            "credentials_configured": wa_token and wa_phone,
            "mode": "LIVE_CLOUD_API" if (wa_token and wa_phone) else "SANDBOX_IN_APP_FALLBACK",
            "supported_templates": list(WHATSAPP_TEMPLATES.values()),
            "rate_limit_per_user_daily": 10,
            "opt_out_supported": True,
        }

    @router.get("/notifications/preferences")
    async def get_my_notification_preferences(user: dict = Depends(get_current_user)):
        prefs = await db.notification_preferences.find_one({"user_id": user["id"]})
        if not prefs:
            return {
                "user_id": user["id"],
                "in_app_enabled": True,
                "whatsapp_opt_in": True,
                "email_opt_in": True,
                "muted_all": False,
                "buyer_request_alerts": True,
                "order_updates": True,
                "inventory_reminders": True,
            }
        prefs.pop("_id", None)
        return prefs

    @router.patch("/notifications/preferences")
    async def update_my_notification_preferences(
        payload: Dict[str, Any],
        user: dict = Depends(get_current_user),
    ):
        allowed_keys = {
            "in_app_enabled", "whatsapp_opt_in", "email_opt_in", "muted_all",
            "buyer_request_alerts", "order_updates", "inventory_reminders",
        }
        updates = {k: bool(v) for k, v in payload.items() if k in allowed_keys}
        updates["user_id"] = user["id"]
        updates["updated_at"] = now_iso()
        await db.notification_preferences.update_one(
            {"user_id": user["id"]},
            {"$set": updates},
            upsert=True,
        )
        return updates

    # ------------------------------------------------------------------------
    # POINTS 20 & 21: SELF-SERVICE PROMOTED LISTINGS & LOCAL ADVERTISING ENGINE
    # ------------------------------------------------------------------------

    @router.get("/campaigns/sponsored")
    async def get_active_sponsored_listings(
        q: str = Query(""),
        category: Optional[str] = None,
        locality: str = Query("Dehradun"),
    ):
        """
        Returns clearly labeled SPONSORED listings separate from organic search results.
        Automatically excludes out-of-stock or low-confidence stale products.
        """
        camps = await db.ad_campaigns.find({"status": "ACTIVE"}).to_list(50)
        if not camps:
            return []

        vendors = await db.users.find({"role": "vendor"}).to_list(300)
        vmap = {str(v["_id"]): v for v in vendors}
        sponsored_out = []

        for c in camps:
            if float(c.get("spend") or 0) >= float(c.get("total_budget") or 500):
                continue
            if category and category != "all" and c.get("category") and c["category"].lower() != category.lower():
                continue

            prod_doc = None
            if c.get("product_id"):
                try:
                    prod_doc = await db.products.find_one({"_id": ObjectId(c["product_id"])})
                except Exception:
                    prod_doc = None
                if not prod_doc or not prod_doc.get("in_stock", True):
                    # Guardrail: Out-of-stock products cannot run paid promotion
                    continue
                trust = compute_inventory_trust_sync(prod_doc, vmap.get(str(c.get("vendor_id"))))
                if trust["inventory_freshness_state"] == "POSSIBLY_STALE":
                    continue

            v = vmap.get(str(c.get("vendor_id")), {})
            sponsored_out.append({
                "campaign_id": c["id"],
                "is_sponsored": True,
                "sponsored_label": "SPONSORED",
                "title": c.get("title"),
                "campaign_type": c.get("campaign_type"),
                "offer_headline": c.get("offer_headline"),
                "vendor_id": c.get("vendor_id"),
                "vendor_shop": v.get("shop_name") or v.get("name") or "Sponsored Partner",
                "product_id": c.get("product_id"),
                "product_name": prod_doc.get("name") if prod_doc else None,
                "price": prod_doc.get("price") if prod_doc else None,
                "unit": prod_doc.get("unit") if prod_doc else None,
            })

        return sponsored_out[:4]

    @router.get("/vendor/campaigns")
    async def list_vendor_campaigns(vendor: dict = Depends(require_vendor)):
        docs = await db.ad_campaigns.find({"vendor_id": vendor["id"]}).sort("created_at", -1).to_list(100)
        for d in docs:
            d.pop("_id", None)
            spend = float(d.get("spend") or 0.0)
            attr_rev = float(d.get("attributed_revenue") or 0.0)
            d["roas"] = round(attr_rev / spend, 2) if spend > 0 else None
        return docs

    @router.post("/vendor/campaigns")
    async def create_vendor_campaign(
        payload: AdCampaignCreateIn,
        vendor: dict = Depends(require_vendor),
    ):
        # Validate product if PRODUCT_PROMOTION
        if payload.product_id:
            try:
                p = await db.products.find_one({"_id": ObjectId(payload.product_id), "vendor_id": vendor["id"]})
            except Exception:
                p = None
            if not p:
                raise HTTPException(status_code=404, detail="Selected product not found in your inventory")
            if not p.get("in_stock", True):
                raise HTTPException(status_code=400, detail="Out-of-stock products cannot run paid promotions")

        now_s = now_iso()
        cid = f"camp_{uuid.uuid4().hex[:12]}"
        doc = {
            "id": cid,
            "vendor_id": vendor["id"],
            "vendor_shop": vendor.get("shop_name") or vendor.get("name"),
            "title": payload.title.strip(),
            "campaign_type": payload.campaign_type,
            "pricing_model": payload.pricing_model,
            "product_id": payload.product_id,
            "category": payload.category,
            "locality": payload.locality,
            "radius_km": payload.radius_km,
            "daily_budget": float(payload.daily_budget),
            "total_budget": float(payload.total_budget),
            "bid_amount": float(payload.bid_amount),
            "offer_headline": payload.offer_headline,
            "start_date": payload.start_date or now_s[:10],
            "end_date": payload.end_date or (now_utc() + timedelta(days=14)).strftime("%Y-%m-%d"),
            "status": "ACTIVE",
            "moderation_status": "APPROVED",
            "is_sponsored_labeled": True,
            "impressions": 0,
            "clicks": 0,
            "attributed_visits": 0,
            "verified_purchases": 0,
            "spend": 0.0,
            "attributed_revenue": 0.0,
            "created_at": now_s,
            "updated_at": now_s,
        }
        await db.ad_campaigns.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/campaigns/{campaign_id}/event")
    async def record_campaign_event(
        campaign_id: str,
        event_type: Literal["IMPRESSION", "CLICK"] = Query("CLICK"),
        user: Optional[dict] = Depends(get_optional_user),
    ):
        camp = await db.ad_campaigns.find_one({"id": campaign_id})
        if not camp or camp.get("status") != "ACTIVE":
            raise HTTPException(status_code=404, detail="Active campaign not found")

        inc_ops: Dict[str, Any] = {}
        if event_type == "IMPRESSION":
            inc_ops["impressions"] = 1
            if camp.get("pricing_model") == "CPM":
                inc_ops["spend"] = round(float(camp.get("bid_amount") or 5.0) / 1000.0, 4)
        else:
            inc_ops["clicks"] = 1
            if camp.get("pricing_model") in ("CPC", "FIXED_BUDGET"):
                inc_ops["spend"] = float(camp.get("bid_amount") or 5.0)
            await emit_domain_event(
                db,
                event_type="CAMPAIGN_CLICKED",
                actor_id=user["id"] if user else None,
                seller_id=camp.get("vendor_id"),
                product_id=camp.get("product_id"),
                campaign_id=campaign_id,
                payload={"campaign_title": camp.get("title")},
            )

        await db.ad_campaigns.update_one({"id": campaign_id}, {"$inc": inc_ops})
        updated = await db.ad_campaigns.find_one({"id": campaign_id})
        if float(updated.get("spend") or 0) >= float(updated.get("total_budget") or 500):
            await db.ad_campaigns.update_one({"id": campaign_id}, {"$set": {"status": "BUDGET_EXHAUSTED"}})
        updated.pop("_id", None)
        return {"ok": True, "campaign": updated}

    @router.get("/admin/campaigns")
    async def admin_list_all_campaigns(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "monetization", mutate=False)
        docs = await db.ad_campaigns.find({}).sort("created_at", -1).to_list(200)
        for d in docs:
            d.pop("_id", None)
        return docs

    @router.post("/admin/campaigns/{campaign_id}/moderate")
    async def admin_moderate_campaign(
        campaign_id: str,
        payload: AdCampaignModerateIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "monetization", mutate=True)
        camp = await db.ad_campaigns.find_one({"id": campaign_id})
        if not camp:
            raise HTTPException(status_code=404, detail="Campaign not found")

        before_state = {k: v for k, v in camp.items() if k != "_id"}
        updates: Dict[str, Any] = {"updated_at": now_iso()}
        if payload.action == "APPROVE":
            updates["moderation_status"] = "APPROVED"
            updates["status"] = "ACTIVE"
        elif payload.action == "REJECT":
            updates["moderation_status"] = "REJECTED"
            updates["status"] = "REJECTED"
        elif payload.action == "PAUSE":
            updates["status"] = "PAUSED"
        elif payload.action == "RESUME":
            updates["status"] = "ACTIVE"
        elif payload.action == "TERMINATE":
            updates["status"] = "TERMINATED"
        elif payload.action == "CREDIT" and payload.credit_amount:
            updates["total_budget"] = float(camp.get("total_budget") or 0) + float(payload.credit_amount)

        await db.ad_campaigns.update_one({"id": campaign_id}, {"$set": updates})
        updated = await db.ad_campaigns.find_one({"id": campaign_id})
        updated.pop("_id", None)

        await record_immutable_audit_log(
            db,
            admin=admin,
            action=f"campaign_{payload.action.lower()}",
            entity_type="ad_campaign",
            entity_id=campaign_id,
            reason=payload.reason,
            before_state=before_state,
            after_state=updated,
            target_name=camp.get("title"),
        )
        return updated

    # ------------------------------------------------------------------------
    # POINT 22: MULTI-ENGINE REVENUE SYSTEM & FINANCIAL LEDGER
    # ------------------------------------------------------------------------

    @router.get("/admin/revenue/control-center")
    async def admin_revenue_control_center(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "revenue", mutate=False)
        # 1. Subscriptions revenue from paid `orders`
        paid_sub_orders = await db.orders.find({"status": "paid"}).to_list(1000)
        sub_gross = sum(float(o.get("amount") or 0.0) / 100.0 for o in paid_sub_orders)

        # 2. Advertising revenue from `ad_campaigns`
        all_camps = await db.ad_campaigns.find({}).to_list(500)
        ad_gross = sum(float(c.get("spend") or 0.0) for c in all_camps)

        # 3. Marketplace Transaction Fees & Commissions from `invoices` (avoiding double count with orders)
        invoices = await db.invoices.find({}).to_list(1000)
        tx_fee_gross = sum(float(inv.get("commission_amount") or inv.get("platform_fee") or 0.0) for inv in invoices)
        refunds_total = sum(float(inv.get("refunded_amount") or 0.0) for inv in invoices)

        # 4. Manual adjustments / credits in `revenue_ledger`
        ledger_entries = await db.revenue_ledger.find({}).sort("created_at", -1).to_list(200)
        for le in ledger_entries:
            le.pop("_id", None)
        credits_total = sum(float(le.get("amount") or 0.0) for le in ledger_entries if le.get("adjustment_type") in ("CREDIT", "REFUND"))

        gross_revenue = round(sub_gross + ad_gross + tx_fee_gross, 2)
        net_revenue = round(max(0.0, gross_revenue - refunds_total - credits_total), 2)

        vendors = await db.users.find({"role": "vendor"}).to_list(1000)
        total_vendors = len(vendors)
        paid_vendors = [v for v in vendors if v.get("is_pro")]
        paid_count = len(paid_vendors)

        # MRR & ARR based on active paid merchants
        mrr = 0.0
        revenue_by_plan: Dict[str, float] = {}
        revenue_by_locality: Dict[str, float] = {}

        for o in paid_sub_orders:
            p_name = str(o.get("plan") or "monthly")
            amt_r = float(o.get("amount") or 0.0) / 100.0
            revenue_by_plan[p_name] = round(revenue_by_plan.get(p_name, 0.0) + amt_r, 2)

        for v in paid_vendors:
            plan_type = v.get("pro_plan") or "monthly"
            if plan_type == "yearly":
                mrr += 1499.0 / 12.0
            elif plan_type == "weekly":
                mrr += 25.0 * 4.0
            else:
                mrr += 199.0
            loc = v.get("city") or "Dehradun"
            revenue_by_locality[loc] = round(revenue_by_locality.get(loc, 0.0) + 199.0, 2)

        mrr = round(mrr, 2)
        arr = round(mrr * 12.0, 2)
        arpu = round(gross_revenue / max(1, paid_count), 2) if paid_count > 0 else 0.0
        trial_conv_rate = round((paid_count / max(1, total_vendors)) * 100.0, 1) if total_vendors > 0 else 0.0

        return {
            "streams": {
                "SUBSCRIPTIONS": round(sub_gross, 2),
                "ADVERTISING": round(ad_gross, 2),
                "TRANSACTION_FEES": round(tx_fee_gross, 2),
                "LEADS": 0.0,
                "PREMIUM_INTELLIGENCE": 0.0,
            },
            "summary": {
                "gross_revenue": gross_revenue,
                "net_revenue": net_revenue,
                "refunds_total": round(refunds_total, 2),
                "credits_and_adjustments": round(credits_total, 2),
                "mrr": mrr,
                "arr": arr,
                "arpu": arpu,
                "paid_merchants_count": paid_count,
                "total_merchants_count": total_vendors,
                "trial_conversion_rate_pct": trial_conv_rate,
            },
            "revenue_by_plan": revenue_by_plan,
            "revenue_by_locality": revenue_by_locality,
            "recent_ledger_adjustments": ledger_entries[:30],
        }

    @router.post("/admin/revenue/ledger-adjustment")
    async def admin_create_revenue_ledger_adjustment(
        payload: RevenueAdjustmentIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "revenue", mutate=True)
        doc = {
            "id": f"led_{uuid.uuid4().hex[:12]}",
            "stream": payload.stream,
            "adjustment_type": payload.adjustment_type,
            "amount": float(payload.amount),
            "vendor_id": payload.vendor_id,
            "reference_id": payload.reference_id,
            "reason": payload.reason,
            "admin_id": admin.get("id"),
            "admin_email": admin.get("email"),
            "created_at": now_iso(),
        }
        await db.revenue_ledger.insert_one(doc)
        doc.pop("_id", None)
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="revenue_ledger_adjustment",
            entity_type="revenue_ledger",
            entity_id=doc["id"],
            reason=payload.reason,
            after_state=doc,
        )
        return doc

    # ------------------------------------------------------------------------
    # POINT 23: CONSUMER CORE FREE GUARANTEE & OPTIONAL PREMIUM CONFIG
    # ------------------------------------------------------------------------

    @router.get("/admin/consumer-premium-config")
    async def get_consumer_premium_config(admin: dict = Depends(require_admin)):
        doc = await db.admin_settings.find_one({"_id": "consumer_premium_config"})
        if not doc:
            return {
                "core_consumer_search_always_free": True,
                "consumer_premium_enabled": False,
                "monthly_price_inr": 49,
                "features": ["Unlimited Price Drop Alerts", "Multi-Household Shared Shopping Lists"],
            }
        doc.pop("_id", None)
        return doc

    @router.patch("/admin/consumer-premium-config")
    async def update_consumer_premium_config(
        payload: Dict[str, Any],
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "monetization", mutate=True)
        payload["core_consumer_search_always_free"] = True  # Core consumer experience must remain free
        payload["updated_at"] = now_iso()
        await db.admin_settings.update_one(
            {"_id": "consumer_premium_config"},
            {"$set": payload},
            upsert=True,
        )
        return payload

    # ------------------------------------------------------------------------
    # POINT 24: REFERRAL & VIRAL LOOP ENGINE
    # ------------------------------------------------------------------------

    @router.get("/referrals/my")
    async def get_my_referral_summary(user: dict = Depends(get_current_user)):
        uid = user["id"]
        code = user.get("referral_code")
        if not code:
            prefix = "HLM" if user.get("role") == "vendor" else "HLC"
            code = f"{prefix}-{uid[-6:].upper()}"
            await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"referral_code": code}})

        refs = await db.referrals.find({"referrer_user_id": uid}).sort("created_at", -1).to_list(100)
        for r in refs:
            r.pop("_id", None)

        return {
            "user_id": uid,
            "role": user.get("role"),
            "referral_code": code,
            "total_referrals": len(refs),
            "qualified_referrals": sum(1 for r in refs if r.get("status") in ("QUALIFIED", "REWARDED")),
            "referrals": refs,
        }

    @router.post("/referrals/apply")
    async def apply_referral_code(
        payload: ReferralApplyIn,
        user: dict = Depends(get_current_user),
    ):
        code = payload.referral_code.strip().upper()
        referrer = await db.users.find_one({"referral_code": code})
        if not referrer:
            raise HTTPException(status_code=404, detail="Invalid referral code")

        ref_uid = str(referrer["_id"])
        if ref_uid == user["id"]:
            raise HTTPException(status_code=400, detail="Self-referral is not permitted")

        if await db.referrals.find_one({"referee_user_id": user["id"]}):
            raise HTTPException(status_code=409, detail="A referral code has already been applied to your account")

        # Anti-abuse check: same phone number
        if referrer.get("phone") and user.get("phone") and referrer.get("phone") == user.get("phone"):
            raise HTTPException(status_code=400, detail="Duplicate phone number detected across referrer and referee")

        now_s = now_iso()
        doc = {
            "id": f"ref_{uuid.uuid4().hex[:12]}",
            "referral_code": code,
            "referrer_user_id": ref_uid,
            "referrer_role": referrer.get("role"),
            "referee_user_id": user["id"],
            "referee_role": user.get("role"),
            "status": "QUALIFIED",
            "reward_points": 50,
            "created_at": now_s,
        }
        await db.referrals.insert_one(doc)
        await db.users.update_one({"_id": ObjectId(ref_uid)}, {"$inc": {"hyperlocal_points": 50}})
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"hyperlocal_points": 25}})
        doc.pop("_id", None)
        return {"ok": True, "referral": doc}

    @router.get("/admin/referrals")
    async def admin_list_referrals(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "growth", mutate=False)
        docs = await db.referrals.find({}).sort("created_at", -1).to_list(200)
        for d in docs:
            d.pop("_id", None)
        return docs

    # ------------------------------------------------------------------------
    # POINTS 25 & 26: LOCALITY-FIRST EXPANSION & MARKETPLACE DENSITY ENGINE
    # ------------------------------------------------------------------------

    @router.get("/localities")
    async def list_localities_public():
        docs = await db.localities.find({}).to_list(50)
        for d in docs:
            d.pop("_id", None)
        return docs

    @router.get("/admin/localities/density")
    async def admin_localities_density_and_readiness(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "growth", mutate=False)
        locs = await db.localities.find({}).to_list(50)
        vendors = await db.users.find({"role": "vendor"}).to_list(500)
        prods = await db.products.find({"in_stock": True}).to_list(2000)
        reqs = await db.requests.find({}).to_list(500)
        orders = await db.marketplace_orders.find({}).to_list(500)

        results = []
        for loc in locs:
            loc.pop("_id", None)
            l_lat = float(loc.get("lat") or 30.3244)
            l_lng = float(loc.get("lng") or 78.0418)
            rad = float(loc.get("radius_km") or 2.5)

            nearby_vendors = []
            for v in vendors:
                d = haversine_km(l_lat, l_lng, v.get("lat"), v.get("lng"))
                if d is not None and d <= rad:
                    nearby_vendors.append(v)

            v_ids = {str(v["_id"]) for v in nearby_vendors}
            active_merchants = sum(1 for v in nearby_vendors if v.get("vendor_type") != "cart_vendor")
            active_carts = sum(1 for v in nearby_vendors if v.get("vendor_type") == "cart_vendor")
            loc_prods = [p for p in prods if str(p.get("vendor_id")) in v_ids]
            fresh_prods = sum(1 for p in loc_prods if compute_inventory_trust_sync(p)["inventory_freshness_state"] in ("CONFIRMED_RECENTLY", "PROBABLY_AVAILABLE"))
            loc_orders = sum(1 for o in orders if str(o.get("vendor_id")) in v_ids)

            # Locality Readiness Score (0-100) from real density signals
            merchant_pts = min(35, len(nearby_vendors) * 7)
            catalog_pts = min(35, fresh_prods * 2)
            activity_pts = min(30, (loc_orders * 5) + min(15, len(reqs) * 2))
            readiness_score = int(min(100, merchant_pts + catalog_pts + activity_pts))

            results.append({
                **loc,
                "metrics": {
                    "active_merchants": active_merchants,
                    "active_mobile_vendors": active_carts,
                    "products_with_fresh_inventory": fresh_prods,
                    "total_in_stock_products": len(loc_prods),
                    "orders_count": loc_orders,
                    "supply_demand_ratio": round(len(loc_prods) / max(1, len(reqs)), 2),
                    "locality_readiness_score": readiness_score,
                },
            })

        return {"localities": results}

    @router.post("/admin/localities")
    async def admin_upsert_locality(
        payload: LocalityUpsertIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "growth", mutate=True)
        lid = payload.locality_id or f"loc_{uuid.uuid4().hex[:8]}"
        doc = payload.model_dump()
        doc["locality_id"] = lid
        doc["updated_at"] = now_iso()
        await db.localities.update_one({"locality_id": lid}, {"$set": doc}, upsert=True)
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="upsert_locality",
            entity_type="locality",
            entity_id=lid,
            reason=f"Configured locality {payload.name} ({payload.status})",
            after_state=doc,
        )
        return doc

    # ------------------------------------------------------------------------
    # POINT 27: MERCHANT ACQUISITION CRM
    # ------------------------------------------------------------------------

    @router.get("/admin/merchant-crm")
    async def admin_list_merchant_crm(
        stage: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "growth", mutate=False)
        q = {"stage": stage} if stage and stage != "ALL" else {}
        docs = await db.merchant_crm_leads.find(q).sort("updated_at", -1).to_list(200)
        for d in docs:
            d.pop("_id", None)
        return {
            "stages": ["LEAD", "CONTACTED", "DEMO_DONE", "ONBOARDED", "CATALOG_UPLOADED", "ACTIVE", "TRIAL", "PAID", "CHURNED", "LOST"],
            "leads": docs,
        }

    @router.post("/admin/merchant-crm")
    async def admin_create_merchant_crm_lead(
        payload: MerchantCRMLeadIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "growth", mutate=True)
        now_s = now_iso()
        doc = {
            "id": f"mcrm_{uuid.uuid4().hex[:10]}",
            **payload.model_dump(),
            "created_by": admin.get("email"),
            "created_at": now_s,
            "updated_at": now_s,
        }
        await db.merchant_crm_leads.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/admin/merchant-crm/{lead_id}")
    async def admin_update_merchant_crm_lead(
        lead_id: str,
        payload: Dict[str, Any],
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "growth", mutate=True)
        existing = await db.merchant_crm_leads.find_one({"id": lead_id})
        if not existing:
            raise HTTPException(status_code=404, detail="CRM lead not found")
        payload.pop("_id", None)
        payload["updated_at"] = now_iso()
        await db.merchant_crm_leads.update_one({"id": lead_id}, {"$set": payload})
        updated = await db.merchant_crm_leads.find_one({"id": lead_id})
        updated.pop("_id", None)
        return updated

    # ------------------------------------------------------------------------
    # POINT 28: PHYSICAL QR SYSTEM (STORE PROFILE, LIVE PRODUCTS, CHECK-IN, VERIFIED)
    # ------------------------------------------------------------------------

    @router.get("/vendor/qr-codes")
    async def list_vendor_qr_codes(vendor: dict = Depends(require_vendor)):
        vid = vendor["id"]
        docs = await db.vendor_qr_codes.find({"vendor_id": vid}).sort("created_at", -1).to_list(30)
        if not docs:
            # Seed default non-secret QR poster record
            default_qr = {
                "id": f"qr_{uuid.uuid4().hex[:10]}",
                "vendor_id": vid,
                "qr_type": "CHECK_IN",
                "label": "Main Counter Check-In & Live Catalog QR",
                "public_path": f"/v/{vid}/checkin",
                "status": "ACTIVE",
                "scans_count": 0,
                "poster_badges": ["Verified Seller on HyperLocal", "Scan to View Live Prices & Check In"],
                "created_at": now_iso(),
            }
            await db.vendor_qr_codes.insert_one(default_qr)
            default_qr.pop("_id", None)
            docs = [default_qr]
        else:
            for d in docs:
                d.pop("_id", None)
        return docs

    @router.post("/vendor/qr-codes/generate")
    async def generate_vendor_qr_code(
        payload: QRGenerateIn,
        vendor: dict = Depends(require_vendor),
    ):
        vid = vendor["id"]
        qid = f"qr_{uuid.uuid4().hex[:10]}"
        path_map = {
            "CHECK_IN": f"/v/{vid}/checkin?qr={qid}",
            "STORE_PROFILE": f"/vendors/{vid}?qr={qid}",
            "LIVE_PRODUCTS": f"/vendors/{vid}?tab=products&qr={qid}",
            "VERIFIED_BADGE": f"/v/{vid}/checkin?badge=verified&qr={qid}",
        }
        doc = {
            "id": qid,
            "vendor_id": vid,
            "qr_type": payload.qr_type,
            "label": payload.label or f"{payload.qr_type} Poster",
            "public_path": path_map.get(payload.qr_type, f"/v/{vid}/checkin"),
            "status": "ACTIVE",
            "scans_count": 0,
            "poster_badges": ["Verified Seller on HyperLocal", "View Live Products", "Scan & Earn Visit Points"],
            "created_at": now_iso(),
        }
        await db.vendor_qr_codes.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/vendor/qr-codes/{qr_id}/revoke")
    async def revoke_vendor_qr_code(
        qr_id: str,
        vendor: dict = Depends(require_vendor),
    ):
        res = await db.vendor_qr_codes.update_one(
            {"id": qr_id, "vendor_id": vendor["id"]},
            {"$set": {"status": "REVOKED", "revoked_at": now_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="QR code not found")
        return {"ok": True, "id": qr_id, "status": "REVOKED"}

    # ------------------------------------------------------------------------
    # POINT 29: MERCHANT RELIABILITY SCORE ENDPOINTS
    # ------------------------------------------------------------------------

    @router.get("/vendors/{vendor_id}/reliability")
    async def get_public_vendor_reliability(vendor_id: str):
        try:
            v = await db.users.find_one({"_id": ObjectId(vendor_id), "role": "vendor"})
        except Exception:
            v = None
        if not v:
            raise HTTPException(status_code=404, detail="Vendor not found")
        return await compute_merchant_reliability(db, v)

    @router.post("/admin/reliability/{vendor_id}/override")
    async def admin_override_vendor_reliability(
        vendor_id: str,
        payload: ReliabilityOverrideIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "risk", mutate=True)
        try:
            oid = ObjectId(vendor_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid vendor ID")
        v = await db.users.find_one({"_id": oid, "role": "vendor"})
        if not v:
            raise HTTPException(status_code=404, detail="Vendor not found")

        override_doc = {
            "score": payload.score,
            "label": payload.label or ("Highly Reliable" if payload.score >= 80 else "Reliable"),
            "reason": payload.reason,
            "overridden_by": admin.get("email"),
            "overridden_at": now_iso(),
        }
        await db.users.update_one({"_id": oid}, {"$set": {"reliability_override": override_doc}})
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="override_merchant_reliability",
            entity_type="vendor",
            entity_id=vendor_id,
            reason=payload.reason,
            after_state=override_doc,
            target_name=v.get("shop_name") or v.get("name"),
        )
        return {"ok": True, "vendor_id": vendor_id, "reliability_override": override_doc}

    # ------------------------------------------------------------------------
    # POINT 30: MULTI-SIGNAL FRAUD & ABUSE INTELLIGENCE QUEUE
    # ------------------------------------------------------------------------

    @router.get("/admin/fraud/queue")
    async def admin_get_fraud_queue(
        status: Optional[str] = None,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "risk", mutate=False)
        q = {"status": status} if status and status != "ALL" else {}
        flags = await db.fraud_flags.find(q).sort("created_at", -1).to_list(100)
        for f in flags:
            f.pop("_id", None)
        anomalies = await db.attribution_anomalies.find({}).sort("created_at", -1).to_list(50)
        for a in anomalies:
            a["id"] = str(a.pop("_id"))
        return {
            "severity_levels": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            "human_review_required_for_enforcement": True,
            "fraud_flags": flags,
            "sales_anomalies": anomalies,
        }

    @router.post("/admin/fraud/scan")
    async def admin_run_fraud_anomaly_scan(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "risk", mutate=True)
        now_s = now_iso()
        new_flags = 0

        # Check 1: Self-dealing in purchase_attributions (customer_id == seller_id)
        self_purchases = await db.purchase_attributions.find({}).to_list(500)
        for sp in self_purchases:
            if sp.get("customer_id") and sp.get("customer_id") == sp.get("seller_id"):
                fid = f"frd_self_{sp.get('id', uuid.uuid4().hex[:8])}"
                if not await db.fraud_flags.find_one({"id": fid}):
                    await db.fraud_flags.insert_one({
                        "id": fid,
                        "signal_type": "SELF_CONFIRMATION_ATTEMPT",
                        "severity": "HIGH",
                        "entity_type": "vendor",
                        "entity_id": sp.get("seller_id"),
                        "description": "Merchant account attempted to confirm a purchase as its own customer.",
                        "status": "PENDING_HUMAN_REVIEW",
                        "created_at": now_s,
                    })
                    new_flags += 1

        # Check 2: Abnormal daily sales spikes in `attribution_anomalies`
        anoms = await db.attribution_anomalies.find({"status": "pending_review"}).to_list(100)
        for an in anoms:
            fid = f"frd_anom_{str(an['_id'])}"
            if not await db.fraud_flags.find_one({"id": fid}):
                await db.fraud_flags.insert_one({
                    "id": fid,
                    "signal_type": "ABNORMAL_SALES_SPIKE",
                    "severity": "MEDIUM",
                    "entity_type": "vendor",
                    "entity_id": an.get("seller_id"),
                    "description": an.get("reason") or f"Sales spike of ₹{an.get('amount')} on {an.get('date')}",
                    "status": "PENDING_HUMAN_REVIEW",
                    "created_at": now_s,
                })
                new_flags += 1

        return {"ok": True, "new_flags_detected": new_flags, "scanned_at": now_s}

    @router.post("/admin/fraud/{flag_id}/resolve")
    async def admin_resolve_fraud_flag(
        flag_id: str,
        payload: FraudResolveIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "risk", mutate=True)
        flag = await db.fraud_flags.find_one({"id": flag_id})
        if not flag:
            raise HTTPException(status_code=404, detail="Fraud flag not found")

        updates = {
            "status": payload.resolution,
            "resolution_notes": payload.notes,
            "resolved_by": admin.get("email"),
            "resolved_at": now_iso(),
        }
        await db.fraud_flags.update_one({"id": flag_id}, {"$set": updates})
        await record_immutable_audit_log(
            db,
            admin=admin,
            action=f"fraud_resolve_{payload.resolution.lower()}",
            entity_type="fraud_flag",
            entity_id=flag_id,
            reason=payload.notes,
            after_state=updates,
        )
        return {"ok": True, "id": flag_id, **updates}

    # ------------------------------------------------------------------------
    # POINT 33: DOMAIN EVENT STREAM API
    # ------------------------------------------------------------------------

    @router.post("/events/emit")
    async def api_emit_domain_event(
        payload: Dict[str, Any],
        user: Optional[dict] = Depends(get_optional_user),
    ):
        ev_type = str(payload.get("event_type") or "PRODUCT_VIEWED").upper()
        if ev_type not in CANONICAL_DOMAIN_EVENTS:
            raise HTTPException(status_code=400, detail=f"Unsupported canonical event_type '{ev_type}'")
        doc = await emit_domain_event(
            db,
            event_type=ev_type,
            actor_id=user["id"] if user else payload.get("actor_id"),
            actor_role=user.get("role") if user else payload.get("actor_role"),
            seller_id=payload.get("seller_id"),
            product_id=payload.get("product_id"),
            order_id=payload.get("order_id"),
            request_id=payload.get("request_id"),
            campaign_id=payload.get("campaign_id"),
            locality=payload.get("locality", "Dehradun"),
            payload=payload.get("payload") or {},
            idempotency_key=payload.get("idempotency_key"),
        )
        return doc

    @router.get("/admin/events")
    async def admin_list_domain_events(
        event_type: Optional[str] = None,
        limit: int = Query(50, ge=1, le=200),
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "platform_control", mutate=False)
        q = {"event_type": event_type} if event_type else {}
        docs = await db.domain_events.find(q).sort("created_at", -1).limit(limit).to_list(limit)
        for d in docs:
            d.pop("_id", None)
        counts_by_type: Dict[str, int] = {}
        for et in CANONICAL_DOMAIN_EVENTS:
            counts_by_type[et] = await db.domain_events.count_documents({"event_type": et})
        return {
            "canonical_event_types": CANONICAL_DOMAIN_EVENTS,
            "counts_by_type": counts_by_type,
            "recent_events": docs,
        }

    # ------------------------------------------------------------------------
    # POINT 34: A/B EXPERIMENTATION FRAMEWORK
    # ------------------------------------------------------------------------

    @router.get("/experiments/assign/{experiment_key}")
    async def assign_experiment_variant(
        experiment_key: str,
        subject_id: Optional[str] = Query(None),
        user: Optional[dict] = Depends(get_optional_user),
    ):
        exp = await db.experiments.find_one({"experiment_key": experiment_key})
        if not exp or exp.get("status") != "RUNNING":
            return {"experiment_key": experiment_key, "variant": "CONTROL", "status": "INACTIVE"}

        subj = (user["id"] if user else None) or subject_id or "anonymous_default"
        variants = exp.get("variants") or ["CONTROL", "VARIANT_A"]
        h_val = int(hashlib.sha256(f"{experiment_key}:{subj}".encode("utf-8")).hexdigest()[:8], 16)
        chosen = variants[h_val % len(variants)]

        await db.experiment_assignments.update_one(
            {"experiment_key": experiment_key, "subject_id": subj},
            {
                "$setOnInsert": {
                    "experiment_key": experiment_key,
                    "subject_id": subj,
                    "variant": chosen,
                    "assigned_at": now_iso(),
                }
            },
            upsert=True,
        )
        return {"experiment_key": experiment_key, "subject_id": subj, "variant": chosen, "status": "RUNNING"}

    @router.get("/admin/experiments")
    async def admin_list_experiments(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "platform_control", mutate=False)
        exps = await db.experiments.find({}).to_list(50)
        for e in exps:
            e.pop("_id", None)
            cnt = await db.experiment_assignments.count_documents({"experiment_key": e["experiment_key"]})
            e["sample_size_assigned"] = cnt
            e["evidence_status"] = "SUFFICIENT_SAMPLE" if cnt >= int(e.get("min_sample_size") or 30) else "Not Enough Evidence"
        return exps

    @router.post("/admin/experiments")
    async def admin_upsert_experiment(
        payload: ExperimentUpsertIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "platform_control", mutate=True)
        doc = payload.model_dump()
        doc["updated_at"] = now_iso()
        await db.experiments.update_one(
            {"experiment_key": payload.experiment_key},
            {"$set": doc},
            upsert=True,
        )
        return doc

    # ------------------------------------------------------------------------
    # POINTS 35, 37, 38: CEO EXECUTIVE DASHBOARD, KPI TARGETS & ROADMAP
    # ------------------------------------------------------------------------

    @router.get("/admin/executive/dashboard")
    async def admin_ceo_executive_dashboard(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "overview", mutate=False)
        consumers_count = await db.users.count_documents({"role": "consumer"})
        vendors = await db.users.find({"role": "vendor"}).to_list(1000)
        prods = await db.products.find({}).to_list(2000)
        orders = await db.marketplace_orders.find({}).to_list(1000)
        sub_orders = await db.orders.find({"status": "paid"}).to_list(1000)
        purchases = await db.purchase_attributions.find({}).to_list(1000)
        verified_visits = await db.verified_visits.count_documents({})
        reqs = await db.requests.find({}).to_list(500)
        grievances_open = await db.grievances.count_documents({"status": {"$in": ["open", "in_review", "escalated"]}})
        fraud_open = await db.fraud_flags.count_documents({"status": "PENDING_HUMAN_REVIEW"})

        active_merchants = sum(1 for v in vendors if v.get("vendor_type") != "cart_vendor")
        active_mobile = sum(1 for v in vendors if v.get("vendor_type") == "cart_vendor")
        paid_merchants = sum(1 for v in vendors if v.get("is_pro"))
        trial_merchants = sum(1 for v in vendors if not v.get("is_pro"))

        fresh_prods = sum(
            1 for p in prods if compute_inventory_trust_sync(p)["inventory_freshness_state"] == "CONFIRMED_RECENTLY"
        )
        fresh_pct = round((fresh_prods / len(prods)) * 100.0, 1) if prods else 0.0

        gmv_orders = sum(float(o.get("total_amount") or 0.0) for o in orders if o.get("status") not in ("REJECTED", "CANCELLED"))
        attr_rev = sum(float(p.get("amount") or 0.0) for p in purchases)
        sub_rev = sum(float(so.get("amount") or 0.0) / 100.0 for so in sub_orders)
        ad_camps = await db.ad_campaigns.find({}).to_list(200)
        ad_rev = sum(float(c.get("spend") or 0.0) for c in ad_camps)

        responded_reqs = sum(1 for r in reqs if (r.get("reply_count") or 0) > 0)
        lead_resp_rate = round((responded_reqs / len(reqs)) * 100.0, 1) if reqs else 0.0

        return {
            "north_star_question": "How much measurable incremental commercial value does HyperLocal generate for merchants?",
            "generated_at": now_iso(),
            "sections": {
                "growth": {
                    "active_consumers": consumers_count,
                    "active_retail_merchants": active_merchants,
                    "active_mobile_vendors": active_mobile,
                    "paid_merchants": paid_merchants,
                    "trial_or_free_merchants": trial_merchants,
                },
                "commerce": {
                    "total_products": len(prods),
                    "fresh_inventory_pct": fresh_pct,
                    "in_app_orders_count": len(orders),
                    "verified_store_visits": verified_visits,
                    "gmv_in_app_inr": round(gmv_orders, 2),
                    "attributed_offline_revenue_inr": round(attr_rev, 2),
                    "total_measurable_merchant_value_inr": round(gmv_orders + attr_rev, 2),
                    "buyer_lead_response_rate_pct": lead_resp_rate,
                },
                "revenue": {
                    "subscription_revenue_inr": round(sub_rev, 2),
                    "advertising_revenue_inr": round(ad_rev, 2),
                    "total_platform_revenue_inr": round(sub_rev + ad_rev, 2),
                    "estimated_mrr_inr": round(paid_merchants * 199.0, 2),
                    "estimated_arr_inr": round(paid_merchants * 199.0 * 12.0, 2),
                },
                "operations_and_risk": {
                    "open_grievances": grievances_open,
                    "pending_fraud_flags": fraud_open,
                },
            },
        }

    @router.get("/admin/kpi-targets")
    async def admin_list_kpi_targets(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "overview", mutate=False)
        targets = await db.kpi_targets.find({}).to_list(50)
        prods_cnt = await db.products.count_documents({})
        vendors_cnt = await db.users.count_documents({"role": "vendor"})
        paid_cnt = await db.users.count_documents({"role": "vendor", "is_pro": True})

        actuals_map = {
            "active_merchants": vendors_cnt,
            "total_products": prods_cnt,
            "paid_merchants": paid_cnt,
        }
        for t in targets:
            t.pop("_id", None)
            act = actuals_map.get(t.get("kpi_key"), 0)
            t["actual_value"] = act
            tgt = float(t.get("target_value") or 1.0)
            ratio = act / max(1.0, tgt)
            t["health_status"] = "ON_TRACK" if ratio >= 0.8 else ("AT_RISK" if ratio >= 0.4 else "OFF_TRACK")
        return targets

    @router.post("/admin/kpi-targets")
    async def admin_upsert_kpi_target(
        payload: KPITargetUpsertIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "overview", mutate=True)
        doc = payload.model_dump()
        doc["updated_at"] = now_iso()
        await db.kpi_targets.update_one({"kpi_key": payload.kpi_key, "scope": payload.scope}, {"$set": doc}, upsert=True)
        return doc

    @router.get("/admin/roadmap")
    async def admin_get_execution_roadmap(admin: dict = Depends(require_admin)):
        check_admin_domain(admin, "overview", mutate=False)
        docs = await db.execution_roadmap.find({}).to_list(50)
        for d in docs:
            d.pop("_id", None)
        return docs

    @router.patch("/admin/roadmap/{milestone_id}")
    async def admin_update_roadmap_milestone(
        milestone_id: str,
        payload: RoadmapMilestonePatchIn,
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "overview", mutate=True)
        updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
        updates["updated_at"] = now_iso()
        res = await db.execution_roadmap.update_one({"milestone_id": milestone_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Roadmap milestone not found")
        updated = await db.execution_roadmap.find_one({"milestone_id": milestone_id})
        updated.pop("_id", None)
        return updated

    # ------------------------------------------------------------------------
    # GRANULAR ADMIN RBAC MANAGEMENT ENDPOINTS
    # ------------------------------------------------------------------------

    @router.get("/admin/rbac/roles")
    async def admin_list_rbac_roles(admin: dict = Depends(require_admin)):
        return {
            "current_admin_role": admin.get("admin_role") or "SUPER_ADMIN",
            "roles": ADMIN_ROLES_PERMISSIONS,
        }

    @router.patch("/admin/users/{user_id}/admin-role")
    async def admin_assign_granular_role(
        user_id: str,
        admin_role: str = Query(...),
        reason: str = Query("Assigned granular admin role"),
        admin: dict = Depends(require_admin),
    ):
        check_admin_domain(admin, "platform_control", mutate=True)
        if admin_role not in ADMIN_ROLES_PERMISSIONS:
            raise HTTPException(status_code=400, detail=f"Invalid admin_role. Choose from {list(ADMIN_ROLES_PERMISSIONS.keys())}")
        try:
            oid = ObjectId(user_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid user_id")

        target = await db.users.find_one({"_id": oid})
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

        before_role = target.get("admin_role")
        await db.users.update_one({"_id": oid}, {"$set": {"admin_role": admin_role}})
        await record_immutable_audit_log(
            db,
            admin=admin,
            action="assign_granular_admin_role",
            entity_type="user",
            entity_id=user_id,
            reason=reason,
            before_state={"admin_role": before_role},
            after_state={"admin_role": admin_role},
            target_name=target.get("email"),
        )
        return {"ok": True, "user_id": user_id, "admin_role": admin_role}

    return router


# ============================================================================
# DATABASE INDEXES & IDEMPOTENT SEEDING FOR ALL NEW COLLECTIONS
# ============================================================================

async def ensure_commerce_os_indexes_and_seeds(db):
    """Creates production indexes and seeds initial configuration records non-destructively."""
    try:
        # Indexes
        await db.platform_features.create_index("feature_key", unique=True)
        await db.platform_features.create_index("category")
        await db.subscription_plans.create_index("plan_code", unique=True)
        await db.domain_events.create_index("idempotency_key", unique=True)
        await db.domain_events.create_index([("event_type", 1), ("created_at", -1)])
        await db.domain_events.create_index([("seller_id", 1), ("created_at", -1)])
        await db.shopping_lists.create_index([("user_id", 1), ("updated_at", -1)])
        await db.shopping_lists.create_index("id", unique=True)
        await db.barcode_catalog.create_index("barcode", unique=True)
        await db.ad_campaigns.create_index("id", unique=True)
        await db.ad_campaigns.create_index([("vendor_id", 1), ("status", 1)])
        await db.revenue_ledger.create_index("id", unique=True)
        await db.referrals.create_index("id", unique=True)
        await db.referrals.create_index("referrer_user_id")
        await db.localities.create_index("locality_id", unique=True)
        await db.merchant_crm_leads.create_index("id", unique=True)
        await db.vendor_qr_codes.create_index("id", unique=True)
        await db.fraud_flags.create_index("id", unique=True)
        await db.experiments.create_index("experiment_key", unique=True)
        await db.experiment_assignments.create_index([("experiment_key", 1), ("subject_id", 1)], unique=True)
        await db.kpi_targets.create_index([("kpi_key", 1), ("scope", 1)], unique=True)
        await db.execution_roadmap.create_index("milestone_id", unique=True)

        # Seed Platform Features
        for feat in DEFAULT_PLATFORM_FEATURES:
            await db.platform_features.update_one(
                {"feature_key": feat["feature_key"]},
                {"$setOnInsert": {**feat, "usage_count": 0, "created_at": now_iso()}},
                upsert=True,
            )

        # Seed Subscription Plans
        for plan in DEFAULT_SUBSCRIPTION_PLANS:
            await db.subscription_plans.update_one(
                {"plan_code": plan["plan_code"]},
                {"$setOnInsert": {**plan, "created_at": now_iso(), "updated_at": now_iso()}},
                upsert=True,
            )

        # Seed AI Maturity Registry
        for cap in DEFAULT_AI_MATURITY_REGISTRY:
            await db.ai_maturity_registry.update_one(
                {"capability_key": cap["capability_key"]},
                {"$setOnInsert": {**cap, "updated_at": now_iso()}},
                upsert=True,
            )

        # Seed Dehradun Localities
        for loc in DEFAULT_DEHRADUN_LOCALITIES:
            await db.localities.update_one(
                {"locality_id": loc["locality_id"]},
                {"$setOnInsert": {**loc, "created_at": now_iso()}},
                upsert=True,
            )

        # Seed Execution Roadmap
        for ms in DEFAULT_EXECUTION_ROADMAP:
            await db.execution_roadmap.update_one(
                {"milestone_id": ms["milestone_id"]},
                {"$setOnInsert": {**ms, "updated_at": now_iso()}},
                upsert=True,
            )

        # Seed Default KPI Targets
        default_kpis = [
            {"kpi_key": "active_merchants", "name": "Active Verified Merchants", "scope": "GLOBAL", "scope_value": "ALL", "target_value": 15, "unit": "merchants", "period": "MONTHLY", "owner": "Sales & Acquisition"},
            {"kpi_key": "total_products", "name": "Active Local Product Listings", "scope": "GLOBAL", "scope_value": "ALL", "target_value": 50, "unit": "products", "period": "MONTHLY", "owner": "Catalog Ops"},
            {"kpi_key": "paid_merchants", "name": "Paid Pro / Growth Merchants", "scope": "GLOBAL", "scope_value": "ALL", "target_value": 5, "unit": "merchants", "period": "MONTHLY", "owner": "Monetization"},
        ]
        for kt in default_kpis:
            await db.kpi_targets.update_one(
                {"kpi_key": kt["kpi_key"], "scope": kt["scope"]},
                {"$setOnInsert": {**kt, "updated_at": now_iso()}},
                upsert=True,
            )

        # Seed Default Experiment
        await db.experiments.update_one(
            {"experiment_key": "exp_freshness_badge_ranking_v1"},
            {
                "$setOnInsert": {
                    "experiment_key": "exp_freshness_badge_ranking_v1",
                    "name": "Inventory Confidence Badge & Freshness Ranking Boost",
                    "hypothesis": "Highlighting 🟢 Confirmed Recently badges increases shopper add-to-cart and direction clicks by >15%.",
                    "variants": ["CONTROL", "FRESHNESS_BOOST"],
                    "traffic_allocation_pct": 100,
                    "min_sample_size": 30,
                    "status": "RUNNING",
                    "updated_at": now_iso(),
                }
            },
            upsert=True,
        )
    except Exception:
        pass
