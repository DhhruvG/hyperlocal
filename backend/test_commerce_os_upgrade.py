"""
Comprehensive Backend Verification Suite for the HyperLocal Commerce OS Upgrade (Points 1-40).
Includes unit tests for deterministic scoring/extraction engines and live HTTP integration tests
against the unified FastAPI + MongoDB application.
"""
import os
import sys
from datetime import datetime, timezone, timedelta
import httpx

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from commerce_os_engine import (
    compute_inventory_trust_sync,
    parse_multi_item_voice_inventory,
    ADMIN_ROLES_PERMISSIONS,
    CANONICAL_DOMAIN_EVENTS,
    DEFAULT_AI_MATURITY_REGISTRY,
    DEFAULT_SUBSCRIPTION_PLANS,
    DEFAULT_PLATFORM_FEATURES,
)

BASE_URL = "http://127.0.0.1:8000"


def test_point_1_feature_priority_classifications():
    """Verify Point 1: CORE, GROWTH, MONETIZATION, EXPERIMENTAL classifications & security guard."""
    classes = {f["category"] for f in DEFAULT_PLATFORM_FEATURES}
    assert {"CORE", "GROWTH", "MONETIZATION", "EXPERIMENTAL"}.issubset(classes)
    essential = [f for f in DEFAULT_PLATFORM_FEATURES if f.get("is_essential_security")]
    assert len(essential) >= 1
    assert essential[0]["status"] == "ENABLED"


def test_point_2_inventory_trust_and_confidence_scoring():
    """Verify Point 2: Inventory confidence 0-100 and CONFIRMED_RECENTLY / PROBABLY_AVAILABLE / POSSIBLY_STALE."""
    now = datetime.now(timezone.utc)

    fresh_prod = {
        "in_stock": True,
        "updated_at": (now - timedelta(hours=2)).isoformat(),
        "last_confirmed_at": (now - timedelta(hours=1)).isoformat(),
        "verified_order_count": 4,
        "stock_quantity": 25,
    }
    res_fresh = compute_inventory_trust_sync(fresh_prod)
    assert 75 <= res_fresh["inventory_confidence_score"] <= 100
    assert res_fresh["inventory_freshness_state"] == "CONFIRMED_RECENTLY"
    assert "🟢" in res_fresh["inventory_badge_label"]

    mid_prod = {
        "in_stock": True,
        "updated_at": (now - timedelta(hours=48)).isoformat(),
    }
    res_mid = compute_inventory_trust_sync(mid_prod)
    assert res_mid["inventory_freshness_state"] in ("PROBABLY_AVAILABLE", "CONFIRMED_RECENTLY")

    stale_prod = {
        "in_stock": True,
        "updated_at": (now - timedelta(hours=240)).isoformat(),
    }
    res_stale = compute_inventory_trust_sync(stale_prod)
    assert res_stale["inventory_freshness_state"] == "POSSIBLY_STALE"
    assert "🟠" in res_stale["inventory_badge_label"]
    assert res_stale["inventory_confidence_score"] < res_fresh["inventory_confidence_score"]


def test_point_3_frictionless_multi_item_voice_inventory_extraction():
    """Verify Point 3: Multi-item voice extraction ('10 packet Maggi 14 rupees, 20 Dairy Milk 20 rupees, Surf Excel one kilo 135')."""
    sample = "10 packet Maggi 14 rupees, 20 Dairy Milk 20 rupees, Surf Excel one kilo 135"
    extracted = parse_multi_item_voice_inventory(sample)
    assert len(extracted) == 3

    maggi = extracted[0]
    assert "maggi" in maggi["product"].lower()
    assert maggi["quantity"] == 10.0
    assert maggi["price"] == 14.0

    dairy_milk = extracted[1]
    assert "dairy milk" in dairy_milk["product"].lower()
    assert dairy_milk["quantity"] == 20.0
    assert dairy_milk["price"] == 20.0

    surf = extracted[2]
    assert "surf excel" in surf["product"].lower()
    assert surf["price"] == 135.0


def test_points_8_and_9_subscription_plans_preserve_trial_and_pricing():
    """Verify Points 8 & 9: Preserves 30-day trial, ₹199/mo Pro, ₹1,499/yr Annual, plus Growth, Business & Mobile Cart Pro."""
    by_code = {p["plan_code"]: p for p in DEFAULT_SUBSCRIPTION_PLANS}
    assert "FREE" in by_code
    assert "PRO" in by_code
    assert "GROWTH" in by_code
    assert "BUSINESS" in by_code
    assert "CART_PRO" in by_code

    assert by_code["FREE"]["trial_duration_days"] == 30
    assert by_code["PRO"]["monthly_price"] == 199
    assert by_code["PRO"]["annual_price"] == 1499
    assert by_code["CART_PRO"]["vendor_tier"] == "cart_vendor"


def test_point_17_ai_maturity_registry_honesty():
    """Verify Point 17: Honest classification of Rule-Based, Data-Driven, and Model-Assisted systems."""
    allowed_labels = {"PROTOTYPE", "RULE_BASED", "DATA_DRIVEN", "MODEL_ASSISTED", "PRODUCTION_AI"}
    assert len(DEFAULT_AI_MATURITY_REGISTRY) >= 5
    for cap in DEFAULT_AI_MATURITY_REGISTRY:
        assert cap["maturity_level"] in allowed_labels


def test_point_33_and_granular_admin_rbac():
    """Verify Point 33 canonical event bus types & 9 granular admin roles."""
    assert len(CANONICAL_DOMAIN_EVENTS) == 19
    assert "PRODUCT_SEARCHED" in CANONICAL_DOMAIN_EVENTS
    assert "QR_CHECKED_IN" in CANONICAL_DOMAIN_EVENTS
    assert "PURCHASE_CONFIRMED" in CANONICAL_DOMAIN_EVENTS

    expected_roles = {
        "SUPER_ADMIN",
        "OPERATIONS_ADMIN",
        "FINANCE_ADMIN",
        "SUPPORT_ADMIN",
        "AI_ADMIN",
        "MARKETING_ADMIN",
        "SALES_ADMIN",
        "RISK_ADMIN",
        "ANALYST",
    }
    assert expected_roles.issubset(set(ADMIN_ROLES_PERMISSIONS.keys()))


def test_live_api_endpoints_and_rbac():
    """Verify live HTTP endpoints for Products, Basket Optimizer, Subscriptions, Vendor OS, and Admin OS."""
    with httpx.Client(base_url=BASE_URL, timeout=20.0) as client:
        # 1. Public Products Search with Inventory Trust fields
        prod_res = client.get("/api/search?sort=confidence")
        assert prod_res.status_code == 200
        prods = prod_res.json()
        assert isinstance(prods, list)
        if prods:
            first = prods[0]
            assert "inventory_confidence_score" in first
            assert "inventory_freshness_state" in first
            assert "inventory_badge_label" in first

        # 2. Public Subscription Plans
        plans_res = client.get("/api/subscription-plans")
        assert plans_res.status_code == 200
        plans_data = plans_res.json()
        assert len(plans_data.get("plans", [])) >= 5

        # 3. Cheapest Basket Optimizer (Point 4)
        basket_res = client.post(
            "/api/basket/optimize",
            json={
                "items": [
                    {"name": "Tomato", "quantity": 1},
                    {"name": "Potato", "quantity": 1},
                ],
                "lat": 28.6315,
                "lng": 77.2167,
                "radius_km": 10.0,
            },
        )
        assert basket_res.status_code == 200
        b_data = basket_res.json()
        assert "modes" in b_data
        assert "CHEAPEST" in b_data["modes"]
        assert "CONVENIENT" in b_data["modes"]
        assert "NEAREST" in b_data["modes"]

        # 4. Unauthenticated access to Admin endpoint must return 401/403
        unauth_admin = client.get("/api/admin/executive/dashboard")
        assert unauth_admin.status_code in (401, 403)


def test_part_14_consumer_retailer_cart_vendor_and_monetization_flows():
    """
    Comprehensive End-to-End Integration Test for Part 14:
    - Consumer Free Forever (search, live carts, requests, no paywalls)
    - Retailer Free (30 active cap) vs Pro (₹199/mo, ₹1,499/yr, 30-day trial, templates, stockout AI)
    - Mobile Cart Vendor Free (20 active cap, Free Live Location & Start/Stop Selling) vs Pro (₹99/mo, ₹799/yr, AI Route guard)
    - Non-Destructive Downgrade active product selection
    - Idempotent payment verification & non-destructive cancellation
    """
    import uuid
    suffix = uuid.uuid4().hex[:8]

    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        # 1. Verify Payment Config Pricing (Retailer ₹199/₹1499, Cart Vendor ₹99/₹799)
        cfg = client.get("/api/payments/config").json()
        assert cfg["all_plans"]["retailer"]["monthly"]["amount"] == 19900
        assert cfg["all_plans"]["retailer"]["yearly"]["amount"] == 149900
        assert cfg["all_plans"]["cart_vendor"]["monthly"]["amount"] == 9900
        assert cfg["all_plans"]["cart_vendor"]["yearly"]["amount"] == 79900

        # 2. Consumer Signup & Free Forever Entitlements
        c_reg = client.post(
            "/api/auth/consumer/register",
            json={
                "name": f"Test Consumer {suffix}",
                "email": f"consumer_{suffix}@example.com",
                "password": "Password123!",
                "phone": "9876543210",
            },
        )
        assert c_reg.status_code == 200
        c_data = c_reg.json()
        c_token = c_data["token"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        assert c_data["user"]["entitlement_tier"] == "CONSUMER_FREE"
        assert c_data["user"]["product_limit"] is None

        # Consumer creates an 'I Need' request & views live carts (100% free)
        req_res = client.post(
            "/api/requests",
            headers=c_headers,
            json={
                "item": "Fresh Coriander",
                "quantity": "2 bunches",
                "target_price": 30,
                "lat": 28.6315,
                "lng": 77.2167,
            },
        )
        assert req_res.status_code == 200
        live_carts_res = client.get("/api/vendors?online=true&lat=28.6315&lng=77.2167")
        assert live_carts_res.status_code == 200

        # Consumer cannot access Admin endpoints (RBAC check — returns 401/403/404)
        c_admin = client.get("/api/admin/stats", headers=c_headers)
        assert c_admin.status_code in (401, 403, 404)

        # 3. Retailer Registration (30-day Free Pro Trial + 30 Free Product Cap metadata)
        r_reg = client.post(
            "/api/auth/vendor/register",
            json={
                "name": f"Test Retailer {suffix}",
                "email": f"retailer_{suffix}@example.com",
                "password": "Password123!",
                "phone": "9876543211",
                "vendor_type": "retailer",
                "shop_name": f"Sharma Kirana {suffix}",
                "shop_address": "Connaught Place, New Delhi",
                "lat": 28.6315,
                "lng": 77.2167,
            },
        )
        assert r_reg.status_code == 200
        r_data = r_reg.json()
        r_token = r_data["token"]
        r_headers = {"Authorization": f"Bearer {r_token}"}
        assert r_data["user"]["trial_active"] is True
        assert r_data["user"]["has_pro_access"] is True
        assert r_data["user"]["free_product_cap"] == 30

        # Retailer fetches Smart Product Templates
        tpl_res = client.get("/api/vendor/product-templates", headers=r_headers)
        assert tpl_res.status_code == 200
        assert len(tpl_res.json()["templates"]) >= 20

        # Retailer adds products & tests Copy Yesterday's Inventory
        p1 = client.post(
            "/api/vendor/products",
            headers=r_headers,
            json={"name": "Potato (Aloo)", "category": "Vegetables", "price": 30, "unit": "kg", "in_stock": True},
        )
        assert p1.status_code == 200
        p2 = client.post(
            "/api/vendor/products",
            headers=r_headers,
            json={"name": "Onion (Pyaz)", "category": "Vegetables", "price": 40, "unit": "kg", "in_stock": True},
        )
        assert p2.status_code == 200

        copy_res = client.post("/api/vendor/inventory/copy-previous", headers=r_headers)
        assert copy_res.status_code == 200

        # Retailer on Trial can access Pro Stockout Prediction & Demand Forecast
        so_res = client.get("/api/vendor/stockout-prediction", headers=r_headers)
        assert so_res.status_code == 200
        df_res = client.post("/api/ai/demand-forecast?category=Vegetables", headers=r_headers)
        assert df_res.status_code == 200

        # Non-Destructive Active Product Selection (Part 4.4)
        p1_id = p1.json()["id"]
        sel_res = client.post(
            "/api/vendor/products/select-active",
            headers=r_headers,
            json={"active_product_ids": [p1_id]},
        )
        assert sel_res.status_code == 200
        assert sel_res.json()["activated_count"] == 1
        assert sel_res.json()["paused_count"] == 1

        # Verify both products still exist in database (zero deletion!)
        all_r_prods = client.get("/api/vendor/products", headers=r_headers).json()
        assert len(all_r_prods) == 2

        # 4. Mobile Cart Vendor Registration, Live Selling (Always Free), and Idempotent Payment
        cv_reg = client.post(
            "/api/auth/vendor/register",
            json={
                "name": f"Test Cart Vendor {suffix}",
                "email": f"cart_{suffix}@example.com",
                "password": "Password123!",
                "phone": "9876543212",
                "vendor_type": "cart_vendor",
                "shop_name": f"Raju Fresh Thela {suffix}",
                "shop_address": "Main Market Chowk",
                "lat": 28.6320,
                "lng": 77.2170,
            },
        )
        assert cv_reg.status_code == 200
        cv_data = cv_reg.json()
        cv_token = cv_data["token"]
        cv_headers = {"Authorization": f"Bearer {cv_token}"}
        assert cv_data["user"]["free_product_cap"] == 20
        assert cv_data["user"]["entitlements"]["live_location_sharing"] is True
        assert cv_data["user"]["entitlements"]["start_stop_selling"] is True

        # Cart vendor updates live selling status & GPS location
        online_res = client.patch(
            "/api/vendor/profile",
            headers=cv_headers,
            json={"is_online": True, "lat": 28.6325, "lng": 77.2175},
        )
        assert online_res.status_code == 200
        status_res = client.post(
            "/api/vendor/mobile-cart/status",
            headers=cv_headers,
            json={"cart_status": "AT_HOTSPOT", "current_stop_name": "Block C Gate 2", "eta_next_stop_mins": 15},
        )
        assert status_res.status_code == 200

        # Idempotent Payment Verification Test (Part 4.5)
        ord_res = client.post("/api/payments/create-order", headers=cv_headers, json={"plan": "monthly"})
        assert ord_res.status_code == 200
        order_id = ord_res.json()["order_id"]

        ver1 = client.post(
            "/api/payments/verify",
            headers=cv_headers,
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": f"pay_test_{suffix}",
                "razorpay_signature": None,
                "plan": "monthly",
            },
        )
        assert ver1.status_code == 200
        exp1 = ver1.json()["user"]["pro_expires_at"]

        # Second identical verification must be idempotent and return identical expiry without double extension
        ver2 = client.post(
            "/api/payments/verify",
            headers=cv_headers,
            json={
                "razorpay_order_id": order_id,
                "razorpay_payment_id": f"pay_test_{suffix}",
                "razorpay_signature": None,
                "plan": "monthly",
            },
        )
        assert ver2.status_code == 200
        assert ver2.json().get("idempotent") is True
        assert ver2.json()["user"]["pro_expires_at"] == exp1

        # Subscription status & non-destructive cancellation
        sub_st = client.get("/api/vendor/subscription-status", headers=cv_headers)
        assert sub_st.status_code == 200
        assert sub_st.json()["is_pro"] is True

        cancel_res = client.post("/api/vendor/subscription/cancel", headers=cv_headers)
        assert cancel_res.status_code == 200
        assert cancel_res.json()["ok"] is True
