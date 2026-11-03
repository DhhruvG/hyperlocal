"""
Comprehensive test suite for HyperLocal Visit, Customer Attribution & Sales Impact Engine
and Admin Total Editing Control across entities.

Scenarios tested:
1. Search -> visit -> no QR -> customer confirms visit -> Verified visit.
2. Search -> directions -> geofence entered -> no confirmation -> Likely/Possible visit.
3. QR scan -> purchase confirm -> Verified purchase attribution.
4. Initial discovery -> return 3 days later -> HyperLocal-acquired returning customer.
5. Vendor manual purchase record -> Vendor-reported purchase.
6. Customer purchase confirm -> Customer-confirmed purchase.
7. Dual customer + vendor confirm -> High-confidence verified purchase.
8. Walk past shop -> Not automatically verified visit (GPS alone != verified).
9. Lives near shop -> Proximity without intent != attributed.
10. Unusually high daily sales -> Flags potential anomaly for review.
11. Security & permissions: Cross-vendor isolation, Admin attribution editing & deletion.
12. Admin full entity editing: users (vendor/consumer), orders, reviews, messages, requests.
"""

import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

from server import app, db, hash_password, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD


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
def vendor_a(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_vend_a_{suffix}@qa.example.com"
    shop = f"QA Vendor A Shop {suffix}"
    r = client.post("/api/auth/vendor/register", json={
        "name": "Vendor A Owner",
        "email": email,
        "password": "Password@123",
        "phone": "9876500001",
        "shop_name": shop,
        "shop_address": "Rajpur Road, Dehradun",
        "vendor_type": "retailer",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return {"id": data["user"]["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email, "shop_name": shop}


@pytest.fixture(scope="module")
def vendor_b(client):
    email = f"qa_vend_b_{uuid.uuid4().hex[:6]}@qa.example.com"
    r = client.post("/api/auth/vendor/register", json={
        "name": "Vendor B Owner",
        "email": email,
        "password": "Password@123",
        "phone": "9876500002",
        "shop_name": "QA Vendor B Cart",
        "shop_address": "Clock Tower, Dehradun",
        "vendor_type": "cart_vendor",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return {"id": data["user"]["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}


@pytest.fixture(scope="module")
def consumer_user(client):
    email = f"qa_cons_{uuid.uuid4().hex[:6]}@qa.example.com"
    r = client.post("/api/auth/consumer/register", json={
        "name": "QA Shopper Anita",
        "email": email,
        "password": "Password@123",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return {"id": data["user"]["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}


# ---------------- Scenario 1: Search -> visit -> no QR -> customer confirms visit -> Verified visit ----------------
def test_scenario_1_search_visit_no_qr_customer_confirms(client, vendor_a, consumer_user, admin_headers):
    # Consumer searches & views profile
    anon_id = f"anon-{uuid.uuid4().hex[:8]}"
    r1 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "product_search",
        "metadata": {"query": "organic apples"}
    }, headers=consumer_user["headers"])
    assert r1.status_code == 200
    session_id = r1.json()["session_id"]

    # Customer confirms visit via prompt
    r2 = client.post("/api/attribution/confirm-visit-customer", json={
        "session_id": session_id,
        "visited": True,
        "purchased": False,
    }, headers=consumer_user["headers"])
    assert r2.status_code == 200
    res = r2.json()
    assert res["ok"] is True
    assert res["status"] == "verified_visit"
    assert res.get("points_earned", 0) > 0

    # Admin inspection confirms session is verified
    r3 = client.get(f"/api/admin/attribution/sessions/{session_id}", headers=admin_headers)
    assert r3.status_code == 200
    session_data = r3.json()["session"]
    assert session_data["attribution_status"] == "verified_visit"
    assert len(r3.json()["visits"]) > 0


# ---------------- Scenario 2: Search -> directions -> geofence entered -> Likely/Possible visit ----------------
def test_scenario_2_search_directions_geofence_likely_visit(client, vendor_a):
    anon_id = f"anon-{uuid.uuid4().hex[:8]}"
    # Search & directions
    r1 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "directions_clicked",
        "session_token": anon_id,
    })
    assert r1.status_code == 200
    session_id = r1.json()["session_id"]
    assert r1.json()["intent_level"] in ("HIGH", "VERY_HIGH")

    # Geofence location signal (within 35m) with high dwell time
    r2 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "location_visit_signal",
        "session_id": session_id,
        "session_token": anon_id,
        "dwell_seconds": 180,
        "metadata": {"distance_meters": 35}
    })
    assert r2.status_code == 200
    # Visit is classified as LIKELY or POSSIBLE, NOT VERIFIED without explicit customer/vendor confirmation
    assert r2.json()["visit_classified"] in ("LIKELY", "POSSIBLE")
    assert r2.json()["visit_classified"] != "VERIFIED"


# ---------------- Scenario 3: QR scan -> purchase confirm -> Verified purchase attribution ----------------
def test_scenario_3_qr_scan_purchase_attribution(client, vendor_a, consumer_user):
    # Check vendor QR landing info
    rqr = client.get(f"/api/attribution/qr/{vendor_a['id']}")
    assert rqr.status_code == 200
    assert rqr.json()["shop_name"] == vendor_a["shop_name"]

    # QR check-in
    r_checkin = client.post("/api/attribution/qr-checkin", json={
        "seller_id": vendor_a["id"],
        "event_type": "qr_checkin",
        "metadata": {"source": "counter_stand"}
    }, headers=consumer_user["headers"])
    assert r_checkin.status_code == 200
    data = r_checkin.json()
    assert data["ok"] is True
    assert data["status"] == "verified_visit"
    session_id = data["session_id"]

    # Customer confirms purchase from QR flow
    r_conf = client.post("/api/attribution/confirm-visit-customer", json={
        "session_id": session_id,
        "visited": True,
        "purchased": True,
        "exact_amount": 250.0,
        "spend_range": "101-250",
    }, headers=consumer_user["headers"])
    assert r_conf.status_code == 200
    assert r_conf.json()["status"] == "purchase_attributed"
    assert r_conf.json()["purchase_amount"] == 250.0


# ---------------- Scenario 4: Initial discovery -> return days later -> HyperLocal-acquired returning customer ----------------
def test_scenario_4_returning_customer_attribution(client, vendor_a, consumer_user):
    # 1st touch
    r1 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "seller_profile_view",
    }, headers=consumer_user["headers"])
    assert r1.status_code == 200
    sess1 = r1.json()["session_id"]

    # 1st purchase
    client.post("/api/attribution/confirm-visit-customer", json={
        "session_id": sess1,
        "visited": True,
        "purchased": True,
        "exact_amount": 150.0,
    }, headers=consumer_user["headers"])

    # 2nd visit days later
    r2 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "seller_profile_view",
    }, headers=consumer_user["headers"])
    assert r2.status_code == 200

    # Customer relationship recognizes returning HyperLocal-acquired shopper
    r_impact = client.get("/api/vendor/business-impact?time_range=last_30d", headers=vendor_a["headers"])
    assert r_impact.status_code == 200
    impact = r_impact.json()
    assert "returning_customers" in impact["customer_acquisition"]


# ---------------- Scenario 5: Vendor manual purchase record -> Vendor-reported purchase ----------------
def test_scenario_5_vendor_manual_purchase_record(client, vendor_a, admin_headers):
    r = client.post("/api/vendor/record-visit", json={
        "visit_status": "purchased",
        "amount": 420.0,
        "notes": "2 packets basmati rice",
        "category": "groceries"
    }, headers=vendor_a["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["recorded_purchase"] is True

    # Check that it's labeled as vendor-reported
    r_purchases = client.get("/api/admin/attribution/purchases", headers=admin_headers)
    assert r_purchases.status_code == 200
    purchases = r_purchases.json()
    match = next((p for p in purchases if p.get("amount") == 420.0 and p.get("seller_id") == vendor_a["id"]), None)
    assert match is not None
    assert match.get("trust_level") == "Vendor Reported"


# ---------------- Scenario 6: Customer purchase confirm -> Customer-confirmed purchase ----------------
def test_scenario_6_customer_purchase_confirm_modal(client, vendor_a, consumer_user):
    # Trigger active session with directions
    r1 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "directions_clicked",
    }, headers=consumer_user["headers"])
    sess_id = r1.json()["session_id"]

    # Prompt check for pending confirmation
    r_prompt = client.get("/api/attribution/prompt-check", headers=consumer_user["headers"])
    assert r_prompt.status_code == 200

    # Confirm visit with spend
    r_conf = client.post("/api/attribution/confirm-visit-customer", json={
        "session_id": sess_id,
        "visited": True,
        "purchased": True,
        "spend_range": "251-500",
        "exact_amount": 320.0
    }, headers=consumer_user["headers"])
    assert r_conf.status_code == 200
    data = r_conf.json()
    assert data["ok"] is True
    assert data["status"] == "purchase_attributed"
    assert data["purchase_amount"] == 320.0
    assert data["points_earned"] >= 10


# ---------------- Scenario 7: Dual customer + vendor confirm -> High-confidence verified purchase ----------------
def test_scenario_7_dual_confirmation(client, vendor_a, consumer_user, admin_headers):
    # Consumer clicks directions -> starts session
    r_start = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "directions_clicked"
    }, headers=consumer_user["headers"])
    sess_id = r_start.json()["session_id"]

    # Vendor logs purchase (automatically matches active session)
    r_vend = client.post("/api/vendor/record-visit", json={
        "visit_status": "purchased",
        "amount": 550.0,
        "notes": "Cotton shirt"
    }, headers=vendor_a["headers"])
    assert r_vend.status_code == 200

    # Customer also confirms
    r_cust = client.post("/api/attribution/confirm-visit-customer", json={
        "session_id": sess_id,
        "visited": True,
        "purchased": True,
        "exact_amount": 550.0
    }, headers=consumer_user["headers"])
    assert r_cust.status_code == 200

    # Both vendor and customer confirm visit
    r_journey = client.get(f"/api/admin/attribution/sessions/{sess_id}", headers=admin_headers)
    assert r_journey.status_code == 200
    assert len(r_journey.json()["purchases"]) > 0


# ---------------- Scenario 8: Walk past shop -> Not automatically verified visit ----------------
def test_scenario_8_walk_past_not_verified(client, vendor_a):
    anon_id = f"anon-walkby-{uuid.uuid4().hex[:6]}"
    # Isolated location signal without prior search, directions, or dwell
    r = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "location_visit_signal",
        "session_token": anon_id,
        "dwell_seconds": 15,
        "metadata": {"distance_meters": 45}
    })
    assert r.status_code == 200
    data = r.json()
    assert data["intent_level"] == "LOW"
    # Never classified as VERIFIED from GPS alone
    assert data["visit_classified"] != "VERIFIED"


# ---------------- Scenario 9: Lives near shop -> Not attributed merely from location ----------------
def test_scenario_9_neighbor_no_attribution(client, vendor_a):
    anon_id = f"anon-neighbor-{uuid.uuid4().hex[:6]}"
    # Repeated proximity events with no product searches or clicks
    for _ in range(3):
        r = client.post("/api/attribution/event", json={
            "seller_id": vendor_a["id"],
            "event_type": "location_visit_signal",
            "session_token": anon_id,
            "metadata": {"distance_meters": 30}
        })
        assert r.status_code == 200
        assert r.json()["visit_classified"] != "VERIFIED"


# ---------------- Scenario 10: Vendor unusually high daily sales -> Flags anomaly ----------------
def test_scenario_10_high_daily_sales_anomaly(client, vendor_a, admin_headers):
    # Set baseline: 4000 daily
    r_base = client.post("/api/vendor/baseline", json={
        "average_daily_sales": 4000.0,
        "average_daily_customers": 20.0,
        "average_monthly_sales": 120000.0,
        "baseline_type": "estimate"
    }, headers=vendor_a["headers"])
    assert r_base.status_code == 200

    # Log unusually high daily sales: 28,000 (over 6x baseline and > 20,000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r_sales = client.post("/api/vendor/daily-sales", json={
        "date": today,
        "total_sales": 28000.0,
        "customer_count": 80,
        "hyperlocal_customer_count": 30,
        "notes": "Huge festival rush"
    }, headers=vendor_a["headers"])
    assert r_sales.status_code == 200
    assert r_sales.json()["is_anomaly"] is True

    # Admin checks anomalies
    r_anom = client.get("/api/admin/attribution/anomalies", headers=admin_headers)
    assert r_anom.status_code == 200
    anomalies = r_anom.json()
    assert any(a.get("seller_id") == vendor_a["id"] for a in anomalies)


# ---------------- Security & Cross-Vendor Isolation ----------------
def test_security_cross_vendor_isolation(client, vendor_a, vendor_b, consumer_user):
    # Vendor B can access their own business impact
    r1 = client.get("/api/vendor/business-impact", headers=vendor_b["headers"])
    assert r1.status_code == 200
    assert "revenue" in r1.json()

    # Consumer cannot access vendor analytics
    r2 = client.get("/api/vendor/business-impact", headers=consumer_user["headers"])
    assert r2.status_code == 403

    # Consumer or Vendor cannot access admin attribution (returns 403 or stealth 404)
    r3 = client.get("/api/admin/business-impact", headers=vendor_a["headers"])
    assert r3.status_code in (403, 404)

    r4 = client.get("/api/admin/attribution/sessions", headers=consumer_user["headers"])
    assert r4.status_code in (403, 404)


# ---------------- Admin Attribution Management ----------------
def test_admin_attribution_crud(client, admin_headers, vendor_a):
    # Admin inspects platform business impact
    r_plat = client.get("/api/admin/business-impact", headers=admin_headers)
    assert r_plat.status_code == 200
    assert "disclaimer" in r_plat.json()
    assert "verified_visits" in r_plat.json()

    # Admin lists sessions
    r_sess = client.get("/api/admin/attribution/sessions", headers=admin_headers)
    assert r_sess.status_code == 200
    sessions = r_sess.json()
    assert isinstance(sessions, list)
    if sessions:
        sid = sessions[0]["session_id"]
        # Journey inspection
        r_detail = client.get(f"/api/admin/attribution/sessions/{sid}", headers=admin_headers)
        assert r_detail.status_code == 200
        assert "events" in r_detail.json()
        assert "session" in r_detail.json()

        # Admin patch session notes
        r_patch = client.patch(f"/api/admin/attribution/sessions/{sid}", json={
            "notes": "Verified by admin audit"
        }, headers=admin_headers)
        assert r_patch.status_code == 200
        assert r_patch.json()["notes"] == "Verified by admin audit"

    # Admin attribution config
    r_cfg = client.get("/api/admin/attribution/config", headers=admin_headers)
    assert r_cfg.status_code == 200
    cfg = r_cfg.json()
    assert "attribution_window_days" in cfg

    r_cfg_patch = client.patch("/api/admin/attribution/config", json={
        "attribution_window_days": 35
    }, headers=admin_headers)
    assert r_cfg_patch.status_code == 200
    assert r_cfg_patch.json()["attribution_window_days"] == 35


# ---------------- Admin Full Entity Editing Control ----------------
def test_admin_entity_editing_control(client, admin_headers, vendor_b, consumer_user):
    # 1. Edit User (Vendor)
    r_vpatch = client.patch(f"/api/admin/users/{vendor_b['id']}", json={
        "name": "Updated Vendor B Name",
        "shop_name": "Updated Vendor B Shop",
        "city": "Dehradun Central"
    }, headers=admin_headers)
    assert r_vpatch.status_code == 200
    assert r_vpatch.json()["name"] == "Updated Vendor B Name"
    assert r_vpatch.json()["shop_name"] == "Updated Vendor B Shop"

    # 2. Edit User (Consumer)
    r_cpatch = client.patch(f"/api/admin/users/{consumer_user['id']}", json={
        "name": "Updated Shopper Name"
    }, headers=admin_headers)
    assert r_cpatch.status_code == 200
    assert r_cpatch.json()["name"] == "Updated Shopper Name"

    # 3. Create & Edit Request
    r_req = client.post("/api/requests", json={
        "item": "Organic Lemons",
        "quantity": "2 kg",
        "category": "fruits",
        "note": "Need fresh"
    }, headers=consumer_user["headers"])
    assert r_req.status_code == 200
    req_id = r_req.json()["id"]

    r_req_patch = client.patch(f"/api/admin/requests/{req_id}", json={
        "item": "Organic Sweet Lemons",
        "quantity": "5 kg"
    }, headers=admin_headers)
    assert r_req_patch.status_code == 200
    assert r_req_patch.json()["item"] == "Organic Sweet Lemons"

    # 4. Create & Edit Review
    r_rev = client.post(f"/api/vendors/{vendor_b['id']}/reviews", json={
        "rating": 4,
        "comment": "Nice cart goods"
    }, headers=consumer_user["headers"])
    assert r_rev.status_code == 200

    r_rev_list = client.get("/api/admin/reviews", headers=admin_headers)
    assert r_rev_list.status_code == 200
    reviews = r_rev_list.json()
    my_review = next((r for r in reviews if r.get("vendor_id") == vendor_b["id"]), None)
    assert my_review is not None
    rev_id = my_review["id"]

    r_rev_patch = client.patch(f"/api/admin/reviews/{rev_id}", json={
        "rating": 5,
        "comment": "Outstanding goods & polite vendor"
    }, headers=admin_headers)
    assert r_rev_patch.status_code == 200
    assert r_rev_patch.json()["rating"] == 5
    assert r_rev_patch.json()["comment"] == "Outstanding goods & polite vendor"

    # 5. Order Patch & Delete
    # Create order via razorpay order creation
    r_ord = client.post("/api/payments/create-order", json={
        "plan": "monthly"
    }, headers=vendor_b["headers"])
    assert r_ord.status_code == 200
    ord_id = r_ord.json()["order_id"]

    r_ord_patch = client.patch(f"/api/admin/orders/{ord_id}", json={
        "status": "paid",
        "amount": 19900
    }, headers=admin_headers)
    assert r_ord_patch.status_code == 200
    assert r_ord_patch.json()["status"] == "paid"

    r_ord_del = client.delete(f"/api/admin/orders/{ord_id}", headers=admin_headers)
    assert r_ord_del.status_code == 200


# ---------------- Scenario G: Receipt OCR Extraction & Shopper Confirmation ----------------
def test_scenario_g_receipt_ocr_extraction_and_confirmation(client, vendor_a, consumer_user):
    receipt_text = f"""
    {vendor_a['shop_name'] if 'shop_name' in vendor_a else 'QA Vendor A Shop'}
    Rajpur Road, Dehradun
    Date: 2026-09-18
    Time: 14:30
    Organic Red Apples 120.00
    Fresh Bananas 60.00
    TOTAL AMOUNT: 180.00
    Payment: UPI
    """
    r_upload = client.post("/api/attribution/receipt/upload", json={
        "raw_text": receipt_text
    }, headers=consumer_user["headers"])
    assert r_upload.status_code == 200
    up_data = r_upload.json()
    assert up_data["receipt_id"].startswith("rcpt_")
    assert up_data["extracted"]["total_amount"] == 180.0
    assert up_data["matched_seller"]["id"] == vendor_a["id"]
    assert up_data["matched_seller"]["confidence"] > 0.8

    # Shopper confirms receipt
    r_confirm = client.post("/api/attribution/receipt/confirm", json={
        "receipt_id": up_data["receipt_id"],
        "seller_id": vendor_a["id"],
        "amount": 180.0,
        "spend_range": "101-250",
        "notes": "Verified receipt purchase",
    }, headers=consumer_user["headers"])
    assert r_confirm.status_code == 200
    conf_data = r_confirm.json()
    assert conf_data["ok"] is True
    assert conf_data["status"] == "purchase_attributed"
    assert conf_data["points_earned"] > 0

    # Receipts list
    r_list = client.get("/api/attribution/receipts", headers=consumer_user["headers"])
    assert r_list.status_code == 200
    assert len(r_list.json()) > 0


# ---------------- Scenario H: Price Alert Lifecycle & Notification ----------------
def test_scenario_h_price_alert_lifecycle(client, vendor_a, consumer_user):
    # 1. Vendor adds product
    r_prod = client.post("/api/vendor/products", json={
        "name": f"Alphonso Mangoes {uuid.uuid4().hex[:4]}",
        "price": 200.0,
        "category": "fruits",
        "in_stock": True,
    }, headers=vendor_a["headers"])
    assert r_prod.status_code == 200
    prod_id = r_prod.json()["id"]

    # 2. Consumer creates price drop alert
    r_alert = client.post("/api/alerts/price", json={
        "product_id": prod_id,
        "target_price": 150.0,
    }, headers=consumer_user["headers"])
    assert r_alert.status_code == 200
    alert_id = r_alert.json()["alert_id"]

    # 3. Check consumer alerts
    r_alerts = client.get("/api/alerts", headers=consumer_user["headers"])
    assert r_alerts.status_code == 200
    my_alert = next((a for a in r_alerts.json() if a.get("alert_id") == alert_id), None)
    assert my_alert is not None
    assert my_alert["target_price"] == 150.0

    # 4. Consumer clicks / opens alert -> creates HIGH intent session
    r_open = client.post("/api/attribution/alert-opened", json={
        "alert_id": alert_id,
        "product_id": prod_id,
        "seller_id": vendor_a["id"],
    }, headers=consumer_user["headers"])
    assert r_open.status_code == 200
    assert r_open.json()["intent_level"] == "HIGH"

    # 5. Vendor drops price below target -> triggers notification
    r_patch = client.patch(f"/api/vendor/products/{prod_id}", json={
        "price": 140.0
    }, headers=vendor_a["headers"])
    assert r_patch.status_code == 200

    # 6. Consumer checks notifications
    r_notif = client.get("/api/notifications", headers=consumer_user["headers"])
    assert r_notif.status_code == 200
    notifs = r_notif.json()
    price_notif = next((n for n in notifs if n.get("type") == "price_alert" and n.get("product_id") == prod_id), None)
    assert price_notif is not None

    # Mark notification read
    r_read = client.patch(f"/api/notifications/{price_notif['id']}/read", headers=consumer_user["headers"])
    assert r_read.status_code == 200

    # Clean up alert
    r_del = client.delete(f"/api/alerts/{alert_id}", headers=consumer_user["headers"])
    assert r_del.status_code == 200


# ---------------- Scenario I: Availability Alert & Restock Notification ----------------
def test_scenario_i_availability_alert(client, vendor_a, consumer_user):
    # 1. Vendor adds out of stock product
    r_prod = client.post("/api/vendor/products", json={
        "name": f"Kashmiri Walnuts {uuid.uuid4().hex[:4]}",
        "price": 450.0,
        "category": "dry_fruits",
        "in_stock": False,
    }, headers=vendor_a["headers"])
    assert r_prod.status_code == 200
    prod_id = r_prod.json()["id"]

    # 2. Consumer creates availability alert
    r_alert = client.post("/api/alerts/availability", json={
        "product_id": prod_id
    }, headers=consumer_user["headers"])
    assert r_alert.status_code == 200

    # 3. Vendor restocks
    r_patch = client.patch(f"/api/vendor/products/{prod_id}", json={
        "in_stock": True
    }, headers=vendor_a["headers"])
    assert r_patch.status_code == 200

    # 4. Consumer receives restock notification
    r_notif = client.get("/api/notifications", headers=consumer_user["headers"])
    assert r_notif.status_code == 200
    stock_notif = next((n for n in r_notif.json() if n.get("type") == "availability_alert" and n.get("product_id") == prod_id), None)
    assert stock_notif is not None


# ---------------- Scenario J: HyperLocal Trip Navigation Session ----------------
def test_scenario_j_hyperlocal_trip_navigation_session(client, vendor_a, consumer_user):
    # 1. Start trip navigation session
    r_start = client.post("/api/attribution/trip/start", json={
        "seller_id": vendor_a["id"],
        "destination_lat": 30.3165,
        "destination_lng": 78.0322,
    }, headers=consumer_user["headers"])
    assert r_start.status_code == 200
    trip_data = r_start.json()
    assert trip_data["trip_id"].startswith("trip_")
    trip_id = trip_data["trip_id"]

    # 2. Ping outside geofence
    r_ping1 = client.post("/api/attribution/trip/ping", json={
        "trip_id": trip_id,
        "lat": 30.3500,
        "lng": 78.0500,
    })
    assert r_ping1.status_code == 200
    assert r_ping1.json()["arrived"] is False

    # 3. Ping arrived within 30 meters
    r_ping2 = client.post("/api/attribution/trip/ping", json={
        "trip_id": trip_id,
        "lat": 30.3166,
        "lng": 78.0323,
    })
    assert r_ping2.status_code == 200
    assert r_ping2.json()["arrived"] is True

    # 4. End trip
    r_end = client.post("/api/attribution/trip/end", json={"trip_id": trip_id})
    assert r_end.status_code == 200
    assert r_end.json()["status"] == "completed"


# ---------------- Scenario K: Vendor One-Tap Possible Visits Confirmation ----------------
def test_scenario_k_vendor_one_tap_possible_visits(client, vendor_a, consumer_user):
    # Consumer signals high intent
    r_sig = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "contact_seller",
    }, headers=consumer_user["headers"])
    assert r_sig.status_code == 200
    session_id = r_sig.json()["session_id"]

    # Vendor checks possible visits
    r_visits = client.get("/api/vendor/possible-visits", headers=vendor_a["headers"])
    assert r_visits.status_code == 200
    visits_list = r_visits.json()
    matched = next((v for v in visits_list if v["session_id"] == session_id), None)
    assert matched is not None

    # Vendor confirms purchase with one tap
    r_confirm = client.post("/api/vendor/confirm-visit", json={
        "session_id": session_id,
        "action": "purchased",
        "amount": 260.0,
        "notes": "Store walk-in confirmed",
    }, headers=vendor_a["headers"])
    assert r_confirm.status_code == 200
    assert r_confirm.json()["action"] == "purchase_confirmed"


# ---------------- Scenario L: CSV Sales Batch Import & Anomaly Flagging ----------------
def test_scenario_l_csv_sales_batch_import_and_anomalies(client, vendor_a, admin_headers):
    csv_payload = """date,total_sales,customer_count,hyperlocal_customer_count,notes
2026-09-10,3500.0,22,5,Regular Monday
2026-09-11,4100.0,26,7,Busy Tuesday
2026-09-12,450000.0,30,8,Suspect High Spike
"""
    r_imp = client.post("/api/vendor/sales-import", json={
        "csv_text": csv_payload
    }, headers=vendor_a["headers"])
    assert r_imp.status_code == 200
    imp_data = r_imp.json()
    assert imp_data["imported_count"] == 3
    assert imp_data["anomalies_count"] == 1  # 450,000 is flagged > 300,000

    # Verify admin anomaly list has this flagged row
    r_anom = client.get("/api/admin/attribution/anomalies", headers=admin_headers)
    assert r_anom.status_code == 200
    anomalies = r_anom.json()
    spike = next((a for a in anomalies if a.get("seller_id") == vendor_a["id"] and a.get("amount") == 450000.0), None)
    assert spike is not None


# ---------------- Scenario M: Super Admin Global Search ----------------
def test_scenario_m_super_admin_global_search(client, vendor_a, consumer_user, admin_headers):
    # Search for Anita
    r_search1 = client.get("/api/admin/global-search?q=Anita", headers=admin_headers)
    assert r_search1.status_code == 200
    res1 = r_search1.json()["results"]
    user_match = next((u for u in res1["users"] if "Anita" in u.get("name", "")), None)
    assert user_match is not None
    # Privacy verification: email and phone masked
    assert "@" in user_match["email_masked"]
    assert "*" in user_match["email_masked"]

    # Search for Vendor A
    r_search2 = client.get("/api/admin/global-search?q=Vendor", headers=admin_headers)
    assert r_search2.status_code == 200
    res2 = r_search2.json()["results"]
    assert len(res2["users"]) > 0


# ---------------- Scenario N: Super Admin User Full Profile Inspection ----------------
def test_scenario_n_super_admin_user_full_profile(client, vendor_a, consumer_user, admin_headers):
    # Consumer profile
    r_cp = client.get(f"/api/admin/users/{consumer_user['id']}/full-profile", headers=admin_headers)
    assert r_cp.status_code == 200
    cp_data = r_cp.json()
    assert cp_data["role"] == "consumer"
    assert "*" in cp_data["user"]["email_masked"]
    assert "activity" in cp_data

    # Vendor profile
    r_vp = client.get(f"/api/admin/users/{vendor_a['id']}/full-profile", headers=admin_headers)
    assert r_vp.status_code == 200
    vp_data = r_vp.json()
    assert vp_data["role"] == "vendor"
    assert vp_data["vendor_stats"] is not None
    assert "quality_score" in vp_data["vendor_stats"]


# ---------------- Scenario O: Sensitive Data Masking & Reveal Action Audit ----------------
def test_scenario_o_sensitive_data_masking_and_reveal_audit(client, consumer_user, admin_headers):
    # Attempt reveal without administrative reason -> 400
    r_fail = client.post("/api/admin/audit/reveal", json={
        "entity_type": "user",
        "entity_id": consumer_user["id"],
        "field": "email",
        "reason": "",
    }, headers=admin_headers)
    assert r_fail.status_code in (400, 422)

    # Reveal with valid reason
    r_ok = client.post("/api/admin/audit/reveal", json={
        "entity_type": "user",
        "entity_id": consumer_user["id"],
        "field": "email",
        "reason": "Investigating disputed delivery complaint",
    }, headers=admin_headers)
    assert r_ok.status_code == 200
    reveal_data = r_ok.json()
    assert reveal_data["ok"] is True
    assert reveal_data["value"] == consumer_user["email"]

    # Verify audit log recorded
    r_logs = client.get("/api/admin/audit-logs", headers=admin_headers)
    assert r_logs.status_code == 200
    logs = r_logs.json()["logs"]
    my_log = next((l for l in logs if l.get("action") == "reveal_sensitive_data" and l.get("entity_id") == consumer_user["id"]), None)
    assert my_log is not None
    assert my_log["reason"] == "Investigating disputed delivery complaint"


# ---------------- Scenario P: Super Admin Impersonation Session ----------------
def test_scenario_p_super_admin_impersonation(client, vendor_a, admin_headers):
    r_imp = client.post(f"/api/admin/impersonate/{vendor_a['id']}", headers=admin_headers)
    assert r_imp.status_code == 200
    imp_data = r_imp.json()
    assert imp_data["impersonated"] is True
    assert imp_data["token"] is not None

    # Check audit log
    r_logs = client.get("/api/admin/audit-logs?action=impersonate_user", headers=admin_headers)
    assert r_logs.status_code == 200
    logs = r_logs.json()["logs"]
    assert len(logs) > 0


# ---------------- Scenario Q: Admin Attribution Dispute Resolution ----------------
def test_scenario_q_admin_dispute_resolution(client, vendor_a, admin_headers):
    # Create attribution session
    r1 = client.post("/api/attribution/event", json={
        "seller_id": vendor_a["id"],
        "event_type": "directions_clicked",
    })
    session_id = r1.json()["session_id"]

    # Admin dispute resolution
    r_disp = client.post(f"/api/admin/attribution/sessions/{session_id}/resolve-dispute", json={
        "action": "approve",
        "new_status": "verified_visit",
        "justification": "Customer provided valid physical receipt copy via support",
    }, headers=admin_headers)
    assert r_disp.status_code == 200
    assert r_disp.json()["new_status"] == "verified_visit"

    # Verify audit log
    r_logs = client.get("/api/admin/audit-logs?action=attribution_dispute_resolved", headers=admin_headers)
    assert r_logs.status_code == 200
    assert len(r_logs.json()["logs"]) > 0


# ---------------- Scenario R: Admin Bulk Operations ----------------
def test_scenario_r_admin_bulk_actions(client, vendor_a, vendor_b, admin_headers):
    r_bulk = client.post("/api/admin/bulk-action", json={
        "entity": "vendors",
        "ids": [vendor_a["id"], vendor_b["id"]],
        "action": "verify",
    }, headers=admin_headers)
    assert r_bulk.status_code == 200
    assert r_bulk.json()["action"] == "verify"

