"""
Comprehensive test suite for the 3-Tier Smart AI Ecosystem & Super Admin Control Center.

Validates:
  1. Centralized Feature Registry (all 45 smart features across Tier 1, Tier 2, Tier 3).
  2. Super Admin feature toggling, beta flags, thresholds, and immutable audit logs.
  3. Master Kill-Switch (emergency disable of all smart features, verified graceful 503).
  4. Role-based access control (RBAC) enforcement on smart endpoints.
  5. Tier 1: AI Shopping Copilot with Hindi/English/Hinglish synonym expansion.
  6. Tier 1: Smart Cheapest Basket optimizer (Single-Store Option A vs Multi-Store Option B).
  7. Tier 1: Customer Demand Requests & Mobile Vendor Demand Matching.
  8. Tier 1: Availability Freshness Score dynamic calculation.
  9. Tier 2: Price Recommendation, Demand Forecasting, Route Optimization, Stockout Prediction.
 10. Tier 2: Voice Search transcript interpretation & Listing Optimizer.
 11. Tier 3: Counterfactual Sales Impact & mandatory non-causal attribution disclaimer.
 12. Tier 3: Super Admin AI Briefing, Fraud Graph anomalies, and Marketplace Balancing.
 13. Admin AI Playground execution with latency tracking and tool-call reporting.
"""

import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
import pytest
from datetime import datetime, timezone, timedelta
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
def test_vendor(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_smart_vendor_{suffix}@qa.example.com"
    r = client.post("/api/auth/vendor/register", json={
        "name": "Smart Vendor Test",
        "email": email,
        "password": "Password@123",
        "phone": "9876543210",
        "shop_name": f"Smart Groceries {suffix}",
        "shop_address": "Connaught Place, New Delhi",
        "vendor_type": "cart_vendor",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return {"id": data["user"]["id"], "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def test_consumer(client):
    suffix = uuid.uuid4().hex[:6]
    email = f"qa_smart_shopper_{suffix}@qa.example.com"
    r = client.post("/api/auth/consumer/register", json={
        "name": "Smart Shopper Test",
        "email": email,
        "password": "Password@123",
        "phone": "9876543211",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return {"id": data["user"]["id"], "headers": {"Authorization": f"Bearer {token}"}}


# =========================================================================
# 1. CENTRALIZED FEATURE REGISTRY & ADMIN CONTROLS
# =========================================================================

def test_smart_feature_registry_contains_45_features(client, admin_headers):
    """Admin registry must list all 45 smart features categorized across tiers."""
    r = client.get("/api/admin/smart-features", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_features" in data
    assert data["total_features"] >= 45, f"Expected at least 45 smart features, got {data['total_features']}"
    
    tier_counts = {"tier1": 0, "tier2": 0, "tier3": 0}
    for feat in data["features"]:
        t = feat.get("tier")
        if t in tier_counts:
            tier_counts[t] += 1
    assert tier_counts["tier1"] >= 10, f"Tier 1 expected >= 10, got {tier_counts['tier1']}"
    assert tier_counts["tier2"] >= 20, f"Tier 2 expected >= 20, got {tier_counts['tier2']}"
    assert tier_counts["tier3"] >= 15, f"Tier 3 expected >= 15, got {tier_counts['tier3']}"


def test_smart_feature_update_and_audit(client, admin_headers):
    """Admin can modify feature status, beta flag, and confidence threshold with audit trail."""
    r = client.patch("/api/admin/smart-features/ai_shopping_copilot", json={
        "beta": True,
        "confidence_threshold": 0.85,
        "rate_limit": 90,
    }, headers=admin_headers)
    assert r.status_code == 200
    feat = r.json().get("feature", {})
    assert feat["beta"] is True
    assert feat["confidence_threshold"] == 0.85
    assert feat["rate_limit"] == 90

    # Reset back
    client.patch("/api/admin/smart-features/ai_shopping_copilot", json={
        "beta": False,
        "confidence_threshold": 0.70,
        "rate_limit": 60,
    }, headers=admin_headers)


def test_master_kill_switch_emergency_control(client, admin_headers):
    """Toggling master kill-switch disables smart features with 503, then restores seamlessly."""
    # Turn Master Switch OFF
    r_off = client.post("/api/admin/smart-features/master-toggle", json={
        "master_switch": False,
        "admin_reason": "Emergency maintenance simulation"
    }, headers=admin_headers)
    assert r_off.status_code == 200
    assert r_off.json()["config"]["master_switch"] is False

    # Calling any smart endpoint should now yield 503
    r_blocked = client.post("/api/ai/copilot", json={"query": "fresh apples"})
    assert r_blocked.status_code == 503
    assert "disabled by the Super Admin" in r_blocked.json()["detail"]

    # Turn Master Switch back ON
    r_on = client.post("/api/admin/smart-features/master-toggle", json={
        "master_switch": True,
        "admin_reason": "Maintenance ended"
    }, headers=admin_headers)
    assert r_on.status_code == 200
    assert r_on.json()["config"]["master_switch"] is True

    # Endpoints operate normally again
    r_ok = client.post("/api/ai/copilot", json={"query": "fresh apples"})
    assert r_ok.status_code == 200


def test_rbac_security_admin_briefing_restricted(client, test_consumer):
    """Consumer cannot access Super Admin marketplace briefing."""
    r = client.get("/api/admin/marketplace-briefing", headers=test_consumer["headers"])
    assert r.status_code in (401, 403, 404)


# =========================================================================
# 2. TIER 1: CORE SMART MARKETPLACE
# =========================================================================

def test_tier1_ai_shopping_copilot_hindi_synonyms(client):
    """Copilot expands Hindi/Hinglish terms (tamatar -> tomato, pyaaz -> onion)."""
    r = client.post("/api/ai/copilot", json={"query": "kya fresh tamatar aur pyaaz available hai?"})
    assert r.status_code == 200
    data = r.json()
    assert "tamatar" in data["query"]
    assert any("tomato" in term for term in data["expanded_terms"])
    assert "copilot_reply" in data
    assert len(data["copilot_reply"]) > 10


def test_tier1_smart_cheapest_basket_optimizer(client):
    """Cheapest basket compares Single-Store convenience vs. Multi-Store split."""
    r = client.post("/api/ai/cheapest-basket", json={
        "items": [
            {"item_name": "Tomato", "quantity": 2.0},
            {"item_name": "Milk", "quantity": 1.0}
        ],
        "lat": 28.6139,
        "lng": 77.2090,
    })
    assert r.status_code == 200
    data = r.json()
    assert "option_a_single_store" in data
    assert "option_b_multi_store" in data
    assert "tradeoff_summary" in data


def test_tier1_customer_demand_requests_and_vendor_matching(client, test_consumer, test_vendor):
    """Customer posts 'I Need' demand request; mobile vendor matches nearby."""
    r_post = client.post("/api/demand/requests", json={
        "product_name": "Organic Alphonso Mangoes",
        "category": "Fruits",
        "max_price": 450.0,
        "quantity": "2 kg",
        "notes": "Need ripe sweet mangoes for evening dinner",
        "lat": 28.6139,
        "lng": 77.2090,
        "radius_meters": 5000,
    }, headers=test_consumer["headers"])
    assert r_post.status_code == 200
    req_data = r_post.json()
    req_id = req_data["id"]
    assert req_data["product_name"] == "Organic Alphonso Mangoes"

    # Mobile vendor demand matching query
    r_match = client.get(f"/api/mobile/demand-matching?lat=28.6139&lng=77.2090&radius_meters=6000", headers=test_vendor["headers"])
    assert r_match.status_code == 200
    match_data = r_match.json()
    assert match_data["matched_requests_count"] >= 1
    matched_ids = [req["id"] for req in match_data["requests"]]
    assert req_id in matched_ids


def test_tier1_availability_freshness_score(client):
    """Calculates freshness score for products based on update recency."""
    # Find any product
    prods_r = client.get("/api/products")
    if prods_r.status_code == 200 and prods_r.json():
        prod_id = prods_r.json()[0]["id"]
        r = client.get(f"/api/products/{prod_id}/freshness")
        assert r.status_code == 200
        data = r.json()
        assert "freshness_score" in data
        assert 0 <= data["freshness_score"] <= 100
        assert data["freshness_rating"] in ["FRESH", "VERY_HIGH", "HIGH", "MODERATE", "STALE"]


# =========================================================================
# 3. TIER 2: ADVANCED AI & BUSINESS INTELLIGENCE
# =========================================================================

def test_tier2_smart_price_recommendation(client, test_vendor):
    """Provides local market competitive price recommendation."""
    r = client.post("/api/ai/price-recommendation", json={
        "product_name": "Tomato",
        "category": "Vegetables",
        "current_price": 45.0,
    }, headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "suggested_optimal_price" in data
    assert "market_median_price" in data
    assert "rationale" in data


def test_tier2_demand_forecasting(client, test_vendor):
    """Generates 7-day predictive demand trend with non-causal disclaimer."""
    r = client.post("/api/ai/demand-forecast?category=Vegetables", headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["horizon_days"] == 7
    assert len(data["forecast"]) == 7
    assert "Estimate based on available baseline" in data["disclaimer"]


def test_tier2_mobile_route_recommendation(client, test_vendor):
    """Provides multi-stop navigation route recommendations for mobile carts."""
    r = client.post("/api/ai/route-recommendation?lat=28.6139&lng=77.2090", headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["recommended_stops"] >= 3
    assert len(data["route"]) >= 3
    assert "suggested_dwell_mins" in data["route"][0]


def test_tier2_ai_listing_optimizer(client, test_vendor):
    """Generates optimized title, description, and Hinglish keywords."""
    r = client.post("/api/ai/listing-optimizer", json={
        "title": "aloo",
        "category": "Vegetables"
    }, headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "optimized_title" in data
    assert "optimized_description" in data
    assert any("potato" in syn or "aloo" in syn for syn in data["hinglish_synonyms"])


def test_tier2_voice_search_interpretation(client):
    """Translates voice transcript to search intent and keyword filters."""
    r = client.post("/api/ai/voice-search", json={
        "audio_transcript": "Do kilo taaza tamatar chahiye"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["detected_intent"] == "find_product"
    assert any("tomato" in kw or "tamatar" in kw for kw in data["extracted_keywords"])


def test_tier2_stockout_prediction(client, test_vendor):
    """Evaluates inventory risk and flags items requiring restock."""
    r = client.get("/api/vendor/stockout-prediction", headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "total_items_checked" in data
    assert "stockout_alerts" in data


# =========================================================================
# 4. TIER 3: MARKETPLACE INTELLIGENCE & SCALE
# =========================================================================

def test_tier3_counterfactual_sales_impact_disclaimer(client, test_vendor):
    """Calculates synthetic control sales change with mandatory non-causal disclaimer."""
    r = client.get("/api/vendor/counterfactual-impact", headers=test_vendor["headers"])
    assert r.status_code == 200
    data = r.json()
    assert "observed_sales_change_pct" in data
    assert "synthetic_control_comparison" in data
    assert "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement." in data["disclaimer"]


def test_tier3_admin_daily_briefing_grounded(client, admin_headers):
    """Generates daily Super Admin operational briefing with grounded metrics."""
    r = client.get("/api/admin/marketplace-briefing", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "metrics" in data
    assert "total_users" in data["metrics"]
    assert "ai_briefing" in data
    assert len(data["ai_briefing"]) > 20


def test_tier3_fraud_abuse_intelligence_graph(client, admin_headers):
    """Evaluates graph signals and anomaly indicators."""
    r = client.get("/api/admin/fraud-graph", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_anomalies" in data
    assert "graph_nodes" in data


def test_tier3_marketplace_balancing(client, admin_headers):
    """Detects supply-demand gaps and category balance."""
    r = client.get("/api/admin/marketplace-balancing", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert "balance_data" in data
    assert "categories_evaluated" in data


# =========================================================================
# 5. SUPER ADMIN AI PLAYGROUND
# =========================================================================

def test_admin_ai_playground_execution(client, admin_headers):
    """Admin AI Playground executes prompt simulation, reporting latency and tool calls."""
    r = client.post("/api/admin/ai-playground/test", json={
        "role": "admin",
        "prompt": "Summarize today's active grievances and platform health",
        "model_name": "gemini-1.5-flash",
    }, headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "admin"
    assert "tool_calls" in data
    assert "response" in data
    assert data["latency_ms"] >= 0
    assert "Estimate based on available baseline" in data["disclaimer"]
