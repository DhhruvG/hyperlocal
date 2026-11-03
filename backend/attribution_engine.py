"""HyperLocal Visit, Customer Attribution & Sales Impact Engine.

Multi-signal attribution engine for fixed retailers and mobile cart vendors.
Does not depend on QR scanning alone. Distinguishes:
  - DISCOVERY / INTENT / POSSIBLE VISIT / LIKELY VISIT / VERIFIED VISIT / VERIFIED PURCHASE
  - VERIFIED DATA vs USER-REPORTED DATA vs SYSTEM SIGNALS vs AI ESTIMATES
  - OBSERVED SALES CHANGE vs ESTIMATED INCREMENTAL SALES
"""

import os
import csv
import io
import re
import math
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, List, Dict, Any

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "localprice-super-secret-key-change-in-production")
JWT_ALGO = "HS256"

# Default configurations
DEFAULT_WINDOW_DAYS = 30
DEFAULT_GEOFENCE_METERS = 80
DEFAULT_MIN_DWELL_SECONDS = 60
DEFAULT_POINTS_VISIT = 10
DEFAULT_POINTS_PURCHASE = 25
SMALL_SAMPLE_THRESHOLD = 5

SPEND_RANGES_MIDPOINTS = {
    "0-100": 50.0,
    "101-250": 175.0,
    "251-500": 375.0,
    "501-1000": 750.0,
    "1001-2500": 1750.0,
    "2500+": 3000.0,
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def haversine_meters(lat1, lng1, lat2, lng2) -> Optional[float]:
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------- Privacy & Security Masking Helpers ----------

def mask_email(email: Optional[str]) -> str:
    """Masks email address to protect privacy (e.g. j****n@example.com)."""
    if not email or "@" not in email:
        return email or ""
    parts = email.split("@", 1)
    name, domain = parts[0], parts[1]
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


def mask_phone(phone: Optional[str]) -> str:
    """Masks phone number (e.g. 98******21)."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 10:
        return f"{digits[:2]}******{digits[-2:]}"
    elif len(digits) > 4:
        return f"{digits[:2]}***{digits[-2:]}"
    return "***"


def sanitize_user_dict(u: dict) -> dict:
    """Returns safe user representation with credentials removed and PII masked."""
    d = dict(u)
    d["id"] = str(d.get("_id") or d.get("id"))
    d.pop("_id", None)
    d.pop("password_hash", None)
    if "email" in d:
        d["email_masked"] = mask_email(d["email"])
    if "phone" in d:
        d["phone_masked"] = mask_phone(d["phone"])
    return d


def create_impersonation_token(user_id: str, role: str, admin_id: str) -> str:
    """Generates a temporary scoped JWT token for admin impersonation with audit flag."""
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
        "type": "access",
        "is_impersonated": True,
        "impersonated_by": admin_id,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


# ---------- Receipt OCR & Intelligent Heuristic Parser ----------

def parse_receipt_text(text: str, vendors: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Parses receipt text into structured shop, items, date, total, and matches registered vendors."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    extracted = {
        "raw_text": text,
        "seller_name": None,
        "matched_seller_id": None,
        "matched_seller_name": None,
        "match_confidence": 0.0,
        "items": [],
        "total_amount": 0.0,
        "receipt_date": None,
        "receipt_time": None,
        "payment_mode": "Unknown",
    }
    if not lines:
        return extracted

    # Date extraction (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or month names)
    date_patterns = [
        r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b",
        r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b",
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",
    ]
    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            extracted["receipt_date"] = m.group(1)
            break

    # Time extraction
    time_pat = r"\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\b"
    m_time = re.search(time_pat, text)
    if m_time:
        extracted["receipt_time"] = m_time.group(1)

    # Payment mode
    if re.search(r"\b(UPI|GPay|PhonePe|Paytm)\b", text, re.IGNORECASE):
        extracted["payment_mode"] = "UPI"
    elif re.search(r"\b(Card|Visa|Mastercard|Debit|Credit)\b", text, re.IGNORECASE):
        extracted["payment_mode"] = "Card"
    elif re.search(r"\b(Cash|CASH)\b", text, re.IGNORECASE):
        extracted["payment_mode"] = "Cash"

    # Total Amount extraction
    total_val = None
    for line in lines:
        if re.search(r"\b(TOTAL|GRAND TOTAL|NET AMOUNT|AMOUNT PAID|BILL TOTAL|NET)\b", line, re.IGNORECASE):
            amt_match = re.findall(r"([0-9]+(?:\.[0-9]{1,2})?)", line)
            if amt_match:
                try:
                    candidates = [float(x) for x in amt_match]
                    total_val = max(candidates)
                except ValueError:
                    pass

    # Fallback to currency amounts in lower half of text
    if total_val is None:
        all_nums = []
        for line in lines[max(0, len(lines)-6):]:
            matches = re.findall(r"([0-9]+(?:\.[0-9]{1,2})?)", line)
            for m in matches:
                try:
                    v = float(m)
                    if 1.0 <= v <= 500000.0:
                        all_nums.append(v)
                except ValueError:
                    pass
        if all_nums:
            total_val = max(all_nums)

    extracted["total_amount"] = total_val or 0.0

    # Line items extraction
    for line in lines[1:]:
        if re.search(r"\b(TOTAL|GRAND|SUBTOTAL|TAX|GST|VAT|CASH|UPI|DATE|TIME|CHANGE|BALANCE|INVOICE|BILL)\b", line, re.IGNORECASE):
            continue
        item_match = re.match(r"^([A-Za-z0-9\s\-]+?)\s+([0-9]+(?:\.[0-9]{1,2})?)$", line)
        if item_match:
            try:
                extracted["items"].append({
                    "name": item_match.group(1).strip(),
                    "price": float(item_match.group(2))
                })
            except Exception:
                pass

    # Seller matching against registered vendors
    header_text = " ".join(lines[:4]).lower()
    first_line = lines[0].lower().strip() if lines else ""
    best_vendor = None
    best_conf = 0.0
    longest_match_len = 0

    for v in vendors:
        v_name = (v.get("shop_name") or v.get("name") or "").lower().strip()
        if not v_name:
            continue
        if v_name == first_line:
            best_vendor = v
            best_conf = 0.99
            break
        if v_name in header_text:
            if len(v_name) > longest_match_len:
                longest_match_len = len(v_name)
                best_vendor = v
                best_conf = 0.95
        elif header_text in v_name and best_conf < 0.9:
            best_vendor = v
            best_conf = 0.90
        else:
            v_words = set(re.findall(r"\w+", v_name))
            h_words = set(re.findall(r"\w+", header_text))
            overlap = v_words.intersection(h_words)
            if len(overlap) >= 2 or (len(overlap) == 1 and len(v_words) == 1):
                conf = min(0.92, 0.5 + (len(overlap) / max(len(v_words), 1)) * 0.45)
                if conf > best_conf:
                    best_conf = conf
                    best_vendor = v

    if best_vendor:
        extracted["matched_seller_id"] = str(best_vendor.get("_id") or best_vendor.get("id"))
        extracted["matched_seller_name"] = best_vendor.get("shop_name") or best_vendor.get("name")
        extracted["seller_name"] = extracted["matched_seller_name"]
        extracted["match_confidence"] = round(best_conf, 2)
    else:
        extracted["seller_name"] = lines[0] if lines else "Unknown Seller"

    return extracted


# ---------- Intent & Visit Confidence Logic ----------

def calculate_intent_level(signals: List[str]) -> str:
    """Calculates customer intent strength from observed marketplace interactions."""
    sig_set = set(signals)
    has_contact = any(s in sig_set for s in ["contact_seller", "chat_interaction", "call_seller"])
    has_directions = any(s in sig_set for s in ["directions_clicked", "navigation_started"])
    has_alert = any(s in sig_set for s in ["price_alert_opened", "availability_alert_opened"])
    has_profile = "seller_profile_view" in sig_set
    has_product = any(s in sig_set for s in ["product_view", "price_comparison"])

    if has_directions and (has_contact or "navigation_started" in sig_set):
        return "VERY_HIGH"
    if has_directions or has_contact or has_alert:
        return "HIGH"
    if has_profile or has_product:
        return "MEDIUM"
    return "LOW"


def classify_visit(
    prior_intent: str,
    distance_m: Optional[float],
    dwell_s: Optional[int],
    confirmed: bool,
    geofence_radius: float = DEFAULT_GEOFENCE_METERS,
    trip_arrived: bool = False,
    dual_confirmed: bool = False,
) -> str:
    """Classifies a visit into POSSIBLE, LIKELY, HIGH_CONFIDENCE, or VERIFIED. Never claims GPS alone proves a visit."""
    if confirmed or dual_confirmed:
        return "VERIFIED"

    dwell = dwell_s or 0
    if trip_arrived and dwell >= DEFAULT_MIN_DWELL_SECONDS:
        return "HIGH_CONFIDENCE"

    if distance_m is not None and distance_m <= geofence_radius:
        # Near shop
        if prior_intent in ["HIGH", "VERY_HIGH"] and dwell >= DEFAULT_MIN_DWELL_SECONDS:
            return "HIGH_CONFIDENCE" if (dwell >= 180 and prior_intent == "VERY_HIGH") else "LIKELY"
        return "POSSIBLE"

    # Outside geofence or no distance
    if prior_intent == "VERY_HIGH":
        return "POSSIBLE"
    return "NONE"


# ---------- Pydantic Schemas ----------

class AttributionEventIn(BaseModel):
    seller_id: str
    event_type: str
    session_id: Optional[str] = None
    product_id: Optional[str] = None
    session_token: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    dwell_seconds: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class CustomerVisitConfirmIn(BaseModel):
    session_id: str
    visited: bool
    purchased: bool
    spend_range: Optional[str] = None
    exact_amount: Optional[float] = None
    notes: Optional[str] = None


class VendorRecordVisitIn(BaseModel):
    visit_status: Literal["visited", "purchased", "did_not_purchase", "unknown"]
    amount: Optional[float] = None
    customer_count: Optional[int] = 1
    category: Optional[str] = None
    notes: Optional[str] = None


class VendorDailySalesIn(BaseModel):
    date: str  # YYYY-MM-DD
    total_sales: float = Field(ge=0)
    customer_count: int = Field(ge=0)
    hyperlocal_customer_count: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class SellerBaselineIn(BaseModel):
    average_daily_sales: float = Field(ge=0)
    average_daily_customers: float = Field(ge=0)
    average_monthly_sales: float = Field(ge=0)
    baseline_type: Optional[Literal["estimate", "historical_30d", "historical_file"]] = "estimate"
    source: Optional[str] = "Vendor-Provided Estimate"


class AttributionConfigPatch(BaseModel):
    attribution_window_days: Optional[int] = Field(default=None, ge=1, le=180)
    geofence_radius_meters: Optional[int] = Field(default=None, ge=20, le=500)
    min_dwell_seconds: Optional[int] = Field(default=None, ge=10, le=600)
    points_per_visit_confirmation: Optional[int] = Field(default=None, ge=0)
    points_per_purchase_confirmation: Optional[int] = Field(default=None, ge=0)
    small_sample_threshold: Optional[int] = Field(default=None, ge=1, le=50)
    anomaly_detection_active: Optional[bool] = None


class ReceiptUploadIn(BaseModel):
    raw_text: Optional[str] = None
    image_base64: Optional[str] = None
    seller_hint: Optional[str] = None


class ReceiptConfirmIn(BaseModel):
    receipt_id: Optional[str] = None
    seller_id: str
    session_id: Optional[str] = None
    amount: float = Field(gt=0)
    spend_range: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None


class PriceAlertIn(BaseModel):
    product_id: str
    target_price: float = Field(gt=0)


class AvailabilityAlertIn(BaseModel):
    product_id: str


class AlertOpenedIn(BaseModel):
    alert_id: str
    product_id: str
    seller_id: str


class TripStartIn(BaseModel):
    seller_id: str
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None


class TripPingIn(BaseModel):
    trip_id: str
    lat: float
    lng: float


class TripEndIn(BaseModel):
    trip_id: str


class VendorConfirmVisitIn(BaseModel):
    session_id: str
    action: Literal["confirm_visit", "purchased", "did_not_purchase", "ignore"]
    amount: Optional[float] = None
    notes: Optional[str] = None


class SalesImportRowIn(BaseModel):
    date: str
    total_sales: float = Field(ge=0)
    customer_count: int = Field(ge=0)
    hyperlocal_customer_count: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class SalesImportIn(BaseModel):
    rows: Optional[List[SalesImportRowIn]] = None
    csv_text: Optional[str] = None


class AuditRevealIn(BaseModel):
    entity_type: Literal["user", "vendor", "consumer"]
    entity_id: str
    field: Literal["email", "phone"]
    reason: str = Field(min_length=3)


class DisputeResolveIn(BaseModel):
    action: Literal["approve", "reject", "adjust_amount"]
    new_status: Optional[str] = None
    adjusted_amount: Optional[float] = None
    justification: str = Field(min_length=3)


class BulkActionIn(BaseModel):
    entity: Literal["vendors", "products", "grievances"]
    ids: List[str] = Field(min_length=1)
    action: Literal["verify", "unverify", "activate", "deactivate", "assign", "resolve"]
    value: Optional[Any] = None


# ---------- Quality Score, Cohort & Confidence Revenue Calculations ----------

async def compute_attribution_quality(db, seller_id: str) -> Dict[str, Any]:
    score = 0
    breakdown = {}

    # 1. Baseline completeness (up to 20 pts)
    baseline = await db.seller_baselines.find_one({"seller_id": seller_id})
    if baseline and baseline.get("average_daily_sales", 0) > 0:
        b_score = 20 if baseline.get("baseline_type") == "historical_file" else 15
        score += b_score
        breakdown["baseline_setup"] = {"points": b_score, "max": 20, "status": "completed"}
    else:
        breakdown["baseline_setup"] = {"points": 0, "max": 20, "status": "missing", "tip": "Set your pre-HyperLocal baseline sales"}

    # 2. Daily sales logging streak (up to 25 pts)
    thirty_days_ago = (now_utc() - timedelta(days=30)).strftime("%Y-%m-%d")
    sales_count = await db.vendor_daily_sales.count_documents({"seller_id": seller_id, "date": {"$gte": thirty_days_ago}})
    if sales_count >= 14:
        s_score = 25
    elif sales_count >= 7:
        s_score = 18
    elif sales_count >= 1:
        s_score = 10
    else:
        s_score = 0
    score += s_score
    breakdown["sales_logging"] = {"points": s_score, "max": 25, "days_logged_last_30d": sales_count, "tip": "Log daily sales regularly"}

    # 3. Verified visit & purchase confirmations (up to 30 pts)
    verified_purchases = await db.purchase_attributions.count_documents({"seller_id": seller_id})
    verified_visits = await db.verified_visits.count_documents({"seller_id": seller_id})
    v_score = min(30, (verified_purchases * 5) + (verified_visits * 2))
    score += v_score
    breakdown["verified_activity"] = {"points": v_score, "max": 30, "purchases": verified_purchases, "visits": verified_visits}

    # 4. Multi-signal diversity (up to 25 pts)
    distinct_signals = await db.attribution_events.distinct("event_type", {"seller_id": seller_id})
    sig_types = set(distinct_signals)
    div_pts = 0
    if any(s in sig_types for s in ["directions_clicked", "navigation_started"]):
        div_pts += 7
    if any(s in sig_types for s in ["contact_seller", "chat_interaction", "call_seller"]):
        div_pts += 6
    if any(s in sig_types for s in ["qr_checkin", "visit_confirmed_customer", "receipt_ocr"]):
        div_pts += 6
    if any(s in sig_types for s in ["price_alert_opened", "availability_alert_opened"]):
        div_pts += 6
    div_score = min(25, div_pts)
    score += div_score
    breakdown["signal_diversity"] = {"points": div_score, "max": 25, "signals_recorded": list(sig_types)}

    completeness_items = [
        {"task": "Set pre-HyperLocal business baseline", "done": bool(baseline and baseline.get("average_daily_sales", 0) > 0)},
        {"task": "Log daily sales for at least 7 days", "done": sales_count >= 7},
        {"task": "Display in-store QR code or review detected visits", "done": verified_visits > 0 or "qr_checkin" in sig_types},
        {"task": "Confirm customer purchases or import historical sales", "done": verified_purchases > 0 or sales_count >= 1},
    ]
    completed_count = sum(1 for item in completeness_items if item["done"])
    completeness_pct = int((completed_count / len(completeness_items)) * 100)

    return {
        "quality_score": min(100, score),
        "rating": "Excellent" if score >= 80 else ("Good" if score >= 60 else ("Fair" if score >= 35 else "Needs Attention")),
        "completeness_percentage": completeness_pct,
        "completeness_items": completeness_items,
        "breakdown": breakdown,
    }


async def compute_customer_cohorts(db, seller_id: str) -> List[Dict[str, Any]]:
    rels = await db.customer_seller_relationships.find({"seller_id": seller_id}).to_list(1000)
    cohorts_map = {}
    for r in rels:
        created = r.get("created_at") or r.get("first_discovered_at") or ""
        cohort_month = created[:7] if len(created) >= 7 else "Recent"
        if cohort_month not in cohorts_map:
            cohorts_map[cohort_month] = {
                "cohort": cohort_month,
                "total_customers": 0,
                "repeat_customers": 0,
                "total_visits": 0,
                "total_spent": 0.0,
            }
        cohorts_map[cohort_month]["total_customers"] += 1
        if r.get("visit_count", 0) > 1 or r.get("purchase_count", 0) > 1:
            cohorts_map[cohort_month]["repeat_customers"] += 1
        cohorts_map[cohort_month]["total_visits"] += r.get("visit_count", 0)
        cohorts_map[cohort_month]["total_spent"] += float(r.get("total_spent", 0.0))

    cohorts = list(cohorts_map.values())
    cohorts.sort(key=lambda x: x["cohort"], reverse=True)
    for c in cohorts:
        c["repeat_rate"] = round((c["repeat_customers"] / c["total_customers"] * 100), 1) if c["total_customers"] > 0 else 0.0
        c["total_spent"] = round(c["total_spent"], 2)
    return cohorts[:6]


async def compute_confidence_revenue(db, seller_id: str, start_iso: str) -> Dict[str, Any]:
    purchases = await db.purchase_attributions.find({"seller_id": seller_id, "purchased_at": {"$gte": start_iso}}).to_list(1000)
    
    verified_rev = 0.0
    high_conf_rev = 0.0
    med_conf_rev = 0.0
    vendor_reported_rev = 0.0

    for p in purchases:
        amt = float(p.get("amount", 0.0))
        conf = p.get("confidence_level", "VERIFIED")
        trust = p.get("trust_level", "")
        source = p.get("purchase_source", "")

        if conf == "VERIFIED" or "Customer" in trust or source in ["customer_confirmation", "qr_code", "receipt_ocr"]:
            verified_rev += amt
        elif conf in ["HIGH_CONFIDENCE", "HIGH"]:
            high_conf_rev += amt
        elif conf in ["LIKELY", "POSSIBLE"]:
            med_conf_rev += amt
        else:
            vendor_reported_rev += amt

    return {
        "verified_revenue": round(verified_rev, 2),
        "high_confidence_revenue": round(high_conf_rev, 2),
        "medium_confidence_revenue": round(med_conf_rev, 2),
        "vendor_reported_revenue": round(vendor_reported_rev, 2),
        "total_hyperlocal_revenue": round(verified_rev + high_conf_rev + med_conf_rev, 2),
    }


# ---------- Builder Function for Router ----------

def build_attribution_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user):
    router = APIRouter()

    async def get_config() -> dict:
        doc = await db.admin_settings.find_one({"_id": "attribution"})
        if not doc:
            return {
                "attribution_window_days": DEFAULT_WINDOW_DAYS,
                "geofence_radius_meters": DEFAULT_GEOFENCE_METERS,
                "min_dwell_seconds": DEFAULT_MIN_DWELL_SECONDS,
                "points_per_visit_confirmation": DEFAULT_POINTS_VISIT,
                "points_per_purchase_confirmation": DEFAULT_POINTS_PURCHASE,
                "small_sample_threshold": SMALL_SAMPLE_THRESHOLD,
                "anomaly_detection_active": True,
            }
        return doc

    async def next_session_number() -> str:
        count = await db.attribution_sessions.count_documents({}) + 101
        return f"HL-ATTR-{count:06d}"

    # ---------- Event Ingestion ----------

    @router.post("/attribution/event")
    async def log_attribution_event(payload: AttributionEventIn, request: Request, user: Optional[dict] = Depends(get_optional_user)):
        user_id = user["id"] if user else None
        session_token = payload.session_token or request.cookies.get("lp_anon_session") or str(uuid.uuid4())
        cfg = await get_config()
        window_days = cfg.get("attribution_window_days", DEFAULT_WINDOW_DAYS)

        # Check existing active session for this user/token & seller
        session = None
        if payload.session_id:
            session = await db.attribution_sessions.find_one({"session_id": payload.session_id})
        
        if not session:
            q = {"seller_id": payload.seller_id, "attribution_status": {"$in": ["active", "likely_visit"]}}
            if user_id:
                q["user_id"] = user_id
            else:
                q["session_token"] = session_token
            session = await db.attribution_sessions.find_one(q, sort=[("last_activity_at", -1)])

        now = now_utc()
        now_s = now.isoformat()
        window_end = (now + timedelta(days=window_days)).isoformat()

        if not session:
            session_id = await next_session_number()
            init_intent = calculate_intent_level([payload.event_type])
            session = {
                "session_id": session_id,
                "user_id": user_id,
                "session_token": session_token,
                "seller_id": payload.seller_id,
                "product_id": payload.product_id,
                "session_type": "retail_visit",
                "started_at": now_s,
                "last_activity_at": now_s,
                "intent_level": init_intent,
                "attribution_status": "active",
                "attribution_window_start": now_s,
                "attribution_window_end": window_end,
                "intent_signals": [payload.event_type],
                "created_at": now_s,
            }
            await db.attribution_sessions.insert_one(session)
        else:
            session_id = session["session_id"]
            existing_signals = session.get("intent_signals", [])
            if payload.event_type not in existing_signals:
                existing_signals.append(payload.event_type)
            new_intent = calculate_intent_level(existing_signals)
            update = {
                "last_activity_at": now_s,
                "intent_signals": existing_signals,
                "intent_level": new_intent,
            }
            if payload.product_id and not session.get("product_id"):
                update["product_id"] = payload.product_id
            if user_id and not session.get("user_id"):
                update["user_id"] = user_id
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": update})
            session["intent_signals"] = existing_signals
            session["intent_level"] = new_intent

        # Log event entity
        event_doc = {
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "user_id": user_id,
            "session_token": session_token,
            "seller_id": payload.seller_id,
            "product_id": payload.product_id or session.get("product_id"),
            "event_type": payload.event_type,
            "metadata": payload.metadata or {},
            "timestamp": now_s,
        }
        await db.attribution_events.insert_one(event_doc)

        # Handle physical location signals
        visit_type = None
        if payload.event_type == "location_visit_signal" or (payload.lat is not None and payload.lng is not None) or (payload.metadata and "distance_meters" in payload.metadata):
            seller = await db.users.find_one({"_id": ObjectId(payload.seller_id)})
            dist = None
            if seller and seller.get("lat") and seller.get("lng") and payload.lat is not None and payload.lng is not None:
                dist = haversine_meters(payload.lat, payload.lng, seller["lat"], seller["lng"])
            elif payload.metadata and "distance_meters" in payload.metadata:
                dist = float(payload.metadata["distance_meters"])

            geofence_r = cfg.get("geofence_radius_meters", DEFAULT_GEOFENCE_METERS)
            visit_type = classify_visit(session.get("intent_level", "LOW"), dist, payload.dwell_seconds, False, geofence_r)
            if visit_type in ["POSSIBLE", "LIKELY"]:
                sig_doc = {
                    "id": str(uuid.uuid4()),
                    "attribution_session_id": session_id,
                    "seller_id": payload.seller_id,
                    "signal_type": "gps_geofence" if (dist is not None and dist <= geofence_r) else "proximity",
                    "confidence_level": visit_type,
                    "location_reference": f"Within ~{int(dist)}m" if dist else "Proximity zone",
                    "dwell_duration": payload.dwell_seconds or 0,
                    "timestamp": now_s,
                }
                await db.visit_signals.insert_one(sig_doc)
                if visit_type == "LIKELY" and session.get("attribution_status") == "active":
                    await db.attribution_sessions.update_one({"session_id": session_id}, {"$set": {"attribution_status": "likely_visit"}})

        # Update customer_seller_relationship
        if user_id:
            rel = await db.customer_seller_relationships.find_one({"customer_id": user_id, "seller_id": payload.seller_id})
            if not rel:
                await db.customer_seller_relationships.insert_one({
                    "customer_id": user_id,
                    "seller_id": payload.seller_id,
                    "first_discovered_at": now_s,
                    "first_verified_visit_at": None,
                    "first_purchase_at": None,
                    "last_visit_at": None,
                    "last_purchase_at": None,
                    "visit_count": 0,
                    "purchase_count": 0,
                    "total_spent": 0.0,
                    "attribution_window_end": window_end,
                    "relationship_status": "discovered",
                    "created_at": now_s,
                })
            else:
                await db.customer_seller_relationships.update_one(
                    {"_id": rel["_id"]},
                    {"$set": {"attribution_window_end": window_end}}
                )

        return {
            "ok": True,
            "session_id": session_id,
            "intent_level": session.get("intent_level", "LOW"),
            "visit_classified": visit_type or "NONE"
        }

    # ---------- Customer Post-Visit Confirmation ----------

    @router.get("/attribution/prompt-check")
    async def check_pending_prompt(user: Optional[dict] = Depends(get_optional_user)):
        """Returns the most relevant pending visit prompt for the shopper if available."""
        if not user or user.get("role") != "consumer":
            return {"has_prompt": False}

        # Look for sessions within last 48 hours where directions were clicked or likely visit detected
        two_days_ago = (now_utc() - timedelta(hours=48)).isoformat()
        session = await db.attribution_sessions.find_one({
            "user_id": user["id"],
            "attribution_status": {"$in": ["active", "likely_visit"]},
            "intent_signals": {"$in": ["directions_clicked", "location_visit_signal", "contact_seller"]},
            "last_activity_at": {"$gte": two_days_ago},
            "prompt_answered": {"$ne": True},
        }, sort=[("last_activity_at", -1)])

        if not session:
            return {"has_prompt": False}

        seller = await db.users.find_one({"_id": ObjectId(session["seller_id"])})
        if not seller:
            return {"has_prompt": False}

        prod = None
        if session.get("product_id"):
            try:
                prod = await db.products.find_one({"_id": ObjectId(session["product_id"])})
            except Exception:
                pass

        cfg = await get_config()
        return {
            "has_prompt": True,
            "session_id": session["session_id"],
            "seller_id": session["seller_id"],
            "shop_name": seller.get("shop_name") or seller.get("name"),
            "shop_address": seller.get("shop_address"),
            "product_name": prod.get("name") if prod else None,
            "points_visit": cfg.get("points_per_visit_confirmation", DEFAULT_POINTS_VISIT),
            "points_purchase": cfg.get("points_per_purchase_confirmation", DEFAULT_POINTS_PURCHASE),
        }

    @router.post("/attribution/confirm-visit-customer")
    async def confirm_visit_customer(payload: CustomerVisitConfirmIn, user: dict = Depends(require_consumer)):
        session = await db.attribution_sessions.find_one({"session_id": payload.session_id, "user_id": user["id"]})
        if not session:
            raise HTTPException(status_code=404, detail="Attribution session not found")

        now_s = now_iso()
        cfg = await get_config()
        earned_points = 0

        # Mark prompt as answered so user isn't prompted repeatedly
        await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"prompt_answered": True}})

        if not payload.visited:
            await db.attribution_events.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "user_id": user["id"],
                "seller_id": session["seller_id"],
                "event_type": "visit_declined_customer",
                "timestamp": now_s,
            })
            return {"ok": True, "visited": False, "points_earned": 0}

        # User confirmed visit
        earned_points += cfg.get("points_per_visit_confirmation", DEFAULT_POINTS_VISIT)
        visit_doc = {
            "id": str(uuid.uuid4()),
            "attribution_session_id": payload.session_id,
            "seller_id": session["seller_id"],
            "customer_id": user["id"],
            "confirmation_source": "customer_modal",
            "confidence_level": "VERIFIED",
            "visit_time": now_s,
            "created_at": now_s,
        }
        await db.verified_visits.insert_one(visit_doc)

        await db.attribution_events.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": payload.session_id,
            "user_id": user["id"],
            "seller_id": session["seller_id"],
            "event_type": "visit_confirmed_customer",
            "timestamp": now_s,
        })

        new_status = "verified_visit"
        purchase_amount = None

        if payload.purchased:
            earned_points += cfg.get("points_per_purchase_confirmation", DEFAULT_POINTS_PURCHASE)
            if payload.exact_amount is not None and payload.exact_amount > 0:
                purchase_amount = float(payload.exact_amount)
            elif payload.spend_range in SPEND_RANGES_MIDPOINTS:
                purchase_amount = SPEND_RANGES_MIDPOINTS[payload.spend_range]
            else:
                purchase_amount = 150.0  # default reasonable fallback

            purchase_doc = {
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "seller_id": session["seller_id"],
                "customer_id": user["id"],
                "product_id": session.get("product_id"),
                "purchase_source": "customer_confirmation",
                "amount": purchase_amount,
                "spend_range": payload.spend_range,
                "currency": "INR",
                "confidence_level": "VERIFIED",
                "trust_level": "Customer Confirmed",
                "purchased_at": now_s,
                "created_at": now_s,
            }
            await db.purchase_attributions.insert_one(purchase_doc)

            await db.attribution_events.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "user_id": user["id"],
                "seller_id": session["seller_id"],
                "event_type": "purchase_declared_customer",
                "metadata": {"amount": purchase_amount, "spend_range": payload.spend_range},
                "timestamp": now_s,
            })
            new_status = "purchase_attributed"

        await db.attribution_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"attribution_status": new_status, "verified_at": now_s}}
        )

        # Credit points
        if earned_points > 0:
            await db.users.update_one(
                {"_id": ObjectId(user["id"])},
                {"$inc": {"hyperlocal_points": earned_points}}
            )

        # Update relationship
        rel_update = {
            "last_visit_at": now_s,
            "relationship_status": "visited",
        }
        inc_fields = {"visit_count": 1}
        if payload.purchased:
            rel_update["last_purchase_at"] = now_s
            rel_update["relationship_status"] = "purchased"
            inc_fields["purchase_count"] = 1
            if purchase_amount:
                inc_fields["total_spent"] = purchase_amount

        await db.customer_seller_relationships.update_one(
            {"customer_id": user["id"], "seller_id": session["seller_id"]},
            {"$set": rel_update, "$inc": inc_fields, "$setOnInsert": {"first_verified_visit_at": now_s, "created_at": now_s}},
            upsert=True
        )

        return {
            "ok": True,
            "status": new_status,
            "points_earned": earned_points,
            "purchase_amount": purchase_amount,
        }

    # ---------- Vendor Actions: Record Visit & Purchase ----------

    @router.post("/vendor/record-visit")
    async def vendor_record_visit(payload: VendorRecordVisitIn, user: dict = Depends(require_vendor)):
        now_s = now_iso()
        seller_id = user["id"]

        # Attempt to match with recent active session for this vendor (created within last 3 hours)
        three_hours_ago = (now_utc() - timedelta(hours=3)).isoformat()
        matched_session = await db.attribution_sessions.find_one({
            "seller_id": seller_id,
            "attribution_status": {"$in": ["active", "likely_visit"]},
            "last_activity_at": {"$gte": three_hours_ago},
        }, sort=[("last_activity_at", -1)])

        session_id = matched_session["session_id"] if matched_session else f"HL-UNMATCHED-{uuid.uuid4().hex[:8]}"

        visit_doc = {
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "seller_id": seller_id,
            "customer_id": matched_session.get("user_id") if matched_session else None,
            "confirmation_source": "vendor_manual",
            "confidence_level": "VERIFIED" if matched_session else "HIGH",
            "is_matched": bool(matched_session),
            "visit_time": now_s,
            "created_at": now_s,
        }
        await db.verified_visits.insert_one(visit_doc)

        await db.attribution_events.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "seller_id": seller_id,
            "event_type": "visit_confirmed_vendor",
            "metadata": {"matched": bool(matched_session)},
            "timestamp": now_s,
        })

        purchase_doc = None
        if payload.visit_status == "purchased" and payload.amount is not None:
            purchase_doc = {
                "id": str(uuid.uuid4()),
                "attribution_session_id": session_id,
                "seller_id": seller_id,
                "customer_id": matched_session.get("user_id") if matched_session else None,
                "purchase_source": "vendor_recorded",
                "amount": float(payload.amount),
                "currency": "INR",
                "confidence_level": "VERIFIED" if matched_session else "HIGH",
                "trust_level": "Vendor Reported",
                "notes": payload.notes,
                "purchased_at": now_s,
                "created_at": now_s,
            }
            await db.purchase_attributions.insert_one(purchase_doc)

            await db.attribution_events.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": session_id,
                "seller_id": seller_id,
                "event_type": "purchase_recorded_vendor",
                "metadata": {"amount": payload.amount},
                "timestamp": now_s,
            })

        if matched_session:
            new_st = "purchase_attributed" if (payload.visit_status == "purchased") else "verified_visit"
            await db.attribution_sessions.update_one(
                {"_id": matched_session["_id"]},
                {"$set": {"attribution_status": new_st, "verified_at": now_s}}
            )

        return {
            "ok": True,
            "matched": bool(matched_session),
            "session_id": session_id,
            "recorded_purchase": bool(purchase_doc),
        }

    # ---------- Vendor Daily Sales & Baseline ----------

    @router.get("/vendor/daily-sales")
    async def list_daily_sales(limit: int = 30, user: dict = Depends(require_vendor)):
        docs = await db.vendor_daily_sales.find({"seller_id": user["id"]}).sort("date", -1).limit(limit).to_list(limit)
        for d in docs:
            d["id"] = str(d["_id"])
            d.pop("_id", None)
        return docs

    @router.post("/vendor/daily-sales")
    async def save_daily_sales(payload: VendorDailySalesIn, user: dict = Depends(require_vendor)):
        now_s = now_iso()
        seller_id = user["id"]

        # Anomaly detection: flag if daily sales > 500,000 or > 4x baseline
        baseline = await db.seller_baselines.find_one({"seller_id": seller_id})
        is_anomaly = False
        anomaly_reason = None
        if payload.total_sales > 300000:
            is_anomaly = True
            anomaly_reason = "Unusually high reported daily sales (> ₹3,00,000)"
        elif baseline and baseline.get("average_daily_sales", 0) > 0:
            if payload.total_sales > (baseline["average_daily_sales"] * 4) and payload.total_sales > 20000:
                is_anomaly = True
                anomaly_reason = f"Sales spike {round(payload.total_sales / baseline['average_daily_sales'], 1)}x over reported baseline"

        doc = {
            "seller_id": seller_id,
            "date": payload.date,
            "total_sales": float(payload.total_sales),
            "customer_count": int(payload.customer_count),
            "hyperlocal_customer_count": payload.hyperlocal_customer_count,
            "notes": payload.notes,
            "source": "vendor_reported",
            "trust_level": "Vendor Reported",
            "is_flagged_anomaly": is_anomaly,
            "anomaly_reason": anomaly_reason,
            "created_at": now_s,
        }

        # Upsert by date
        res = await db.vendor_daily_sales.update_one(
            {"seller_id": seller_id, "date": payload.date},
            {"$set": doc},
            upsert=True
        )

        if is_anomaly:
            # Register in anomaly collection for admin review
            await db.attribution_anomalies.insert_one({
                "seller_id": seller_id,
                "shop_name": user.get("shop_name"),
                "date": payload.date,
                "amount": payload.total_sales,
                "reason": anomaly_reason,
                "status": "pending_review",
                "created_at": now_s,
            })

        return {"ok": True, "date": payload.date, "is_anomaly": is_anomaly}

    @router.get("/vendor/baseline")
    async def get_baseline(user: dict = Depends(require_vendor)):
        doc = await db.seller_baselines.find_one({"seller_id": user["id"]})
        if not doc:
            return {
                "has_baseline": False,
                "average_daily_sales": 0,
                "average_daily_customers": 0,
                "average_monthly_sales": 0,
                "source": "None",
            }
        doc["id"] = str(doc["_id"])
        doc.pop("_id", None)
        doc["has_baseline"] = True
        return doc

    @router.post("/vendor/baseline")
    async def set_baseline(payload: SellerBaselineIn, user: dict = Depends(require_vendor)):
        now_s = now_iso()
        doc = {
            "seller_id": user["id"],
            "average_daily_sales": float(payload.average_daily_sales),
            "average_daily_customers": float(payload.average_daily_customers),
            "average_monthly_sales": float(payload.average_monthly_sales),
            "baseline_type": payload.baseline_type or "estimate",
            "source": payload.source or "Vendor-Provided Estimate",
            "confidence": "Vendor Estimate" if payload.baseline_type == "estimate" else "Verified Records",
            "updated_at": now_s,
        }
        await db.seller_baselines.update_one(
            {"seller_id": user["id"]},
            {"$set": doc, "$setOnInsert": {"created_at": now_s}},
            upsert=True
        )
        return {"ok": True, **doc}

    # ---------- QR Code Helper ----------

    @router.get("/attribution/qr/{seller_id}")
    async def get_qr_meta(seller_id: str):
        seller = await db.users.find_one({"_id": ObjectId(seller_id)})
        if not seller:
            raise HTTPException(status_code=404, detail="Seller not found")
        return {
            "seller_id": seller_id,
            "shop_name": seller.get("shop_name") or seller.get("name"),
            "shop_address": seller.get("shop_address"),
            "vendor_type": seller.get("vendor_type", "retailer"),
            "is_verified": seller.get("is_verified", False),
            "is_online": seller.get("is_online", False),
        }

    @router.post("/attribution/qr-checkin")
    async def qr_checkin(payload: AttributionEventIn, user: Optional[dict] = Depends(get_optional_user)):
        user_id = user["id"] if user else None
        now_s = now_iso()
        session_id = await next_session_number()
        
        session = {
            "session_id": session_id,
            "user_id": user_id,
            "session_token": payload.session_token or str(uuid.uuid4()),
            "seller_id": payload.seller_id,
            "session_type": "qr_scan",
            "started_at": now_s,
            "last_activity_at": now_s,
            "intent_level": "VERY_HIGH",
            "attribution_status": "verified_visit",
            "attribution_window_start": now_s,
            "attribution_window_end": (now_utc() + timedelta(days=DEFAULT_WINDOW_DAYS)).isoformat(),
            "intent_signals": ["qr_checkin", "visit_confirmed_customer"],
            "created_at": now_s,
        }
        await db.attribution_sessions.insert_one(session)

        # Log verified visit
        await db.verified_visits.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "seller_id": payload.seller_id,
            "customer_id": user_id,
            "confirmation_source": "qr_code",
            "confidence_level": "VERIFIED",
            "visit_time": now_s,
            "created_at": now_s,
        })

        if user_id:
            await db.users.update_one({"_id": ObjectId(user_id)}, {"$inc": {"hyperlocal_points": DEFAULT_POINTS_VISIT}})

        return {"ok": True, "session_id": session_id, "status": "verified_visit"}

    # ---------- Vendor Business Impact Analytics ----------

    @router.get("/vendor/business-impact")
    async def vendor_business_impact(
        time_range: Literal["today", "last_7d", "last_30d", "this_month", "last_month", "all"] = "last_30d",
        user: dict = Depends(require_vendor)
    ):
        seller_id = user["id"]
        cfg = await get_config()
        small_threshold = cfg.get("small_sample_threshold", SMALL_SAMPLE_THRESHOLD)

        # Determine date range boundaries
        now = now_utc()
        if time_range == "today":
            start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == "last_7d":
            start_dt = now - timedelta(days=7)
        elif time_range == "last_30d":
            start_dt = now - timedelta(days=30)
        elif time_range == "this_month":
            start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif time_range == "last_month":
            first_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_last_month = first_this_month - timedelta(seconds=1)
            start_dt = end_last_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start_dt = now - timedelta(days=365)

        start_iso = start_dt.isoformat()

        # Query events & sessions
        sess_query = {"seller_id": seller_id, "started_at": {"$gte": start_iso}}
        sessions = await db.attribution_sessions.find(sess_query).to_list(1000)

        # Unique customers
        customer_ids = {s.get("user_id") for s in sessions if s.get("user_id")}
        anon_tokens = {s.get("session_token") for s in sessions if not s.get("user_id") and s.get("session_token")}
        total_customers = len(customer_ids) + len(anon_tokens)

        # Returning & repeat customers from relationships
        relationships = await db.customer_seller_relationships.find({"seller_id": seller_id}).to_list(500)
        repeat_customers_count = sum(1 for r in relationships if r.get("visit_count", 0) > 1 or r.get("purchase_count", 0) > 1)
        new_customers_count = max(0, total_customers - repeat_customers_count)

        # Visits breakdown
        possible_visits = sum(1 for s in sessions if s.get("attribution_status") == "active" and s.get("intent_level") in ["HIGH", "VERY_HIGH"])
        likely_visits = sum(1 for s in sessions if s.get("attribution_status") == "likely_visit")
        verified_visits_count = await db.verified_visits.count_documents({"seller_id": seller_id, "visit_time": {"$gte": start_iso}})

        # Purchases breakdown
        purchases = await db.purchase_attributions.find({"seller_id": seller_id, "purchased_at": {"$gte": start_iso}}).to_list(1000)
        attributed_purchases_count = len(purchases)
        attributed_revenue = sum(p.get("amount", 0) for p in purchases)
        avg_basket = (attributed_revenue / attributed_purchases_count) if attributed_purchases_count > 0 else 0

        # Daily sales reported by vendor in period
        daily_sales = await db.vendor_daily_sales.find({"seller_id": seller_id, "date": {"$gte": start_dt.strftime("%Y-%m-%d")}}).sort("date", 1).to_list(365)
        total_reported_sales = sum(d.get("total_sales", 0) for d in daily_sales)
        total_reported_customers = sum(d.get("customer_count", 0) for d in daily_sales)

        # Baseline & Before vs After
        baseline = await db.seller_baselines.find_one({"seller_id": seller_id})
        baseline_daily_sales = baseline.get("average_daily_sales", 0) if baseline else 0
        baseline_daily_customers = baseline.get("average_daily_customers", 0) if baseline else 0

        days_count = max(1, len(daily_sales) if daily_sales else (now - start_dt).days or 1)
        current_daily_sales_avg = (total_reported_sales / days_count) if total_reported_sales > 0 else (attributed_revenue / days_count if attributed_revenue > 0 else 0)
        current_daily_customers_avg = (total_reported_customers / days_count) if total_reported_customers > 0 else (total_customers / days_count if total_customers > 0 else 0)

        observed_sales_change_pct = None
        observed_customer_change_pct = None
        if baseline_daily_sales > 0:
            observed_sales_change_pct = round(((current_daily_sales_avg - baseline_daily_sales) / baseline_daily_sales) * 100, 1)
        if baseline_daily_customers > 0:
            observed_customer_change_pct = round(((current_daily_customers_avg - baseline_daily_customers) / baseline_daily_customers) * 100, 1)

        # Estimated incremental sales (bounded with disclaimer)
        estimated_incremental = 0.0
        if baseline_daily_sales > 0 and total_reported_sales > 0:
            expected_baseline_sales = baseline_daily_sales * days_count
            sales_above_baseline = max(0.0, total_reported_sales - expected_baseline_sales)
            estimated_incremental = round(min(attributed_revenue + (sales_above_baseline * 0.25), max(attributed_revenue, sales_above_baseline)), 2)
        else:
            estimated_incremental = round(attributed_revenue, 2)

        # Funnel stages
        impressions_count = await db.attribution_events.count_documents({"seller_id": seller_id, "event_type": {"$in": ["seller_impression", "product_search"]}, "timestamp": {"$gte": start_iso}})
        profile_views_count = await db.attribution_events.count_documents({"seller_id": seller_id, "event_type": "seller_profile_view", "timestamp": {"$gte": start_iso}})
        high_intent_count = sum(1 for s in sessions if s.get("intent_level") in ["HIGH", "VERY_HIGH"])
        total_visits_all = likely_visits + verified_visits_count

        conversion_rates = {
            "profile_to_visit": round((total_visits_all / profile_views_count * 100), 1) if profile_views_count > 0 else 0,
            "visit_to_purchase": round((attributed_purchases_count / total_visits_all * 100), 1) if total_visits_all > 0 else 0,
            "search_to_profile": round((profile_views_count / impressions_count * 100), 1) if impressions_count > 0 else 0,
            "repeat_rate": round((repeat_customers_count / total_customers * 100), 1) if total_customers > 0 else 0,
        }

        # Small sample protection
        is_small_sample = total_visits_all < small_threshold
        sample_warning = f"Limited data available. Current metrics are based on {total_visits_all} recorded visits." if is_small_sample else None

        # Products performance
        # Fetch visits and sales by product
        products_driving_visits = []
        products_driving_sales = []
        vendor_products = await db.products.find({"vendor_id": seller_id}).to_list(100)
        for p in vendor_products:
            pid = str(p["_id"])
            p_visits = await db.attribution_events.count_documents({"seller_id": seller_id, "product_id": pid, "event_type": {"$in": ["directions_clicked", "location_visit_signal", "visit_confirmed_customer"]}, "timestamp": {"$gte": start_iso}})
            p_purchases = await db.purchase_attributions.find({"seller_id": seller_id, "product_id": pid, "purchased_at": {"$gte": start_iso}}).to_list(100)
            p_revenue = sum(x.get("amount", 0) for x in p_purchases)
            if p_visits > 0 or p["views"] > 0:
                products_driving_visits.append({"id": pid, "name": p["name"], "visits": p_visits, "views": p.get("views", 0)})
            if p_revenue > 0:
                products_driving_sales.append({"id": pid, "name": p["name"], "revenue": p_revenue, "purchases": len(p_purchases)})

        products_driving_visits.sort(key=lambda x: x["visits"], reverse=True)
        products_driving_sales.sort(key=lambda x: x["revenue"], reverse=True)

        # Mobile vendor demand-to-sale metrics (if cart vendor)
        mobile_metrics = None
        if user.get("vendor_type") == "cart_vendor":
            demand_count = await db.requests.count_documents({"status": "open", "created_at": {"$gte": start_iso}})
            accepted_count = await db.request_replies.count_documents({"vendor_id": seller_id, "created_at": {"$gte": start_iso}})
            matches_count = await db.attribution_events.count_documents({"seller_id": seller_id, "event_type": "contact_seller", "timestamp": {"$gte": start_iso}})
            arrivals_count = await db.attribution_events.count_documents({"seller_id": seller_id, "event_type": "vendor_arrival_marked", "timestamp": {"$gte": start_iso}})
            mobile_metrics = {
                "demand_requests": demand_count,
                "requests_accepted": accepted_count,
                "customer_matches": matches_count,
                "vendor_arrivals": arrivals_count,
                "confirmed_purchases": attributed_purchases_count,
                "attributed_revenue": attributed_revenue,
            }

        # Sales timeline chart data (daily points)
        chart_data = []
        for d in daily_sales[-30:]:
            # match purchases for that day
            day_str = d["date"]
            day_attr = sum(p["amount"] for p in purchases if p.get("purchased_at", "").startswith(day_str))
            chart_data.append({
                "date": day_str,
                "total_sales": d.get("total_sales", 0),
                "attributed_sales": day_attr,
                "customer_count": d.get("customer_count", 0),
            })

        # Today's quick numbers for mobile-first view
        today_iso = now.strftime("%Y-%m-%d")
        today_sales_doc = next((d for d in daily_sales if d.get("date") == today_iso), None)
        today_purchases = [p for p in purchases if p.get("purchased_at", "").startswith(today_iso)]
        today_attr_sales = sum(p["amount"] for p in today_purchases)
        today_visits = await db.verified_visits.count_documents({"seller_id": seller_id, "visit_time": {"$gte": today_iso}})
        # Attribution Quality, Cohorts & Confidence-Weighted Revenue
        quality_info = await compute_attribution_quality(db, seller_id)
        cohorts_info = await compute_customer_cohorts(db, seller_id)
        confidence_rev_info = await compute_confidence_revenue(db, seller_id, start_iso)

        return {
            "time_range": time_range,
            "today_quick": {
                "hyperlocal_customers": len({s.get("user_id") or s.get("session_token") for s in sessions if s.get("started_at", "").startswith(today_iso)}),
                "verified_visits": today_visits,
                "attributed_purchases": len(today_purchases),
                "attributed_sales": today_attr_sales,
                "total_sales": today_sales_doc.get("total_sales", 0) if today_sales_doc else 0,
                "observed_sales_vs_baseline": observed_sales_change_pct,
            },
            "attribution_quality": quality_info,
            "analytics_completeness": {
                "percentage": quality_info["completeness_percentage"],
                "items": quality_info["completeness_items"],
            },
            "confidence_revenue": confidence_rev_info,
            "cohorts": cohorts_info,
            "customer_acquisition": {
                "total_hyperlocal_customers": total_customers,
                "new_customers": new_customers_count,
                "returning_customers": repeat_customers_count,
                "repeat_customers": repeat_customers_count,
            },
            "visits": {
                "possible_visits": possible_visits,
                "likely_visits": likely_visits,
                "verified_visits": verified_visits_count,
                "total_likely_and_verified": total_visits_all,
            },
            "purchases": {
                "attributed_purchases": attributed_purchases_count,
                "purchase_conversion_rate": conversion_rates["visit_to_purchase"],
                "average_basket_value": round(avg_basket, 2),
            },
            "revenue": {
                "hyperlocal_attributed_revenue": round(attributed_revenue, 2),
                "total_reported_sales": round(total_reported_sales, 2),
                "other_reported_sales": round(max(0, total_reported_sales - attributed_revenue), 2),
                "estimated_incremental_sales": estimated_incremental,
                "methodology_disclaimer": "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement.",
            },
            "growth": {
                "has_baseline": bool(baseline),
                "baseline_source": baseline.get("source") if baseline else "None",
                "before_daily_sales": baseline_daily_sales,
                "before_daily_customers": baseline_daily_customers,
                "after_daily_sales": round(current_daily_sales_avg, 2),
                "after_daily_customers": round(current_daily_customers_avg, 1),
                "observed_sales_change_pct": observed_sales_change_pct,
                "observed_customer_change_pct": observed_customer_change_pct,
                "label": "Observed Change",
                "label_disclaimer": "The observed change reflects total reported business changes and is not guaranteed to be caused solely by HyperLocal.",
            },
            "funnel": {
                "impressions": impressions_count,
                "profile_views": profile_views_count,
                "high_intent": high_intent_count,
                "likely_and_verified_visits": total_visits_all,
                "attributed_purchases": attributed_purchases_count,
                "repeat_customers": repeat_customers_count,
            },
            "conversion_rates": conversion_rates,
            "small_sample": {
                "is_small": is_small_sample,
                "warning": sample_warning,
            },
            "products_performance": {
                "driving_visits": products_driving_visits[:5],
                "driving_sales": products_driving_sales[:5],
            },
            "attribution_quality": quality_info,
            "cohorts": cohorts_info,
            "confidence_revenue": confidence_rev_info,
            "mobile_vendor_funnel": mobile_metrics,
            "chart_data": chart_data,
        }

    # ---------- Export Analytics to CSV ----------

    @router.get("/vendor/export-analytics")
    async def export_vendor_analytics(user: dict = Depends(require_vendor)):
        seller_id = user["id"]
        daily_sales = await db.vendor_daily_sales.find({"seller_id": seller_id}).sort("date", -1).to_list(180)
        purchases = await db.purchase_attributions.find({"seller_id": seller_id}).sort("purchased_at", -1).to_list(200)

        lines = ["Date,Total Reported Sales,Customer Count,HyperLocal Customers,Attributed Revenue"]
        for d in daily_sales:
            date_str = d.get("date", "")
            attr_rev = sum(p["amount"] for p in purchases if p.get("purchased_at", "").startswith(date_str))
            lines.append(f"{date_str},{d.get('total_sales', 0)},{d.get('customer_count', 0)},{d.get('hyperlocal_customer_count', '')},{attr_rev}")

        csv_content = "\n".join(lines)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=business_impact_{user.get('shop_name', 'seller')}.csv"}
        )

    # ---------- Admin Endpoints ----------

    @router.get("/admin/business-impact")
    async def admin_business_impact(admin: dict = Depends(require_admin)):
        total_sellers = await db.users.count_documents({"role": "vendor"})
        active_sellers = await db.users.count_documents({"role": "vendor", "is_verified": True})
        total_searches = await db.attribution_events.count_documents({"event_type": "product_search"})
        total_profile_views = await db.attribution_events.count_documents({"event_type": "seller_profile_view"})
        verified_visits = await db.verified_visits.count_documents({})
        attributed_purchases = await db.purchase_attributions.count_documents({})

        purchases = await db.purchase_attributions.find({}).to_list(5000)
        total_attributed_revenue = sum(p.get("amount", 0) for p in purchases)

        daily_sales_all = await db.vendor_daily_sales.find({}).to_list(5000)
        total_reported_sales = sum(d.get("total_sales", 0) for d in daily_sales_all)

        return {
            "total_sellers": total_sellers,
            "active_sellers": active_sellers,
            "total_searches": total_searches,
            "total_profile_views": total_profile_views,
            "verified_visits": verified_visits,
            "attributed_purchases": attributed_purchases,
            "total_attributed_revenue": round(total_attributed_revenue, 2),
            "total_vendor_reported_sales": round(total_reported_sales, 2),
            "disclaimer": "Reported offline business metrics associated with verified HyperLocal customer journeys.",
        }

    @router.get("/admin/attribution/sessions")
    async def admin_list_sessions(
        seller_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        admin: dict = Depends(require_admin)
    ):
        q = {}
        if seller_id:
            q["seller_id"] = seller_id
        if status:
            q["attribution_status"] = status
        sessions = await db.attribution_sessions.find(q).sort("created_at", -1).limit(limit).to_list(limit)
        for s in sessions:
            s["id"] = str(s["_id"])
            s.pop("_id", None)
            seller = await db.users.find_one({"_id": ObjectId(s["seller_id"])})
            s["seller_name"] = seller.get("shop_name") or seller.get("name") if seller else "Unknown"
        return sessions

    @router.get("/admin/attribution/sessions/{session_id}")
    async def admin_get_session_journey(session_id: str, admin: dict = Depends(require_admin)):
        session = await db.attribution_sessions.find_one({"session_id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Attribution session not found")
        session["id"] = str(session["_id"])
        session.pop("_id", None)

        events = await db.attribution_events.find({"attribution_session_id": session_id}).sort("timestamp", 1).to_list(100)
        for e in events:
            e["id"] = str(e["_id"])
            e.pop("_id", None)

        signals = await db.visit_signals.find({"attribution_session_id": session_id}).sort("timestamp", 1).to_list(100)
        for s in signals:
            s["id"] = str(s["_id"])
            s.pop("_id", None)

        visits = await db.verified_visits.find({"attribution_session_id": session_id}).to_list(20)
        for v in visits:
            v["id"] = str(v["_id"])
            v.pop("_id", None)

        purchases = await db.purchase_attributions.find({"attribution_session_id": session_id}).to_list(20)
        for p in purchases:
            p["id"] = str(p["_id"])
            p.pop("_id", None)

        seller = await db.users.find_one({"_id": ObjectId(session["seller_id"])})
        customer = await db.users.find_one({"_id": ObjectId(session["user_id"])}) if session.get("user_id") else None

        return {
            "session": session,
            "seller": {"id": session["seller_id"], "name": seller.get("shop_name") or seller.get("name") if seller else "Unknown"},
            "customer": {"id": session.get("user_id"), "name": customer.get("name") if customer else "Anonymous / Guest"},
            "events": events,
            "signals": signals,
            "visits": visits,
            "purchases": purchases,
        }

    @router.patch("/admin/attribution/sessions/{session_id}")
    async def admin_patch_session(session_id: str, payload: dict, admin: dict = Depends(require_admin)):
        allowed = {"attribution_status", "intent_level", "notes"}
        update = {k: v for k, v in payload.items() if k in allowed}
        if update:
            await db.attribution_sessions.update_one({"session_id": session_id}, {"$set": update})
        fresh = await db.attribution_sessions.find_one({"session_id": session_id})
        if fresh:
            fresh["id"] = str(fresh["_id"])
            fresh.pop("_id", None)
            return fresh
        return {"ok": True}

    @router.get("/admin/attribution/purchases")
    async def admin_list_purchases(limit: int = 100, admin: dict = Depends(require_admin)):
        docs = await db.purchase_attributions.find({}).sort("purchased_at", -1).limit(limit).to_list(limit)
        for d in docs:
            d["id"] = str(d["_id"])
            d.pop("_id", None)
            seller = await db.users.find_one({"_id": ObjectId(d["seller_id"])})
            d["shop_name"] = seller.get("shop_name") if seller else "Unknown"
        return docs

    @router.patch("/admin/attribution/purchases/{purchase_id}")
    async def admin_patch_purchase(purchase_id: str, payload: dict, admin: dict = Depends(require_admin)):
        try:
            oid = ObjectId(purchase_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid purchase ID")
        allowed = {"amount", "confidence_level", "trust_level", "notes"}
        update = {k: v for k, v in payload.items() if k in allowed}
        if "amount" in update:
            update["amount"] = float(update["amount"])
        if update:
            await db.purchase_attributions.update_one({"_id": oid}, {"$set": update})
        fresh = await db.purchase_attributions.find_one({"_id": oid})
        if fresh:
            fresh["id"] = str(fresh["_id"])
            fresh.pop("_id", None)
            return fresh
        return {"ok": True}

    @router.delete("/admin/attribution/purchases/{purchase_id}")
    async def admin_delete_purchase(purchase_id: str, admin: dict = Depends(require_admin)):
        try:
            oid = ObjectId(purchase_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid purchase ID")
        await db.purchase_attributions.delete_one({"_id": oid})
        return {"ok": True}

    @router.get("/admin/attribution/anomalies")
    async def admin_list_anomalies(admin: dict = Depends(require_admin)):
        docs = await db.attribution_anomalies.find({}).sort("created_at", -1).limit(100).to_list(100)
        for d in docs:
            d["id"] = str(d["_id"])
            d.pop("_id", None)
        return docs

    @router.get("/admin/attribution/config")
    async def admin_get_config(admin: dict = Depends(require_admin)):
        return await get_config()

    @router.patch("/admin/attribution/config")
    async def admin_patch_config(payload: AttributionConfigPatch, admin: dict = Depends(require_admin)):
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if update:
            await db.admin_settings.update_one({"_id": "attribution"}, {"$set": update}, upsert=True)
        return await get_config()

    # ---------- Receipt OCR & Seller Matching ----------

    @router.post("/attribution/receipt/upload")
    async def upload_receipt(payload: ReceiptUploadIn, user: Optional[dict] = Depends(get_optional_user)):
        user_id = user["id"] if user else None
        now_s = now_iso()
        vendors = await db.users.find({"role": "vendor"}).to_list(500)
        raw_text = payload.raw_text or ""
        if not raw_text and payload.seller_hint:
            raw_text = f"{payload.seller_hint}\nDate: {now_s[:10]}\nTotal: 250.0"

        extracted = parse_receipt_text(raw_text, vendors)

        matched_session = None
        if extracted.get("matched_seller_id"):
            q = {"seller_id": extracted["matched_seller_id"], "attribution_status": {"$in": ["active", "likely_visit"]}}
            if user_id:
                q["user_id"] = user_id
            matched_session = await db.attribution_sessions.find_one(q, sort=[("last_activity_at", -1)])

        receipt_id = f"rcpt_{uuid.uuid4().hex[:12]}"
        receipt_doc = {
            "id": receipt_id,
            "receipt_id": receipt_id,
            "user_id": user_id,
            "extracted_data": extracted,
            "seller_id": extracted.get("matched_seller_id"),
            "session_id": matched_session.get("session_id") if matched_session else None,
            "status": "draft",
            "created_at": now_s,
        }
        await db.receipt_attributions.insert_one(receipt_doc)

        return {
            "receipt_id": receipt_id,
            "extracted": extracted,
            "matched_seller": {
                "id": extracted.get("matched_seller_id"),
                "name": extracted.get("matched_seller_name"),
                "confidence": extracted.get("match_confidence", 0.0),
            },
            "suggested_session_id": matched_session.get("session_id") if matched_session else None,
        }

    @router.post("/attribution/receipt/confirm")
    async def confirm_receipt(payload: ReceiptConfirmIn, user: dict = Depends(require_consumer)):
        now_s = now_iso()
        cfg = await get_config()
        pts = cfg.get("points_per_purchase_confirmation", DEFAULT_POINTS_PURCHASE)

        seller = await db.users.find_one({"_id": ObjectId(payload.seller_id)})
        if not seller:
            raise HTTPException(status_code=404, detail="Seller not found")

        session = None
        if payload.session_id:
            session = await db.attribution_sessions.find_one({"session_id": payload.session_id})
        if not session:
            session = await db.attribution_sessions.find_one({
                "user_id": user["id"],
                "seller_id": payload.seller_id,
                "attribution_status": {"$in": ["active", "likely_visit", "verified_visit"]},
            }, sort=[("last_activity_at", -1)])

        if not session:
            session_id = await next_session_number()
            session = {
                "session_id": session_id,
                "user_id": user["id"],
                "session_token": str(uuid.uuid4()),
                "seller_id": payload.seller_id,
                "session_type": "receipt_ocr",
                "started_at": now_s,
                "last_activity_at": now_s,
                "intent_level": "VERY_HIGH",
                "attribution_status": "purchase_attributed",
                "attribution_window_start": now_s,
                "attribution_window_end": (now_utc() + timedelta(days=DEFAULT_WINDOW_DAYS)).isoformat(),
                "intent_signals": ["receipt_uploaded", "purchase_confirmed_customer"],
                "created_at": now_s,
            }
            await db.attribution_sessions.insert_one(session)
        else:
            session_id = session["session_id"]
            await db.attribution_sessions.update_one(
                {"_id": session["_id"]},
                {"$set": {"attribution_status": "purchase_attributed", "last_activity_at": now_s}}
            )

        purchase_id = str(uuid.uuid4())
        purchase_doc = {
            "id": purchase_id,
            "attribution_session_id": session_id,
            "seller_id": payload.seller_id,
            "customer_id": user["id"],
            "purchase_source": "receipt_ocr",
            "amount": float(payload.amount),
            "spend_range": payload.spend_range,
            "items": payload.items or [],
            "notes": payload.notes,
            "currency": "INR",
            "confidence_level": "VERIFIED",
            "trust_level": "Receipt OCR Verified",
            "purchased_at": now_s,
            "created_at": now_s,
        }
        await db.purchase_attributions.insert_one(purchase_doc)

        await db.verified_visits.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "seller_id": payload.seller_id,
            "customer_id": user["id"],
            "confirmation_source": "receipt_ocr",
            "confidence_level": "VERIFIED",
            "visit_time": now_s,
            "created_at": now_s,
        })

        if payload.receipt_id:
            await db.receipt_attributions.update_one(
                {"receipt_id": payload.receipt_id},
                {"$set": {"status": "confirmed", "session_id": session_id, "purchase_id": purchase_id, "confirmed_amount": payload.amount}}
            )

        await db.attribution_events.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "user_id": user["id"],
            "seller_id": payload.seller_id,
            "event_type": "purchase_receipt_verified",
            "metadata": {"amount": payload.amount, "receipt_id": payload.receipt_id},
            "timestamp": now_s,
        })

        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"hyperlocal_points": pts}})

        await db.customer_seller_relationships.update_one(
            {"customer_id": user["id"], "seller_id": payload.seller_id},
            {
                "$set": {"last_visit_at": now_s, "last_purchase_at": now_s, "relationship_status": "purchased"},
                "$inc": {"visit_count": 1, "purchase_count": 1, "total_spent": payload.amount},
                "$setOnInsert": {"first_verified_visit_at": now_s, "first_purchase_at": now_s, "created_at": now_s},
            },
            upsert=True
        )

        return {
            "ok": True,
            "session_id": session_id,
            "purchase_id": purchase_id,
            "status": "purchase_attributed",
            "points_earned": pts,
        }

    @router.get("/attribution/receipts")
    async def list_receipts(user: dict = Depends(get_current_user)):
        q = {"user_id": user["id"]} if user.get("role") == "consumer" else {"seller_id": user["id"]}
        docs = await db.receipt_attributions.find(q).sort("created_at", -1).limit(50).to_list(50)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("id"))
            d.pop("_id", None)
        return docs

    # ---------- Price & Availability Alerts ----------

    @router.post("/alerts/price")
    async def create_price_alert(payload: PriceAlertIn, user: dict = Depends(require_consumer)):
        prod = await db.products.find_one({"_id": ObjectId(payload.product_id)})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")
        now_s = now_iso()
        alert_id = f"alt_{uuid.uuid4().hex[:10]}"
        doc = {
            "id": alert_id,
            "alert_id": alert_id,
            "user_id": user["id"],
            "product_id": payload.product_id,
            "seller_id": str(prod["vendor_id"]),
            "product_name": prod.get("name"),
            "alert_type": "price_drop",
            "target_price": float(payload.target_price),
            "initial_price": float(prod.get("price", 0)),
            "status": "active",
            "created_at": now_s,
            "triggered_at": None,
        }
        await db.alerts.insert_one(doc)
        return {"ok": True, "alert_id": alert_id, "status": "active", "target_price": payload.target_price}

    @router.post("/alerts/availability")
    async def create_availability_alert(payload: AvailabilityAlertIn, user: dict = Depends(require_consumer)):
        prod = await db.products.find_one({"_id": ObjectId(payload.product_id)})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")
        now_s = now_iso()
        alert_id = f"alt_{uuid.uuid4().hex[:10]}"
        doc = {
            "id": alert_id,
            "alert_id": alert_id,
            "user_id": user["id"],
            "product_id": payload.product_id,
            "seller_id": str(prod["vendor_id"]),
            "product_name": prod.get("name"),
            "alert_type": "in_stock",
            "initial_in_stock": bool(prod.get("in_stock", False)),
            "status": "active",
            "created_at": now_s,
            "triggered_at": None,
        }
        await db.alerts.insert_one(doc)
        return {"ok": True, "alert_id": alert_id, "status": "active"}

    @router.get("/alerts")
    async def list_user_alerts(user: dict = Depends(require_consumer)):
        alerts = await db.alerts.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
        for a in alerts:
            a["id"] = str(a.get("_id") or a.get("id"))
            a.pop("_id", None)
            try:
                prod = await db.products.find_one({"_id": ObjectId(a["product_id"])})
                if prod:
                    a["current_price"] = prod.get("price")
                    a["current_in_stock"] = prod.get("in_stock", False)
                    a["product_name"] = prod.get("name")
                    a["product_image"] = prod.get("image_url")
            except Exception:
                pass
            try:
                seller = await db.users.find_one({"_id": ObjectId(a["seller_id"])})
                if seller:
                    a["shop_name"] = seller.get("shop_name") or seller.get("name")
            except Exception:
                pass
        return alerts

    @router.delete("/alerts/{alert_id}")
    async def delete_alert(alert_id: str, user: dict = Depends(require_consumer)):
        res = await db.alerts.delete_one({"$or": [{"alert_id": alert_id}, {"id": alert_id}], "user_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"ok": True}

    @router.post("/attribution/alert-opened")
    async def alert_opened(payload: AlertOpenedIn, user: Optional[dict] = Depends(get_optional_user)):
        now_s = now_iso()
        user_id = user["id"] if user else None

        alert = await db.alerts.find_one({"$or": [{"alert_id": payload.alert_id}, {"id": payload.alert_id}]})
        alert_type = alert.get("alert_type") if alert else "price_drop"
        event_type = "price_alert_opened" if alert_type == "price_drop" else "availability_alert_opened"

        q = {"seller_id": payload.seller_id, "attribution_status": {"$in": ["active", "likely_visit"]}}
        if user_id:
            q["user_id"] = user_id
        session = await db.attribution_sessions.find_one(q, sort=[("last_activity_at", -1)])

        if not session:
            session_id = await next_session_number()
            session = {
                "session_id": session_id,
                "user_id": user_id,
                "session_token": str(uuid.uuid4()),
                "seller_id": payload.seller_id,
                "product_id": payload.product_id,
                "session_type": "alert_driven",
                "started_at": now_s,
                "last_activity_at": now_s,
                "intent_level": "HIGH",
                "attribution_status": "active",
                "attribution_window_start": now_s,
                "attribution_window_end": (now_utc() + timedelta(days=DEFAULT_WINDOW_DAYS)).isoformat(),
                "intent_signals": [event_type],
                "created_at": now_s,
            }
            await db.attribution_sessions.insert_one(session)
        else:
            session_id = session["session_id"]
            signals = session.get("intent_signals", [])
            if event_type not in signals:
                signals.append(event_type)
            await db.attribution_sessions.update_one(
                {"_id": session["_id"]},
                {"$set": {"last_activity_at": now_s, "intent_signals": signals, "intent_level": "HIGH"}}
            )

        await db.attribution_events.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "user_id": user_id,
            "seller_id": payload.seller_id,
            "product_id": payload.product_id,
            "event_type": event_type,
            "metadata": {"alert_id": payload.alert_id},
            "timestamp": now_s,
        })

        return {"ok": True, "session_id": session_id, "intent_level": "HIGH"}

    # ---------- HyperLocal Trip Sessions ----------

    @router.post("/attribution/trip/start")
    async def start_trip(payload: TripStartIn, user: Optional[dict] = Depends(get_optional_user)):
        seller = await db.users.find_one({"_id": ObjectId(payload.seller_id)})
        if not seller:
            raise HTTPException(status_code=404, detail="Seller not found")

        now = now_utc()
        now_s = now.isoformat()
        user_id = user["id"] if user else None
        trip_id = f"trip_{uuid.uuid4().hex[:12]}"
        dest_lat = payload.destination_lat or seller.get("lat")
        dest_lng = payload.destination_lng or seller.get("lng")

        trip_doc = {
            "id": trip_id,
            "trip_id": trip_id,
            "user_id": user_id,
            "seller_id": payload.seller_id,
            "destination_lat": dest_lat,
            "destination_lng": dest_lng,
            "status": "in_progress",
            "started_at": now_s,
            "arrived_at": None,
            "dwell_seconds": 0,
            "expires_at": (now + timedelta(hours=3)).isoformat(),
        }
        await db.trips.insert_one(trip_doc)

        q = {"seller_id": payload.seller_id, "attribution_status": {"$in": ["active", "likely_visit"]}}
        if user_id:
            q["user_id"] = user_id
        session = await db.attribution_sessions.find_one(q, sort=[("last_activity_at", -1)])

        if not session:
            session_id = await next_session_number()
            session = {
                "session_id": session_id,
                "user_id": user_id,
                "session_token": str(uuid.uuid4()),
                "seller_id": payload.seller_id,
                "session_type": "trip_navigation",
                "started_at": now_s,
                "last_activity_at": now_s,
                "intent_level": "VERY_HIGH",
                "attribution_status": "active",
                "attribution_window_start": now_s,
                "attribution_window_end": (now + timedelta(days=DEFAULT_WINDOW_DAYS)).isoformat(),
                "intent_signals": ["navigation_started"],
                "created_at": now_s,
            }
            await db.attribution_sessions.insert_one(session)
        else:
            session_id = session["session_id"]
            signals = session.get("intent_signals", [])
            if "navigation_started" not in signals:
                signals.append("navigation_started")
            await db.attribution_sessions.update_one(
                {"_id": session["_id"]},
                {"$set": {"last_activity_at": now_s, "intent_signals": signals, "intent_level": "VERY_HIGH"}}
            )

        await db.attribution_events.insert_one({
            "id": str(uuid.uuid4()),
            "attribution_session_id": session_id,
            "user_id": user_id,
            "seller_id": payload.seller_id,
            "event_type": "navigation_started",
            "metadata": {"trip_id": trip_id},
            "timestamp": now_s,
        })

        return {"ok": True, "trip_id": trip_id, "session_id": session_id}

    @router.post("/attribution/trip/ping")
    async def ping_trip(payload: TripPingIn):
        trip = await db.trips.find_one({"trip_id": payload.trip_id, "status": "in_progress"})
        if not trip:
            raise HTTPException(status_code=404, detail="Active trip not found or expired")

        now = now_utc()
        now_s = now.isoformat()
        cfg = await get_config()
        geofence_r = cfg.get("geofence_radius_meters", DEFAULT_GEOFENCE_METERS)
        min_dwell = cfg.get("min_dwell_seconds", DEFAULT_MIN_DWELL_SECONDS)

        dest_lat = trip.get("destination_lat")
        dest_lng = trip.get("destination_lng")
        dist = haversine_meters(payload.lat, payload.lng, dest_lat, dest_lng)

        arrived = False
        dwell_s = trip.get("dwell_seconds", 0)
        arrived_at = trip.get("arrived_at")

        if dist is not None and dist <= geofence_r:
            arrived = True
            if not arrived_at:
                arrived_at = now_s
                dwell_s = 0
            else:
                try:
                    arr_dt = datetime.fromisoformat(arrived_at.replace("Z", "+00:00"))
                    dwell_s = int((now - arr_dt).total_seconds())
                except Exception:
                    dwell_s += 10

        update = {
            "last_ping_lat": payload.lat,
            "last_ping_lng": payload.lng,
            "last_distance_m": dist,
            "last_ping_at": now_s,
            "arrived_at": arrived_at,
            "dwell_seconds": dwell_s,
        }
        await db.trips.update_one({"_id": trip["_id"]}, {"$set": update})

        promoted = False
        if arrived and dwell_s >= min_dwell:
            q = {"seller_id": trip["seller_id"], "attribution_status": {"$in": ["active", "likely_visit"]}}
            if trip.get("user_id"):
                q["user_id"] = trip["user_id"]
            session = await db.attribution_sessions.find_one(q, sort=[("last_activity_at", -1)])
            if session:
                new_status = "likely_visit"
                await db.attribution_sessions.update_one(
                    {"_id": session["_id"]},
                    {"$set": {"attribution_status": new_status, "dwell_seconds": dwell_s}}
                )
                promoted = True

        return {
            "ok": True,
            "trip_id": payload.trip_id,
            "distance_meters": round(dist, 1) if dist is not None else None,
            "arrived": arrived,
            "dwell_seconds": dwell_s,
            "promoted": promoted,
        }

    @router.post("/attribution/trip/end")
    async def end_trip(payload: TripEndIn):
        now_s = now_iso()
        res = await db.trips.update_one(
            {"trip_id": payload.trip_id},
            {"$set": {"status": "completed", "ended_at": now_s}}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Trip not found")
        return {"ok": True, "trip_id": payload.trip_id, "status": "completed"}

    @router.get("/attribution/trip/{trip_id}")
    async def get_trip(trip_id: str):
        trip = await db.trips.find_one({"trip_id": trip_id})
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        trip["id"] = str(trip.get("_id") or trip.get("id"))
        trip.pop("_id", None)
        return trip

    # ---------- Vendor One-Tap Possible Visits & Sales Batch Import ----------

    @router.get("/vendor/possible-visits")
    async def get_possible_visits(user: dict = Depends(require_vendor)):
        seller_id = user["id"]
        seven_days_ago = (now_utc() - timedelta(days=7)).isoformat()

        sessions = await db.attribution_sessions.find({
            "seller_id": seller_id,
            "attribution_status": {"$in": ["active", "likely_visit"]},
            "intent_level": {"$in": ["HIGH", "VERY_HIGH", "MEDIUM"]},
            "vendor_confirmed": {"$ne": True},
            "vendor_ignored": {"$ne": True},
            "last_activity_at": {"$gte": seven_days_ago},
        }).sort("last_activity_at", -1).limit(20).to_list(20)

        results = []
        for s in sessions:
            cust_name = "Anonymous Shopper"
            if s.get("user_id"):
                u = await db.users.find_one({"_id": ObjectId(s["user_id"])})
                if u:
                    cust_name = u.get("name", "Registered Shopper")
            results.append({
                "session_id": s["session_id"],
                "customer_label": cust_name,
                "intent_level": s.get("intent_level", "HIGH"),
                "attribution_status": s.get("attribution_status", "active"),
                "intent_signals": s.get("intent_signals", []),
                "time": s.get("last_activity_at"),
                "dwell_seconds": s.get("dwell_seconds", 0),
            })
        return results

    @router.post("/vendor/confirm-visit")
    async def vendor_confirm_visit(payload: VendorConfirmVisitIn, user: dict = Depends(require_vendor)):
        seller_id = user["id"]
        now_s = now_iso()

        session = await db.attribution_sessions.find_one({"session_id": payload.session_id, "seller_id": seller_id})
        if not session:
            raise HTTPException(status_code=404, detail="Attribution session not found")

        if payload.action == "ignore":
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"vendor_ignored": True}})
            return {"ok": True, "action": "ignored"}

        if payload.action == "did_not_purchase":
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"vendor_confirmed": True, "attribution_status": "verified_visit"}})
            await db.verified_visits.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "seller_id": seller_id,
                "customer_id": session.get("user_id"),
                "confirmation_source": "vendor_one_tap",
                "confidence_level": "VERIFIED",
                "visit_time": now_s,
                "created_at": now_s,
            })
            return {"ok": True, "action": "visit_confirmed_no_purchase"}

        if payload.action == "confirm_visit":
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"vendor_confirmed": True, "attribution_status": "verified_visit"}})
            await db.verified_visits.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "seller_id": seller_id,
                "customer_id": session.get("user_id"),
                "confirmation_source": "vendor_one_tap",
                "confidence_level": "VERIFIED",
                "visit_time": now_s,
                "created_at": now_s,
            })
            return {"ok": True, "action": "visit_confirmed"}

        if payload.action == "purchased":
            amt = float(payload.amount or 150.0)
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"vendor_confirmed": True, "attribution_status": "purchase_attributed"}})
            await db.verified_visits.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "seller_id": seller_id,
                "customer_id": session.get("user_id"),
                "confirmation_source": "vendor_one_tap",
                "confidence_level": "VERIFIED",
                "visit_time": now_s,
                "created_at": now_s,
            })
            await db.purchase_attributions.insert_one({
                "id": str(uuid.uuid4()),
                "attribution_session_id": payload.session_id,
                "seller_id": seller_id,
                "customer_id": session.get("user_id"),
                "purchase_source": "vendor_one_tap",
                "amount": amt,
                "currency": "INR",
                "confidence_level": "VERIFIED",
                "trust_level": "Vendor Confirmed",
                "notes": payload.notes,
                "purchased_at": now_s,
                "created_at": now_s,
            })
            return {"ok": True, "action": "purchase_confirmed", "amount": amt}

        return {"ok": True}

    @router.post("/vendor/sales-import")
    async def import_vendor_sales(payload: SalesImportIn, user: dict = Depends(require_vendor)):
        seller_id = user["id"]
        now_s = now_iso()
        baseline = await db.seller_baselines.find_one({"seller_id": seller_id})

        rows_to_process = []
        if payload.rows:
            rows_to_process = [r.model_dump() for r in payload.rows]
        elif payload.csv_text:
            f = io.StringIO(payload.csv_text.strip())
            reader = csv.DictReader(f)
            for row in reader:
                date_val = row.get("date") or row.get("Date") or ""
                sales_val = row.get("total_sales") or row.get("Total Sales") or row.get("sales") or "0"
                cust_val = row.get("customer_count") or row.get("Customer Count") or row.get("customers") or "0"
                hl_val = row.get("hyperlocal_customer_count") or row.get("HyperLocal Customers") or None
                if date_val:
                    try:
                        rows_to_process.append({
                            "date": date_val.strip(),
                            "total_sales": float(sales_val.strip()),
                            "customer_count": int(cust_val.strip()),
                            "hyperlocal_customer_count": int(hl_val.strip()) if hl_val else None,
                            "notes": row.get("notes") or row.get("Notes"),
                        })
                    except ValueError:
                        pass

        if not rows_to_process:
            raise HTTPException(status_code=400, detail="No valid sales rows found in import")

        imported_count = 0
        anomalies_count = 0

        for r in rows_to_process:
            try:
                datetime.strptime(r["date"], "%Y-%m-%d")
            except ValueError:
                continue

            tot_sales = float(r["total_sales"])
            is_anomaly = False
            anomaly_reason = None
            if tot_sales > 300000:
                is_anomaly = True
                anomaly_reason = "Unusually high reported daily sales (> ₹3,00,000)"
            elif baseline and baseline.get("average_daily_sales", 0) > 0:
                if tot_sales > (baseline["average_daily_sales"] * 4) and tot_sales > 20000:
                    is_anomaly = True
                    anomaly_reason = f"Sales spike {round(tot_sales / baseline['average_daily_sales'], 1)}x over reported baseline"

            doc = {
                "seller_id": seller_id,
                "date": r["date"],
                "total_sales": tot_sales,
                "customer_count": int(r["customer_count"]),
                "hyperlocal_customer_count": r.get("hyperlocal_customer_count"),
                "notes": r.get("notes"),
                "source": "csv_import",
                "trust_level": "Vendor Reported (CSV)",
                "is_flagged_anomaly": is_anomaly,
                "anomaly_reason": anomaly_reason,
                "created_at": now_s,
            }
            await db.vendor_daily_sales.update_one(
                {"seller_id": seller_id, "date": r["date"]},
                {"$set": doc},
                upsert=True
            )
            imported_count += 1
            if is_anomaly:
                anomalies_count += 1
                await db.attribution_anomalies.insert_one({
                    "seller_id": seller_id,
                    "shop_name": user.get("shop_name"),
                    "date": r["date"],
                    "amount": tot_sales,
                    "reason": anomaly_reason,
                    "status": "pending_review",
                    "created_at": now_s,
                })

        return {
            "ok": True,
            "imported_count": imported_count,
            "anomalies_count": anomalies_count,
        }

    # ---------- Super Admin Control Center Endpoints ----------

    @router.get("/admin/global-search")
    async def admin_global_search(q: str = Query("", min_length=1), limit: int = 15, admin: dict = Depends(require_admin)):
        query_str = q.strip()
        reg = {"$regex": query_str, "$options": "i"}

        user_docs = await db.users.find({
            "$or": [{"name": reg}, {"email": reg}, {"shop_name": reg}, {"phone": reg}]
        }).limit(limit).to_list(limit)
        sanitized_users = [sanitize_user_dict(u) for u in user_docs]

        product_docs = await db.products.find({
            "$or": [{"name": reg}, {"description": reg}, {"category": reg}]
        }).limit(limit).to_list(limit)
        for p in product_docs:
            p["id"] = str(p["_id"])
            p.pop("_id", None)

        grievance_docs = await db.grievances.find({
            "$or": [{"grievance_number": reg}, {"subject": reg}, {"description": reg}]
        }).limit(limit).to_list(limit)
        for g in grievance_docs:
            g["id"] = str(g["_id"])
            g.pop("_id", None)

        session_docs = await db.attribution_sessions.find({"session_id": reg}).limit(limit).to_list(limit)
        for s in session_docs:
            s["id"] = str(s["_id"])
            s.pop("_id", None)

        order_docs = await db.orders.find({
            "$or": [{"order_id": reg}, {"id": reg}]
        }).limit(limit).to_list(limit)
        for o in order_docs:
            o["id"] = str(o.get("_id") or o.get("id"))
            o.pop("_id", None)

        return {
            "query": query_str,
            "results": {
                "users": sanitized_users,
                "products": product_docs,
                "grievances": grievance_docs,
                "attribution_sessions": session_docs,
                "orders": order_docs,
            },
            "total_matches": len(sanitized_users) + len(product_docs) + len(grievance_docs) + len(session_docs) + len(order_docs),
        }

    @router.get("/admin/users/{user_id}/full-profile")
    async def admin_user_full_profile(user_id: str, admin: dict = Depends(require_admin)):
        user = None
        try:
            user = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        uid = str(user["_id"])
        role = user.get("role", "consumer")
        sanitized = sanitize_user_dict(user)

        orders_count = await db.orders.count_documents({"customer_id": uid}) if role == "consumer" else await db.orders.count_documents({"vendor_id": uid})
        reviews_count = await db.reviews.count_documents({"customer_id": uid}) if role == "consumer" else await db.reviews.count_documents({"seller_id": uid})
        grievances_count = await db.grievances.count_documents({"complainant_user_id": uid})

        verified_visits = await db.verified_visits.count_documents({"customer_id": uid}) if role == "consumer" else await db.verified_visits.count_documents({"seller_id": uid})
        purchases = await db.purchase_attributions.find({"customer_id": uid} if role == "consumer" else {"seller_id": uid}).to_list(100)
        total_attributed_revenue = sum(p.get("amount", 0) for p in purchases)

        vendor_stats = None
        if role == "vendor":
            quality = await compute_attribution_quality(db, uid)
            baseline = await db.seller_baselines.find_one({"seller_id": uid})
            products_count = await db.products.count_documents({"vendor_id": uid})
            sales_count = await db.vendor_daily_sales.count_documents({"seller_id": uid})
            vendor_stats = {
                "quality_score": quality["quality_score"],
                "quality_rating": quality["rating"],
                "products_count": products_count,
                "sales_logged_count": sales_count,
                "baseline": baseline.get("average_daily_sales") if baseline else None,
            }

        recent_sessions = await db.attribution_sessions.find({"user_id": uid} if role == "consumer" else {"seller_id": uid}).sort("created_at", -1).limit(10).to_list(10)
        for s in recent_sessions:
            s["id"] = str(s["_id"])
            s.pop("_id", None)

        return {
            "user": sanitized,
            "role": role,
            "activity": {
                "orders_count": orders_count,
                "reviews_count": reviews_count,
                "grievances_count": grievances_count,
                "verified_visits": verified_visits,
                "attributed_purchases": len(purchases),
                "attributed_revenue": round(total_attributed_revenue, 2),
                "hyperlocal_points": user.get("hyperlocal_points", 0),
            },
            "vendor_stats": vendor_stats,
            "recent_sessions": recent_sessions,
        }

    @router.post("/admin/audit/reveal")
    async def admin_reveal_sensitive_data(payload: AuditRevealIn, admin: dict = Depends(require_admin)):
        if not payload.reason or len(payload.reason.strip()) < 3:
            raise HTTPException(status_code=400, detail="Administrative reason is strictly required to reveal sensitive data")

        target = None
        try:
            target = await db.users.find_one({"_id": ObjectId(payload.entity_id)})
        except Exception:
            target = await db.users.find_one({"id": payload.entity_id})
        if not target:
            raise HTTPException(status_code=404, detail="Target entity not found")

        unmasked_val = target.get(payload.field)
        if not unmasked_val:
            raise HTTPException(status_code=404, detail=f"Field '{payload.field}' not present on entity")

        now_s = now_iso()
        audit_doc = {
            "id": str(uuid.uuid4()),
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": "reveal_sensitive_data",
            "entity_type": payload.entity_type,
            "entity_id": payload.entity_id,
            "target_name": target.get("name") or target.get("shop_name"),
            "field": payload.field,
            "reason": payload.reason.strip(),
            "timestamp": now_s,
        }
        await db.admin_audit_logs.insert_one(audit_doc)

        return {
            "ok": True,
            "entity_id": payload.entity_id,
            "field": payload.field,
            "value": unmasked_val,
            "revealed_at": now_s,
        }

    @router.get("/admin/audit-logs")
    async def admin_get_audit_logs(
        limit: int = 50,
        skip: int = 0,
        action: Optional[str] = None,
        admin: dict = Depends(require_admin)
    ):
        q = {}
        if action:
            q["action"] = action
        total = await db.admin_audit_logs.count_documents(q)
        docs = await db.admin_audit_logs.find(q).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
        for d in docs:
            d["id"] = str(d.get("_id") or d.get("id"))
            d.pop("_id", None)
        return {
            "total": total,
            "logs": docs,
            "limit": limit,
            "skip": skip,
        }

    @router.post("/admin/impersonate/{user_id}")
    async def admin_impersonate_user(user_id: str, admin: dict = Depends(require_admin)):
        target = None
        try:
            target = await db.users.find_one({"_id": ObjectId(user_id)})
        except Exception:
            target = await db.users.find_one({"id": user_id})
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

        tid = str(target["_id"])
        role = target.get("role", "consumer")
        token = create_impersonation_token(tid, role, admin["id"])

        now_s = now_iso()
        await db.admin_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": "impersonate_user",
            "entity_type": "user",
            "entity_id": tid,
            "target_name": target.get("name"),
            "target_role": role,
            "reason": "Administrative inspection session",
            "timestamp": now_s,
        })

        return {
            "ok": True,
            "token": token,
            "access_token": token,
            "impersonated": True,
            "user": {
                "id": tid,
                "name": target.get("name"),
                "role": role,
                "email": mask_email(target.get("email")),
                "shop_name": target.get("shop_name"),
            }
        }

    @router.post("/admin/attribution/sessions/{session_id}/resolve-dispute")
    async def admin_resolve_attribution_dispute(session_id: str, payload: DisputeResolveIn, admin: dict = Depends(require_admin)):
        session = await db.attribution_sessions.find_one({"session_id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Attribution session not found")

        now_s = now_iso()
        new_status = session.get("attribution_status")

        if payload.action == "approve":
            new_status = payload.new_status or "verified_visit"
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"attribution_status": new_status, "dispute_resolved": True}})
        elif payload.action == "reject":
            new_status = "disputed_rejected"
            await db.attribution_sessions.update_one({"_id": session["_id"]}, {"$set": {"attribution_status": new_status, "dispute_resolved": True}})
        elif payload.action == "adjust_amount" and payload.adjusted_amount is not None:
            await db.purchase_attributions.update_one(
                {"attribution_session_id": session_id},
                {"$set": {"amount": float(payload.adjusted_amount), "notes": f"Admin adjusted: {payload.justification}"}}
            )

        await db.admin_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": "attribution_dispute_resolved",
            "entity_type": "attribution_session",
            "entity_id": session_id,
            "dispute_action": payload.action,
            "justification": payload.justification,
            "adjusted_amount": payload.adjusted_amount,
            "timestamp": now_s,
        })

        return {"ok": True, "session_id": session_id, "action": payload.action, "new_status": new_status}

    @router.post("/admin/bulk-action")
    async def admin_bulk_action(payload: BulkActionIn, admin: dict = Depends(require_admin)):
        now_s = now_iso()
        oids = []
        for x in payload.ids:
            try:
                oids.append(ObjectId(x))
            except Exception:
                pass

        affected_count = 0
        if payload.entity == "vendors":
            val = True if payload.action == "verify" else False
            res = await db.users.update_many({"_id": {"$in": oids}}, {"$set": {"is_verified": val}})
            affected_count = res.modified_count
        elif payload.entity == "products":
            val = True if payload.action == "activate" else False
            res = await db.products.update_many({"_id": {"$in": oids}}, {"$set": {"in_stock": val}})
            affected_count = res.modified_count
        elif payload.entity == "grievances":
            new_st = "resolved" if payload.action == "resolve" else "in_review"
            res = await db.grievances.update_many({"_id": {"$in": oids}}, {"$set": {"status": new_st}})
            affected_count = res.modified_count

        await db.admin_audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": f"bulk_{payload.action}",
            "entity_type": payload.entity,
            "target_count": len(payload.ids),
            "affected_count": affected_count,
            "timestamp": now_s,
        })

        return {"ok": True, "entity": payload.entity, "action": payload.action, "count": affected_count}

    return router


async def create_attribution_indexes(db):
    """Creates performance indexes for the attribution engine."""
    await db.attribution_sessions.create_index("session_id", unique=True)
    await db.attribution_sessions.create_index("seller_id")
    await db.attribution_sessions.create_index("user_id")
    await db.attribution_events.create_index("attribution_session_id")
    await db.attribution_events.create_index("seller_id")
    await db.attribution_events.create_index("event_type")
    await db.verified_visits.create_index("seller_id")
    await db.verified_visits.create_index("attribution_session_id")
    await db.purchase_attributions.create_index("seller_id")
    await db.purchase_attributions.create_index("attribution_session_id")
    await db.vendor_daily_sales.create_index([("seller_id", 1), ("date", 1)], unique=True)
    await db.seller_baselines.create_index("seller_id", unique=True)
    await db.customer_seller_relationships.create_index([("customer_id", 1), ("seller_id", 1)], unique=True)
    await db.alerts.create_index([("user_id", 1), ("product_id", 1)])
    await db.alerts.create_index("product_id")
    await db.trips.create_index("trip_id", unique=True)
    await db.trips.create_index("seller_id")
    await db.receipt_attributions.create_index("id", unique=True)
    await db.admin_audit_logs.create_index("timestamp")
    await db.admin_audit_logs.create_index("admin_id")


async def seed_attribution_demo(db, vendor_ids: List[str]):
    """Seeds realistic baseline, daily sales, sessions, and purchases for demo vendors."""
    now = datetime.now(timezone.utc)
    for idx, vid in enumerate(vendor_ids[:3]):
        # 1. Baseline
        b_exist = await db.seller_baselines.find_one({"seller_id": vid})
        if not b_exist:
            await db.seller_baselines.insert_one({
                "seller_id": vid,
                "typical_daily_walkins": 22 + idx * 4,
                "typical_daily_revenue": 3800.0 + idx * 600.0,
                "typical_avg_order_value": 170.0 + idx * 25.0,
                "notes": "Estimated baseline before joining HyperLocal",
                "created_at": (now - timedelta(days=35)).isoformat(),
                "updated_at": (now - timedelta(days=35)).isoformat(),
            })

        # 2. Daily sales for last 14 days
        for d in range(14, 0, -1):
            day_dt = now - timedelta(days=d)
            date_str = day_dt.strftime("%Y-%m-%d")
            s_exist = await db.vendor_daily_sales.find_one({"seller_id": vid, "date": date_str})
            if not s_exist:
                total_sales = 4200.0 + ((d * 137) % 1800) + idx * 500.0
                cust_count = 25 + ((d * 7) % 15)
                hl_count = 4 + ((d * 3) % 7)
                await db.vendor_daily_sales.insert_one({
                    "seller_id": vid,
                    "date": date_str,
                    "total_sales": round(total_sales, 2),
                    "customer_count": cust_count,
                    "hyperlocal_customer_count": hl_count,
                    "note": "Regular daily business log",
                    "source": "vendor_entry",
                    "created_at": day_dt.isoformat(),
                    "updated_at": day_dt.isoformat(),
                })

        # 3. Sample attribution sessions & purchases
        sess_count = await db.attribution_sessions.count_documents({"seller_id": vid})
        if sess_count == 0:
            # Session 1: Dual confirmed purchase
            s1_id = f"HL-ATTR-{idx+1}001"
            s1_time = (now - timedelta(days=2, hours=3)).isoformat()
            await db.attribution_sessions.insert_one({
                "session_id": s1_id,
                "seller_id": vid,
                "user_id": None,
                "anon_device_id": f"anon-device-{idx}-1",
                "intent_level": "VERY_HIGH",
                "visit_status": "VERIFIED",
                "conversion_type": "IN_STORE_PURCHASE",
                "status": "CONVERTED",
                "first_event_at": s1_time,
                "last_event_at": s1_time,
                "expires_at": (now + timedelta(days=28)).isoformat(),
                "notes": "Verified visit with purchase confirmation",
                "customer_label": "New Shopper",
            })
            await db.attribution_events.insert_one({
                "attribution_session_id": s1_id,
                "seller_id": vid,
                "event_type": "directions_clicked",
                "created_at": s1_time,
                "metadata": {"source": "search"},
            })
            await db.verified_visits.insert_one({
                "attribution_session_id": s1_id,
                "seller_id": vid,
                "verification_method": "CUSTOMER_CONFIRMED",
                "verified_at": s1_time,
                "confidence_score": 0.95,
                "notes": "Customer confirmed visiting the store",
            })
            await db.purchase_attributions.insert_one({
                "attribution_session_id": s1_id,
                "seller_id": vid,
                "amount": 480.0,
                "confirmation_source": "BOTH",
                "verification_status": "HIGH_CONFIDENCE_VERIFIED",
                "spend_range": "251-500",
                "purchased_at": s1_time,
                "created_at": s1_time,
            })

            # Session 2: QR checkin purchase
            s2_id = f"HL-ATTR-{idx+1}002"
            s2_time = (now - timedelta(days=1, hours=5)).isoformat()
            await db.attribution_sessions.insert_one({
                "session_id": s2_id,
                "seller_id": vid,
                "user_id": None,
                "anon_device_id": f"anon-device-{idx}-2",
                "intent_level": "VERY_HIGH",
                "visit_status": "VERIFIED",
                "conversion_type": "IN_STORE_PURCHASE",
                "status": "CONVERTED",
                "first_event_at": s2_time,
                "last_event_at": s2_time,
                "expires_at": (now + timedelta(days=29)).isoformat(),
                "customer_label": "Returning Shopper",
            })
            await db.attribution_events.insert_one({
                "attribution_session_id": s2_id,
                "seller_id": vid,
                "event_type": "qr_checkin",
                "created_at": s2_time,
                "metadata": {"qr_source": "counter_stand"},
            })
            await db.verified_visits.insert_one({
                "attribution_session_id": s2_id,
                "seller_id": vid,
                "verification_method": "QR_SCAN",
                "verified_at": s2_time,
                "confidence_score": 0.98,
                "notes": "In-store QR scan check-in",
            })
            await db.purchase_attributions.insert_one({
                "attribution_session_id": s2_id,
                "seller_id": vid,
                "amount": 350.0,
                "confirmation_source": "CUSTOMER_CONFIRMED",
                "verification_status": "CUSTOMER_CONFIRMED",
                "spend_range": "251-500",
                "purchased_at": s2_time,
                "created_at": s2_time,
            })

