"""
Billing Service — Razorpay subscription management, geo-pricing, and usage limits.

Handles:
- Razorpay client initialization and subscription lifecycle
- Geo-based pricing (INR for India, USD for international)
- Per-tier usage limit definitions and enforcement
- Usage counter tracking per billing period
"""

import hmac
import hashlib
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timezone

import httpx
import razorpay

from app.config import get_settings

settings = get_settings()


# ---------------------------------------------------------------------------
# Plan Definitions
# ---------------------------------------------------------------------------

PLAN_LIMITS = {
    "free": {
        "repos": 5,
        "walkthroughs_per_month": 5,
        "signals_per_month": 3,
        "provenance_per_month": 3,
        "explains_per_day": 10,
        "diagrams_per_month": -1,  # -1 = unlimited
        "audio_quality": "browser",  # browser TTS only
        "team_sharing": False,
        "api_access": False,
    },
    "pro": {
        "repos": -1,
        "walkthroughs_per_month": 100,
        "signals_per_month": 50,
        "provenance_per_month": 30,
        "explains_per_day": -1,
        "diagrams_per_month": -1,
        "audio_quality": "elevenlabs",
        "team_sharing": False,
        "api_access": True,
    },
    "team": {
        "repos": -1,
        "walkthroughs_per_month": -1,
        "signals_per_month": -1,
        "provenance_per_month": -1,
        "explains_per_day": -1,
        "diagrams_per_month": -1,
        "audio_quality": "elevenlabs",
        "team_sharing": True,
        "api_access": True,
    },
}


# Pricing per currency
PLAN_PRICING = {
    "INR": {
        "pro": {"amount": 799, "display": "₹799/mo", "symbol": "₹"},
        "team": {"amount": 1499, "display": "₹1,499/mo per seat", "symbol": "₹"},
    },
    "USD": {
        "pro": {"amount": 9, "display": "$9/mo", "symbol": "$"},
        "team": {"amount": 19, "display": "$19/mo per seat", "symbol": "$"},
    },
}

# Feature display names (for limit-exceeded messages)
FEATURE_NAMES = {
    "walkthroughs": "AI Walkthroughs",
    "signals": "Signal Packets",
    "provenance": "Provenance Cards",
    "explains": "Inline Explanations",
    "repos": "Connected Repositories",
    "diagrams": "Architecture Diagrams",
}


# ---------------------------------------------------------------------------
# Razorpay Client
# ---------------------------------------------------------------------------

_razorpay_client: Optional[razorpay.Client] = None


def _get_razorpay_client() -> razorpay.Client:
    """Get or create Razorpay client singleton."""
    global _razorpay_client
    if _razorpay_client is None:
        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            raise RuntimeError("Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env")
        _razorpay_client = razorpay.Client(
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
        )
    return _razorpay_client


# ---------------------------------------------------------------------------
# Geo Detection
# ---------------------------------------------------------------------------

# Countries that get INR pricing
INR_COUNTRIES = {"IN"}


async def detect_geo(ip: str) -> Dict[str, str]:
    """
    Detect country and currency from IP address.
    Uses ipapi.co free tier (no API key needed, 1000 req/day).
    Falls back to USD if detection fails.
    """
    # Skip detection for localhost/private IPs
    if ip in ("127.0.0.1", "::1", "localhost") or ip.startswith("192.168.") or ip.startswith("10."):
        return {"country": "IN", "country_name": "India", "currency": "INR", "symbol": "₹"}

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            if resp.status_code == 200:
                data = resp.json()
                country = data.get("country_code", "US")
                country_name = data.get("country_name", "")
                if country in INR_COUNTRIES:
                    return {"country": country, "country_name": country_name, "currency": "INR", "symbol": "₹"}
                else:
                    return {"country": country, "country_name": country_name, "currency": "USD", "symbol": "$"}
    except Exception as e:
        print(f"Geo detection failed: {e}")

    return {"country": "US", "country_name": "United States", "currency": "USD", "symbol": "$"}


def get_pricing_for_currency(currency: str) -> Dict[str, Any]:
    """Get plan pricing for a given currency."""
    pricing = PLAN_PRICING.get(currency, PLAN_PRICING["USD"])
    symbol = pricing["pro"]["symbol"]
    return {
        "currency": currency,
        "symbol": symbol,
        "free": {
            "amount": 0,
            "display": "Free",
            "features": _get_feature_list("free"),
        },
        "pro": {
            **pricing["pro"],
            "features": _get_feature_list("pro"),
        },
        "team": {
            **pricing["team"],
            "features": _get_feature_list("team"),
        },
    }


def _get_feature_list(tier: str) -> list:
    """Get human-readable feature list for a tier."""
    limits = PLAN_LIMITS[tier]
    features = []

    repos = limits["repos"]
    features.append(f"{'Unlimited' if repos == -1 else repos} repositories")

    wt = limits["walkthroughs_per_month"]
    features.append(f"{'Unlimited' if wt == -1 else wt} walkthroughs / month")

    features.append("Unlimited diagrams")

    sig = limits["signals_per_month"]
    features.append(f"{'Unlimited' if sig == -1 else sig} Signal packets / month")

    prov = limits["provenance_per_month"]
    features.append(f"{'Unlimited' if prov == -1 else prov} Provenance cards / month")

    exp = limits["explains_per_day"]
    exp_label = "Unlimited" if exp == -1 else f"{exp} / day"
    features.append(f"{exp_label} Inline Explain")

    audio = limits["audio_quality"]
    features.append("ElevenLabs HD audio" if audio == "elevenlabs" else "Browser TTS audio")

    if limits["api_access"]:
        features.append("API & MCP access")
    if limits["team_sharing"]:
        features.append("Team collaboration")

    return features


# ---------------------------------------------------------------------------
# Subscription Management
# ---------------------------------------------------------------------------

def create_razorpay_subscription(plan_id: str, customer_email: str, customer_name: str) -> Dict[str, Any]:
    """
    Legacy: Create a Razorpay subscription for a user.
    Kept for backwards compat but not actively used.
    """
    client = _get_razorpay_client()
    subscription_data = {
        "plan_id": plan_id,
        "total_count": 120,
        "quantity": 1,
        "customer_notify": 1,
        "notes": {
            "customer_email": customer_email,
            "customer_name": customer_name,
        },
    }
    subscription = client.subscription.create(subscription_data)
    return subscription


def create_razorpay_subscription_link(
    plan_tier: str,
    currency: str,
    customer_email: str,
    customer_name: str,
) -> Dict[str, Any]:
    """
    Create a Razorpay Order for the chosen plan.
    Uses order-based flow (works with all test keys) instead of
    subscription-based flow (which requires pre-created plans in the
    Razorpay Dashboard).
    """
    client = _get_razorpay_client()
    pricing = PLAN_PRICING.get(currency, PLAN_PRICING["USD"])

    if plan_tier not in pricing:
        raise ValueError(f"Invalid plan tier: {plan_tier}")

    plan_info = pricing[plan_tier]
    amount_in_smallest_unit = plan_info["amount"] * 100  # Razorpay expects paise/cents

    import uuid
    receipt = f"docuverse_{plan_tier}_{uuid.uuid4().hex[:8]}"

    try:
        order = client.order.create({
            "amount": amount_in_smallest_unit,
            "currency": currency,
            "receipt": receipt,
            "notes": {
                "customer_email": customer_email,
                "customer_name": customer_name,
                "tier": plan_tier,
                "currency": currency,
            },
        })
        return {
            "order_id": order["id"],
            "razorpay_key_id": settings.razorpay_key_id,
            "amount": plan_info["amount"],
            "amount_in_paise": amount_in_smallest_unit,
            "currency": currency,
            "display": plan_info["display"],
            "name": f"DocuVerse {plan_tier.capitalize()}",
            "description": f"Monthly {plan_tier.capitalize()} subscription",
            "tier": plan_tier,
        }
    except Exception as e:
        print(f"Error creating Razorpay order: {e}")
        raise


def verify_razorpay_signature(
    payment_id: str,
    order_id: str,
    signature: str,
) -> bool:
    """
    Verify Razorpay payment signature using HMAC-SHA256.
    Uses order-based verification: HMAC(order_id|payment_id, key_secret).
    """
    client = _get_razorpay_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_payment_id": payment_id,
            "razorpay_order_id": order_id,
            "razorpay_signature": signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False


def cancel_razorpay_subscription(subscription_id: str, cancel_at_cycle_end: bool = True) -> Dict[str, Any]:
    """Cancel a Razorpay subscription."""
    client = _get_razorpay_client()
    return client.subscription.cancel(subscription_id, {"cancel_at_cycle_end": cancel_at_cycle_end})


def fetch_razorpay_subscription(subscription_id: str) -> Dict[str, Any]:
    """Fetch subscription details from Razorpay."""
    client = _get_razorpay_client()
    return client.subscription.fetch(subscription_id)


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature."""
    if not settings.razorpay_webhook_secret:
        # Skip verification if secret not set (dev mode)
        return True

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Usage Limit Checking
# ---------------------------------------------------------------------------

# Map feature keys to their limit keys in PLAN_LIMITS
_FEATURE_LIMIT_MAP = {
    "walkthroughs": "walkthroughs_per_month",
    "signals": "signals_per_month",
    "provenance": "provenance_per_month",
    "explains": "explains_per_day",
    "repos": "repos",
    "diagrams": "diagrams_per_month",
}


def check_usage_limit(tier: str, feature: str, current_usage: int) -> Tuple[bool, int]:
    """
    Check if a user has reached their usage limit for a feature.

    Returns (allowed: bool, limit: int).
    limit = -1 means unlimited.
    """
    tier = tier.lower()
    if tier not in PLAN_LIMITS:
        tier = "free"

    limit_key = _FEATURE_LIMIT_MAP.get(feature)
    if not limit_key:
        return True, -1  # Unknown feature = no limit

    limit = PLAN_LIMITS[tier].get(limit_key, -1)

    if limit == -1:
        return True, -1  # Unlimited

    return current_usage < limit, limit


def get_plan_limits(tier: str) -> Dict[str, int]:
    """Get the usage limits for a tier as a simple dict."""
    tier = tier.lower()
    limits = PLAN_LIMITS.get(tier, PLAN_LIMITS["free"])
    return {
        "repos": limits["repos"],
        "walkthroughs": limits["walkthroughs_per_month"],
        "signals": limits["signals_per_month"],
        "provenance": limits["provenance_per_month"],
        "explains": limits["explains_per_day"],
        "diagrams": limits["diagrams_per_month"],
    }
