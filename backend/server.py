from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import math
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Annotated

import bcrypt
import jwt
import razorpay
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, BeforeValidator

# ---------- DB & App setup ----------
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

app = FastAPI(title="LocalPrice API")
api_router = APIRouter(prefix="/api")

JWT_ALGO = "HS256"
JWT_SECRET = os.environ['JWT_SECRET']

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', 'rzp_test_placeholder')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', 'placeholder_secret')
RAZORPAY_MODE = os.environ.get('RAZORPAY_MODE', 'mock')

# Admin allow-list — hard-coded single super admin
ADMIN_ALLOWED_EMAILS = {"dgstartup2026@gmail.com"}
ADMIN_SEED_EMAIL = "dgstartup2026@gmail.com"
ADMIN_SEED_PASSWORD = "Dgadmin@startup2026"
ADMIN_SEED_NAME = "Dhhruv Gupta"

razor_client = None
if RAZORPAY_MODE == 'live' and not RAZORPAY_KEY_ID.endswith('placeholder'):
    try:
        razor_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    except Exception as e:
        logging.warning(f"Razorpay client init failed: {e}")


# ---------- Categories ----------
CATEGORIES = [
    {"key": "vegetables", "label": "Vegetables", "emoji": "🥕"},
    {"key": "fruits", "label": "Fruits", "emoji": "🍎"},
    {"key": "groceries", "label": "Groceries", "emoji": "🛒"},
    {"key": "dairy", "label": "Dairy", "emoji": "🥛"},
    {"key": "bakery", "label": "Bakery", "emoji": "🍞"},
    {"key": "stationery", "label": "Stationery", "emoji": "✏️"},
    {"key": "clothing", "label": "Clothing", "emoji": "👕"},
    {"key": "household", "label": "Household", "emoji": "🧴"},
    {"key": "hardware", "label": "Hardware", "emoji": "🔧"},
    {"key": "pharmacy", "label": "Pharmacy", "emoji": "💊"},
    {"key": "flowers", "label": "Flowers", "emoji": "🌼"},
    {"key": "other", "label": "Other", "emoji": "📦"},
]

# Dehradun approximate center
DEFAULT_LAT = 30.3165
DEFAULT_LNG = 78.0322


# ---------- Helpers ----------
def obj_id_str(v):
    return str(v) if v is not None else None


PyObjectId = Annotated[str, BeforeValidator(obj_id_str)]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user["id"] = str(user["_id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_vendor(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "vendor":
        raise HTTPException(status_code=403, detail="Vendor account required")
    return user


async def require_consumer(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "consumer":
        raise HTTPException(status_code=403, detail="Consumer account required")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    # deny-by-default: role must be admin AND email must be in the hard-coded allow-list
    if user.get("role") != "admin" or user.get("email", "").lower() not in ADMIN_ALLOWED_EMAILS:
        raise HTTPException(status_code=404, detail="Not found")
    return user


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=7 * 24 * 3600, path="/",
    )


def haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def format_distance(km):
    if km is None:
        return None
    if km < 1:
        return f"{int(km * 1000)} m"
    return f"{km:.1f} km"


def compute_trial_status(user: dict) -> dict:
    if user.get("role") != "vendor":
        return {"is_pro": False, "trial_active": False, "days_left": 0, "product_limit": 0}
    is_pro = bool(user.get("is_pro"))
    pro_expires_at = user.get("pro_expires_at")
    if is_pro and pro_expires_at:
        try:
            exp = datetime.fromisoformat(pro_expires_at)
            if exp < datetime.now(timezone.utc):
                is_pro = False
        except Exception:
            pass
    trial_start = user.get("trial_started_at")
    days_left = 0
    trial_active = False
    if trial_start:
        try:
            ts = datetime.fromisoformat(trial_start)
            elapsed = (datetime.now(timezone.utc) - ts).days
            days_left = max(0, 30 - elapsed)
            trial_active = days_left > 0
        except Exception:
            pass
    product_limit = None if (is_pro or trial_active) else 15
    return {"is_pro": is_pro, "trial_active": trial_active, "days_left": days_left,
            "product_limit": product_limit, "pro_expires_at": pro_expires_at}


def serialize_user(user: dict) -> dict:
    base = {
        "id": user.get("id") or str(user.get("_id", "")),
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role"),
        "phone": user.get("phone"),
        "shop_name": user.get("shop_name"),
        "shop_address": user.get("shop_address"),
        "city": user.get("city", "Dehradun"),
        "vendor_type": user.get("vendor_type"),
        "is_verified": user.get("is_verified", False),
        "is_online": user.get("is_online", False),
        "opening_hours": user.get("opening_hours", "8:00 AM - 9:00 PM"),
        "lat": user.get("lat"),
        "lng": user.get("lng"),
        "avg_rating": user.get("avg_rating", 0),
        "review_count": user.get("review_count", 0),
        "product_count": user.get("product_count", 0),
        "created_at": user.get("created_at"),
        "trial_started_at": user.get("trial_started_at"),
        "is_pro": user.get("is_pro", False),
        "pro_expires_at": user.get("pro_expires_at"),
        "subscription_plan": user.get("subscription_plan"),
        **compute_trial_status(user),
    }
    return base


def serialize_vendor_public(u: dict, ref_lat=None, ref_lng=None) -> dict:
    dist = haversine_km(ref_lat, ref_lng, u.get("lat"), u.get("lng"))
    return {
        "id": str(u.get("_id") or u.get("id")),
        "name": u.get("name"),
        "shop_name": u.get("shop_name"),
        "shop_address": u.get("shop_address"),
        "vendor_type": u.get("vendor_type", "retailer"),
        "phone": u.get("phone"),
        "is_verified": u.get("is_verified", False),
        "is_online": u.get("is_online", False),
        "is_pro": u.get("is_pro", False),
        "opening_hours": u.get("opening_hours", "8:00 AM - 9:00 PM"),
        "lat": u.get("lat"),
        "lng": u.get("lng"),
        "avg_rating": round(u.get("avg_rating", 0), 1),
        "review_count": u.get("review_count", 0),
        "product_count": u.get("product_count", 0),
        "city": u.get("city", "Dehradun"),
        "distance_km": dist,
        "distance_label": format_distance(dist),
    }


async def refresh_vendor_stats(vendor_id: str):
    count = await db.products.count_documents({"vendor_id": vendor_id})
    reviews = await db.reviews.find({"vendor_id": vendor_id}).to_list(500)
    total = len(reviews)
    avg = (sum(r.get("rating", 0) for r in reviews) / total) if total else 0
    await db.users.update_one({"_id": ObjectId(vendor_id)},
                              {"$set": {"product_count": count, "avg_rating": avg, "review_count": total}})


# ---------- Models ----------
class ConsumerRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = None


class VendorRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: str
    shop_name: str
    shop_address: str
    vendor_type: Literal["retailer", "cart_vendor"] = "retailer"
    lat: Optional[float] = None
    lng: Optional[float] = None


class LoginPayload(BaseModel):
    email: str
    password: str


class ProductCreate(BaseModel):
    name: str
    category: Optional[str] = "other"
    price: float
    unit: Optional[str] = None
    description: Optional[str] = None
    in_stock: bool = True
    is_featured: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    in_stock: Optional[bool] = None
    is_featured: Optional[bool] = None


class VendorProfileUpdate(BaseModel):
    shop_name: Optional[str] = None
    shop_address: Optional[str] = None
    phone: Optional[str] = None
    opening_hours: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_online: Optional[bool] = None


class SubscribePayload(BaseModel):
    plan: Literal["weekly", "monthly", "yearly"]


class VerifyPaymentPayload(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: Optional[str] = None
    plan: Literal["weekly", "monthly", "yearly"]


class UpiPaymentSubmitPayload(BaseModel):
    plan: Literal["weekly", "monthly", "yearly", "custom"] = "monthly"
    utr_number: str
    custom_amount_rupees: Optional[float] = None
    payer_upi_id: Optional[str] = None
    notes: Optional[str] = None



class BranchCreate(BaseModel):
    branch_name: str
    address: str


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class MessageSend(BaseModel):
    to_user_id: str
    body: str
    product_id: Optional[str] = None


class RequestCreate(BaseModel):
    item: str
    quantity: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None


class RequestReplyCreate(BaseModel):
    price: float
    note: Optional[str] = None


# ---------- Auth ----------
@api_router.post("/auth/consumer/register")
async def consumer_register(payload: ConsumerRegister, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email, "password_hash": hash_password(payload.password),
        "name": payload.name, "role": "consumer", "phone": payload.phone,
        "city": "Dehradun", "lat": DEFAULT_LAT, "lng": DEFAULT_LNG,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    token = create_access_token(str(res.inserted_id), "consumer")
    set_auth_cookie(response, token)
    user = await db.users.find_one({"_id": res.inserted_id})
    user["id"] = str(user["_id"])
    return {"token": token, "user": serialize_user(user)}


@api_router.post("/auth/vendor/register")
async def vendor_register(payload: VendorRegister, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "email": email, "password_hash": hash_password(payload.password),
        "name": payload.name, "role": "vendor", "phone": payload.phone,
        "shop_name": payload.shop_name, "shop_address": payload.shop_address,
        "vendor_type": payload.vendor_type, "city": "Dehradun",
        "lat": payload.lat or DEFAULT_LAT + random.uniform(-0.02, 0.02),
        "lng": payload.lng or DEFAULT_LNG + random.uniform(-0.02, 0.02),
        "is_verified": False, "is_online": False,
        "opening_hours": "8:00 AM - 9:00 PM",
        "avg_rating": 0, "review_count": 0, "product_count": 0,
        "created_at": now, "trial_started_at": now,
        "is_pro": False, "subscription_plan": None,
    }
    res = await db.users.insert_one(doc)
    token = create_access_token(str(res.inserted_id), "vendor")
    set_auth_cookie(response, token)
    user = await db.users.find_one({"_id": res.inserted_id})
    user["id"] = str(user["_id"])
    return {"token": token, "user": serialize_user(user)}


@api_router.post("/auth/login")
async def login(payload: LoginPayload, response: Response, role: Optional[str] = Query(None)):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # Guard admin access — email must be in the allow-list AND the account must already be role=admin
    if role == "admin":
        if email not in ADMIN_ALLOWED_EMAILS or user.get("role") != "admin":
            raise HTTPException(status_code=404, detail="Not found")
    elif role and user.get("role") != role:
        raise HTTPException(status_code=403, detail=f"This account is registered as {user.get('role')}, not {role}")
    token = create_access_token(str(user["_id"]), user["role"])
    set_auth_cookie(response, token)
    user["id"] = str(user["_id"])
    return {"token": token, "user": serialize_user(user)}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# ---------- Meta ----------
@api_router.get("/categories")
async def get_categories():
    return CATEGORIES


@api_router.get("/stats/overview")
async def stats_overview():
    vendor_count = await db.users.count_documents({"role": "vendor", "is_verified": True})
    online_count = await db.users.count_documents({"role": "vendor", "is_online": True})
    product_count = await db.products.count_documents({})
    return {"vendor_count": vendor_count, "online_count": online_count, "product_count": product_count}


# ---------- Vendor: Profile ----------
@api_router.patch("/vendor/profile")
async def update_vendor_profile(payload: VendorProfileUpdate, user: dict = Depends(require_vendor)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": update})
        # propagate to products
        prop = {}
        if "shop_name" in update:
            prop["vendor_shop"] = update["shop_name"]
            prop["vendor_name"] = update["shop_name"]
        if "shop_address" in update:
            prop["vendor_address"] = update["shop_address"]
        if prop:
            await db.products.update_many({"vendor_id": user["id"]}, {"$set": prop})
    fresh = await db.users.find_one({"_id": ObjectId(user["id"])})
    fresh["id"] = str(fresh["_id"])
    return serialize_user(fresh)


# ---------- Vendor: Products ----------
async def get_active_product_count(vendor_id: str) -> int:
    return await db.products.count_documents({"vendor_id": vendor_id})


@api_router.get("/vendor/products")
async def list_vendor_products(user: dict = Depends(require_vendor)):
    docs = await db.products.find({"vendor_id": user["id"]}).sort("updated_at", -1).to_list(1000)
    for d in docs:
        d["id"] = str(d["_id"])
        d.pop("_id", None)
    return docs


@api_router.post("/vendor/products")
async def create_product(payload: ProductCreate, user: dict = Depends(require_vendor)):
    status = compute_trial_status(user)
    count = await get_active_product_count(user["id"])
    limit = status["product_limit"]
    if limit is not None and count >= limit:
        raise HTTPException(status_code=402, detail=f"You've hit the {limit}-product free cap. Upgrade to add more.")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "vendor_id": user["id"],
        "vendor_name": user.get("shop_name") or user.get("name"),
        "vendor_shop": user.get("shop_name"),
        "vendor_address": user.get("shop_address"),
        "vendor_city": user.get("city", "Dehradun"),
        "vendor_type": user.get("vendor_type", "retailer"),
        "vendor_is_pro": status["is_pro"],
        "vendor_lat": user.get("lat"),
        "vendor_lng": user.get("lng"),
        "name": payload.name, "name_lower": payload.name.lower(),
        "category": payload.category or "other",
        "price": float(payload.price), "unit": payload.unit,
        "description": payload.description, "in_stock": bool(payload.in_stock),
        "is_featured": bool(payload.is_featured) if status["is_pro"] else False,
        "views": 0, "clicks": 0, "created_at": now, "updated_at": now,
    }
    res = await db.products.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    await refresh_vendor_stats(user["id"])
    return doc


@api_router.patch("/vendor/products/{product_id}")
async def update_product(product_id: str, payload: ProductUpdate, user: dict = Depends(require_vendor)):
    prod = await db.products.find_one({"_id": ObjectId(product_id), "vendor_id": user["id"]})
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    old_price = float(prod.get("price", 0))
    old_in_stock = bool(prod.get("in_stock", False))
    status = compute_trial_status(user)
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "is_featured" in update and not status["is_pro"]:
        update.pop("is_featured")
    if "name" in update:
        update["name_lower"] = update["name"].lower()
    if "price" in update:
        update["price"] = float(update["price"])
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": update})

    # Trigger price and availability alert notifications
    now_iso_s = datetime.now(timezone.utc).isoformat()
    if "price" in update and float(update["price"]) < old_price:
        new_price = float(update["price"])
        price_alerts = await db.alerts.find({
            "product_id": product_id,
            "alert_type": "price_drop",
            "status": "active",
            "target_price": {"$gte": new_price},
        }).to_list(100)
        for al in price_alerts:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": al["user_id"],
                "title": "Price Drop Alert!",
                "message": f"Good news! {prod.get('name')} dropped to ₹{new_price} (your target: ₹{al.get('target_price')})",
                "type": "price_alert",
                "alert_id": al.get("alert_id") or al.get("id"),
                "product_id": product_id,
                "seller_id": str(prod["vendor_id"]),
                "read": False,
                "created_at": now_iso_s,
            })
            await db.alerts.update_one({"_id": al["_id"]}, {"$set": {"status": "triggered", "triggered_at": now_iso_s}})

    if update.get("in_stock") is True and not old_in_stock:
        stock_alerts = await db.alerts.find({
            "product_id": product_id,
            "alert_type": "in_stock",
            "status": "active",
        }).to_list(100)
        for al in stock_alerts:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": al["user_id"],
                "title": "Item Back In Stock!",
                "message": f"{prod.get('name')} is back in stock at {user.get('shop_name') or 'seller'}!",
                "type": "availability_alert",
                "alert_id": al.get("alert_id") or al.get("id"),
                "product_id": product_id,
                "seller_id": str(prod["vendor_id"]),
                "read": False,
                "created_at": now_iso_s,
            })
            await db.alerts.update_one({"_id": al["_id"]}, {"$set": {"status": "triggered", "triggered_at": now_iso_s}})

    prod = await db.products.find_one({"_id": ObjectId(product_id)})
    prod["id"] = str(prod["_id"]); prod.pop("_id", None)
    return prod


@api_router.delete("/vendor/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_vendor)):
    res = await db.products.delete_one({"_id": ObjectId(product_id), "vendor_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    await refresh_vendor_stats(user["id"])
    return {"ok": True}


# ---------- Consumer Notifications ----------

@api_router.get("/notifications")
async def list_notifications(limit: int = 30, user: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d.get("_id") or d.get("id"))
        d.pop("_id", None)
    return docs


@api_router.patch("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user: dict = Depends(get_current_user)):
    try:
        oid = ObjectId(notif_id)
        q = {"_id": oid, "user_id": user["id"]}
    except Exception:
        q = {"id": notif_id, "user_id": user["id"]}
    await db.notifications.update_one(q, {"$set": {"read": True}})
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Consumer: Search & Discovery ----------
def enrich_product(p: dict, ref_lat=None, ref_lng=None):
    dist = haversine_km(ref_lat, ref_lng, p.get("vendor_lat"), p.get("vendor_lng"))
    p["distance_km"] = dist
    p["distance_label"] = format_distance(dist)
    return p


@api_router.get("/search")
async def search_products(
    q: str = Query(""),
    city: str = Query("Dehradun"),
    category: Optional[str] = Query(None),
    in_stock_only: bool = Query(False),
    sort: Literal["price_asc", "price_desc", "distance", "latest"] = Query("price_asc"),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
):
    query = {
        "vendor_city": city,
        "moderation_status": {"$nin": ["rejected", "suspended", "pending_review"]},
        "listing_status": {"$ne": "draft"},
    }
    if q.strip():
        import re as _re
        from voice_inventory_engine import expand_multilingual_search_terms
        expanded = await expand_multilingual_search_terms(db, q.strip())
        or_clauses = []
        for term in expanded:
            escaped = _re.escape(term)
            or_clauses.extend([
                {"name_lower": {"$regex": escaped, "$options": "i"}},
                {"name_en": {"$regex": escaped, "$options": "i"}},
                {"name_hi": {"$regex": escaped, "$options": "i"}},
                {"name_hinglish": {"$regex": escaped, "$options": "i"}},
                {"canonical_product_name": {"$regex": escaped, "$options": "i"}},
                {"search_tokens": {"$regex": escaped, "$options": "i"}},
            ])
        query["$or"] = or_clauses
    if category and category != "all":
        query["category"] = category
    if in_stock_only:
        query["in_stock"] = True

    ref_lat = lat if lat is not None else DEFAULT_LAT
    ref_lng = lng if lng is not None else DEFAULT_LNG

    docs = await db.products.find(query).to_list(500)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        enrich_product(d, ref_lat, ref_lng)

    def sort_key(x):
        priority = (0 if x.get("is_featured") else 1, 0 if x.get("vendor_is_pro") else 1)
        if sort == "price_asc":
            return (*priority, x.get("price", 0))
        if sort == "price_desc":
            return (*priority, -x.get("price", 0))
        if sort == "distance":
            return (*priority, x.get("distance_km") or 999)
        return (*priority, -datetime.fromisoformat(x["updated_at"]).timestamp() if x.get("updated_at") else 0)

    docs.sort(key=sort_key)
    if docs:
        await db.products.update_many({"_id": {"$in": [ObjectId(d["id"]) for d in docs[:30]]}}, {"$inc": {"views": 1}})
    return docs


@api_router.get("/discover/popular")
async def popular_near_you(lat: Optional[float] = None, lng: Optional[float] = None, limit: int = 12):
    docs = await db.products.find({
        "in_stock": True,
        "moderation_status": {"$nin": ["rejected", "suspended", "pending_review"]},
        "listing_status": {"$ne": "draft"},
    }).sort("views", -1).limit(limit * 2).to_list(50)
    ref_lat = lat if lat is not None else DEFAULT_LAT
    ref_lng = lng if lng is not None else DEFAULT_LNG
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        enrich_product(d, ref_lat, ref_lng)
    docs.sort(key=lambda x: (0 if x.get("is_featured") else 1, x.get("distance_km") or 999))
    return docs[:limit]


@api_router.get("/discover/today-prices")
async def today_prices(limit: int = 10):
    """For each unique product name, get the cheapest vendor."""
    pipeline = [
        {"$match": {
            "in_stock": True,
            "moderation_status": {"$nin": ["rejected", "suspended", "pending_review"]},
            "listing_status": {"$ne": "draft"},
        }},
        {"$sort": {"price": 1}},
        {"$group": {
            "_id": "$name_lower",
            "name": {"$first": "$name"},
            "name_en": {"$first": "$name_en"},
            "name_hi": {"$first": "$name_hi"},
            "name_hinglish": {"$first": "$name_hinglish"},
            "price": {"$first": "$price"},
            "unit": {"$first": "$unit"},
            "vendor_shop": {"$first": "$vendor_shop"},
            "vendor_id": {"$first": "$vendor_id"},
            "product_id": {"$first": {"$toString": "$_id"}},
            "category": {"$first": "$category"},
        }},
        {"$sort": {"name": 1}},
        {"$limit": limit},
    ]
    return await db.products.aggregate(pipeline).to_list(limit)


@api_router.get("/vendors")
async def list_vendors(
    lat: Optional[float] = None, lng: Optional[float] = None,
    category: Optional[str] = None, online: bool = False,
    sort: Literal["distance", "rating", "products"] = "distance",
    limit: int = 24,
):
    q = {"role": "vendor", "city": "Dehradun"}
    if online:
        q["is_online"] = True
    docs = await db.users.find(q).limit(200).to_list(200)
    ref_lat = lat if lat is not None else DEFAULT_LAT
    ref_lng = lng if lng is not None else DEFAULT_LNG

    if category and category != "all":
        vendor_ids_with_cat = await db.products.distinct("vendor_id", {"category": category})
        docs = [d for d in docs if str(d["_id"]) in vendor_ids_with_cat]

    result = [serialize_vendor_public(d, ref_lat, ref_lng) for d in docs]
    if sort == "distance":
        result.sort(key=lambda x: x.get("distance_km") or 999)
    elif sort == "rating":
        result.sort(key=lambda x: -x.get("avg_rating", 0))
    else:
        result.sort(key=lambda x: -x.get("product_count", 0))
    return result[:limit]


@api_router.get("/vendors/{vendor_id}")
async def vendor_detail(vendor_id: str, lat: Optional[float] = None, lng: Optional[float] = None):
    u = await db.users.find_one({"_id": ObjectId(vendor_id), "role": "vendor"})
    if not u:
        raise HTTPException(status_code=404, detail="Vendor not found")
    products = await db.products.find({"vendor_id": vendor_id}).to_list(500)
    for p in products:
        p["id"] = str(p["_id"]); p.pop("_id", None)
    reviews = await db.reviews.find({"vendor_id": vendor_id}).sort("created_at", -1).to_list(50)
    for r in reviews:
        r["id"] = str(r["_id"]); r.pop("_id", None)
    return {"vendor": serialize_vendor_public(u, lat or DEFAULT_LAT, lng or DEFAULT_LNG),
            "products": products, "reviews": reviews}


@api_router.post("/products/{product_id}/click")
async def product_click(product_id: str):
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$inc": {"clicks": 1}})
    return {"ok": True}


# ---------- Vendor: Analytics ----------
@api_router.get("/vendor/analytics")
async def vendor_analytics(user: dict = Depends(require_vendor)):
    status = compute_trial_status(user)
    if not (status["is_pro"] or status["trial_active"]):
        raise HTTPException(status_code=402, detail="Analytics is a Pro feature. Upgrade to unlock.")
    docs = await db.products.find({"vendor_id": user["id"]}).to_list(1000)
    total_views = sum(d.get("views", 0) for d in docs)
    total_clicks = sum(d.get("clicks", 0) for d in docs)
    per_product = [
        {"id": str(d["_id"]), "name": d["name"], "views": d.get("views", 0),
         "clicks": d.get("clicks", 0), "price": d.get("price"), "in_stock": d.get("in_stock", True)}
        for d in docs
    ]
    per_product.sort(key=lambda x: x["views"], reverse=True)
    return {"total_products": len(docs), "total_views": total_views, "total_clicks": total_clicks,
            "ctr": round((total_clicks / total_views * 100) if total_views else 0, 2),
            "per_product": per_product}


# ---------- Branches ----------
@api_router.get("/vendor/branches")
async def list_branches(user: dict = Depends(require_vendor)):
    docs = await db.branches.find({"vendor_id": user["id"]}).to_list(100)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.post("/vendor/branches")
async def create_branch(payload: BranchCreate, user: dict = Depends(require_vendor)):
    status = compute_trial_status(user)
    if not status["is_pro"]:
        raise HTTPException(status_code=402, detail="Multi-branch listings require a Pro subscription.")
    doc = {"vendor_id": user["id"], "branch_name": payload.branch_name,
           "address": payload.address, "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.branches.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc


@api_router.delete("/vendor/branches/{branch_id}")
async def delete_branch(branch_id: str, user: dict = Depends(require_vendor)):
    await db.branches.delete_one({"_id": ObjectId(branch_id), "vendor_id": user["id"]})
    return {"ok": True}


# ---------- Reviews ----------
@api_router.post("/vendors/{vendor_id}/reviews")
async def create_review(vendor_id: str, payload: ReviewCreate, user: dict = Depends(require_consumer)):
    existing = await db.reviews.find_one({"vendor_id": vendor_id, "consumer_id": user["id"]})
    doc = {
        "vendor_id": vendor_id, "consumer_id": user["id"],
        "consumer_name": user.get("name"), "rating": payload.rating,
        "comment": payload.comment, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if existing:
        await db.reviews.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        await db.reviews.insert_one(doc)
    await refresh_vendor_stats(vendor_id)
    return {"ok": True}


# ---------- Saved ----------
@api_router.post("/saved/toggle")
async def toggle_saved(product_id: str = Query(...), user: dict = Depends(require_consumer)):
    existing = await db.saved.find_one({"user_id": user["id"], "product_id": product_id})
    if existing:
        await db.saved.delete_one({"_id": existing["_id"]})
        return {"saved": False}
    await db.saved.insert_one({"user_id": user["id"], "product_id": product_id,
                                "created_at": datetime.now(timezone.utc).isoformat()})
    return {"saved": True}


@api_router.get("/saved")
async def list_saved(user: dict = Depends(require_consumer)):
    saves = await db.saved.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    product_ids = [ObjectId(s["product_id"]) for s in saves]
    products = await db.products.find({"_id": {"$in": product_ids}}).to_list(200)
    for p in products:
        p["id"] = str(p["_id"]); p.pop("_id", None)
        enrich_product(p, DEFAULT_LAT, DEFAULT_LNG)
    return products


# ---------- Messages / Chat ----------
def thread_id_for(a: str, b: str) -> str:
    return "__".join(sorted([a, b]))


@api_router.post("/messages/send")
async def send_message(payload: MessageSend, user: dict = Depends(get_current_user)):
    other = await db.users.find_one({"_id": ObjectId(payload.to_user_id)})
    if not other:
        raise HTTPException(status_code=404, detail="Recipient not found")
    tid = thread_id_for(user["id"], payload.to_user_id)
    doc = {
        "thread_id": tid, "from_user_id": user["id"], "to_user_id": payload.to_user_id,
        "body": payload.body, "product_id": payload.product_id,
        "created_at": datetime.now(timezone.utc).isoformat(), "read": False,
    }
    res = await db.messages.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc


@api_router.get("/messages/threads")
async def list_threads(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"$or": [{"from_user_id": user["id"]}, {"to_user_id": user["id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$thread_id", "last": {"$first": "$$ROOT"}}},
        {"$sort": {"last.created_at": -1}},
    ]
    threads = await db.messages.aggregate(pipeline).to_list(200)
    result = []
    for t in threads:
        last = t["last"]
        other_id = last["to_user_id"] if last["from_user_id"] == user["id"] else last["from_user_id"]
        other = await db.users.find_one({"_id": ObjectId(other_id)})
        if not other:
            continue
        result.append({
            "thread_id": t["_id"],
            "other_id": other_id,
            "other_name": other.get("shop_name") or other.get("name"),
            "other_role": other.get("role"),
            "other_verified": other.get("is_verified", False),
            "last_body": last["body"], "last_at": last["created_at"],
            "unread": last.get("to_user_id") == user["id"] and not last.get("read"),
        })
    return result


@api_router.get("/messages/thread/{other_id}")
async def get_thread(other_id: str, user: dict = Depends(get_current_user)):
    tid = thread_id_for(user["id"], other_id)
    msgs = await db.messages.find({"thread_id": tid}).sort("created_at", 1).to_list(500)
    for m in msgs:
        m["id"] = str(m["_id"]); m.pop("_id", None)
    await db.messages.update_many({"thread_id": tid, "to_user_id": user["id"], "read": False}, {"$set": {"read": True}})
    other = await db.users.find_one({"_id": ObjectId(other_id)})
    other_meta = {
        "id": other_id, "name": other.get("shop_name") or other.get("name"),
        "role": other.get("role"), "verified": other.get("is_verified", False),
        "phone": other.get("phone"),
    } if other else None
    return {"messages": msgs, "other": other_meta}


# ---------- I need (Requests) ----------
@api_router.post("/requests")
async def create_request(payload: RequestCreate, user: dict = Depends(require_consumer)):
    doc = {
        "consumer_id": user["id"], "consumer_name": user.get("name"),
        "item": payload.item, "item_lower": payload.item.lower(),
        "quantity": payload.quantity, "category": payload.category,
        "note": payload.note, "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.requests.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None)
    return doc


@api_router.get("/requests/my")
async def my_requests(user: dict = Depends(require_consumer)):
    docs = await db.requests.find({"consumer_id": user["id"]}).sort("created_at", -1).to_list(100)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["reply_count"] = await db.request_replies.count_documents({"request_id": d["id"]})
    return docs


@api_router.get("/requests/open")
async def open_requests(user: dict = Depends(require_vendor)):
    docs = await db.requests.find({"status": "open"}).sort("created_at", -1).limit(50).to_list(50)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["replied_by_me"] = bool(await db.request_replies.find_one({"request_id": d["id"], "vendor_id": user["id"]}))
    return docs


@api_router.get("/requests/{request_id}/replies")
async def request_replies(request_id: str, user: dict = Depends(get_current_user)):
    docs = await db.request_replies.find({"request_id": request_id}).sort("price", 1).to_list(50)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.post("/requests/{request_id}/reply")
async def reply_request(request_id: str, payload: RequestReplyCreate, user: dict = Depends(require_vendor)):
    req = await db.requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    doc = {
        "request_id": request_id, "vendor_id": user["id"],
        "vendor_shop": user.get("shop_name"), "vendor_verified": user.get("is_verified", False),
        "price": float(payload.price), "note": payload.note,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = await db.request_replies.find_one({"request_id": request_id, "vendor_id": user["id"]})
    if existing:
        await db.request_replies.update_one({"_id": existing["_id"]}, {"$set": doc})
    else:
        await db.request_replies.insert_one(doc)
    return {"ok": True}


# ---------- Payments (Razorpay + Direct UPI QR) ----------
# Tiered pricing by vendor type — amount is in paise
PLANS_BY_TIER = {
    "cart_vendor": {
        "weekly":  {"amount": 1500, "compare_amount": 2100, "label": "Cart Pro Weekly", "days": 7},
        "monthly": {"amount": 4900, "compare_amount": 6900, "label": "Cart Pro Monthly", "days": 30},
        "yearly":  {"amount": 49900, "compare_amount": 82800, "label": "Cart Pro Yearly", "days": 365},
    },
    "retailer": {
        "monthly": {"amount": 14900, "compare_amount": 19900, "label": "Retail Pro Monthly", "days": 30},
        "yearly":  {"amount": 149900, "compare_amount": 238800, "label": "Retail Pro Yearly", "days": 365},
    },
}

DEFAULT_UPI_ID = "8955745543@yapl"
DEFAULT_UPI_PAYEE_NAME = "LocalPrice Official"
DEFAULT_QR_IMAGE_URL = "/payment-qr.jpg"
DEFAULT_PAYMENT_INSTRUCTIONS = (
    "Scan the QR code with any UPI app (PhonePe, Google Pay, Paytm, BHIM) or send the exact plan amount "
    "to the UPI ID below. After paying, enter your 12-digit UTR / UPI Reference Number to activate Pro."
)


async def _payment_settings_runtime():
    """Resolve current Razorpay + UPI QR + Plan Pricing settings at request time."""
    import copy
    key_id, key_secret, mode = RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_MODE
    upi_qr_enabled = True
    razorpay_enabled = True
    upi_id = DEFAULT_UPI_ID
    upi_payee_name = DEFAULT_UPI_PAYEE_NAME
    qr_image_url = DEFAULT_QR_IMAGE_URL
    upi_verification_mode = "auto_approve"
    payment_instructions = DEFAULT_PAYMENT_INSTRUCTIONS
    plans_by_tier = copy.deepcopy(PLANS_BY_TIER)

    try:
        s = await db.admin_settings.find_one({"_id": "razorpay"})
        if s:
            key_id = s.get("key_id") or key_id
            key_secret = s.get("key_secret") or key_secret
            mode = s.get("mode") or mode
            if "upi_qr_enabled" in s and s["upi_qr_enabled"] is not None:
                upi_qr_enabled = bool(s["upi_qr_enabled"])
            if "razorpay_enabled" in s and s["razorpay_enabled"] is not None:
                razorpay_enabled = bool(s["razorpay_enabled"])
            if s.get("upi_id"):
                upi_id = s["upi_id"]
            if s.get("upi_payee_name"):
                upi_payee_name = s["upi_payee_name"]
            if s.get("qr_image_url"):
                qr_image_url = s["qr_image_url"]
            if s.get("upi_verification_mode") in ("auto_approve", "manual_approval"):
                upi_verification_mode = s["upi_verification_mode"]
            if s.get("payment_instructions"):
                payment_instructions = s["payment_instructions"]
            if isinstance(s.get("plans_override"), dict):
                for t_key, t_plans in s["plans_override"].items():
                    if t_key in plans_by_tier and isinstance(t_plans, dict):
                        for p_key, p_val in t_plans.items():
                            if p_key in plans_by_tier[t_key] and isinstance(p_val, dict):
                                plans_by_tier[t_key][p_key].update(p_val)
                            elif isinstance(p_val, dict):
                                plans_by_tier[t_key][p_key] = p_val
    except Exception as e:
        logging.warning(f"Failed to read payment settings from DB: {e}")

    client = None
    if mode == "live" and key_id and not key_id.endswith("placeholder") and key_secret and not key_secret.endswith("placeholder"):
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
        except Exception as e:
            logging.warning(f"Razorpay init failed: {e}")

    return {
        "client": client,
        "key_id": key_id,
        "mode": mode,
        "razorpay_enabled": razorpay_enabled,
        "upi_qr_enabled": upi_qr_enabled,
        "upi_id": upi_id,
        "upi_payee_name": upi_payee_name,
        "qr_image_url": qr_image_url,
        "upi_verification_mode": upi_verification_mode,
        "payment_instructions": payment_instructions,
        "plans_by_tier": plans_by_tier,
    }


async def _razorpay_runtime():
    """Resolve current Razorpay credentials at request time."""
    rt = await _payment_settings_runtime()
    return rt["client"], rt["key_id"], rt["mode"]


def plan_for(user: dict, plan_key: str, plans_map: Optional[dict] = None):
    tier = "cart_vendor" if user.get("vendor_type") == "cart_vendor" else "retailer"
    source = plans_map or PLANS_BY_TIER
    plan = source.get(tier, {}).get(plan_key)
    return tier, plan


# Legacy flat map kept for admin grant-pro (defaults to retailer tier)
PLANS = {
    "monthly": PLANS_BY_TIER["retailer"]["monthly"],
    "yearly": PLANS_BY_TIER["retailer"]["yearly"],
}


@api_router.get("/payments/config")
async def payments_config(user: Optional[dict] = Depends(get_optional_user)):
    tier = "retailer"
    if user and user.get("role") == "vendor" and user.get("vendor_type") == "cart_vendor":
        tier = "cart_vendor"
    rt = await _payment_settings_runtime()
    active_plans = rt["plans_by_tier"]
    return {
        "key_id": rt["key_id"],
        "mode": rt["mode"],
        "razorpay_enabled": rt["razorpay_enabled"],
        "vendor_tier": tier,
        "plans": active_plans[tier],
        "all_plans": active_plans,
        "upi_qr": {
            "enabled": rt["upi_qr_enabled"],
            "upi_id": rt["upi_id"],
            "payee_name": rt["upi_payee_name"],
            "qr_image_url": rt["qr_image_url"],
            "verification_mode": rt["upi_verification_mode"],
            "instructions": rt["payment_instructions"],
        },
    }


@api_router.post("/payments/create-order")
async def create_order(payload: SubscribePayload, user: dict = Depends(require_vendor)):
    rt = await _payment_settings_runtime()
    tier, plan = plan_for(user, payload.plan, rt["plans_by_tier"])
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan for your vendor type")
    receipt = f"sub_{user['id'][:10]}_{int(datetime.now(timezone.utc).timestamp())}"
    client, key_id, mode = rt["client"], rt["key_id"], rt["mode"]

    if client:
        order = client.order.create({
            "amount": plan["amount"], "currency": "INR",
            "receipt": receipt[:40], "payment_capture": 1,
            "notes": {"user_id": user["id"], "plan": payload.plan, "tier": tier},
        })
        order_id = order["id"]
    else:
        order_id = f"order_mock_{uuid.uuid4().hex[:16]}"
    await db.orders.insert_one({
        "order_id": order_id, "user_id": user["id"],
        "vendor_name": user.get("name"), "shop_name": user.get("shop_name"),
        "plan": payload.plan, "tier": tier,
        "amount": plan["amount"], "status": "created",
        "payment_method": "razorpay",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "order_id": order_id, "amount": plan["amount"], "currency": "INR",
        "key_id": key_id, "plan": payload.plan, "tier": tier,
        "compare_amount": plan.get("compare_amount"), "mode": mode,
    }


@api_router.post("/payments/verify")
async def verify_payment(payload: VerifyPaymentPayload, user: dict = Depends(require_vendor)):
    rt = await _payment_settings_runtime()
    _tier, plan = plan_for(user, payload.plan, rt["plans_by_tier"])
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")
    client = rt["client"]
    order_record = await db.orders.find_one({"order_id": payload.razorpay_order_id, "user_id": user["id"]})
    if not order_record:
        raise HTTPException(status_code=404, detail="Order not found")
    verified = False
    if client and payload.razorpay_signature:
        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            })
            verified = True
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Signature verification failed: {e}")
    else:
        verified = True
    if not verified:
        raise HTTPException(status_code=400, detail="Payment verification failed")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=plan["days"])
    await db.users.update_one({"_id": ObjectId(user["id"])},
        {"$set": {"is_pro": True, "subscription_plan": payload.plan,
                  "pro_expires_at": expires_at.isoformat(),
                  "last_payment_id": payload.razorpay_payment_id}})
    await db.orders.update_one({"order_id": payload.razorpay_order_id},
        {"$set": {"status": "paid", "payment_id": payload.razorpay_payment_id, "paid_at": now.isoformat()}})
    await db.products.update_many({"vendor_id": user["id"]}, {"$set": {"vendor_is_pro": True}})
    fresh_user = await db.users.find_one({"_id": ObjectId(user["id"])})
    fresh_user["id"] = str(fresh_user["_id"])
    return {"ok": True, "user": serialize_user(fresh_user)}


@api_router.post("/payments/upi-submit")
async def submit_upi_payment(payload: UpiPaymentSubmitPayload, user: dict = Depends(require_vendor)):
    rt = await _payment_settings_runtime()
    if not rt["upi_qr_enabled"]:
        raise HTTPException(status_code=400, detail="UPI QR payment is currently disabled by administrator")
    utr = (payload.utr_number or "").strip()
    if len(utr) < 4:
        raise HTTPException(status_code=400, detail="Please enter a valid UTR / UPI Transaction Reference Number")

    tier = "cart_vendor" if user.get("vendor_type") == "cart_vendor" else "retailer"
    if payload.plan == "custom":
        if not payload.custom_amount_rupees or payload.custom_amount_rupees <= 0:
            raise HTTPException(status_code=400, detail="Please enter a valid custom payment amount")
        amount_paise = int(round(payload.custom_amount_rupees * 100))
        plan_days = 30
        plan_label = "Custom Vendor Payment"
    else:
        _, plan = plan_for(user, payload.plan, rt["plans_by_tier"])
        if not plan:
            # Fallback if a retailer picks weekly or similar
            plan = rt["plans_by_tier"].get("cart_vendor", {}).get(payload.plan) or rt["plans_by_tier"]["retailer"]["monthly"]
        amount_paise = plan["amount"]
        plan_days = plan.get("days", 30)
        plan_label = plan.get("label", payload.plan)

    now = datetime.now(timezone.utc)
    order_id = f"order_upi_{uuid.uuid4().hex[:12]}"
    payment_id = f"upi_{utr}"
    auto_approve = rt["upi_verification_mode"] == "auto_approve"
    status = "paid" if auto_approve else "pending_verification"

    order_doc = {
        "order_id": order_id,
        "user_id": user["id"],
        "vendor_name": user.get("name"),
        "shop_name": user.get("shop_name"),
        "vendor_email": user.get("email"),
        "vendor_phone": user.get("phone"),
        "plan": payload.plan,
        "plan_label": plan_label,
        "tier": tier,
        "days": plan_days,
        "amount": amount_paise,
        "status": status,
        "payment_method": "upi_qr",
        "upi_id": rt["upi_id"],
        "utr_number": utr,
        "payer_upi_id": (payload.payer_upi_id or "").strip() or None,
        "notes": (payload.notes or "").strip() or None,
        "payment_id": payment_id,
        "created_at": now.isoformat(),
        "paid_at": now.isoformat() if auto_approve else None,
    }
    await db.orders.insert_one(order_doc)

    if auto_approve:
        expires_at = now + timedelta(days=plan_days)
        await db.users.update_one(
            {"_id": ObjectId(user["id"])},
            {"$set": {
                "is_pro": True,
                "subscription_plan": payload.plan,
                "pro_expires_at": expires_at.isoformat(),
                "last_payment_id": payment_id,
            }},
        )
        await db.products.update_many({"vendor_id": user["id"]}, {"$set": {"vendor_is_pro": True}})

    fresh_user = await db.users.find_one({"_id": ObjectId(user["id"])})
    fresh_user["id"] = str(fresh_user["_id"])
    return {
        "ok": True,
        "order_id": order_id,
        "status": status,
        "utr_number": utr,
        "upi_id": rt["upi_id"],
        "message": (
            "UPI Payment recorded and Pro Plan activated!"
            if auto_approve
            else "UPI Payment UTR submitted! Your Pro plan will activate once verified by Admin."
        ),
        "user": serialize_user(fresh_user),
    }



# ---------- Seed Demo ----------
SEED_VENDORS = [
    {"shop_name": "Gupta Dairy Bhandar", "area": "Patel Nagar", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": True, "online": False, "lat_off": 0.0055, "lng_off": 0.0022},
    {"shop_name": "Doon Fruit Mandi", "area": "Clock Tower", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": True, "online": False, "lat_off": 0.0073, "lng_off": -0.0031},
    {"shop_name": "Karanpur Chemist", "area": "Patel Nagar", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": True, "online": False, "lat_off": 0.0075, "lng_off": 0.0028},
    {"shop_name": "Bhandari Kirana Store", "area": "Karanpur", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": True, "online": False, "lat_off": 0.012, "lng_off": 0.006},
    {"shop_name": "Munna Vegetable Cart", "area": "Karanpur", "type": "cart_vendor", "hours": "", "verified": True, "online": True, "lat_off": 0.013, "lng_off": -0.006},
    {"shop_name": "Deepak Green Cart", "area": "Paltan Bazaar", "type": "cart_vendor", "hours": "", "verified": True, "online": True, "lat_off": 0.013, "lng_off": 0.005},
    {"shop_name": "Doon Book & Copy House", "area": "Paltan Bazaar", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": False, "online": False, "lat_off": 0.014, "lng_off": 0.007},
    {"shop_name": "Chaudhary Sabzi Cart", "area": "Patel Nagar", "type": "cart_vendor", "hours": "", "verified": False, "online": True, "lat_off": 0.017, "lng_off": 0.009},
    {"shop_name": "Salim Fruit Cart", "area": "Rajpur Road", "type": "cart_vendor", "hours": "", "verified": True, "online": True, "lat_off": -0.005, "lng_off": 0.008},
    {"shop_name": "Rajpur General Store", "area": "Rajpur Road", "type": "retailer", "hours": "8:00 AM - 9:00 PM", "verified": True, "online": False, "lat_off": -0.006, "lng_off": 0.01},
    {"shop_name": "Shanti Household Cart", "area": "Prem Nagar", "type": "cart_vendor", "hours": "", "verified": True, "online": False, "lat_off": -0.011, "lng_off": -0.005},
    {"shop_name": "Nainital Cloth House", "area": "Paltan Bazaar", "type": "retailer", "hours": "10:00 AM - 8:00 PM", "verified": True, "online": False, "lat_off": 0.011, "lng_off": 0.004},
]

SEED_PRODUCTS = [
    # name, category, unit, price_range
    ("Tomato", "vegetables", "kg", (24, 34)),
    ("Potato", "vegetables", "kg", (28, 38)),
    ("Onion", "vegetables", "kg", (26, 34)),
    ("Brinjal", "vegetables", "kg", (38, 50)),
    ("Carrot", "vegetables", "kg", (34, 46)),
    ("Cauliflower", "vegetables", "piece", (22, 35)),
    ("Spinach", "vegetables", "bundle", (15, 25)),
    ("Ginger", "vegetables", "250g", (24, 32)),
    ("Apple", "fruits", "kg", (115, 175)),
    ("Banana", "fruits", "dozen", (44, 62)),
    ("Orange", "fruits", "kg", (75, 95)),
    ("Milk", "dairy", "litre", (55, 65)),
    ("Curd", "dairy", "500g", (30, 45)),
    ("Butter", "dairy", "500g", (230, 260)),
    ("Bread", "bakery", "packet", (35, 55)),
    ("Rusk", "bakery", "packet", (40, 65)),
    ("Paracetamol Strip", "pharmacy", "packet", (30, 45)),
    ("Cotton T-Shirt", "clothing", "piece", (299, 449)),
    ("Detergent Powder", "household", "kg", (120, 150)),
    ("Notebook", "stationery", "piece", (35, 60)),
]


async def seed_demo():
    existing_vendors = await db.users.count_documents({"role": "vendor", "email": {"$regex": "@seed.local$"}})
    if existing_vendors > 0:
        vendor_docs = await db.users.find({"role": "vendor"}).to_list(10)
        vendor_ids = [str(v["_id"]) for v in vendor_docs]
        if vendor_ids:
            try:
                from attribution_engine import seed_attribution_demo
                await seed_attribution_demo(db, vendor_ids)
            except Exception as e:
                logging.warning(f"Attribution demo seed error: {e}")
        return
    logging.info("Seeding demo vendors + products...")
    now = datetime.now(timezone.utc).isoformat()
    seeded_ids = []
    for i, sv in enumerate(SEED_VENDORS):
        email = f"seed{i}@seed.local"
        doc = {
            "email": email, "password_hash": hash_password("demo1234"),
            "name": sv["shop_name"].split()[0], "role": "vendor",
            "phone": f"9876500{i:03d}", "shop_name": sv["shop_name"],
            "shop_address": sv["area"], "vendor_type": sv["type"], "city": "Dehradun",
            "lat": DEFAULT_LAT + sv["lat_off"], "lng": DEFAULT_LNG + sv["lng_off"],
            "is_verified": sv["verified"], "is_online": sv["online"],
            "opening_hours": sv["hours"] or "8:00 AM - 9:00 PM",
            "avg_rating": round(random.uniform(3.5, 4.8), 1),
            "review_count": random.randint(2, 12),
            "product_count": 0,
            "created_at": now, "trial_started_at": now,
            "is_pro": False, "subscription_plan": None,
        }
        res = await db.users.insert_one(doc)
        vid = str(res.inserted_id)
        seeded_ids.append(vid)
        # add 4-8 products
        picks = random.sample(SEED_PRODUCTS, k=random.randint(4, 8))
        for name, cat, unit, price_range in picks:
            price = random.randint(price_range[0], price_range[1])
            hours_ago = random.randint(1, 18)
            updated = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
            await db.products.insert_one({
                "vendor_id": vid, "vendor_name": sv["shop_name"],
                "vendor_shop": sv["shop_name"], "vendor_address": sv["area"],
                "vendor_city": "Dehradun", "vendor_type": sv["type"],
                "vendor_is_pro": False, "vendor_lat": doc["lat"], "vendor_lng": doc["lng"],
                "name": name, "name_lower": name.lower(),
                "category": cat, "price": float(price), "unit": unit,
                "description": None, "in_stock": random.random() > 0.15,
                "is_featured": False, "views": random.randint(3, 40),
                "clicks": random.randint(0, 8), "created_at": now, "updated_at": updated,
            })
        await refresh_vendor_stats(vid)
    if seeded_ids:
        try:
            from attribution_engine import seed_attribution_demo
            await seed_attribution_demo(db, seeded_ids)
        except Exception as e:
            logging.warning(f"Attribution demo seed error: {e}")
    logging.info("Seed complete.")


# ---------- ADMIN ----------
class AdminVendorCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: str
    shop_name: str
    shop_address: str
    vendor_type: Literal["retailer", "cart_vendor"] = "retailer"
    is_verified: bool = True
    grant_pro: bool = False


class AdminUserPatch(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    shop_name: Optional[str] = None
    shop_address: Optional[str] = None
    city: Optional[str] = None
    vendor_type: Optional[Literal["retailer", "cart_vendor"]] = None
    is_verified: Optional[bool] = None
    is_online: Optional[bool] = None
    is_pro: Optional[bool] = None
    opening_hours: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class AdminProductPatch(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None
    in_stock: Optional[bool] = None
    is_featured: Optional[bool] = None


class AdminGrantProPayload(BaseModel):
    vendor_id: str
    plan: Literal["monthly", "yearly"] = "monthly"


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    return {
        "consumer_count": await db.users.count_documents({"role": "consumer"}),
        "vendor_count": await db.users.count_documents({"role": "vendor"}),
        "verified_vendor_count": await db.users.count_documents({"role": "vendor", "is_verified": True}),
        "pro_vendor_count": await db.users.count_documents({"role": "vendor", "is_pro": True}),
        "online_cart_count": await db.users.count_documents({"role": "vendor", "vendor_type": "cart_vendor", "is_online": True}),
        "product_count": await db.products.count_documents({}),
        "in_stock_product_count": await db.products.count_documents({"in_stock": True}),
        "review_count": await db.reviews.count_documents({}),
        "message_count": await db.messages.count_documents({}),
        "request_count": await db.requests.count_documents({}),
        "open_request_count": await db.requests.count_documents({"status": "open"}),
        "order_count": await db.orders.count_documents({}),
        "paid_order_count": await db.orders.count_documents({"status": "paid"}),
    }


@api_router.get("/admin/users")
async def admin_list_users(role: Optional[str] = None, q: Optional[str] = None,
                          limit: int = 200, admin: dict = Depends(require_admin)):
    query = {}
    if role and role != "all":
        query["role"] = role
    if q:
        query["$or"] = [{"email": {"$regex": q, "$options": "i"}},
                        {"name": {"$regex": q, "$options": "i"}},
                        {"shop_name": {"$regex": q, "$options": "i"}}]
    docs = await db.users.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None); d.pop("password_hash", None)
    return docs


@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: AdminUserPatch, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("email", "").lower() in ADMIN_ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="Cannot modify admin account")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in update:
        update["email"] = update["email"].lower()
        existing = await db.users.find_one({"email": update["email"], "_id": {"$ne": ObjectId(user_id)}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken by another user")
    if update:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
        prop = {}
        if "shop_name" in update:
            prop["vendor_shop"] = update["shop_name"]
            prop["vendor_name"] = update["shop_name"]
        if "shop_address" in update:
            prop["vendor_address"] = update["shop_address"]
        if "vendor_type" in update:
            prop["vendor_type"] = update["vendor_type"]
        if "lat" in update:
            prop["vendor_lat"] = update["lat"]
        if "lng" in update:
            prop["vendor_lng"] = update["lng"]
        if "is_pro" in update:
            prop["vendor_is_pro"] = update["is_pro"]
        if prop:
            await db.products.update_many({"vendor_id": user_id}, {"$set": prop})
    fresh = await db.users.find_one({"_id": ObjectId(user_id)})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None); fresh.pop("password_hash", None)
    return fresh


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("email", "").lower() in ADMIN_ALLOWED_EMAILS:
        raise HTTPException(status_code=403, detail="Cannot delete admin account")
    # cascade
    await db.products.delete_many({"vendor_id": user_id})
    await db.reviews.delete_many({"$or": [{"vendor_id": user_id}, {"consumer_id": user_id}]})
    await db.saved.delete_many({"user_id": user_id})
    await db.messages.delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]})
    await db.requests.delete_many({"consumer_id": user_id})
    await db.request_replies.delete_many({"vendor_id": user_id})
    await db.branches.delete_many({"vendor_id": user_id})
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"ok": True}


@api_router.post("/admin/vendors")
async def admin_create_vendor(payload: AdminVendorCreate, admin: dict = Depends(require_admin)):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "email": email, "password_hash": hash_password(payload.password),
        "name": payload.name, "role": "vendor", "phone": payload.phone,
        "shop_name": payload.shop_name, "shop_address": payload.shop_address,
        "vendor_type": payload.vendor_type, "city": "Dehradun",
        "lat": DEFAULT_LAT + random.uniform(-0.02, 0.02),
        "lng": DEFAULT_LNG + random.uniform(-0.02, 0.02),
        "is_verified": payload.is_verified, "is_online": False,
        "opening_hours": "8:00 AM - 9:00 PM",
        "avg_rating": 0, "review_count": 0, "product_count": 0,
        "created_at": now, "trial_started_at": now,
        "is_pro": payload.grant_pro,
        "pro_expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat() if payload.grant_pro else None,
        "subscription_plan": "monthly" if payload.grant_pro else None,
    }
    res = await db.users.insert_one(doc)
    doc["id"] = str(res.inserted_id); doc.pop("_id", None); doc.pop("password_hash", None)
    return doc


@api_router.post("/admin/grant-pro")
async def admin_grant_pro(payload: AdminGrantProPayload, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": ObjectId(payload.vendor_id), "role": "vendor"})
    if not target:
        raise HTTPException(status_code=404, detail="Vendor not found")
    days = PLANS[payload.plan]["days"]
    expires = datetime.now(timezone.utc) + timedelta(days=days)
    await db.users.update_one({"_id": ObjectId(payload.vendor_id)},
        {"$set": {"is_pro": True, "subscription_plan": payload.plan, "pro_expires_at": expires.isoformat()}})
    await db.products.update_many({"vendor_id": payload.vendor_id}, {"$set": {"vendor_is_pro": True}})
    return {"ok": True, "expires_at": expires.isoformat()}


@api_router.post("/admin/revoke-pro")
async def admin_revoke_pro(payload: AdminGrantProPayload, admin: dict = Depends(require_admin)):
    await db.users.update_one({"_id": ObjectId(payload.vendor_id)},
        {"$set": {"is_pro": False, "subscription_plan": None, "pro_expires_at": None}})
    await db.products.update_many({"vendor_id": payload.vendor_id}, {"$set": {"vendor_is_pro": False}})
    return {"ok": True}


@api_router.get("/admin/products")
async def admin_list_products(q: Optional[str] = None, vendor_id: Optional[str] = None,
                               limit: int = 300, admin: dict = Depends(require_admin)):
    query = {}
    if q:
        query["name_lower"] = {"$regex": q.lower()}
    if vendor_id:
        query["vendor_id"] = vendor_id
    docs = await db.products.find(query).sort("updated_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.patch("/admin/products/{product_id}")
async def admin_update_product(product_id: str, payload: AdminProductPatch, admin: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "price" in update:
        update["price"] = float(update["price"])
    if "name" in update:
        update["name_lower"] = update["name"].lower()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": update})
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    doc["id"] = str(doc["_id"]); doc.pop("_id", None)
    return doc


@api_router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin: dict = Depends(require_admin)):
    prod = await db.products.find_one({"_id": ObjectId(product_id)})
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.delete_one({"_id": ObjectId(product_id)})
    await refresh_vendor_stats(prod["vendor_id"])
    return {"ok": True}


class AdminReviewPatch(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: Optional[str] = None
    consumer_name: Optional[str] = None


@api_router.get("/admin/reviews")
async def admin_list_reviews(limit: int = 200, admin: dict = Depends(require_admin)):
    docs = await db.reviews.find({}).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.patch("/admin/reviews/{review_id}")
async def admin_update_review(review_id: str, payload: AdminReviewPatch, admin: dict = Depends(require_admin)):
    r = await db.reviews.find_one({"_id": ObjectId(review_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.reviews.update_one({"_id": ObjectId(review_id)}, {"$set": update})
        if "rating" in update:
            await refresh_vendor_stats(r["vendor_id"])
    fresh = await db.reviews.find_one({"_id": ObjectId(review_id)})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str, admin: dict = Depends(require_admin)):
    r = await db.reviews.find_one({"_id": ObjectId(review_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    await db.reviews.delete_one({"_id": ObjectId(review_id)})
    await refresh_vendor_stats(r["vendor_id"])
    return {"ok": True}


class AdminMessagePatch(BaseModel):
    body: Optional[str] = None
    read: Optional[bool] = None


@api_router.get("/admin/messages")
async def admin_list_messages(limit: int = 200, admin: dict = Depends(require_admin)):
    docs = await db.messages.find({}).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.patch("/admin/messages/{message_id}")
async def admin_update_message(message_id: str, payload: AdminMessagePatch, admin: dict = Depends(require_admin)):
    m = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update:
        await db.messages.update_one({"_id": ObjectId(message_id)}, {"$set": update})
    fresh = await db.messages.find_one({"_id": ObjectId(message_id)})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.delete("/admin/messages/{message_id}")
async def admin_delete_message(message_id: str, admin: dict = Depends(require_admin)):
    await db.messages.delete_one({"_id": ObjectId(message_id)})
    return {"ok": True}


class AdminRequestPatch(BaseModel):
    item: Optional[str] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None


@api_router.get("/admin/requests")
async def admin_list_requests(limit: int = 200, admin: dict = Depends(require_admin)):
    docs = await db.requests.find({}).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
        d["reply_count"] = await db.request_replies.count_documents({"request_id": d["id"]})
    return docs


@api_router.patch("/admin/requests/{request_id}")
async def admin_update_request(request_id: str, payload: AdminRequestPatch, admin: dict = Depends(require_admin)):
    r = await db.requests.find_one({"_id": ObjectId(request_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "item" in update:
        update["item_lower"] = update["item"].lower()
    if update:
        await db.requests.update_one({"_id": ObjectId(request_id)}, {"$set": update})
    fresh = await db.requests.find_one({"_id": ObjectId(request_id)})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.delete("/admin/requests/{request_id}")
async def admin_delete_request(request_id: str, admin: dict = Depends(require_admin)):
    await db.request_replies.delete_many({"request_id": request_id})
    await db.requests.delete_one({"_id": ObjectId(request_id)})
    return {"ok": True}


class AdminOrderPatch(BaseModel):
    status: Optional[str] = None
    amount: Optional[int] = None
    plan: Optional[str] = None
    tier: Optional[str] = None
    utr_number: Optional[str] = None
    payment_method: Optional[str] = None
    upi_id: Optional[str] = None
    notes: Optional[str] = None


class AdminManualOrderCreate(BaseModel):
    user_id: str
    plan: str = "monthly"
    tier: str = "retailer"
    amount_rupees: float
    payment_method: str = "upi_qr"
    utr_number: Optional[str] = None
    upi_id: Optional[str] = None
    status: str = "paid"
    notes: Optional[str] = None


async def _activate_pro_for_order(order_doc: dict):
    """Helper to activate a vendor's Pro plan when an order is marked paid."""
    uid = order_doc.get("user_id")
    if not uid:
        return
    rt = await _payment_settings_runtime()
    tier = order_doc.get("tier") or "retailer"
    plan_key = order_doc.get("plan") or "monthly"
    plan_cfg = rt["plans_by_tier"].get(tier, {}).get(plan_key) or {}
    days = order_doc.get("days") or plan_cfg.get("days") or (365 if plan_key == "yearly" else 7 if plan_key == "weekly" else 30)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=int(days))
    payment_id = order_doc.get("payment_id") or (f"upi_{order_doc.get('utr_number')}" if order_doc.get("utr_number") else order_doc.get("order_id"))
    try:
        await db.users.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {
                "is_pro": True,
                "subscription_plan": plan_key,
                "pro_expires_at": expires_at.isoformat(),
                "last_payment_id": payment_id,
            }},
        )
        await db.products.update_many({"vendor_id": uid}, {"$set": {"vendor_is_pro": True}})
    except Exception as e:
        logging.warning(f"Could not activate pro for user {uid}: {e}")


@api_router.get("/admin/orders")
async def admin_list_orders(limit: int = 200, admin: dict = Depends(require_admin)):
    docs = await db.orders.find({}).sort("created_at", -1).limit(limit).to_list(limit)
    for d in docs:
        d["id"] = str(d["_id"]); d.pop("_id", None)
    return docs


@api_router.post("/admin/orders/create-manual")
async def admin_create_manual_order(payload: AdminManualOrderCreate, admin: dict = Depends(require_admin)):
    rt = await _payment_settings_runtime()
    now = datetime.now(timezone.utc)
    order_id = f"order_manual_{uuid.uuid4().hex[:10]}"
    amount_paise = int(round(payload.amount_rupees * 100))
    vendor = None
    try:
        vendor = await db.users.find_one({"_id": ObjectId(payload.user_id)})
    except Exception:
        pass
    doc = {
        "order_id": order_id,
        "user_id": payload.user_id,
        "vendor_name": vendor.get("name") if vendor else None,
        "shop_name": vendor.get("shop_name") if vendor else None,
        "plan": payload.plan,
        "tier": payload.tier,
        "amount": amount_paise,
        "status": payload.status,
        "payment_method": payload.payment_method,
        "upi_id": payload.upi_id or rt["upi_id"],
        "utr_number": (payload.utr_number or "").strip() or None,
        "notes": (payload.notes or "").strip() or None,
        "payment_id": f"manual_{payload.utr_number or order_id}",
        "created_at": now.isoformat(),
        "paid_at": now.isoformat() if payload.status == "paid" else None,
    }
    res = await db.orders.insert_one(doc)
    if payload.status == "paid":
        await _activate_pro_for_order(doc)
    fresh = await db.orders.find_one({"_id": res.inserted_id})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.patch("/admin/orders/{order_id}")
async def admin_update_order(order_id: str, payload: AdminOrderPatch, admin: dict = Depends(require_admin)):
    o = None
    try:
        o = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        pass
    if not o:
        # Fallback to search by string order_id
        o = await db.orders.find_one({"order_id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if update.get("status") == "paid" and o.get("status") != "paid":
        update["paid_at"] = datetime.now(timezone.utc).isoformat()
    if update:
        await db.orders.update_one({"_id": o["_id"]}, {"$set": update})
    fresh = await db.orders.find_one({"_id": o["_id"]})
    if update.get("status") == "paid":
        await _activate_pro_for_order(fresh)
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.post("/admin/orders/{order_id}/approve")
async def admin_approve_order(order_id: str, admin: dict = Depends(require_admin)):
    o = None
    try:
        o = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        pass
    if not o:
        o = await db.orders.find_one({"order_id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"_id": o["_id"]},
        {"$set": {"status": "paid", "paid_at": now_iso, "verified_by": admin["id"], "verified_at": now_iso}},
    )
    fresh = await db.orders.find_one({"_id": o["_id"]})
    await _activate_pro_for_order(fresh)
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.post("/admin/orders/{order_id}/reject")
async def admin_reject_order(order_id: str, admin: dict = Depends(require_admin)):
    o = None
    try:
        o = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        pass
    if not o:
        o = await db.orders.find_one({"order_id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"_id": o["_id"]},
        {"$set": {"status": "failed", "verified_by": admin["id"], "verified_at": now_iso}},
    )
    fresh = await db.orders.find_one({"_id": o["_id"]})
    fresh["id"] = str(fresh["_id"]); fresh.pop("_id", None)
    return fresh


@api_router.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, admin: dict = Depends(require_admin)):
    o = None
    try:
        o = await db.orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        pass
    if not o:
        o = await db.orders.find_one({"order_id": order_id})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.delete_one({"_id": o["_id"]})
    return {"ok": True}


class RazorpaySettingsPatch(BaseModel):
    key_id: Optional[str] = None
    key_secret: Optional[str] = None
    mode: Optional[Literal["mock", "live"]] = None
    razorpay_enabled: Optional[bool] = None
    upi_qr_enabled: Optional[bool] = None
    upi_id: Optional[str] = None
    upi_payee_name: Optional[str] = None
    qr_image_url: Optional[str] = None
    upi_verification_mode: Optional[Literal["auto_approve", "manual_approval"]] = None
    payment_instructions: Optional[str] = None
    plans_override: Optional[dict] = None


def _mask_secret(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 6:
        return "•" * len(s)
    return s[:4] + "•" * (len(s) - 8) + s[-4:]


@api_router.get("/admin/settings/razorpay")
async def admin_get_razorpay_settings(admin: dict = Depends(require_admin)):
    doc = await db.admin_settings.find_one({"_id": "razorpay"}) or {}
    rt = await _payment_settings_runtime()
    active_key = rt["key_id"]
    active_mode = rt["mode"]
    source = "admin_override" if doc else "environment"
    return {
        "key_id": doc.get("key_id") or RAZORPAY_KEY_ID,
        "mode": doc.get("mode") or RAZORPAY_MODE,
        "razorpay_enabled": rt["razorpay_enabled"],
        "has_secret": bool(doc.get("key_secret") or RAZORPAY_KEY_SECRET),
        "secret_preview": _mask_secret(doc.get("key_secret") or RAZORPAY_KEY_SECRET),
        "source": source,
        "active_key_id": active_key,
        "active_mode": active_mode,
        "is_live_key": (active_key or "").startswith("rzp_live_"),
        "is_test_key": (active_key or "").startswith("rzp_test_"),
        "upi_qr_enabled": rt["upi_qr_enabled"],
        "upi_id": rt["upi_id"],
        "upi_payee_name": rt["upi_payee_name"],
        "qr_image_url": rt["qr_image_url"],
        "upi_verification_mode": rt["upi_verification_mode"],
        "payment_instructions": rt["payment_instructions"],
        "plans_by_tier": rt["plans_by_tier"],
        "default_plans_by_tier": PLANS_BY_TIER,
        "default_upi_id": DEFAULT_UPI_ID,
        "default_qr_image_url": DEFAULT_QR_IMAGE_URL,
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }


@api_router.patch("/admin/settings/razorpay")
async def admin_update_razorpay_settings(payload: RazorpaySettingsPatch,
                                          admin: dict = Depends(require_admin)):
    raw = payload.model_dump(exclude_unset=True)
    update = {}
    for k, v in raw.items():
        if isinstance(v, bool) or isinstance(v, dict):
            update[k] = v
        elif v not in (None, ""):
            update[k] = v
    if update.get("key_id") and not (update["key_id"].startswith("rzp_test_") or update["key_id"].startswith("rzp_live_")):
        raise HTTPException(status_code=400, detail="Razorpay Key ID must start with rzp_test_ or rzp_live_")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    update["updated_by"] = admin["id"]
    await db.admin_settings.update_one({"_id": "razorpay"}, {"$set": update}, upsert=True)
    return await admin_get_razorpay_settings(admin=admin)


@api_router.post("/admin/settings/upi-qr/reset")
async def admin_reset_upi_qr_settings(admin: dict = Depends(require_admin)):
    await db.admin_settings.update_one(
        {"_id": "razorpay"},
        {
            "$set": {
                "upi_qr_enabled": True,
                "upi_id": DEFAULT_UPI_ID,
                "upi_payee_name": DEFAULT_UPI_PAYEE_NAME,
                "qr_image_url": DEFAULT_QR_IMAGE_URL,
                "upi_verification_mode": "auto_approve",
                "payment_instructions": DEFAULT_PAYMENT_INSTRUCTIONS,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": admin["id"],
            }
        },
        upsert=True,
    )
    return await admin_get_razorpay_settings(admin=admin)


@api_router.post("/admin/settings/plans/reset")
async def admin_reset_plans_settings(admin: dict = Depends(require_admin)):
    await db.admin_settings.update_one(
        {"_id": "razorpay"},
        {
            "$unset": {"plans_override": ""},
            "$set": {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": admin["id"],
            },
        },
        upsert=True,
    )
    return await admin_get_razorpay_settings(admin=admin)


@api_router.delete("/admin/settings/razorpay")
async def admin_clear_razorpay_settings(admin: dict = Depends(require_admin)):
    await db.admin_settings.delete_one({"_id": "razorpay"})
    return await admin_get_razorpay_settings(admin=admin)




async def seed_admin():
    email = ADMIN_SEED_EMAIL.lower()
    existing = await db.users.find_one({"email": email})
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        # Ensure role is admin and password matches the configured value; idempotent
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {
            "role": "admin", "name": ADMIN_SEED_NAME,
            "password_hash": hash_password(ADMIN_SEED_PASSWORD),
        }})
        return
    await db.users.insert_one({
        "email": email, "password_hash": hash_password(ADMIN_SEED_PASSWORD),
        "name": ADMIN_SEED_NAME, "role": "admin",
        "created_at": now, "city": "Dehradun",
    })
    logging.info(f"Admin seeded: {email}")



# ---------- Root & startup ----------
@api_router.get("/")
async def root():
    return {"message": "LocalPrice API up"}


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("name_lower")
    await db.products.create_index("vendor_id")
    await db.products.create_index("vendor_city")
    await db.products.create_index("category")
    await db.messages.create_index("thread_id")
    await db.saved.create_index([("user_id", 1), ("product_id", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    if os.environ.get("SEED_DEMO", "1") == "1":
        try:
            await seed_demo()
        except Exception as e:
            logging.error(f"Seed error: {e}")
    try:
        await seed_admin()
    except Exception as e:
        logging.error(f"Admin seed error: {e}")
    try:
        await _grv_indexes(db)
        await _grv_seed_kb(db)
        _grv_init_storage()
    except Exception as e:
        logging.error(f"Grievance/AI init error: {e}")
    try:
        await _attr_indexes(db)
    except Exception as e:
        logging.error(f"Attribution init error: {e}")
    try:
        from smart_ai_ecosystem import init_smart_ecosystem as _smart_init
        await _smart_init(db)
    except Exception as e:
        logging.error(f"Smart ecosystem init error: {e}")
    try:
        from voice_inventory_engine import init_voice_inventory_db as _voice_init
        await _voice_init(db)
    except Exception as e:
        logging.error(f"Voice inventory init error: {e}")
    try:
        from ai_control_center_engine import init_ai_control_center_db as _ai_cc_init
        await _ai_cc_init(db)
    except Exception as e:
        logging.error(f"AI Control Center init error: {e}")


app.include_router(api_router)

# Attribution & Sales Impact Engine
from attribution_engine import build_attribution_router as _attr_build_router, create_attribution_indexes as _attr_indexes
app.include_router(_attr_build_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user), prefix="/api")

# Grievance Redressal + AI Assistant
from grievance_ai import build_router as _grv_build_router, seed_knowledge as _grv_seed_kb, create_grievance_indexes as _grv_indexes, init_storage as _grv_init_storage
app.include_router(_grv_build_router(db, get_current_user, require_admin, get_optional_user, ADMIN_ALLOWED_EMAILS))

# 3-Tier Smart AI Ecosystem & Super Admin Control
from smart_ai_ecosystem import build_smart_ecosystem_router as _smart_build_router
app.include_router(_smart_build_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user), prefix="/api")

# HyperLocal In-App Billing, Checkout & Sales Attribution
from billing_checkout import build_billing_router as _billing_build_router
app.include_router(_billing_build_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user), prefix="/api")

# AI Voice-Based Inventory Management & Multilingual Product Listing
from voice_inventory_engine import build_voice_inventory_router as _voice_build_router
app.include_router(_voice_build_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user, refresh_vendor_stats), prefix="/api")

# Universal AI Copilot, Multilingual Voice Conversation, TTS & Admin Control Center
from ai_control_center_engine import build_ai_control_center_router as _ai_cc_build_router
app.include_router(_ai_cc_build_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user), prefix="/api")
app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_BUILD_DIR = ROOT_DIR.parent / 'frontend' / 'build'

if FRONTEND_BUILD_DIR.exists():
    static_assets = FRONTEND_BUILD_DIR / 'static'
    if static_assets.exists():
        app.mount("/static", StaticFiles(directory=str(static_assets)), name="static")

    @app.get("/")
    async def serve_root():
        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"status": "ok", "message": "Backend API is running"}

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api") or full_path in ("docs", "redoc", "openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        target = FRONTEND_BUILD_DIR / full_path
        if full_path and target.is_file():
            return FileResponse(str(target))
        index_file = FRONTEND_BUILD_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Frontend index.html not found")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()

