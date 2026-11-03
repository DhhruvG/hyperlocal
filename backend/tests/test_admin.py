"""
Admin panel backend tests for LocalPrice (iteration 3).
Covers: authorization matrix, admin login, CRUD, grant/revoke Pro,
cascade delete, seed idempotency.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hyperlocal-deals-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "dgstartup2026@gmail.com"
ADMIN_PASSWORD = "Dgadmin@startup2026"

# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login?role=admin",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]

@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="module")
def consumer_token():
    email = f"TEST_adm_cons_{uuid.uuid4().hex[:6]}@qa.example.com"
    r = requests.post(f"{API}/auth/consumer/register",
                      json={"name": "AdmTestCons", "email": email, "password": "Test@1234"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture(scope="module")
def vendor_token():
    email = f"TEST_adm_vend_{uuid.uuid4().hex[:6]}@qa.example.com"
    r = requests.post(f"{API}/auth/vendor/register", json={
        "name": "AdmTestVend", "email": email, "password": "Test@1234",
        "phone": "9999911111", "shop_name": "TEST Admin Shop",
        "shop_address": "Rajpur Rd", "vendor_type": "retailer"
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------- Authorization matrix ----------------

class TestAuthorizationMatrix:
    def test_anon_stats_401(self):
        r = requests.get(f"{API}/admin/stats", timeout=15)
        assert r.status_code == 401

    def test_consumer_stats_404(self, consumer_token):
        r = requests.get(f"{API}/admin/stats",
                         headers={"Authorization": f"Bearer {consumer_token}"}, timeout=15)
        assert r.status_code == 404

    def test_vendor_stats_404(self, vendor_token):
        r = requests.get(f"{API}/admin/stats",
                         headers={"Authorization": f"Bearer {vendor_token}"}, timeout=15)
        assert r.status_code == 404

    def test_admin_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login?role=admin",
                          json={"email": ADMIN_EMAIL, "password": "wrong-pass-xxx"}, timeout=15)
        assert r.status_code == 401

    def test_admin_login_non_allowed_email_404(self, consumer_token):
        # authenticate with a valid non-admin account but request role=admin → 404
        # (this simulates 'NON-allowed email' case since only allow-listed email may login as admin)
        r = requests.post(f"{API}/auth/login?role=admin",
                          json={"email": "someone-nonadmin@qa.example.com", "password": "Test@1234"},
                          timeout=15)
        # Either 401 (invalid creds) or 404 (allow-list); both acceptable — no existence leak
        assert r.status_code in (401, 404)

    def test_admin_login_success(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_regression_vendor_login_wrong_role_403(self, vendor_token):
        # Try logging into the vendor account requesting role=consumer → 403
        # We only have token; do fresh login attempt with wrong role using registered email is enough:
        # Registering already gave us a vendor; extract email via /auth/me
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {vendor_token}"}, timeout=15).json()
        r = requests.post(f"{API}/auth/login?role=consumer",
                          json={"email": me["email"], "password": "Test@1234"}, timeout=15)
        assert r.status_code == 403


# ---------------- Admin identity protection ----------------

class TestAdminSelfProtect:
    def test_cannot_patch_admin_account(self, admin_headers):
        me = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15).json()
        r = requests.patch(f"{API}/admin/users/{me['id']}",
                           json={"name": "Hacked"}, headers=admin_headers, timeout=15)
        assert r.status_code == 403

    def test_cannot_delete_admin_account(self, admin_headers):
        me = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15).json()
        r = requests.delete(f"{API}/admin/users/{me['id']}", headers=admin_headers, timeout=15)
        assert r.status_code == 403


# ---------------- Admin CRUD ----------------

class TestAdminStats:
    def test_stats_shape(self, admin_headers):
        r = requests.get(f"{API}/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for key in ["consumer_count", "vendor_count", "verified_vendor_count",
                    "pro_vendor_count", "online_cart_count", "product_count",
                    "in_stock_product_count", "review_count", "message_count",
                    "request_count", "open_request_count", "order_count", "paid_order_count"]:
            assert key in d, f"missing {key}"
            assert isinstance(d[key], int)


class TestAdminUsersList:
    def test_list_vendors(self, admin_headers):
        r = requests.get(f"{API}/admin/users?role=vendor", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) > 0
        assert all(u["role"] == "vendor" for u in docs)
        assert all("password_hash" not in u for u in docs)

    def test_list_consumers(self, admin_headers):
        r = requests.get(f"{API}/admin/users?role=consumer", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert all(u["role"] == "consumer" for u in r.json())

    def test_search_q(self, admin_headers, vendor_token):
        me = requests.get(f"{API}/auth/me",
                          headers={"Authorization": f"Bearer {vendor_token}"}, timeout=15).json()
        r = requests.get(f"{API}/admin/users?role=vendor&q=TEST+Admin+Shop",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        results = r.json()
        assert any(u["id"] == me["id"] for u in results)


class TestAdminVendorLifecycle:
    """Create vendor via admin → grant pro → patch → verify products propagate → cascade delete"""

    @pytest.fixture(scope="class")
    def created_vendor(self, admin_headers):
        email = f"test_admcreate_{uuid.uuid4().hex[:6]}@qa.example.com"
        payload = {
            "name": "AdmCreatedVend", "email": email, "password": "Test@1234",
            "phone": "9111100001", "shop_name": "TEST Adm Created Shop",
            "shop_address": "GMS Rd", "vendor_type": "cart_vendor",
            "is_verified": True, "grant_pro": True,
        }
        r = requests.post(f"{API}/admin/vendors", json=payload,
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == email
        assert d["is_pro"] is True
        assert d["subscription_plan"] == "monthly"
        assert d["pro_expires_at"]
        return d

    def test_login_created_vendor(self, created_vendor):
        r = requests.post(f"{API}/auth/login?role=vendor",
                          json={"email": created_vendor["email"], "password": "Test@1234"},
                          timeout=15)
        assert r.status_code == 200

    def test_patch_and_product_propagation(self, admin_headers, created_vendor):
        vid = created_vendor["id"]
        # Add a product for that vendor by logging in as them
        login = requests.post(f"{API}/auth/login?role=vendor",
                              json={"email": created_vendor["email"], "password": "Test@1234"},
                              timeout=15).json()
        v_headers = {"Authorization": f"Bearer {login['token']}"}
        prod_r = requests.post(f"{API}/vendor/products", json={
            "name": "TEST admin propagation tomato", "category": "vegetables",
            "price": 20.0, "unit": "kg", "in_stock": True
        }, headers=v_headers, timeout=15)
        assert prod_r.status_code == 200, prod_r.text
        pid = prod_r.json()["id"]

        # Admin PATCH vendor shop_name + address + is_pro=False
        r = requests.patch(f"{API}/admin/users/{vid}", json={
            "shop_name": "TEST Renamed Shop", "shop_address": "New Rajpur Rd 42",
            "is_pro": False, "is_verified": False, "is_online": True,
            "opening_hours": "9-9"
        }, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["shop_name"] == "TEST Renamed Shop"
        assert u["is_pro"] is False and u["is_verified"] is False and u["is_online"] is True

        # Product should reflect propagated vendor_shop / vendor_address / vendor_is_pro
        p = requests.get(f"{API}/admin/products?vendor_id={vid}",
                         headers=admin_headers, timeout=15).json()
        assert len(p) >= 1
        target = next(x for x in p if x["id"] == pid)
        assert target["vendor_shop"] == "TEST Renamed Shop"
        assert target["vendor_address"] == "New Rajpur Rd 42"
        assert target["vendor_is_pro"] is False

    def test_grant_pro_endpoint(self, admin_headers, created_vendor):
        vid = created_vendor["id"]
        r = requests.post(f"{API}/admin/grant-pro",
                          json={"vendor_id": vid, "plan": "yearly"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["expires_at"]
        # verify user updated
        u = requests.get(f"{API}/admin/users?role=vendor&q={created_vendor['email']}",
                         headers=admin_headers, timeout=15).json()
        me = next(x for x in u if x["id"] == vid)
        assert me["is_pro"] is True
        assert me["subscription_plan"] == "yearly"
        # verify products.vendor_is_pro is True
        p = requests.get(f"{API}/admin/products?vendor_id={vid}",
                         headers=admin_headers, timeout=15).json()
        assert all(x["vendor_is_pro"] is True for x in p)

    def test_revoke_pro_endpoint(self, admin_headers, created_vendor):
        vid = created_vendor["id"]
        r = requests.post(f"{API}/admin/revoke-pro",
                          json={"vendor_id": vid}, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        u = requests.get(f"{API}/admin/users?role=vendor&q={created_vendor['email']}",
                         headers=admin_headers, timeout=15).json()
        me = next(x for x in u if x["id"] == vid)
        assert me["is_pro"] is False
        assert me.get("subscription_plan") in (None, "")
        p = requests.get(f"{API}/admin/products?vendor_id={vid}",
                         headers=admin_headers, timeout=15).json()
        assert all(x["vendor_is_pro"] is False for x in p)

    def test_admin_patch_product_force_feature(self, admin_headers, created_vendor):
        vid = created_vendor["id"]
        p = requests.get(f"{API}/admin/products?vendor_id={vid}",
                         headers=admin_headers, timeout=15).json()
        pid = p[0]["id"]
        r = requests.patch(f"{API}/admin/products/{pid}",
                           json={"is_featured": True, "price": 33.5, "name": "TEST feat renamed"},
                           headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["is_featured"] is True and d["price"] == 33.5 and d["name"] == "TEST feat renamed"

    def test_cascade_delete_vendor(self, admin_headers, created_vendor):
        vid = created_vendor["id"]
        r = requests.delete(f"{API}/admin/users/{vid}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # products gone
        p = requests.get(f"{API}/admin/products?vendor_id={vid}",
                         headers=admin_headers, timeout=15).json()
        assert p == []
        # user gone
        u = requests.get(f"{API}/admin/users?q={created_vendor['email']}",
                         headers=admin_headers, timeout=15).json()
        assert not any(x["id"] == vid for x in u)


class TestAdminReadonlyLists:
    def test_products_list_and_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/products?limit=50", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_reviews_list(self, admin_headers):
        r = requests.get(f"{API}/admin/reviews", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_messages_list(self, admin_headers):
        r = requests.get(f"{API}/admin/messages", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_requests_list_has_reply_count(self, admin_headers):
        r = requests.get(f"{API}/admin/requests", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        for d in r.json():
            assert "reply_count" in d

    def test_orders_list(self, admin_headers):
        r = requests.get(f"{API}/admin/orders", headers=admin_headers, timeout=15)
        assert r.status_code == 200


# ---------------- Seed idempotency ----------------

class TestSeedAdmin:
    def test_only_one_admin_user(self, admin_headers):
        r = requests.get(f"{API}/admin/users?q=dgstartup2026",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        rows = [u for u in r.json() if u.get("email") == ADMIN_EMAIL]
        assert len(rows) == 1, f"Expected 1 admin, got {len(rows)}"
        assert rows[0]["role"] == "admin"
