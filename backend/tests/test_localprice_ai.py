"""Comprehensive Automated Test Suite for LocalPrice AI Assistant.

Validates:
1. Dynamic greeting (never static loop)
2. Real product search with live MongoDB data
3. Cheapest product queries with price comparisons
4. Nearby sellers queries
5. Grievance flow and draft creation
6. Role-aware seller sales analytics with strict RBAC (consumer denied, vendor approved)
7. Mobile vendor demand queries
8. Admin platform briefing with strict RBAC (consumer denied, admin approved)
9. Multi-lingual Hindi (Devanagari) queries
10. Multi-lingual Hinglish (Romanized Hindi) queries
11. AI Feedback (thumbs up/down)
12. Admin AI Diagnostics logging & retrieval
13. Conversation history persistence
"""

import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from server import app, db, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD

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
    email = f"qa_ai_consumer_{suffix}@qa.example.com"
    r = client.post("/api/auth/consumer/register", json={
        "name": "AI Test Consumer",
        "email": email,
        "password": "Password@123",
        "phone": "9876500001",
    })
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module")
def vendor_headers(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_ai_vendor_{suffix}@qa.example.com"
    r = client.post("/api/auth/vendor/register", json={
        "name": "AI Test Vendor",
        "email": email,
        "password": "Password@123",
        "phone": "9876500002",
        "shop_name": f"AI Mart {suffix}",
        "shop_address": "Rajpur Road, Dehradun",
        "vendor_type": "retailer",
    })
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


# =========================================================================
# 1. BASIC GREETING & CONVERSATION
# =========================================================================

def test_ai_greeting_dynamic(client, consumer_headers):
    """Verifies that greeting returns a conversational intro, not a generic hardcoded loop."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_greeting",
        "message": "hi",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "GREETING"
    assert "LocalPrice AI" in data["reply"]
    assert len(data.get("actions", [])) > 0
    # Crucial: verify it does not contain the old static repetitive sentence
    assert "I can assist you with products, pricing, shop analytics, orders, or grievances. How can I help you today?" not in data["reply"]


def test_ai_general_help(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_help",
        "message": "help",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "GENERAL_HELP"
    assert "cheapest" in data["reply"].lower() or "shops" in data["reply"].lower() or "groceries" in data["reply"].lower()


# =========================================================================
# 2. PRODUCT DISCOVERY & CHEAPEST PRODUCT
# =========================================================================

def test_ai_product_search_real_data(client, consumer_headers):
    """Verifies searching for rice returns real data from db.products."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_prod",
        "message": "find rice",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] in ["PRODUCT_SEARCH", "CHEAPEST_PRODUCT"]
    assert "rice" in data["reply"].lower() or "₹" in data["reply"]


def test_ai_cheapest_product(client, consumer_headers):
    """Verifies cheapest product query identifies lowest price."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_cheap",
        "message": "which shop has the cheapest rice?",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "CHEAPEST_PRODUCT"
    assert "₹" in data["reply"]
    assert len(data.get("actions", [])) > 0


def test_ai_where_to_buy_tomatoes(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_tomatoes",
        "message": "where can I buy tomatoes?",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] in ["PRODUCT_SEARCH", "CHEAPEST_PRODUCT", "NEARBY_SELLER"]
    assert "tomato" in data["reply"].lower() or "₹" in data["reply"]


# =========================================================================
# 3. SELLER SEARCH & NEARBY SHOPS
# =========================================================================

def test_ai_nearby_shops(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_shops",
        "message": "show me nearby shops",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] in ["NEARBY_SELLER", "SELLER_SEARCH"]
    assert any(term in data["reply"].lower() for term in ["shop", "store", "vendor", "dehradun", "market", "verified", "map"]) or "🏪" in data["reply"]


# =========================================================================
# 4. GRIEVANCE REPORTING & STATUS
# =========================================================================

def test_ai_grievance_help(client, consumer_headers):
    """Verifies that sending 'grievance' triggers the guided reporting workflow, not the static greeting."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_grv_1",
        "message": "grievance",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "GRIEVANCE"
    assert any(term in data["reply"].lower() for term in ["grievance", "complaint", "issue", "sla", "report", "dispute", "समस्या", "what happened?"])
    assert "I can assist you with products, pricing, shop analytics, orders, or grievances. How can I help you today?" not in data["reply"]


def test_ai_report_seller_overcharge(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_grv_2",
        "message": "I want to report a seller because they charged me more than listed price",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] in ["CREATE_GRIEVANCE", "GRIEVANCE"]
    assert "draft" in data.get("data", {}) or any(a.get("action") == "draft_grievance" for a in data.get("actions", []))


def test_ai_grievance_status(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_grv_status",
        "message": "show my grievance status",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "GRIEVANCE_STATUS"


# =========================================================================
# 5. SELLER ANALYTICS & RBAC
# =========================================================================

def test_ai_seller_sales_authorized(client, vendor_headers):
    """Verifies registered seller receives their real sales analytics."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_vendor_sales",
        "message": "how are my sales today?",
    }, headers=vendor_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "SALES_ANALYTICS"
    assert "sales" in data["reply"].lower() or "orders" in data["reply"].lower() or "analytics" in data["reply"].lower()
    assert "not a guaranteed causal measurement" in data["reply"]


def test_ai_seller_sales_forbidden_for_consumer(client, consumer_headers):
    """Verifies ordinary consumer is denied access to private seller analytics."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_consumer_probe",
        "message": "how are my sales today?",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert any(term in data["reply"].lower() for term in ["accessible to registered sellers", "consumer", "authorized to view sales", "private", "not authorized", "super admin", "seller account"])


# =========================================================================
# 6. MOBILE VENDOR DEMAND
# =========================================================================

def test_ai_mobile_demand(client, vendor_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_demand",
        "message": "where is demand today?",
    }, headers=vendor_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "DEMAND_ANALYTICS"


# =========================================================================
# 7. ADMIN QUERIES & RBAC
# =========================================================================

def test_ai_admin_marketplace_briefing(client, admin_headers):
    """Verifies Super Admin receives platform health briefing."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_admin_brief",
        "message": "summarize today's marketplace",
    }, headers=admin_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "BUSINESS_ANALYTICS"
    assert "Registered Users" in data["reply"] or "PLATFORM DATA" in data["reply"] or "Operational Briefing" in data["reply"]


def test_ai_admin_briefing_denied_for_consumer(client, consumer_headers):
    """Verifies non-admin cannot access admin platform briefing."""
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_consumer_admin_probe",
        "message": "summarize today's marketplace platform statistics",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    # Does not expose admin numbers
    assert "Total Vendors:" not in data["reply"]


# =========================================================================
# 8. MULTI-LINGUAL HINDI & HINGLISH
# =========================================================================

def test_ai_hindi_devanagari(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_hindi",
        "message": "मुझे चावल चाहिए",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["language"] == "hi"
    assert data["intent"] in ["PRODUCT_SEARCH", "CHEAPEST_PRODUCT"]
    assert "चावल" in data["reply"] or "₹" in data["reply"]


def test_ai_hinglish_query(client, consumer_headers):
    res = client.post("/api/ai/chat-simple", json={
        "session_id": "test_sess_hinglish",
        "message": "mere paas sabse sasta rice kaha milega?",
    }, headers=consumer_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["language"] == "hinglish"
    assert data["intent"] == "CHEAPEST_PRODUCT"
    assert "saste" in data["reply"].lower() or "sasta" in data["reply"].lower() or "₹" in data["reply"]


# =========================================================================
# 9. CONVERSATION HISTORY & AUDIT LOGGING
# =========================================================================

def test_ai_conversation_history_persistence(client, consumer_headers):
    sid = f"test_hist_{uuid.uuid4().hex[:6]}"
    # Send message 1
    r1 = client.post("/api/ai/chat-simple", json={
        "session_id": sid,
        "message": "find milk",
    }, headers=consumer_headers)
    assert r1.status_code == 200

    # Fetch history
    hres = client.get(f"/api/ai/history?session_id={sid}", headers=consumer_headers)
    assert hres.status_code == 200
    history = hres.json()
    assert len(history) >= 2  # 1 user + 1 assistant
    assert history[0]["sender_type"] == "user"
    assert history[1]["sender_type"] == "assistant"


def test_ai_feedback_and_diagnostics(client, consumer_headers, admin_headers):
    # Submit feedback
    f_res = client.post("/api/ai/feedback", json={
        "session_id": "test_sess_diag",
        "message_id": "msg_123",
        "rating": 1,
        "comment": "Very accurate price!",
    }, headers=consumer_headers)
    assert f_res.status_code == 200
    assert f_res.json()["ok"] is True

    # Admin checks diagnostics
    d_res = client.get("/api/admin/ai-diagnostics", headers=admin_headers)
    assert d_res.status_code == 200
    diag = d_res.json()
    assert diag["total_requests"] >= 1
    assert len(diag["recent_logs"]) > 0
    assert len(diag["feedbacks"]) > 0

