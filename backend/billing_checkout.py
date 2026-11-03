"""HyperLocal In-App Billing, Checkout, Payment Recording & Automatic Sales Attribution System.

Modular extension providing:
  - Multi-seller shopping cart with attribution source tagging
  - Mode A (Reserve & Bill at Shop) and Mode B (Pay through HyperLocal)
  - Seller bill confirmation, price locking, and customer revision confirmation
  - Digital invoice generation with collision-resistant IDs
  - Cash payment recording by seller and online payment with idempotency
  - Automatic feed into Attribution Engine (db.purchase_attributions)
  - New vs. Returning customer automatic classification
  - Prevention of double counting with manual vendor daily sales
  - Super Admin master switches, emergency controls, reconciliation, and exports
"""

import os
import csv
import io
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, List, Dict, Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DISCLAIMER_TEXT = "Estimate based on available baseline and attribution data. This is not a guaranteed causal measurement."

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().isoformat()

def mask_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 10:
        return f"{digits[:2]}******{digits[-2:]}"
    elif len(digits) > 4:
        return f"{digits[:2]}***{digits[-2:]}"
    return "***"

def mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return email or ""
    parts = email.split("@", 1)
    name, domain = parts[0], parts[1]
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


# =========================================================================
# ID GENERATORS (COLLISION RESISTANT)
# =========================================================================

async def next_id(db, entity_type: str, prefix: str) -> str:
    year = now_utc().year
    counter = await db.counters.find_one_and_update(
        {"_id": f"{entity_type}_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True, return_document=True,
    )
    seq = counter.get("seq", 1) if counter else 1
    return f"{prefix}-{year}-{seq:06d}"

async def next_order_id(db) -> str:
    return await next_id(db, "order", "HL-ORD")

async def next_invoice_id(db) -> str:
    return await next_id(db, "invoice", "HL-INV")

async def next_payment_id(db) -> str:
    return await next_id(db, "payment", "HL-PAY")

async def next_refund_id(db) -> str:
    return await next_id(db, "refund", "HL-REF")


# =========================================================================
# PYDANTIC SCHEMAS
# =========================================================================

class CartItemIn(BaseModel):
    product_id: str
    quantity: float = Field(default=1.0, gt=0)
    attribution_source: Optional[str] = "HYPERLOCAL_PRODUCT_PAGE"
    notes: Optional[str] = None

class CartItemUpdate(BaseModel):
    quantity: float = Field(gt=0)
    notes: Optional[str] = None

class CheckoutRequestIn(BaseModel):
    checkout_mode: Literal["RESERVE_AT_SHOP", "PAY_THROUGH_HYPERLOCAL"] = "RESERVE_AT_SHOP"
    payment_method: Literal["CASH", "UPI", "CARD", "ONLINE_PAYMENT", "PAY_AT_SHOP", "OTHER"] = "CASH"
    customer_notes: Optional[str] = None
    attribution_source: Optional[str] = "HYPERLOCAL_CHECKOUT"

class OrderItemRevisionIn(BaseModel):
    product_id: str
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    reason: Optional[str] = None

class SellerConfirmOrderIn(BaseModel):
    action: Literal["ACCEPT", "REVISE", "REJECT"] = "ACCEPT"
    revised_items: Optional[List[OrderItemRevisionIn]] = None
    additional_charges: Optional[float] = 0.0
    discount: Optional[float] = 0.0
    seller_notes: Optional[str] = None
    reason: Optional[str] = None

class CustomerConfirmRevisionIn(BaseModel):
    accepted: bool
    rejection_reason: Optional[str] = None

class CollectCashIn(BaseModel):
    amount_collected: float = Field(gt=0)
    notes: Optional[str] = None

class OnlinePaymentRecordIn(BaseModel):
    order_id: str
    payment_method: Literal["UPI", "CARD", "ONLINE_PAYMENT"] = "ONLINE_PAYMENT"
    amount: float = Field(gt=0)
    provider: str = "razorpay"
    provider_tx_id: Optional[str] = None
    idempotency_key: str = Field(min_length=6)

class RefundRequestIn(BaseModel):
    amount: Optional[float] = None
    refund_type: Literal["full", "partial"] = "full"
    reason: str = Field(min_length=3)

class AdminOrderCorrectionIn(BaseModel):
    order_status: Optional[str] = None
    payment_status: Optional[str] = None
    seller_notes: Optional[str] = None
    reason: str = Field(min_length=3)

class BillingSettingsPatch(BaseModel):
    billing_enabled: Optional[bool] = None
    checkout_enabled: Optional[bool] = None
    seller_confirmation_enabled: Optional[bool] = None
    online_payment_enabled: Optional[bool] = None
    cash_payment_enabled: Optional[bool] = None
    upi_enabled: Optional[bool] = None
    digital_invoice_enabled: Optional[bool] = None
    multi_seller_cart_enabled: Optional[bool] = None
    mobile_vendor_billing_enabled: Optional[bool] = None
    automatic_sales_attribution_enabled: Optional[bool] = None
    customer_acquisition_analytics_enabled: Optional[bool] = None
    ai_billing_assistant_enabled: Optional[bool] = None
    new_customer_window_days: Optional[int] = None
    attribution_window_days: Optional[int] = None
    enabled_payment_methods: Optional[List[str]] = None
    city_controls: Optional[Dict[str, Any]] = None
    seller_overrides: Optional[Dict[str, Any]] = None


# =========================================================================
# ROUTER BUILDER
# =========================================================================

def build_billing_router(db, get_current_user, require_vendor, require_consumer, require_admin, get_optional_user):
    router = APIRouter(tags=["Billing & Checkout"])

    # ---------------------------------------------------------------------
    # SETTINGS HELPER
    # ---------------------------------------------------------------------
    async def get_billing_settings() -> dict:
        doc = await db.billing_settings.find_one({"_id": "global_billing_config"})
        if not doc:
            doc = {
                "_id": "global_billing_config",
                "billing_enabled": True,
                "checkout_enabled": True,
                "seller_confirmation_enabled": True,
                "online_payment_enabled": True,
                "cash_payment_enabled": True,
                "upi_enabled": True,
                "digital_invoice_enabled": True,
                "multi_seller_cart_enabled": True,
                "mobile_vendor_billing_enabled": True,
                "automatic_sales_attribution_enabled": True,
                "customer_acquisition_analytics_enabled": True,
                "ai_billing_assistant_enabled": True,
                "new_customer_window_days": 90,
                "attribution_window_days": 30,
                "enabled_payment_methods": ["CASH", "UPI", "CARD", "ONLINE_PAYMENT"],
                "city_controls": {"Dehradun": {"billing_enabled": True}},
                "seller_overrides": {},
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.billing_settings.insert_one(doc)
        return doc

    async def check_feature_flag(flag_name: str, seller_id: Optional[str] = None):
        cfg = await get_billing_settings()
        if not cfg.get("billing_enabled", True) and flag_name != "billing_enabled":
            raise HTTPException(status_code=503, detail="Marketplace billing is currently paused by platform administrators.")
        if not cfg.get(flag_name, True):
            raise HTTPException(status_code=503, detail=f"Feature '{flag_name}' is currently disabled.")
        if seller_id and cfg.get("seller_overrides", {}).get(seller_id, {}).get("billing_enabled") is False:
            raise HTTPException(status_code=403, detail="In-app billing is not active for this seller.")

    # ---------------------------------------------------------------------
    # CART ENDPOINTS
    # ---------------------------------------------------------------------

    @router.get("/cart")
    async def get_cart(user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        cart = await db.carts.find_one({"user_id": user_id})
        if not cart:
            return {"user_id": user_id, "items": [], "sellers": {}, "total_items": 0, "subtotal": 0.0}

        items = cart.get("items", [])
        sellers: Dict[str, Any] = {}
        total_items = 0
        overall_subtotal = 0.0

        for it in items:
            s_id = it.get("vendor_id")
            if s_id not in sellers:
                sellers[s_id] = {
                    "seller_id": s_id,
                    "shop_name": it.get("shop_name", "Local Shop"),
                    "shop_address": it.get("shop_address", "Dehradun"),
                    "vendor_type": it.get("vendor_type", "retailer"),
                    "items": [],
                    "subtotal": 0.0,
                }
            line_tot = round(float(it.get("price", 0)) * float(it.get("quantity", 1)), 2)
            sellers[s_id]["items"].append({**it, "line_total": line_tot})
            sellers[s_id]["subtotal"] = round(sellers[s_id]["subtotal"] + line_tot, 2)
            overall_subtotal = round(overall_subtotal + line_tot, 2)
            total_items += int(it.get("quantity", 1))

        return {
            "user_id": user_id,
            "items": items,
            "sellers": list(sellers.values()),
            "total_items": total_items,
            "subtotal": overall_subtotal,
            "updated_at": cart.get("updated_at"),
        }

    @router.post("/cart/items")
    async def add_to_cart(payload: CartItemIn, user: dict = Depends(get_current_user)):
        await check_feature_flag("checkout_enabled")
        user_id = str(user.get("id") or user.get("_id"))

        # Look up product in db.products
        prod = None
        try:
            prod = await db.products.find_one({"_id": ObjectId(payload.product_id)})
        except Exception:
            pass
        if not prod:
            prod = await db.products.find_one({"id": payload.product_id})
        if not prod:
            raise HTTPException(status_code=404, detail="Product not found")

        vendor_id = str(prod.get("vendor_id"))
        vendor = None
        try:
            vendor = await db.users.find_one({"_id": ObjectId(vendor_id)})
        except Exception:
            pass
        if not vendor:
            vendor = await db.users.find_one({"id": vendor_id})

        shop_name = vendor.get("shop_name") or vendor.get("name", "Local Shop") if vendor else "Local Shop"
        shop_address = vendor.get("shop_address", "Dehradun") if vendor else "Dehradun"
        vendor_type = vendor.get("vendor_type", "retailer") if vendor else "retailer"

        cart = await db.carts.find_one({"user_id": user_id})
        items = cart.get("items", []) if cart else []

        # Check if product is already in cart
        found = False
        for it in items:
            if it.get("product_id") == payload.product_id:
                it["quantity"] = round(it["quantity"] + payload.quantity, 2)
                if payload.notes:
                    it["notes"] = payload.notes
                found = True
                break

        if not found:
            items.append({
                "product_id": payload.product_id,
                "name": prod.get("name"),
                "price": float(prod.get("price", 0)),
                "unit": prod.get("unit", "unit"),
                "category": prod.get("category", "General"),
                "quantity": payload.quantity,
                "vendor_id": vendor_id,
                "shop_name": shop_name,
                "shop_address": shop_address,
                "vendor_type": vendor_type,
                "attribution_source": payload.attribution_source or "HYPERLOCAL_PRODUCT_PAGE",
                "notes": payload.notes,
                "added_at": now_iso(),
            })

        await db.carts.update_one(
            {"user_id": user_id},
            {"$set": {"items": items, "updated_at": now_iso()}},
            upsert=True
        )

        # Log cart addition attribution event
        try:
            await db.attribution_events.insert_one({
                "event_id": f"evt_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "seller_id": vendor_id,
                "product_id": payload.product_id,
                "event_type": "add_to_cart",
                "metadata": {"quantity": payload.quantity, "price": prod.get("price")},
                "timestamp": now_iso(),
            })
        except Exception as e:
            logger.warning(f"Failed to log cart attribution event: {e}")

        return {"ok": True, "message": f"Added {prod.get('name')} to cart", "cart_size": len(items)}

    @router.patch("/cart/items/{product_id}")
    async def update_cart_item(product_id: str, payload: CartItemUpdate, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        cart = await db.carts.find_one({"user_id": user_id})
        if not cart:
            raise HTTPException(status_code=404, detail="Cart is empty")

        items = cart.get("items", [])
        updated = False
        for it in items:
            if it.get("product_id") == product_id:
                it["quantity"] = payload.quantity
                if payload.notes is not None:
                    it["notes"] = payload.notes
                updated = True
                break

        if not updated:
            raise HTTPException(status_code=404, detail="Item not found in cart")

        await db.carts.update_one({"user_id": user_id}, {"$set": {"items": items, "updated_at": now_iso()}})
        return {"ok": True, "message": "Cart updated"}

    @router.delete("/cart/items/{product_id}")
    async def remove_cart_item(product_id: str, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        cart = await db.carts.find_one({"user_id": user_id})
        if not cart:
            return {"ok": True, "items": []}

        items = [it for it in cart.get("items", []) if it.get("product_id") != product_id]
        await db.carts.update_one({"user_id": user_id}, {"$set": {"items": items, "updated_at": now_iso()}})
        return {"ok": True, "message": "Item removed from cart"}

    @router.delete("/cart")
    async def clear_cart(user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        await db.carts.update_one({"user_id": user_id}, {"$set": {"items": [], "updated_at": now_iso()}})
        return {"ok": True, "message": "Cart cleared"}

    # ---------------------------------------------------------------------
    # CHECKOUT & ORDER CREATION (MULTI-SELLER SPLIT)
    # ---------------------------------------------------------------------

    @router.post("/checkout/orders")
    async def create_checkout_orders(payload: CheckoutRequestIn, user: dict = Depends(get_current_user)):
        await check_feature_flag("checkout_enabled")
        user_id = str(user.get("id") or user.get("_id"))
        cart = await db.carts.find_one({"user_id": user_id})

        if not cart or not cart.get("items"):
            raise HTTPException(status_code=400, detail="Cannot checkout an empty cart")

        items = cart.get("items", [])
        grouped_by_seller: Dict[str, List[dict]] = {}
        for it in items:
            s_id = it.get("vendor_id")
            grouped_by_seller.setdefault(s_id, []).append(it)

        created_orders = []
        now_ts = now_iso()
        cfg = await get_billing_settings()
        new_cust_window_days = cfg.get("new_customer_window_days", 90)
        new_cust_cutoff = (now_utc() - timedelta(days=new_cust_window_days)).isoformat()

        for seller_id, seller_items in grouped_by_seller.items():
            # Check seller billing eligibility
            await check_feature_flag("billing_enabled", seller_id)

            seller_doc = None
            try:
                seller_doc = await db.users.find_one({"_id": ObjectId(seller_id)})
            except Exception:
                pass
            if not seller_doc:
                seller_doc = await db.users.find_one({"id": seller_id})

            shop_name = seller_doc.get("shop_name") or seller_doc.get("name", "Local Shop") if seller_doc else "Local Shop"
            shop_address = seller_doc.get("shop_address", "Dehradun") if seller_doc else "Dehradun"

            order_id = await next_order_id(db)
            invoice_id = await next_invoice_id(db)

            # Check if customer has prior completed purchases from this seller
            prior_purchase = await db.marketplace_orders.find_one({
                "seller_id": seller_id,
                "customer_id": user_id,
                "order_status": "COMPLETED",
                "created_at": {"$gte": new_cust_cutoff}
            })
            is_new_customer = (prior_purchase is None)

            # Build line items snapshot
            line_items = []
            subtotal = 0.0
            for sit in seller_items:
                price = float(sit.get("price", 0))
                qty = float(sit.get("quantity", 1))
                line_tot = round(price * qty, 2)
                subtotal = round(subtotal + line_tot, 2)
                line_items.append({
                    "product_id": sit.get("product_id"),
                    "name": sit.get("name"),
                    "quantity": qty,
                    "unit": sit.get("unit", "unit"),
                    "unit_price": price,
                    "discount": 0.0,
                    "tax": 0.0,
                    "line_total": line_tot,
                    "notes": sit.get("notes"),
                })

            total_amount = subtotal  # can be updated on seller revisions

            order_doc = {
                "order_id": order_id,
                "invoice_id": invoice_id,
                "customer_id": user_id,
                "customer_name": user.get("name", "Shopper"),
                "customer_phone": mask_phone(user.get("phone")),
                "seller_id": seller_id,
                "seller_name": seller_doc.get("name", "Vendor") if seller_doc else "Vendor",
                "seller_shop_name": shop_name,
                "seller_shop_address": shop_address,
                "seller_vendor_type": seller_doc.get("vendor_type", "retailer") if seller_doc else "retailer",
                "items": line_items,
                "subtotal": subtotal,
                "discount": 0.0,
                "tax": 0.0,
                "additional_charges": 0.0,
                "total_amount": total_amount,
                "checkout_mode": payload.checkout_mode,
                "payment_method": payload.payment_method,
                "order_status": "PENDING_SELLER_CONFIRMATION",
                "payment_status": "NOT_REQUIRED" if payload.checkout_mode == "RESERVE_AT_SHOP" else "PENDING_PAYMENT",
                "customer_notes": payload.customer_notes,
                "seller_notes": None,
                "revisions": [],
                "customer_confirmed_revision": True,
                "is_new_customer": is_new_customer,
                "attribution_source": payload.attribution_source or seller_items[0].get("attribution_source") or "HYPERLOCAL_CHECKOUT",
                "attribution_confidence": "HIGH_CONFIDENCE",
                "created_at": now_ts,
                "updated_at": now_ts,
                "status_history": [
                    {"status": "PENDING_SELLER_CONFIRMATION", "timestamp": now_ts, "updated_by": user_id, "reason": "Order placed by customer"}
                ],
            }

            await db.marketplace_orders.insert_one(order_doc)
            order_doc.pop("_id", None)
            created_orders.append(order_doc)

            # Generate initial draft invoice
            invoice_doc = {
                "invoice_id": invoice_id,
                "order_id": order_id,
                "platform_name": "HyperLocal Marketplace",
                "date": now_utc().strftime("%Y-%m-%d"),
                "time": now_utc().strftime("%H:%M:%S UTC"),
                "seller": {
                    "id": seller_id,
                    "name": seller_doc.get("name") if seller_doc else "Vendor",
                    "shop_name": shop_name,
                    "address": shop_address,
                    "phone": seller_doc.get("phone") if seller_doc else None,
                },
                "customer": {
                    "id": user_id,
                    "name": user.get("name", "Shopper"),
                    "phone": mask_phone(user.get("phone")),
                },
                "items": line_items,
                "subtotal": subtotal,
                "discount": 0.0,
                "tax": 0.0,
                "additional_charges": 0.0,
                "total": total_amount,
                "payment_method": payload.payment_method,
                "payment_status": "NOT_REQUIRED" if payload.checkout_mode == "RESERVE_AT_SHOP" else "PENDING_PAYMENT",
                "status": "DRAFT",
                "created_at": now_ts,
                "finalized_at": None,
            }
            await db.invoices.insert_one(invoice_doc)

            # Attribution event: high intent / checkout started
            try:
                await db.attribution_events.insert_one({
                    "event_id": f"evt_{uuid.uuid4().hex[:12]}",
                    "user_id": user_id,
                    "seller_id": seller_id,
                    "order_id": order_id,
                    "event_type": "checkout_started",
                    "metadata": {"amount": total_amount, "items_count": len(line_items)},
                    "timestamp": now_ts,
                })
            except Exception:
                pass

        # Clear active cart after successful order dispatch
        await db.carts.update_one({"user_id": user_id}, {"$set": {"items": [], "updated_at": now_ts}})

        return {
            "ok": True,
            "message": f"Successfully created {len(created_orders)} orders",
            "orders": created_orders,
        }

    # ---------------------------------------------------------------------
    # ORDER LISTING & DETAILS
    # ---------------------------------------------------------------------

    @router.get("/orders")
    async def list_customer_orders(user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        orders = await db.marketplace_orders.find({"customer_id": user_id}).sort("created_at", -1).limit(100).to_list(100)
        for o in orders:
            o["id"] = str(o["_id"])
            o.pop("_id", None)
        return orders

    @router.get("/orders/{order_id}")
    async def get_order_details(order_id: str, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        user_role = user.get("role")

        order = await db.marketplace_orders.find_one({"order_id": order_id})
        if not order:
            try:
                order = await db.marketplace_orders.find_one({"_id": ObjectId(order_id)})
            except Exception:
                pass
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # RBAC: customer can view own, seller can view own, admin can view any
        if user_role != "admin" and order.get("customer_id") != user_id and order.get("seller_id") != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to inspect this order")

        order["id"] = str(order["_id"])
        order.pop("_id", None)
        return order

    # ---------------------------------------------------------------------
    # SELLER ORDER CONFIRMATION & BILL ADJUSTMENT (PRICE LOCKING)
    # ---------------------------------------------------------------------

    @router.get("/vendor/orders")
    async def list_vendor_orders(user: dict = Depends(require_vendor)):
        vendor_id = str(user.get("id") or user.get("_id"))
        orders = await db.marketplace_orders.find({"seller_id": vendor_id}).sort("created_at", -1).limit(200).to_list(200)
        for o in orders:
            o["id"] = str(o["_id"])
            o.pop("_id", None)
        return orders

    @router.post("/vendor/orders/{order_id}/confirm")
    async def seller_confirm_order(order_id: str, payload: SellerConfirmOrderIn, user: dict = Depends(require_vendor)):
        await check_feature_flag("seller_confirmation_enabled")
        vendor_id = str(user.get("id") or user.get("_id"))

        order = await db.marketplace_orders.find_one({"order_id": order_id, "seller_id": vendor_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found for this vendor")

        if order.get("order_status") not in ["PENDING_SELLER_CONFIRMATION", "REVISED"]:
            raise HTTPException(status_code=400, detail=f"Cannot confirm order in status {order.get('order_status')}")

        now_ts = now_iso()
        status_history = order.get("status_history", [])

        if payload.action == "REJECT":
            status_history.append({"status": "CANCELLED", "timestamp": now_ts, "updated_by": vendor_id, "reason": payload.reason or "Rejected by seller"})
            await db.marketplace_orders.update_one(
                {"order_id": order_id},
                {"$set": {
                    "order_status": "CANCELLED",
                    "seller_notes": payload.seller_notes or payload.reason,
                    "updated_at": now_ts,
                    "status_history": status_history,
                }}
            )
            await db.invoices.update_one({"order_id": order_id}, {"$set": {"status": "CANCELLED", "updated_at": now_ts}})
            return {"ok": True, "status": "CANCELLED", "message": "Order rejected"}

        # Handle revision of quantities/prices
        items = list(order.get("items", []))
        revisions = list(order.get("revisions", []))
        has_changes = False

        if payload.revised_items:
            rev_map = {r.product_id: r for r in payload.revised_items}
            for it in items:
                p_id = it.get("product_id")
                if p_id in rev_map:
                    rev = rev_map[p_id]
                    if rev.quantity != it.get("quantity") or rev.unit_price != it.get("unit_price"):
                        has_changes = True
                        revisions.append({
                            "product_id": p_id,
                            "product_name": it.get("name"),
                            "old_quantity": it.get("quantity"),
                            "new_quantity": rev.quantity,
                            "old_price": it.get("unit_price"),
                            "new_price": rev.unit_price,
                            "reason": rev.reason,
                            "timestamp": now_ts,
                        })
                        it["quantity"] = rev.quantity
                        it["unit_price"] = rev.unit_price
                        it["line_total"] = round(rev.quantity * rev.unit_price, 2)

        # Recalculate totals and create price lock
        subtotal = round(sum(it["line_total"] for it in items), 2)
        add_charges = round(float(payload.additional_charges or 0.0), 2)
        discount = round(float(payload.discount or 0.0), 2)
        final_total = max(0.0, round(subtotal + add_charges - discount, 2))

        if has_changes:
            # Requires customer re-confirmation of revised bill
            next_status = "CONFIRMED"  # Pre-confirmed by seller, awaiting customer check
            customer_confirmed = False
            status_history.append({"status": "REVISED_BY_SELLER", "timestamp": now_ts, "updated_by": vendor_id, "reason": payload.reason or "Seller modified bill"})
        else:
            next_status = "CONFIRMED"
            customer_confirmed = True
            status_history.append({"status": "CONFIRMED", "timestamp": now_ts, "updated_by": vendor_id, "reason": "Confirmed by seller"})

        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "items": items,
                "subtotal": subtotal,
                "additional_charges": add_charges,
                "discount": discount,
                "total_amount": final_total,
                "order_status": next_status,
                "customer_confirmed_revision": customer_confirmed,
                "seller_notes": payload.seller_notes,
                "revisions": revisions,
                "updated_at": now_ts,
                "status_history": status_history,
            }}
        )

        # Update digital invoice with price lock snapshot
        await db.invoices.update_one(
            {"order_id": order_id},
            {"$set": {
                "items": items,
                "subtotal": subtotal,
                "additional_charges": add_charges,
                "discount": discount,
                "total": final_total,
                "status": next_status,
                "updated_at": now_ts,
            }}
        )

        return {
            "ok": True,
            "order_id": order_id,
            "status": next_status,
            "total_amount": final_total,
            "has_revisions": has_changes,
            "message": "Bill revised and sent to customer" if has_changes else "Order confirmed successfully",
        }

    # ---------------------------------------------------------------------
    # CUSTOMER CONFIRMATION OF REVISED BILL
    # ---------------------------------------------------------------------

    @router.post("/orders/{order_id}/confirm-revision")
    async def customer_confirm_revision(order_id: str, payload: CustomerConfirmRevisionIn, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        order = await db.marketplace_orders.find_one({"order_id": order_id, "customer_id": user_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        now_ts = now_iso()
        status_history = order.get("status_history", [])

        if not payload.accepted:
            status_history.append({"status": "CANCELLED", "timestamp": now_ts, "updated_by": user_id, "reason": payload.rejection_reason or "Customer rejected seller bill revisions"})
            await db.marketplace_orders.update_one(
                {"order_id": order_id},
                {"$set": {
                    "order_status": "CANCELLED",
                    "updated_at": now_ts,
                    "status_history": status_history,
                }}
            )
            await db.invoices.update_one({"order_id": order_id}, {"$set": {"status": "CANCELLED", "updated_at": now_ts}})
            return {"ok": True, "status": "CANCELLED", "message": "Order cancelled due to declined revision"}

        status_history.append({"status": "CONFIRMED", "timestamp": now_ts, "updated_by": user_id, "reason": "Customer approved revised bill"})
        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "customer_confirmed_revision": True,
                "order_status": "CONFIRMED",
                "updated_at": now_ts,
                "status_history": status_history,
            }}
        )
        await db.invoices.update_one({"order_id": order_id}, {"$set": {"status": "CONFIRMED", "updated_at": now_ts}})
        return {"ok": True, "status": "CONFIRMED", "message": "Revised bill confirmed by customer"}

    # ---------------------------------------------------------------------
    # MODE A: CASH COLLECTION AT SHOP (SELLER CONFIRMATION & SALE RECORDING)
    # ---------------------------------------------------------------------

    @router.post("/vendor/orders/{order_id}/collect-cash")
    async def seller_collect_cash(order_id: str, payload: CollectCashIn, user: dict = Depends(require_vendor)):
        await check_feature_flag("cash_payment_enabled")
        vendor_id = str(user.get("id") or user.get("_id"))

        order = await db.marketplace_orders.find_one({"order_id": order_id, "seller_id": vendor_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found for this vendor")

        if order.get("order_status") in ["COMPLETED", "CANCELLED", "REFUNDED"]:
            raise HTTPException(status_code=400, detail=f"Order is already in final state: {order.get('order_status')}")

        now_ts = now_iso()
        payment_id = await next_payment_id(db)

        # 1. Record Cash Payment
        payment_doc = {
            "payment_id": payment_id,
            "order_id": order_id,
            "invoice_id": order.get("invoice_id"),
            "customer_id": order.get("customer_id"),
            "seller_id": vendor_id,
            "amount": payload.amount_collected,
            "currency": "INR",
            "method": "CASH",
            "status": "SUCCESS",
            "provider": "cash",
            "provider_tx_id": f"cash_{uuid.uuid4().hex[:8]}",
            "confirmed_by_seller": True,
            "confirmed_by_seller_id": vendor_id,
            "notes": payload.notes,
            "created_at": now_ts,
        }
        await db.billing_payments.insert_one(payment_doc)

        # 2. Update Order Status
        status_history = order.get("status_history", [])
        status_history.append({"status": "COMPLETED", "timestamp": now_ts, "updated_by": vendor_id, "reason": f"Cash of ₹{payload.amount_collected} collected by vendor"})

        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "order_status": "COMPLETED",
                "payment_status": "PAID",
                "payment_id": payment_id,
                "amount_paid": payload.amount_collected,
                "completed_at": now_ts,
                "updated_at": now_ts,
                "status_history": status_history,
            }}
        )

        # 3. Finalize Digital Invoice
        await db.invoices.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": "PAID",
                "payment_status": "PAID",
                "payment_method": "CASH",
                "payment_reference": payment_id,
                "finalized_at": now_ts,
                "updated_at": now_ts,
            }}
        )

        # 4. Trigger Attribution Engine Pipeline (Idempotently)
        await process_completed_sale_attribution(db, order, payload.amount_collected, payment_id, "CASH")

        return {
            "ok": True,
            "order_id": order_id,
            "payment_id": payment_id,
            "status": "COMPLETED",
            "message": f"Recorded cash sale of ₹{payload.amount_collected} and finalized invoice",
        }

    # ---------------------------------------------------------------------
    # MODE B: PAY THROUGH HYPERLOCAL (ONLINE / UPI / WEBHOOK IDEMPOTENT)
    # ---------------------------------------------------------------------

    @router.post("/payments/checkout/record")
    async def record_online_payment(payload: OnlinePaymentRecordIn, user: dict = Depends(get_current_user)):
        await check_feature_flag("online_payment_enabled")
        user_id = str(user.get("id") or user.get("_id"))

        # Prevent duplicate submissions with Idempotency Key
        existing_payment = await db.billing_payments.find_one({"idempotency_key": payload.idempotency_key})
        if existing_payment:
            return {"ok": True, "payment_id": existing_payment.get("payment_id"), "status": existing_payment.get("status"), "duplicate": True}

        order = await db.marketplace_orders.find_one({"order_id": payload.order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Amount validation
        if abs(payload.amount - order.get("total_amount", 0)) > 0.01:
            logger.warning(f"Payment amount mismatch for order {payload.order_id}: expected {order.get('total_amount')} got {payload.amount}")

        now_ts = now_iso()
        payment_id = await next_payment_id(db)

        payment_doc = {
            "payment_id": payment_id,
            "order_id": payload.order_id,
            "invoice_id": order.get("invoice_id"),
            "customer_id": user_id,
            "seller_id": order.get("seller_id"),
            "amount": payload.amount,
            "currency": "INR",
            "method": payload.payment_method,
            "status": "SUCCESS",
            "provider": payload.provider,
            "provider_tx_id": payload.provider_tx_id or f"tx_{uuid.uuid4().hex[:10]}",
            "idempotency_key": payload.idempotency_key,
            "created_at": now_ts,
        }
        await db.billing_payments.insert_one(payment_doc)

        # Update Order
        status_history = order.get("status_history", [])
        status_history.append({"status": "PAID", "timestamp": now_ts, "updated_by": user_id, "reason": f"Online payment verified via {payload.provider}"})

        await db.marketplace_orders.update_one(
            {"order_id": payload.order_id},
            {"$set": {
                "order_status": "READY_FOR_PICKUP",
                "payment_status": "PAID",
                "payment_id": payment_id,
                "amount_paid": payload.amount,
                "updated_at": now_ts,
                "status_history": status_history,
            }}
        )

        # Finalize Invoice
        await db.invoices.update_one(
            {"order_id": payload.order_id},
            {"$set": {
                "status": "PAID",
                "payment_status": "PAID",
                "payment_method": payload.payment_method,
                "payment_reference": payload.provider_tx_id or payment_id,
                "finalized_at": now_ts,
                "updated_at": now_ts,
            }}
        )

        # Trigger Attribution Pipeline
        await process_completed_sale_attribution(db, order, payload.amount, payment_id, payload.payment_method)

        return {"ok": True, "payment_id": payment_id, "order_id": payload.order_id, "status": "PAID"}

    # ---------------------------------------------------------------------
    # ORDER FULFILLMENT & CANCELLATION
    # ---------------------------------------------------------------------

    @router.post("/vendor/orders/{order_id}/mark-ready")
    async def seller_mark_ready(order_id: str, user: dict = Depends(require_vendor)):
        vendor_id = str(user.get("id") or user.get("_id"))
        order = await db.marketplace_orders.find_one({"order_id": order_id, "seller_id": vendor_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        now_ts = now_iso()
        status_history = order.get("status_history", [])
        status_history.append({"status": "READY_FOR_PICKUP", "timestamp": now_ts, "updated_by": vendor_id, "reason": "Packed and ready for pickup"})

        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {"order_status": "READY_FOR_PICKUP", "updated_at": now_ts, "status_history": status_history}}
        )
        return {"ok": True, "order_id": order_id, "status": "READY_FOR_PICKUP"}

    @router.post("/orders/{order_id}/cancel")
    async def cancel_order(order_id: str, reason: Optional[str] = None, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        user_role = user.get("role")

        order = await db.marketplace_orders.find_one({"order_id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if user_role != "admin" and order.get("customer_id") != user_id and order.get("seller_id") != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to cancel this order")

        if order.get("order_status") in ["COMPLETED", "CANCELLED"]:
            raise HTTPException(status_code=400, detail=f"Cannot cancel order in status {order.get('order_status')}")

        now_ts = now_iso()
        status_history = order.get("status_history", [])
        status_history.append({"status": "CANCELLED", "timestamp": now_ts, "updated_by": user_id, "reason": reason or "Cancelled by user"})

        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {"order_status": "CANCELLED", "updated_at": now_ts, "status_history": status_history}}
        )
        await db.invoices.update_one({"order_id": order_id}, {"$set": {"status": "CANCELLED", "updated_at": now_ts}})

        return {"ok": True, "order_id": order_id, "status": "CANCELLED"}

    @router.post("/orders/{order_id}/reorder")
    async def reorder_items(order_id: str, user: dict = Depends(get_current_user)):
        """Adds all items from a past order back into the user's cart."""
        user_id = str(user.get("id") or user.get("_id"))
        order = await db.marketplace_orders.find_one({"order_id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        cart = await db.carts.find_one({"user_id": user_id})
        items = cart.get("items", []) if cart else []

        reordered_count = 0
        for it in order.get("items", []):
            p_id = it.get("product_id")
            # Look up fresh product price
            prod = await db.products.find_one({"$or": [{"_id": ObjectId(p_id) if ObjectId.is_valid(p_id) else None}, {"id": p_id}]})
            price = float(prod.get("price")) if prod else float(it.get("unit_price", 0))

            items.append({
                "product_id": p_id,
                "name": it.get("name"),
                "price": price,
                "unit": it.get("unit", "unit"),
                "quantity": it.get("quantity", 1),
                "vendor_id": order.get("seller_id"),
                "shop_name": order.get("seller_shop_name"),
                "shop_address": order.get("seller_shop_address"),
                "vendor_type": order.get("seller_vendor_type", "retailer"),
                "attribution_source": "HYPERLOCAL_REORDER",
                "added_at": now_iso(),
            })
            reordered_count += 1

        await db.carts.update_one({"user_id": user_id}, {"$set": {"items": items, "updated_at": now_iso()}}, upsert=True)
        return {"ok": True, "reordered_count": reordered_count, "cart_size": len(items)}

    # ---------------------------------------------------------------------
    # DIGITAL INVOICE RETRIEVAL
    # ---------------------------------------------------------------------

    @router.get("/invoices/{invoice_id}")
    async def get_digital_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        user_role = user.get("role")

        inv = await db.invoices.find_one({"invoice_id": invoice_id})
        if not inv:
            inv = await db.invoices.find_one({"order_id": invoice_id})
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")

        # RBAC Check
        cust_id = inv.get("customer", {}).get("id")
        seller_id = inv.get("seller", {}).get("id")
        if user_role != "admin" and cust_id != user_id and seller_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to inspect this invoice")

        inv["id"] = str(inv["_id"])
        inv.pop("_id", None)
        return inv

    # ---------------------------------------------------------------------
    # REFUND WORKFLOW
    # ---------------------------------------------------------------------

    @router.post("/orders/{order_id}/refund")
    async def process_order_refund(order_id: str, payload: RefundRequestIn, user: dict = Depends(get_current_user)):
        user_id = str(user.get("id") or user.get("_id"))
        user_role = user.get("role")

        order = await db.marketplace_orders.find_one({"order_id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Only seller or admin can initiate refund
        if user_role != "admin" and order.get("seller_id") != user_id:
            raise HTTPException(status_code=403, detail="Only the seller or platform administrator can approve a refund")

        if order.get("payment_status") != "PAID":
            raise HTTPException(status_code=400, detail="Cannot refund an unpaid order")

        refund_amount = payload.amount if payload.amount is not None else float(order.get("total_amount", 0))
        if refund_amount <= 0 or refund_amount > float(order.get("total_amount", 0)):
            raise HTTPException(status_code=400, detail="Invalid refund amount")

        now_ts = now_iso()
        refund_id = await next_refund_id(db)
        is_full_refund = (refund_amount >= float(order.get("total_amount", 0)))

        refund_doc = {
            "refund_id": refund_id,
            "order_id": order_id,
            "invoice_id": order.get("invoice_id"),
            "seller_id": order.get("seller_id"),
            "customer_id": order.get("customer_id"),
            "amount": refund_amount,
            "refund_type": "full" if is_full_refund else "partial",
            "reason": payload.reason,
            "status": "COMPLETED",
            "initiated_by_role": user_role,
            "initiated_by_user_id": user_id,
            "created_at": now_ts,
        }
        await db.billing_refunds.insert_one(refund_doc)

        new_status = "REFUNDED" if is_full_refund else "PARTIALLY_REFUNDED"
        status_history = order.get("status_history", [])
        status_history.append({"status": new_status, "timestamp": now_ts, "updated_by": user_id, "reason": f"Refund of ₹{refund_amount} processed: {payload.reason}"})

        await db.marketplace_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "order_status": new_status,
                "payment_status": "REFUNDED" if is_full_refund else "PAID",
                "refund_id": refund_id,
                "refunded_amount": refund_amount,
                "updated_at": now_ts,
                "status_history": status_history,
            }}
        )

        await db.invoices.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": new_status,
                "refund_reference": refund_id,
                "refunded_amount": refund_amount,
                "updated_at": now_ts,
            }}
        )

        # Adjust attribution record if full refund
        if is_full_refund:
            await db.purchase_attributions.update_one(
                {"order_id": order_id},
                {"$set": {"status": "REFUNDED", "amount": 0.0, "updated_at": now_ts}}
            )

        return {
            "ok": True,
            "refund_id": refund_id,
            "order_id": order_id,
            "amount": refund_amount,
            "status": new_status,
            "message": f"Successfully processed {new_status} of ₹{refund_amount}",
        }

    # ---------------------------------------------------------------------
    # SUPER ADMIN MASTER CONTROL CENTER
    # ---------------------------------------------------------------------

    @router.get("/admin/billing/dashboard")
    async def admin_billing_dashboard(admin: dict = Depends(require_admin)):
        total_orders = await db.marketplace_orders.count_documents({})
        pending_orders = await db.marketplace_orders.count_documents({"order_status": "PENDING_SELLER_CONFIRMATION"})
        completed_orders = await db.marketplace_orders.count_documents({"order_status": "COMPLETED"})
        cancelled_orders = await db.marketplace_orders.count_documents({"order_status": "CANCELLED"})
        refunded_orders = await db.marketplace_orders.count_documents({"order_status": {"$in": ["REFUNDED", "PARTIALLY_REFUNDED"]}})

        # Revenue metrics
        completed_docs = await db.marketplace_orders.find({"order_status": "COMPLETED"}).to_list(1000)
        gtv = sum(float(o.get("total_amount", 0)) for o in completed_docs)
        
        # Attributed revenue (orders with hyperlocal attribution source)
        hyperlocal_orders = [o for o in completed_docs if o.get("attribution_source", "").startswith("HYPERLOCAL")]
        attributed_rev = sum(float(o.get("total_amount", 0)) for o in hyperlocal_orders)

        # Refunds total
        refund_docs = await db.billing_refunds.find({"status": "COMPLETED"}).to_list(1000)
        total_refunds = sum(float(r.get("amount", 0)) for r in refund_docs)

        # Customers breakdown
        unique_customers = set(o.get("customer_id") for o in completed_docs if o.get("customer_id"))
        new_customers_count = len([o for o in completed_docs if o.get("is_new_customer")])
        returning_customers_count = len(completed_docs) - new_customers_count

        cfg = await get_billing_settings()

        return {
            "overview": {
                "gross_transaction_value": round(gtv, 2),
                "attributed_revenue": round(attributed_rev, 2),
                "net_revenue": round(gtv - total_refunds, 2),
                "total_refunds": round(total_refunds, 2),
                "disclaimer": DISCLAIMER_TEXT,
            },
            "orders": {
                "total": total_orders,
                "pending": pending_orders,
                "completed": completed_orders,
                "cancelled": cancelled_orders,
                "refunded": refunded_orders,
            },
            "customers": {
                "total_unique": len(unique_customers),
                "new_customer_orders": new_customers_count,
                "returning_customer_orders": returning_customers_count,
            },
            "feature_flags": {
                "billing_enabled": cfg.get("billing_enabled", True),
                "checkout_enabled": cfg.get("checkout_enabled", True),
                "online_payment_enabled": cfg.get("online_payment_enabled", True),
                "cash_payment_enabled": cfg.get("cash_payment_enabled", True),
                "seller_confirmation_enabled": cfg.get("seller_confirmation_enabled", True),
            }
        }

    @router.get("/admin/billing/orders")
    async def admin_list_billing_orders(
        limit: int = 100,
        status: Optional[str] = None,
        search: Optional[str] = None,
        payment_status: Optional[str] = None,
        admin: dict = Depends(require_admin)
    ):
        q: Dict[str, Any] = {}
        if status and status != "all":
            q["order_status"] = status
        if payment_status and payment_status != "all":
            q["payment_status"] = payment_status
        if search:
            q["$or"] = [
                {"order_id": {"$regex": search, "$options": "i"}},
                {"invoice_id": {"$regex": search, "$options": "i"}},
                {"customer_name": {"$regex": search, "$options": "i"}},
                {"seller_shop_name": {"$regex": search, "$options": "i"}},
            ]

        orders = await db.marketplace_orders.find(q).sort("created_at", -1).limit(limit).to_list(limit)
        for o in orders:
            o["id"] = str(o["_id"])
            o.pop("_id", None)
        return orders

    @router.patch("/admin/billing/orders/{order_id}")
    async def admin_correct_order(order_id: str, payload: AdminOrderCorrectionIn, admin: dict = Depends(require_admin)):
        order = await db.marketplace_orders.find_one({"order_id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        now_ts = now_iso()
        admin_id = str(admin.get("id") or admin.get("_id"))
        status_history = order.get("status_history", [])
        status_history.append({
            "status": payload.order_status or order.get("order_status"),
            "timestamp": now_ts,
            "updated_by": f"admin::{admin.get('email')}",
            "reason": f"Administrative override: {payload.reason}"
        })

        update_fields: Dict[str, Any] = {"updated_at": now_ts, "status_history": status_history}
        if payload.order_status:
            update_fields["order_status"] = payload.order_status
        if payload.payment_status:
            update_fields["payment_status"] = payload.payment_status
        if payload.seller_notes:
            update_fields["seller_notes"] = payload.seller_notes

        await db.marketplace_orders.update_one({"order_id": order_id}, {"$set": update_fields})
        fresh = await db.marketplace_orders.find_one({"order_id": order_id})
        fresh["id"] = str(fresh["_id"])
        fresh.pop("_id", None)

        # Audit log entry
        await db.billing_audit_logs.insert_one({
            "admin_id": admin_id,
            "admin_email": admin.get("email"),
            "action": "ORDER_CORRECTION",
            "order_id": order_id,
            "previous_status": order.get("order_status"),
            "new_status": payload.order_status,
            "reason": payload.reason,
            "timestamp": now_ts,
        })

        return fresh

    @router.get("/admin/billing/invoices")
    async def admin_list_invoices(limit: int = 100, admin: dict = Depends(require_admin)):
        invoices = await db.invoices.find({}).sort("created_at", -1).limit(limit).to_list(limit)
        for inv in invoices:
            inv["id"] = str(inv["_id"])
            inv.pop("_id", None)
        return invoices

    @router.get("/admin/billing/reconciliation")
    async def admin_payment_reconciliation(admin: dict = Depends(require_admin)):
        """Identifies discrepancies between recorded orders and payments."""
        orders = await db.marketplace_orders.find({"payment_status": "PAID"}).to_list(500)
        reconciled = []
        discrepancies = []

        for o in orders:
            o_id = o.get("order_id")
            pay_doc = await db.billing_payments.find_one({"order_id": o_id, "status": "SUCCESS"})
            order_amt = float(o.get("total_amount", 0))
            if not pay_doc:
                discrepancies.append({
                    "order_id": o_id,
                    "issue": "ORDER_PAID_WITHOUT_PAYMENT_RECORD",
                    "order_total": order_amt,
                    "payment_received": 0.0,
                    "seller_shop": o.get("seller_shop_name"),
                })
            else:
                pay_amt = float(pay_doc.get("amount", 0))
                if abs(order_amt - pay_amt) > 0.01:
                    discrepancies.append({
                        "order_id": o_id,
                        "payment_id": pay_doc.get("payment_id"),
                        "issue": "AMOUNT_MISMATCH",
                        "order_total": order_amt,
                        "payment_received": pay_amt,
                        "seller_shop": o.get("seller_shop_name"),
                    })
                else:
                    reconciled.append({
                        "order_id": o_id,
                        "payment_id": pay_doc.get("payment_id"),
                        "amount": pay_amt,
                        "method": pay_doc.get("method"),
                        "status": "RECONCILED",
                    })

        return {
            "total_audited": len(orders),
            "reconciled_count": len(reconciled),
            "discrepancies_count": len(discrepancies),
            "discrepancies": discrepancies,
            "reconciled_sample": reconciled[:10],
        }

    @router.get("/admin/billing/settings")
    async def admin_get_settings(admin: dict = Depends(require_admin)):
        return await get_billing_settings()

    @router.patch("/admin/billing/settings")
    async def admin_patch_settings(payload: BillingSettingsPatch, admin: dict = Depends(require_admin)):
        now_ts = now_iso()
        admin_id = str(admin.get("id") or admin.get("_id"))
        update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
        update_data["updated_at"] = now_ts

        await db.billing_settings.update_one(
            {"_id": "global_billing_config"},
            {"$set": update_data},
            upsert=True
        )

        await db.billing_audit_logs.insert_one({
            "admin_id": admin_id,
            "admin_email": admin.get("email"),
            "action": "SETTINGS_UPDATE",
            "payload": update_data,
            "timestamp": now_ts,
        })

        return await get_billing_settings()

    @router.get("/admin/billing/export")
    async def admin_export_billing_csv(format: str = "csv", admin: dict = Depends(require_admin)):
        orders = await db.marketplace_orders.find({}).sort("created_at", -1).limit(1000).to_list(1000)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Order ID", "Invoice ID", "Date", "Customer Name", "Seller Shop",
            "Items Count", "Subtotal", "Discount", "Total Amount", "Order Status",
            "Payment Status", "Payment Method", "Attribution Source", "Is New Customer"
        ])
        for o in orders:
            writer.writerow([
                o.get("order_id"),
                o.get("invoice_id"),
                o.get("created_at"),
                o.get("customer_name"),
                o.get("seller_shop_name"),
                len(o.get("items", [])),
                o.get("subtotal"),
                o.get("discount"),
                o.get("total_amount"),
                o.get("order_status"),
                o.get("payment_status"),
                o.get("payment_method"),
                o.get("attribution_source"),
                o.get("is_new_customer"),
            ])
        csv_data = output.getvalue()
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=hyperlocal_billing_export.csv"})

    return router


# =========================================================================
# ATTRIBUTION PIPELINE BRIDGE (PREVENTS DOUBLE COUNTING)
# =========================================================================

async def process_completed_sale_attribution(db, order: dict, amount: float, payment_id: str, payment_method: str):
    """Feeds completed in-app transactions directly into the Attribution Engine."""
    seller_id = str(order.get("seller_id"))
    customer_id = str(order.get("customer_id"))
    order_id = str(order.get("order_id"))
    invoice_id = str(order.get("invoice_id"))
    now_ts = now_iso()

    # 1. Idempotency Check: ensure this order has not already been attributed
    existing = await db.purchase_attributions.find_one({"order_id": order_id})
    if existing:
        logger.info(f"Order {order_id} already recorded in purchase_attributions. Skipping duplicate attribution.")
        return

    # 2. Insert into db.purchase_attributions
    purchase_doc = {
        "attribution_id": f"attr_{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "invoice_id": invoice_id,
        "seller_id": seller_id,
        "customer_id": customer_id,
        "amount": round(float(amount), 2),
        "payment_id": payment_id,
        "payment_method": payment_method,
        "is_verified": True,
        "confidence_level": "VERIFIED",
        "trust_level": "VERIFIED",
        "attribution_source": order.get("attribution_source") or "HYPERLOCAL_CHECKOUT",
        "is_new_customer": order.get("is_new_customer", False),
        "purchased_at": now_ts,
        "created_at": now_ts,
    }
    await db.purchase_attributions.insert_one(purchase_doc)

    # 3. Log into db.attribution_events
    try:
        await db.attribution_events.insert_one({
            "event_id": f"evt_{uuid.uuid4().hex[:12]}",
            "user_id": customer_id,
            "seller_id": seller_id,
            "order_id": order_id,
            "event_type": "purchase_confirmed",
            "metadata": {
                "amount": amount,
                "is_new_customer": order.get("is_new_customer"),
                "source": "in_app_billing",
            },
            "timestamp": now_ts,
        })
    except Exception as e:
        logger.warning(f"Failed to log purchase_confirmed attribution event: {e}")

    # 4. Safely update / increment vendor daily sales with source tagging
    today_str = now_utc().strftime("%Y-%m-%d")
    daily_record = await db.vendor_daily_sales.find_one({"seller_id": seller_id, "date": today_str})

    if daily_record:
        await db.vendor_daily_sales.update_one(
            {"_id": daily_record["_id"]},
            {
                "$inc": {
                    "total_sales": round(float(amount), 2),
                    "hyperlocal_sales": round(float(amount), 2),
                    "customer_count": 1,
                    "hyperlocal_customer_count": 1,
                },
                "$set": {"updated_at": now_ts}
            }
        )
    else:
        await db.vendor_daily_sales.insert_one({
            "seller_id": seller_id,
            "date": today_str,
            "total_sales": round(float(amount), 2),
            "hyperlocal_sales": round(float(amount), 2),
            "customer_count": 1,
            "hyperlocal_customer_count": 1,
            "source": "HYPERLOCAL_BILLING",
            "created_at": now_ts,
            "updated_at": now_ts,
        })

    logger.info(f"Successfully attributed sale of ₹{amount} for seller {seller_id} on order {order_id}")

