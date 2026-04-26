"""
Billing API Endpoints — Razorpay subscription management.

Handles:
- Geo-based pricing detection
- Subscription creation via Razorpay
- Payment verification
- Subscription status & usage
- Cancellation
- Razorpay webhook events
"""

import json
from datetime import datetime, timezone
from typing import Optional as Opt

from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.api.endpoints.auth import get_current_user
from app.models.schemas import (
    CreateSubscriptionRequest,
    VerifyPaymentRequest,
    GeoPricingResponse,
    SubscriptionResponse,
)
from app.services.billing_service import (
    detect_geo,
    get_pricing_for_currency,
    create_razorpay_subscription_link,
    verify_razorpay_signature,
    cancel_razorpay_subscription,
    fetch_razorpay_subscription,
    verify_webhook_signature,
    check_usage_limit,
    get_plan_limits,
    PLAN_PRICING,
)
from app.services.persistence import (
    save_subscription,
    load_subscription,
    reset_subscription_usage,
    save_users,
)

router = APIRouter()
settings = get_settings()


@router.get("/geo")
async def get_geo_pricing(request: Request):
    """
    Detect user's country from IP and return localized pricing.
    No authentication required — this is public.
    """
    # Get client IP
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host if request.client else "127.0.0.1"

    geo = await detect_geo(client_ip)
    pricing = get_pricing_for_currency(geo["currency"])

    return GeoPricingResponse(
        country=geo["country"],
        country_name=geo.get("country_name", ""),
        currency=geo["currency"],
        symbol=geo["symbol"],
        plans=pricing,
    )


@router.get("/plans")
async def list_plans(currency: str = "INR"):
    """
    Return all plans with pricing for a given currency.
    No authentication required.
    """
    if currency not in PLAN_PRICING:
        currency = "USD"

    pricing = get_pricing_for_currency(currency)
    return pricing


@router.post("/subscribe")
async def create_subscription(
    body: CreateSubscriptionRequest,
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """
    Create a Razorpay subscription for the authenticated user.
    Returns subscription_id and Razorpay key for checkout widget.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    plan = body.plan.lower()
    if plan not in ("pro", "team"):
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'pro' or 'team'.")

    # Determine currency from existing subscription or default
    sub = load_subscription(user.id)
    currency = sub.get("currency", "INR") if sub else "INR"

    try:
        result = create_razorpay_subscription_link(
            plan_tier=plan,
            currency=currency,
            customer_email=user.email or f"{user.username}@github.com",
            customer_name=user.username,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create subscription: {str(e)}")


@router.post("/verify")
async def verify_payment(
    body: VerifyPaymentRequest,
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """
    Verify Razorpay payment signature and activate subscription.
    Called by frontend after successful Razorpay Checkout.
    Uses order-based verification (not subscription-based).
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Verify order payment signature
    is_valid = verify_razorpay_signature(
        payment_id=body.razorpay_payment_id,
        order_id=body.razorpay_order_id,
        signature=body.razorpay_signature,
    )

    if not is_valid:
        raise HTTPException(status_code=400, detail="Payment verification failed — invalid signature.")

    # Determine tier from request
    tier = body.plan.lower() if body.plan else "pro"
    if tier not in ("pro", "team"):
        tier = "pro"

    # Determine currency from existing subscription or default
    existing_sub = load_subscription(user.id)
    currency = existing_sub.get("currency", "INR") if existing_sub else "INR"

    # Calculate billing period (30 days from now)
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    period_end = now + timedelta(days=30)

    # Save subscription
    sub_data = {
        "user_id": user.id,
        "tier": tier,
        "currency": currency,
        "razorpay_order_id": body.razorpay_order_id,
        "razorpay_payment_id": body.razorpay_payment_id,
        "current_period_start": now.isoformat(),
        "current_period_end": period_end.isoformat(),
        "status": "active",
        "usage": {
            "walkthroughs": 0,
            "signals": 0,
            "provenance": 0,
            "explains": 0,
            "repos": 0,
        },
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    save_subscription(sub_data)

    # Update user model
    user.subscription_tier = tier

    # Update in-memory users_db and persist
    from app.api.endpoints.auth import users_db
    users_db[user.id] = user
    save_users(users_db)

    return {
        "success": True,
        "tier": tier,
        "message": f"Welcome to DocuVerse {tier.capitalize()}! Your subscription is now active.",
    }


@router.get("/subscription")
async def get_subscription(
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """
    Get current user's subscription status, usage, and limits.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else "free"
    usage = sub.get("usage", {}) if sub else {}
    limits = get_plan_limits(tier)

    return SubscriptionResponse(
        tier=tier,
        status=sub.get("status", "active") if sub else "active",
        currency=sub.get("currency", "INR") if sub else "INR",
        current_period_end=sub.get("current_period_end") if sub else None,
        usage=usage,
        limits=limits,
        razorpay_subscription_id=sub.get("razorpay_subscription_id") if sub else None,
    )


@router.post("/cancel")
async def cancel_subscription(
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """
    Cancel the user's subscription at the end of the current billing period.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sub = load_subscription(user.id)
    if not sub or sub.get("tier") == "free":
        raise HTTPException(status_code=400, detail="No active subscription to cancel.")

    razorpay_sub_id = sub.get("razorpay_subscription_id")
    if not razorpay_sub_id:
        raise HTTPException(status_code=400, detail="No Razorpay subscription found.")

    try:
        cancel_razorpay_subscription(razorpay_sub_id, cancel_at_cycle_end=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel subscription: {str(e)}")

    sub["status"] = "cancelled"
    sub["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_subscription(sub)

    return {
        "success": True,
        "message": "Subscription cancelled. You'll retain access until the end of your current billing period.",
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Handle Razorpay webhook events.
    Events handled:
    - subscription.activated → activate subscription
    - subscription.charged → renew period, reset usage
    - subscription.halted → mark halted (payment failed)
    - subscription.cancelled → downgrade to free
    - subscription.completed → downgrade to free
    """
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    # Verify webhook signature
    if not verify_webhook_signature(body, signature):
        return JSONResponse(status_code=400, content={"error": "Invalid signature"})

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    event = payload.get("event", "")
    event_data = payload.get("payload", {})

    subscription_entity = event_data.get("subscription", {}).get("entity", {})
    razorpay_sub_id = subscription_entity.get("id", "")
    notes = subscription_entity.get("notes", {})

    print(f"📦 Razorpay webhook: {event} for subscription {razorpay_sub_id}")

    if not razorpay_sub_id:
        return {"status": "ok", "message": "No subscription ID in event"}

    # Find user by subscription ID (search in-memory)
    from app.services.persistence import _subscription_memory
    user_id = None
    for uid, sub in _subscription_memory.items():
        if sub.get("razorpay_subscription_id") == razorpay_sub_id:
            user_id = uid
            break

    if not user_id:
        # Try to identify from notes
        print(f"⚠️ Could not find user for subscription {razorpay_sub_id}")
        return {"status": "ok", "message": "User not found for subscription"}

    sub = load_subscription(user_id)
    if not sub:
        return {"status": "ok", "message": "Subscription not found"}

    if event == "subscription.activated":
        sub["status"] = "active"
        save_subscription(sub)

    elif event == "subscription.charged":
        # Payment successful — reset usage for new period
        sub["status"] = "active"
        current_start = subscription_entity.get("current_start")
        current_end = subscription_entity.get("current_end")
        if current_start:
            sub["current_period_start"] = datetime.fromtimestamp(current_start, tz=timezone.utc).isoformat()
        if current_end:
            sub["current_period_end"] = datetime.fromtimestamp(current_end, tz=timezone.utc).isoformat()
        sub["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_subscription(sub)
        reset_subscription_usage(user_id)

    elif event == "subscription.halted":
        # Payment failed — subscription halted
        sub["status"] = "halted"
        sub["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_subscription(sub)

    elif event in ("subscription.cancelled", "subscription.completed"):
        # Subscription ended — downgrade to free
        sub["tier"] = "free"
        sub["status"] = "expired"
        sub["razorpay_subscription_id"] = None
        sub["updated_at"] = datetime.now(timezone.utc).isoformat()
        save_subscription(sub)

        # Update user model
        from app.api.endpoints.auth import users_db
        if user_id in users_db:
            users_db[user_id].subscription_tier = "free"
            save_users(users_db)

    return {"status": "ok", "event": event}
