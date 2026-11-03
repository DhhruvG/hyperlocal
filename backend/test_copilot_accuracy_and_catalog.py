"""Verification suite for HyperLocal AI Copilot accuracy, distance calculation, and full shop/cart/product grounding."""

import re
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ai_assistant_engine as a


def run_sync(coro):
    """Drives a coroutine synchronously without creating a socketpair on Windows."""
    try:
        while True:
            coro.send(None)
    except StopIteration as e:
        return e.value


class InMemoryCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, key_or_list, direction=1):
        if isinstance(key_or_list, str):
            rev = direction < 0
            self.docs.sort(key=lambda d: (d.get(key_or_list) is None, d.get(key_or_list, 0)), reverse=rev)
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    async def to_list(self, n):
        return self.docs[:n]


class InMemoryCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def _matches(self, doc, q):
        if not q:
            return True
        for k, v in q.items():
            if k == "$or":
                if not any(self._matches(doc, sub) for sub in v):
                    return False
            elif isinstance(v, dict):
                val = doc.get(k)
                if "$regex" in v:
                    pattern = v["$regex"]
                    flags = re.I if "i" in v.get("$options", "") else 0
                    if isinstance(val, list):
                        if not any(re.search(pattern, str(item), flags) for item in val):
                            return False
                    elif not re.search(pattern, str(val or ""), flags):
                        return False
                if "$in" in v and val not in v["$in"]:
                    return False
                if "$nin" in v and val in v["$nin"]:
                    return False
                if "$ne" in v and val == v["$ne"]:
                    return False
                if "$lte" in v and (val is None or float(val) > float(v["$lte"])):
                    return False
            else:
                if doc.get(k) != v:
                    return False
        return True

    def find(self, q=None):
        return InMemoryCursor([d for d in self.docs if self._matches(d, q)])

    async def find_one(self, q=None, sort=None):
        matched = [d for d in self.docs if self._matches(d, q)]
        return matched[0] if matched else None

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def count_documents(self, q=None):
        return len([d for d in self.docs if self._matches(d, q)])


class SeededDehradunDB:
    def __init__(self):
        self.users = InMemoryCollection([
            {
                "id": "v1", "role": "vendor", "name": "Ramesh Bisht", "shop_name": "Bisht General Store",
                "vendor_type": "retailer", "shop_address": "Rajpur Road, Dehradun",
                "lat": 30.3398, "lng": 78.0644, "is_verified": True, "is_online": True, "avg_rating": 4.7,
                "opening_hours": "8:00 AM - 9:30 PM",
            },
            {
                "id": "v2", "role": "vendor", "name": "Suresh Rawat", "shop_name": "Rawat Organic Sabzi",
                "vendor_type": "retailer", "shop_address": "Paltan Bazaar, Dehradun",
                "lat": 30.3240, "lng": 78.0410, "is_verified": True, "is_online": True, "avg_rating": 4.8,
                "opening_hours": "7:00 AM - 8:30 PM",
            },
            {
                "id": "v3", "role": "vendor", "name": "Raju", "shop_name": "Raju Vegetable Cart",
                "vendor_type": "cart_vendor", "shop_address": "Near Clock Tower, Dehradun",
                "lat": 30.3248, "lng": 78.0418, "is_verified": True, "is_online": True, "avg_rating": 4.6,
                "opening_hours": "6:30 AM - 7:00 PM",
            },
            {
                "id": "v4", "role": "vendor", "name": "Mohan Lal", "shop_name": "Mohan Fruit Cart",
                "vendor_type": "cart_vendor", "shop_address": "Gandhi Park Gate, Dehradun",
                "lat": 30.3268, "lng": 78.0442, "is_verified": True, "is_online": True, "avg_rating": 4.5,
                "opening_hours": "8:00 AM - 8:00 PM",
            },
            {
                "id": "v5", "role": "vendor", "name": "Deepak Sharma", "shop_name": "Doon Dairy & Sweets",
                "vendor_type": "retailer", "shop_address": "Ballupur Chowk, Dehradun",
                "lat": 30.3330, "lng": 78.0120, "is_verified": True, "is_online": True, "avg_rating": 4.9,
                "opening_hours": "6:00 AM - 10:00 PM",
            },
        ])
        self.products = InMemoryCollection([
            {"id": "p1", "name": "Tomato", "name_lower": "tomato", "name_hi": "टमाटर", "name_hinglish": "tamatar", "price": 25.0, "unit": "kg", "vendor_id": "v3", "vendor_shop": "Raju Vegetable Cart", "in_stock": True, "category": "Vegetables"},
            {"id": "p2", "name": "Fresh Tomato", "name_lower": "fresh tomato", "name_hi": "ताज़ा टमाटर", "name_hinglish": "tamatar", "price": 30.0, "unit": "kg", "vendor_id": "v2", "vendor_shop": "Rawat Organic Sabzi", "in_stock": True, "category": "Vegetables"},
            {"id": "p3", "name": "Organic Tomato", "name_lower": "organic tomato", "name_hi": "टमाटर", "name_hinglish": "tamatar", "price": 35.0, "unit": "kg", "vendor_id": "v1", "vendor_shop": "Bisht General Store", "in_stock": True, "category": "Vegetables"},
            {"id": "p4", "name": "Potato (Pahadi Aloo)", "name_lower": "potato (pahadi aloo)", "name_hi": "आलू", "name_hinglish": "aloo", "price": 28.0, "unit": "kg", "vendor_id": "v3", "vendor_shop": "Raju Vegetable Cart", "in_stock": True, "category": "Vegetables"},
            {"id": "p5", "name": "Basmati Rice", "name_lower": "basmati rice", "name_hi": "बासमती चावल", "name_hinglish": "chawal", "price": 85.0, "unit": "kg", "vendor_id": "v1", "vendor_shop": "Bisht General Store", "in_stock": True, "category": "Grains"},
            {"id": "p6", "name": "Fresh Banana", "name_lower": "fresh banana", "name_hi": "केला", "name_hinglish": "kela", "price": 50.0, "unit": "dozen", "vendor_id": "v4", "vendor_shop": "Mohan Fruit Cart", "in_stock": True, "category": "Fruits"},
            {"id": "p7", "name": "Fresh Milk", "name_lower": "fresh milk", "name_hi": "दूध", "name_hinglish": "doodh", "price": 62.0, "unit": "liter", "vendor_id": "v5", "vendor_shop": "Doon Dairy & Sweets", "in_stock": True, "category": "Dairy"},
        ])
        self.carts = InMemoryCollection([
            {
                "user_id": "u_vikash",
                "items": [
                    {"product_id": "p1", "quantity": 2},
                    {"product_id": "p5", "quantity": 1},
                ],
            }
        ])
        self.saved = InMemoryCollection([
            {"user_id": "u_vikash", "product_id": "p6"},
        ])
        self.ai_messages = InMemoryCollection([])
        self.ai_audit_logs = InMemoryCollection([])
        self.product_lexicon = InMemoryCollection([])


def main():
    os.environ["EMERGENT_LLM_KEY"] = ""
    db = SeededDehradunDB()
    consumer = {
        "id": "u_vikash",
        "name": "Vikash Kumar",
        "role": "consumer",
        "lat": 30.3165,
        "lng": 78.0322,
    }

    # 1. Exact spoken question from user screenshot
    q_screenshot = "sabse saste tamatar kaun si dukaan per aur Kitni Dur Mere Ghar Se Milenge aur kitne rupaye mein"
    res1 = run_sync(a.process_ai_chat_turn(db, consumer, q_screenshot, "sess_1"))
    assert res1["intent"] == "CHEAPEST_PRODUCT", f"Expected CHEAPEST_PRODUCT, got {res1['intent']}"
    assert res1["language"] == "hinglish", f"Expected hinglish, got {res1['language']}"
    assert "₹25" in res1["reply"], f"Expected ₹25 in reply: {res1['reply']}"
    assert "Raju Vegetable Cart" in res1["reply"], f"Expected Raju Vegetable Cart in reply: {res1['reply']}"
    assert "Rawat Organic Sabzi" in res1["reply"], f"Expected nearest shop Rawat Organic Sabzi in reply: {res1['reply']}"
    assert "km" in res1["reply"], f"Expected distance in km in reply: {res1['reply']}"
    assert "Hello Vikash Kumar! Main LocalPrice AI hoon" not in res1["reply"], "Must not reply with greeting!"
    print("[PASS] 1. Screenshot spoken Hinglish tomato query (price + shop/cart + distance from home)")

    # 2. Simulate LLM returning truncated greeting (exact bug from screenshot) and verify Guard 1 & Guard 2 reject it
    orig_llm = a.generate_llm_reply
    os.environ["EMERGENT_LLM_KEY"] = "sk-emergent-simulated"
    async def fake_truncated_llm(*args, **kwargs):
        return "Hello Vikash Kumar! Main LocalPrice AI hoon, aapki madad karne ke liye"
    a.generate_llm_reply = fake_truncated_llm
    try:
        res_guarded = run_sync(a.process_ai_chat_turn(db, consumer, q_screenshot, "sess_guard"))
        assert "₹25" in res_guarded["reply"] and "Raju Vegetable Cart" in res_guarded["reply"], (
            f"Guard failed to replace truncated LLM greeting! Got: {res_guarded['reply']}"
        )
        print("[PASS] 2. Truncated LLM greeting guard verified")
    finally:
        a.generate_llm_reply = orig_llm
        os.environ["EMERGENT_LLM_KEY"] = ""

    # 3. Complete shops, mobile carts, and products directory query
    res_all = run_sync(a.process_ai_chat_turn(db, consumer, "Show all shops, mobile carts and their products", "sess_2"))
    assert res_all["intent"] == "ALL_SHOPS_AND_CARTS", f"Expected ALL_SHOPS_AND_CARTS, got {res_all['intent']}"
    for name in ["Bisht General Store", "Rawat Organic Sabzi", "Raju Vegetable Cart", "Mohan Fruit Cart", "Doon Dairy & Sweets"]:
        assert name in res_all["reply"], f"Missing seller {name} in full catalog response"
    assert "Your Active Shopping Cart" in res_all["reply"], "Expected active shopping cart summary in full catalog response"
    print("[PASS] 3. All shops, mobile carts, products & user cart directory verified")

    # 4. Specific mobile cart query ("What products does Mohan Fruit Cart sell and how far is it?")
    res_cart_vendor = run_sync(a.process_ai_chat_turn(db, consumer, "What products does Mohan Fruit Cart sell and how far is it?", "sess_3"))
    assert res_cart_vendor["intent"] == "SELLER_DETAILS", f"Expected SELLER_DETAILS, got {res_cart_vendor['intent']}"
    assert "Mohan Fruit Cart" in res_cart_vendor["reply"] and "Fresh Banana" in res_cart_vendor["reply"] and "₹50" in res_cart_vendor["reply"]
    print("[PASS] 4. Specific mobile cart product catalog & distance query verified")

    # 5. Consumer's active shopping cart query ("Mere cart mein kya hai?")
    res_my_cart = run_sync(a.process_ai_chat_turn(db, consumer, "Mere cart mein kya hai?", "sess_4"))
    assert res_my_cart["intent"] == "MY_CART_QUERY", f"Expected MY_CART_QUERY, got {res_my_cart['intent']}"
    assert "Tomato" in res_my_cart["reply"] and "Basmati Rice" in res_my_cart["reply"] and "135" in res_my_cart["reply"]
    print("[PASS] 5. Consumer active shopping cart query verified")

    # 6. Consumer's saved products query
    res_saved = run_sync(a.process_ai_chat_turn(db, consumer, "Show my saved products", "sess_5"))
    assert res_saved["intent"] == "SAVED_PRODUCTS_QUERY", f"Expected SAVED_PRODUCTS_QUERY, got {res_saved['intent']}"
    assert "Fresh Banana" in res_saved["reply"] and "Mohan Fruit Cart" in res_saved["reply"]
    print("[PASS] 6. Consumer saved products query verified")

    print("\nALL 6 HYPERLOCAL AI COPILOT ACCURACY & COMPLETENESS SUITES PASSED!")


if __name__ == "__main__":
    main()

