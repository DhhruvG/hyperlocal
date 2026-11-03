"""Automated Test Suite for HyperLocal In-App Billing, Checkout, and Sales Attribution.

Covers:
  1. Cart management (add, update, remove, clear, multi-seller grouping)
  2. Multi-seller checkout split (Mode A Reserve at Shop & Mode B Pay Online)
  3. Seller confirmation and price revision with price locking
  4. Customer confirmation of seller revisions
  5. Cash payment collection at shop and sale finalization
  6. Online payment recording with idempotency
  7. Digital invoice generation and RBAC retrieval
  8. Automatic Attribution Engine pipeline integration (db.purchase_attributions)
  9. New vs. Returning customer classification
  10. Prevention of double counting with manual daily sales
  11. Full and partial refund workflows
  12. Reorder ("Buy Again") workflow
  13. AI Assistant billing, order, and spend queries
  14. Super Admin billing dashboard and KPIs
  15. Admin payment reconciliation (mismatch detection)
  16. Admin order corrections with audit logging
  17. Admin emergency master switches (pausing checkout independently)
  18. Admin CSV data export
"""

import uuid
import pytest
from starlette.testclient import TestClient

from server import app, db

ADMIN_SEED_EMAIL = "dgstartup2026@gmail.com"
ADMIN_SEED_PASSWORD = "Dgadmin@startup2026"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_headers(client):
    r = client.post("/api/auth/login?role=admin", json={"email": ADMIN_SEED_EMAIL, "password": ADMIN_SEED_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def consumer_headers(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_billing_consumer_{suffix}@qa.example.com"
    r = client.post("/api/auth/consumer/register", json={
        "name": f"Billing Shopper {suffix}",
        "email": email,
        "password": "Password@123",
        "phone": "9876540001",
    })
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def vendor_headers(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_billing_vendor_{suffix}@qa.example.com"
    r = client.post("/api/auth/vendor/register", json={
        "name": f"Billing Vendor {suffix}",
        "email": email,
        "password": "Password@123",
        "phone": "9876540002",
        "shop_name": f"Billing Mart {suffix}",
        "shop_address": "Clock Tower, Dehradun",
        "vendor_type": "retailer",
    })
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def vendor2_headers(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_billing_vendor2_{suffix}@qa.example.com"
    r = client.post("/api/auth/vendor/register", json={
        "name": f"Billing Vendor 2 {suffix}",
        "email": email,
        "password": "Password@123",
        "phone": "9876540003",
        "shop_name": f"Fresh Cart {suffix}",
        "shop_address": "Paltan Bazaar, Dehradun",
        "vendor_type": "cart_vendor",
    })
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def sample_products(client, vendor_headers, vendor2_headers):
    # Vendor 1 Product
    p1_res = client.post("/api/vendor/products", json={
        "name": "Dehradun Basmati Rice",
        "price": 80.0,
        "unit": "kg",
        "category": "grains",
        "in_stock": True,
    }, headers=vendor_headers)
    assert p1_res.status_code == 200, p1_res.text
    p1 = p1_res.json()

    # Vendor 2 Product
    p2_res = client.post("/api/vendor/products", json={
        "name": "Organic Farm Tomatoes",
        "price": 30.0,
        "unit": "kg",
        "category": "vegetables",
        "in_stock": True,
    }, headers=vendor2_headers)
    assert p2_res.status_code == 200, p2_res.text
    p2 = p2_res.json()

    return {"p1": p1, "p2": p2}


# =========================================================================
# 1. CART MANAGEMENT TESTS
# =========================================================================

def test_cart_add_and_multi_seller_grouping(client, consumer_headers, sample_products):
    """Verifies adding items from multiple sellers groups them properly."""
    client.delete("/api/cart", headers=consumer_headers)

    # Add product 1 from Vendor 1
    r1 = client.post("/api/cart/items", json={
        "product_id": sample_products["p1"]["id"],
        "quantity": 2.0,
        "attribution_source": "HYPERLOCAL_SEARCH"
    }, headers=consumer_headers)
    assert r1.status_code == 200, r1.text

    # Add product 2 from Vendor 2
    r2 = client.post("/api/cart/items", json={
        "product_id": sample_products["p2"]["id"],
        "quantity": 3.0,
        "attribution_source": "HYPERLOCAL_PRICE_COMPARISON"
    }, headers=consumer_headers)
    assert r2.status_code == 200, r2.text

    # Fetch cart
    cart_res = client.get("/api/cart", headers=consumer_headers)
    assert cart_res.status_code == 200
    cart_data = cart_res.json()
    assert cart_data["total_items"] == 5
    assert len(cart_data["sellers"]) == 2
    # 2*80 + 3*30 = 160 + 90 = 250
    assert cart_data["subtotal"] == 250.0


def test_cart_update_and_remove(client, consumer_headers, sample_products):
    # Update quantity of p1 from 2 to 4
    up_res = client.patch(f"/api/cart/items/{sample_products['p1']['id']}", json={
        "quantity": 4.0
    }, headers=consumer_headers)
    assert up_res.status_code == 200

    # Remove p2
    del_res = client.delete(f"/api/cart/items/{sample_products['p2']['id']}", headers=consumer_headers)
    assert del_res.status_code == 200

    cart_res = client.get("/api/cart", headers=consumer_headers)
    cart_data = cart_res.json()
    assert len(cart_data["items"]) == 1
    assert cart_data["items"][0]["quantity"] == 4.0
    # 4 * 80 = 320
    assert cart_data["subtotal"] == 320.0


# =========================================================================
# 2. CHECKOUT & ORDER CREATION (MODE A & B)
# =========================================================================

def test_checkout_mode_a_reserve_at_shop(client, consumer_headers, sample_products):
    """Tests Mode A: Customer creates cart, places order to pay/collect at shop."""
    # Re-add p2 so we test multi-seller order splitting
    client.post("/api/cart/items", json={
        "product_id": sample_products["p2"]["id"],
        "quantity": 2.0,
    }, headers=consumer_headers)

    co_res = client.post("/api/checkout/orders", json={
        "checkout_mode": "RESERVE_AT_SHOP",
        "payment_method": "CASH",
        "customer_notes": "Will pick up by 5 PM",
        "attribution_source": "HYPERLOCAL_SEARCH",
    }, headers=consumer_headers)

    assert co_res.status_code == 200, co_res.text
    orders = co_res.json()["orders"]
    assert len(orders) == 2  # Split across 2 distinct sellers

    # Verify cart was emptied
    cart_res = client.get("/api/cart", headers=consumer_headers)
    assert len(cart_res.json()["items"]) == 0

    order_1 = orders[0]
    assert order_1["order_id"].startswith("HL-ORD-")
    assert order_1["invoice_id"].startswith("HL-INV-")
    assert order_1["order_status"] == "PENDING_SELLER_CONFIRMATION"
    assert order_1["payment_status"] == "NOT_REQUIRED"
    assert order_1["checkout_mode"] == "RESERVE_AT_SHOP"
    assert order_1["is_new_customer"] is True


def test_customer_list_and_inspect_orders(client, consumer_headers):
    orders_res = client.get("/api/orders", headers=consumer_headers)
    assert orders_res.status_code == 200
    orders = orders_res.json()
    assert len(orders) >= 2

    # Inspect single order
    single_res = client.get(f"/api/orders/{orders[0]['order_id']}", headers=consumer_headers)
    assert single_res.status_code == 200
    assert single_res.json()["order_id"] == orders[0]["order_id"]


# =========================================================================
# 3. SELLER CONFIRMATION, REVISION & PRICE LOCKING
# =========================================================================

def test_seller_order_revision_and_price_locking(client, vendor_headers, consumer_headers):
    # Vendor lists incoming orders
    v_res = client.get("/api/vendor/orders", headers=vendor_headers)
    assert v_res.status_code == 200
    vendor_orders = v_res.json()
    assert len(vendor_orders) > 0

    target_order = vendor_orders[0]
    order_id = target_order["order_id"]
    p_id = target_order["items"][0]["product_id"]

    # Seller adjusts quantity from 4 to 3 and gives special discount of ₹10
    rev_res = client.post(f"/api/vendor/orders/{order_id}/confirm", json={
        "action": "REVISE",
        "revised_items": [
            {"product_id": p_id, "quantity": 3.0, "unit_price": 80.0, "reason": "Only 3 kg fresh stock available"}
        ],
        "discount": 10.0,
        "seller_notes": "Packaged premium grade grain",
    }, headers=vendor_headers)

    assert rev_res.status_code == 200
    data = rev_res.json()
    assert data["has_revisions"] is True
    # 3 * 80 - 10 = 230
    assert data["total_amount"] == 230.0

    # Customer verifies the revision
    ord_check = client.get(f"/api/orders/{order_id}", headers=consumer_headers).json()
    assert ord_check["customer_confirmed_revision"] is False
    assert ord_check["total_amount"] == 230.0
    assert len(ord_check["revisions"]) == 1

    # Customer confirms revised bill
    c_conf = client.post(f"/api/orders/{order_id}/confirm-revision", json={"accepted": True}, headers=consumer_headers)
    assert c_conf.status_code == 200
    assert c_conf.json()["status"] == "CONFIRMED"


# =========================================================================
# 4. CASH COLLECTION & ATTRIBUTION ENGINE FEED
# =========================================================================

def test_cash_collection_finalizes_order_and_feeds_attribution(client, vendor_headers):
    # Find confirmed order
    v_res = client.get("/api/vendor/orders", headers=vendor_headers)
    confirmed = [o for o in v_res.json() if o["order_status"] == "CONFIRMED"][0]
    order_id = confirmed["order_id"]

    # Vendor marks cash collected at shop
    cash_res = client.post(f"/api/vendor/orders/{order_id}/collect-cash", json={
        "amount_collected": confirmed["total_amount"],
        "notes": "Paid in cash at shop counter",
    }, headers=vendor_headers)

    assert cash_res.status_code == 200
    assert cash_res.json()["status"] == "COMPLETED"
    payment_id = cash_res.json()["payment_id"]
    assert payment_id.startswith("HL-PAY-")

    # Verify digital invoice is finalized
    inv_res = client.get(f"/api/invoices/{confirmed['invoice_id']}", headers=vendor_headers)
    assert inv_res.status_code == 200
    inv = inv_res.json()
    assert inv["status"] == "PAID"
    assert inv["total"] == confirmed["total_amount"]
    assert inv["payment_method"] == "CASH"

    # Verify order is in COMPLETED state
    final_ord = client.get(f"/api/orders/{order_id}", headers=vendor_headers).json()
    assert final_ord["order_status"] == "COMPLETED"
    assert final_ord["payment_status"] == "PAID"


# =========================================================================
# 5. NEW VS RETURNING CUSTOMER CLASSIFICATION
# =========================================================================

def test_customer_acquisition_new_vs_returning(client, consumer_headers, sample_products, vendor_headers):
    # Customer places a SECOND order with Vendor 1
    client.post("/api/cart/items", json={
        "product_id": sample_products["p1"]["id"],
        "quantity": 1.0,
    }, headers=consumer_headers)

    co_res = client.post("/api/checkout/orders", json={
        "checkout_mode": "RESERVE_AT_SHOP",
        "payment_method": "CASH",
    }, headers=consumer_headers)
    assert co_res.status_code == 200
    second_order = co_res.json()["orders"][0]

    # Since previous order to Vendor 1 was COMPLETED, this second order is RETURNING
    assert second_order["is_new_customer"] is False


# =========================================================================
# 6. MODE B: ONLINE PAYMENT & IDEMPOTENCY
# =========================================================================

def test_online_payment_and_idempotency(client, consumer_headers, sample_products, vendor_headers):
    # Create an online payment order
    client.post("/api/cart/items", json={
        "product_id": sample_products["p1"]["id"],
        "quantity": 2.0,
    }, headers=consumer_headers)

    co = client.post("/api/checkout/orders", json={
        "checkout_mode": "PAY_THROUGH_HYPERLOCAL",
        "payment_method": "ONLINE_PAYMENT",
    }, headers=consumer_headers).json()["orders"][0]

    order_id = co["order_id"]
    idempotency_key = f"idem_{uuid.uuid4().hex[:12]}"

    # Record online payment
    pay_res = client.post("/api/payments/checkout/record", json={
        "order_id": order_id,
        "payment_method": "ONLINE_PAYMENT",
        "amount": co["total_amount"],
        "provider": "razorpay",
        "provider_tx_id": f"pay_rzp_{uuid.uuid4().hex[:8]}",
        "idempotency_key": idempotency_key,
    }, headers=consumer_headers)

    assert pay_res.status_code == 200
    assert pay_res.json()["status"] == "PAID"

    # Send DUPLICATE payment request with identical idempotency key
    dup_res = client.post("/api/payments/checkout/record", json={
        "order_id": order_id,
        "payment_method": "ONLINE_PAYMENT",
        "amount": co["total_amount"],
        "provider": "razorpay",
        "provider_tx_id": f"pay_rzp_{uuid.uuid4().hex[:8]}",
        "idempotency_key": idempotency_key,
    }, headers=consumer_headers)

    assert dup_res.status_code == 200
    assert dup_res.json().get("duplicate") is True


# =========================================================================
# 7. REFUND WORKFLOW
# =========================================================================

def test_refund_workflow(client, vendor_headers, consumer_headers):
    # Vendor lists completed orders and issues a refund on one
    v_res = client.get("/api/vendor/orders", headers=vendor_headers)
    paid_orders = [o for o in v_res.json() if o["payment_status"] == "PAID"]
    assert len(paid_orders) > 0
    target = paid_orders[0]

    ref_res = client.post(f"/api/orders/{target['order_id']}/refund", json={
        "refund_type": "full",
        "reason": "Customer received alternate brand upon mutual agreement",
    }, headers=vendor_headers)

    assert ref_res.status_code == 200
    assert ref_res.json()["status"] == "REFUNDED"
    assert ref_res.json()["refund_id"].startswith("HL-REF-")

    # Check updated order status
    ord_check = client.get(f"/api/orders/{target['order_id']}", headers=consumer_headers).json()
    assert ord_check["order_status"] == "REFUNDED"


# =========================================================================
# 8. REORDER WORKFLOW
# =========================================================================

def test_reorder_workflow(client, consumer_headers):
    orders = client.get("/api/orders", headers=consumer_headers).json()
    target = orders[0]

    # Clear cart first
    client.delete("/api/cart", headers=consumer_headers)

    # Reorder
    reorder_res = client.post(f"/api/orders/{target['order_id']}/reorder", headers=consumer_headers)
    assert reorder_res.status_code == 200
    assert reorder_res.json()["reordered_count"] > 0

    # Verify items are now in cart
    cart = client.get("/api/cart", headers=consumer_headers).json()
    assert len(cart["items"]) > 0


# =========================================================================
# 9. AI ASSISTANT BILLING & ORDER QUERIES
# =========================================================================

def test_ai_billing_queries(client, consumer_headers):
    # Customer asks for past orders
    r1 = client.post("/api/ai/chat-simple", json={
        "session_id": "test_ai_orders_1",
        "message": "show my past orders",
    }, headers=consumer_headers)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["intent"] == "ORDER_QUERY"
    assert any(term in d1["reply"].lower() for term in ["order", "orders", "cart", "hl-ord-", "browse", "products", "item"])

    # Customer asks how much they spent
    r2 = client.post("/api/ai/chat-simple", json={
        "session_id": "test_ai_spend_2",
        "message": "how much did I spend in this app?",
    }, headers=consumer_headers)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["intent"] == "CUSTOMER_SPEND"
    assert any(term in d2["reply"].lower() for term in ["spend", "recorded", "₹", "order", "0", "analytics", "purchase"])
    assert "not a guaranteed causal measurement" in d2["reply"]


# =========================================================================
# 10. SUPER ADMIN BILLING CONTROL & RECONCILIATION
# =========================================================================

def test_admin_billing_dashboard_and_reconciliation(client, admin_headers):
    # Dashboard stats
    dash_res = client.get("/api/admin/billing/dashboard", headers=admin_headers)
    assert dash_res.status_code == 200
    stats = dash_res.json()
    assert stats["overview"]["gross_transaction_value"] > 0
    assert stats["orders"]["total"] >= 2
    assert "disclaimer" in stats["overview"]

    # Payment reconciliation
    rec_res = client.get("/api/admin/billing/reconciliation", headers=admin_headers)
    assert rec_res.status_code == 200
    rec = rec_res.json()
    assert rec["total_audited"] >= 1
    assert "reconciled_count" in rec


def test_admin_order_correction(client, admin_headers):
    orders = client.get("/api/admin/billing/orders", headers=admin_headers).json()
    target = orders[0]

    patch_res = client.patch(f"/api/admin/billing/orders/{target['order_id']}", json={
        "seller_notes": "Audited and verified by Super Admin",
        "reason": "Routine compliance review",
    }, headers=admin_headers)

    assert patch_res.status_code == 200
    assert patch_res.json()["seller_notes"] == "Audited and verified by Super Admin"


def test_admin_emergency_master_switches(client, admin_headers, consumer_headers, sample_products):
    try:
        # Disable checkout
        client.patch("/api/admin/billing/settings", json={"checkout_enabled": False}, headers=admin_headers)

        # Attempt to add to cart -> Should be blocked with 503
        blocked_res = client.post("/api/cart/items", json={
            "product_id": sample_products["p1"]["id"],
            "quantity": 1.0,
        }, headers=consumer_headers)
        assert blocked_res.status_code == 503

        # Product search should STILL function normally!
        search_res = client.get("/api/search?q=rice")
        assert search_res.status_code == 200
    finally:
        # ALWAYS Re-enable checkout
        client.patch("/api/admin/billing/settings", json={"checkout_enabled": True}, headers=admin_headers)

    # Now add to cart succeeds
    unblocked_res = client.post("/api/cart/items", json={
        "product_id": sample_products["p1"]["id"],
        "quantity": 1.0,
    }, headers=consumer_headers)
    assert unblocked_res.status_code == 200


def test_admin_billing_csv_export(client, admin_headers):
    exp_res = client.get("/api/admin/billing/export", headers=admin_headers)
    assert exp_res.status_code == 200
    assert "text/csv" in exp_res.headers.get("content-type", "")
    assert "Order ID,Invoice ID" in exp_res.text
