"""Tests for iteration 3: Grievance Redressal + AI Assistant + Knowledge Base."""
import os
import io
import time
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://hyperlocal-deals-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "dgstartup2026@gmail.com"
ADMIN_PASS = "Dgadmin@startup2026"

UID = uuid.uuid4().hex[:8]
CONSUMER_EMAIL = f"grv_c_{UID}@qa.example.com"
CONSUMER_PASS = "Test@1234"
VENDOR_EMAIL = f"grv_v_{UID}@qa.example.com"
VENDOR_PASS = "Test@1234"


# ---------- Session-scoped clients & fixtures ----------
@pytest.fixture(scope="session")
def s_consumer():
    s = requests.Session()
    # Register
    r = s.post(f"{API}/auth/consumer/register", json={
        "email": CONSUMER_EMAIL, "password": CONSUMER_PASS, "name": "QA Consumer",
    })
    assert r.status_code in (200, 201, 400, 409), r.text
    # Login
    r = s.post(f"{API}/auth/login", json={"email": CONSUMER_EMAIL, "password": CONSUMER_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def s_vendor():
    s = requests.Session()
    r = s.post(f"{API}/auth/vendor/register", json={
        "email": VENDOR_EMAIL, "password": VENDOR_PASS, "name": "QA Vendor",
        "shop_name": "QA Kirana", "vendor_type": "retailer", "city": "Dehradun",
        "phone": "9999999999", "shop_address": "Dehradun main road",
    })
    assert r.status_code in (200, 201, 400, 409), r.text
    r = s.post(f"{API}/auth/login", json={"email": VENDOR_EMAIL, "password": VENDOR_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def s_admin():
    s = requests.Session()
    # Try admin login endpoint variants
    for path in ["/auth/admin/login", "/admin/login", "/auth/login"]:
        r = s.post(f"{API}{path}", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        if r.status_code == 200:
            tok = r.json().get("access_token") or r.json().get("token")
            if tok:
                s.headers["Authorization"] = f"Bearer {tok}"
            return s
    pytest.skip("Admin login failed on all endpoints")


# ---------- Regression smoke ----------
class TestRegression:
    def test_categories(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        assert len(r.json()) >= 10

    def test_vendors(self):
        r = requests.get(f"{API}/vendors")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_today_prices(self):
        r = requests.get(f"{API}/discover/today-prices")
        assert r.status_code == 200

    def test_popular(self):
        r = requests.get(f"{API}/discover/popular?limit=8")
        assert r.status_code == 200
        assert len(r.json()) <= 8

    def test_search(self):
        r = requests.get(f"{API}/search", params={"q": "tomato"})
        assert r.status_code == 200


# ---------- Grievance ----------
class TestGrievance:
    gid = None
    grv_number = None

    def test_create_urgent_downgraded(self, s_consumer):
        payload = {
            "category": "Price", "subject": "Overcharged for tomatoes",
            "description": "The vendor charged double the listed price for tomatoes today morning.",
            "priority": "urgent",
        }
        r = s_consumer.post(f"{API}/grievances", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["priority"] == "high", f"urgent should downgrade to high, got {data['priority']}"
        assert data["grievance_number"].startswith("HL-GRV-")
        assert data["status"] == "open"
        TestGrievance.gid = data["id"]
        TestGrievance.grv_number = data["grievance_number"]

    def test_mine_only_own(self, s_consumer, s_vendor):
        r1 = s_consumer.get(f"{API}/grievances/mine")
        assert r1.status_code == 200
        assert any(g["id"] == TestGrievance.gid for g in r1.json())
        # Vendor should not see consumer's grievance in their mine
        r2 = s_vendor.get(f"{API}/grievances/mine")
        assert r2.status_code == 200
        assert not any(g.get("id") == TestGrievance.gid for g in r2.json())

    def test_detail_non_owner_404(self, s_vendor):
        r = s_vendor.get(f"{API}/grievances/{TestGrievance.gid}")
        assert r.status_code == 404

    def test_detail_owner(self, s_consumer):
        r = s_consumer.get(f"{API}/grievances/{TestGrievance.gid}")
        assert r.status_code == 200
        data = r.json()
        for k in ("grievance", "messages", "history", "evidence"):
            assert k in data
        # Non-admin: internal_notes should be empty
        assert data.get("internal_notes") == [] or data.get("internal_notes") is None or data.get("internal_notes") == []

    def test_message_marks_admin_unread(self, s_consumer):
        r = s_consumer.post(f"{API}/grievances/{TestGrievance.gid}/messages",
                            json={"body": "Adding more details"})
        assert r.status_code == 200

    def test_evidence_invalid_type(self, s_consumer):
        files = {"file": ("bad.exe", b"MZ\x00", "application/x-msdownload")}
        r = s_consumer.post(f"{API}/grievances/{TestGrievance.gid}/evidence", files=files)
        assert r.status_code == 400

    def test_evidence_too_large(self, s_consumer):
        big = b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024)
        files = {"file": ("big.png", big, "image/png")}
        r = s_consumer.post(f"{API}/grievances/{TestGrievance.gid}/evidence", files=files)
        assert r.status_code == 400

    def test_evidence_upload_valid(self, s_consumer):
        # Minimal PNG
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        )
        files = {"file": ("evidence.png", png, "image/png")}
        r = s_consumer.post(f"{API}/grievances/{TestGrievance.gid}/evidence", files=files)
        # 200 if storage available, 503 if not
        assert r.status_code in (200, 503), r.text


# ---------- Admin Grievance ----------
class TestAdminGrievance:
    def test_list_grievances(self, s_admin):
        r = s_admin.get(f"{API}/admin/grievances")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_non_admin_404(self, s_consumer):
        r = s_consumer.get(f"{API}/admin/grievances")
        assert r.status_code in (403, 404)

    def test_stats(self, s_admin):
        r = s_admin.get(f"{API}/admin/grievances/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ("total", "open", "overdue", "by_category", "satisfaction_rate"):
            assert k in data, f"missing {k}"

    def test_patch_and_history(self, s_admin, s_consumer):
        gid = TestGrievance.gid
        r = s_admin.patch(f"{API}/admin/grievances/{gid}",
                          json={"status": "waiting_for_user", "reason": "Need more info"})
        assert r.status_code == 200
        # user_unread should be true now — verify by consumer detail returning grievance
        r2 = s_consumer.get(f"{API}/grievances/{gid}")
        assert r2.status_code == 200
        # history should contain the transition
        hist = r2.json()["history"]
        assert any(h.get("new_status") == "waiting_for_user" for h in hist)

    def test_internal_note_hidden_from_user(self, s_admin, s_consumer):
        gid = TestGrievance.gid
        r = s_admin.post(f"{API}/admin/grievances/{gid}/notes",
                         json={"note": "Internal admin note - do not share"})
        assert r.status_code == 200
        r2 = s_consumer.get(f"{API}/grievances/{gid}")
        assert r2.status_code == 200
        notes = r2.json().get("internal_notes") or []
        assert notes == [] or all("Internal admin note" not in (n.get("note", "")) for n in notes)

    def test_admin_sees_internal_notes(self, s_admin):
        gid = TestGrievance.gid
        r = s_admin.get(f"{API}/grievances/{gid}")
        assert r.status_code == 200
        notes = r.json().get("internal_notes") or []
        assert any("Internal admin note" in (n.get("note", "")) for n in notes)

    def test_resolve_and_reopen(self, s_admin, s_consumer, s_vendor):
        gid = TestGrievance.gid
        r = s_admin.post(f"{API}/admin/grievances/{gid}/resolve",
                         json={"resolution_type": "refund_arranged", "summary": "Refund arranged with vendor."})
        assert r.status_code == 200
        # Non-owner cannot reopen
        r_bad = s_vendor.post(f"{API}/grievances/{gid}/reopen", json={"reason": "Trying to reopen"})
        assert r_bad.status_code in (403, 404)
        # Owner can reopen
        r_ok = s_consumer.post(f"{API}/grievances/{gid}/reopen",
                                json={"reason": "Refund not actually received"})
        assert r_ok.status_code == 200

    def test_feedback_upsert(self, s_admin, s_consumer):
        gid = TestGrievance.gid
        # Re-resolve to allow feedback semantics
        s_admin.post(f"{API}/admin/grievances/{gid}/resolve",
                     json={"resolution_type": "closed", "summary": "Final resolution."})
        r = s_consumer.post(f"{API}/grievances/{gid}/feedback",
                            json={"satisfied": True, "comment": "Thanks"})
        assert r.status_code == 200
        # Upsert: send again
        r2 = s_consumer.post(f"{API}/grievances/{gid}/feedback",
                             json={"satisfied": False, "comment": "Changed mind"})
        assert r2.status_code == 200


# ---------- AI ----------
class TestAI:
    def test_unauth_chat(self):
        r = requests.post(f"{API}/ai/chat-simple",
                          json={"session_id": "x", "message": "hi"})
        assert r.status_code in (401, 403)

    def test_consumer_chat_and_history(self, s_consumer):
        sid = f"qa-{uuid.uuid4().hex[:6]}"
        r = s_consumer.post(f"{API}/ai/chat-simple",
                            json={"session_id": sid, "message": "How do I file a grievance?"},
                            timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("reply"), "empty reply"
        # History
        h = s_consumer.get(f"{API}/ai/history", params={"session_id": sid})
        assert h.status_code == 200
        msgs = h.json()
        assert len(msgs) >= 2
        # Delete history
        d = s_consumer.delete(f"{API}/ai/history", params={"session_id": sid})
        assert d.status_code == 200
        h2 = s_consumer.get(f"{API}/ai/history", params={"session_id": sid})
        assert h2.json() == []

    def test_triage(self, s_consumer):
        r = s_consumer.post(f"{API}/ai/triage",
                            json={"description": "The vendor refused to sell at listed price and shouted at me."},
                            timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data["category"] in [
            "Account & Login", "Product", "Price", "Availability", "Seller", "Consumer",
            "Mobile Vendor", "Chat", "Review", "Verification", "Location",
            "Privacy", "Fraud", "Harassment / Abuse", "Technical", "Safety", "Other",
        ]
        assert data["priority"] in ("low", "medium", "high", "urgent")
        assert data.get("subject")

    def test_hindi_response(self, s_consumer):
        sid = f"hindi-{uuid.uuid4().hex[:6]}"
        r = s_consumer.post(f"{API}/ai/chat-simple",
                            json={"session_id": sid, "message": "मुझे टमाटर कहाँ मिलेगा?"},
                            timeout=60)
        assert r.status_code == 200
        reply = r.json().get("reply", "")
        # Contains at least one Devanagari char
        assert any(0x0900 <= ord(c) <= 0x097F for c in reply), f"expected Devanagari, got: {reply[:200]}"

    def test_ra_grievance_count(self, s_consumer):
        sid = f"ra-{uuid.uuid4().hex[:6]}"
        r = s_consumer.post(f"{API}/ai/chat-simple",
                            json={"session_id": sid, "message": "Show me my grievances status"},
                            timeout=60)
        assert r.status_code == 200
        # should have used context
        assert r.json().get("used_context") is True

    def test_admin_summarize_grievance(self, s_admin):
        gid = TestGrievance.gid
        sid = f"adm-{uuid.uuid4().hex[:6]}"
        r = s_admin.post(f"{API}/ai/chat-simple",
                         json={"session_id": sid, "message": "Summarize this case",
                               "context": {"grievance_id": gid}},
                         timeout=60)
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "")
        # Should reference the grievance number
        assert TestGrievance.grv_number in reply or "HL-GRV-" in reply, f"reply lacks grv number: {reply[:300]}"


# ---------- Knowledge Base ----------
class TestKB:
    doc_id = None

    def test_list_seeded(self, s_admin):
        r = s_admin.get(f"{API}/admin/knowledge")
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_non_admin_denied(self, s_consumer):
        r = s_consumer.get(f"{API}/admin/knowledge")
        assert r.status_code in (403, 404)

    def test_crud(self, s_admin):
        r = s_admin.post(f"{API}/admin/knowledge", json={
            "title": "TEST_ QA Article", "category": "QA",
            "content": "Content body for QA test", "status": "published",
        })
        assert r.status_code == 200
        TestKB.doc_id = r.json()["id"]
        # Patch
        r2 = s_admin.patch(f"{API}/admin/knowledge/{TestKB.doc_id}", json={
            "title": "TEST_ QA Article Updated", "category": "QA",
            "content": "Updated body", "status": "published",
        })
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_ QA Article Updated"
        # Delete
        r3 = s_admin.delete(f"{API}/admin/knowledge/{TestKB.doc_id}")
        assert r3.status_code == 200


# ---------- Security ----------
class TestSecurity:
    def test_consumer_cannot_patch_admin(self, s_consumer):
        r = s_consumer.patch(f"{API}/admin/grievances/{TestGrievance.gid}",
                             json={"status": "under_review"})
        assert r.status_code in (403, 404)

    def test_consumer_cannot_create_kb(self, s_consumer):
        r = s_consumer.post(f"{API}/admin/knowledge",
                            json={"title": "x", "category": "y", "content": "z"})
        assert r.status_code in (403, 404)
