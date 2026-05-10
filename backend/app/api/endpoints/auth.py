"""
Authentication Endpoints - GitHub OAuth
"""

import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

from fastapi import APIRouter, HTTPException, Depends, Response, Header, Cookie, Request
from fastapi.responses import RedirectResponse
from typing import Optional as Opt
import httpx
from jose import jwt, JWTError
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models.schemas import User, UserResponse, APIResponse
from app.services.persistence import save_users, load_users, save_subscription, load_subscription

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# Load users from persistence on startup
users_db: dict[str, User] = load_users()
sessions_db: dict[str, str] = {}  # session_token -> user_id

# A7 fix: short-lived access tokens + revocation set.
# In production replace _revoked_jtis with a Redis SET with TTL.
_revoked_jtis: Set[str] = set()

ACCESS_TOKEN_TTL = timedelta(hours=8)
REFRESH_TOKEN_TTL = timedelta(days=30)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a short-lived JWT access token (default 8 h)."""
    to_encode = data.copy()
    jti = secrets.token_urlsafe(16)
    expire = _utcnow() + (expires_delta or ACCESS_TOKEN_TTL)
    to_encode.update({"exp": expire, "iat": _utcnow(), "jti": jti, "type": "access"})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh token (30 days, not stored in localStorage)."""
    jti = secrets.token_urlsafe(16)
    expire = _utcnow() + REFRESH_TOKEN_TTL
    payload = {
        "user_id": user_id,
        "exp": expire,
        "iat": _utcnow(),
        "jti": jti,
        "type": "refresh",
    }
    # Refresh tokens are signed with a different secret so a leaked access
    # token cannot be used to forge a refresh token.
    return jwt.encode(payload, settings.secret_key + ":refresh", algorithm="HS256")


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        if payload.get("type") not in ("access", None):
            return None
        if payload.get("jti") in _revoked_jtis:
            return None
        return payload
    except JWTError:
        return None


def revoke_token(token: str) -> None:
    """Add a token's jti to the revocation set."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"],
                             options={"verify_exp": False})
        jti = payload.get("jti")
        if jti:
            _revoked_jtis.add(jti)
    except Exception:
        pass


def _auth_failure_log(reason: str, **extra) -> None:
    logger.info(
        "auth_failure",
        extra={"reason": reason, **extra},
    )


async def get_current_user(
    authorization: str = None,
    request: Optional[Request] = None,
    source: str = "unspecified",
) -> Optional[User]:
    """Get current authenticated user from JWT token"""
    if not authorization:
        _auth_failure_log(
            "missing_authorization_header",
            source=source,
            path=str(getattr(getattr(request, "url", None), "path", "")),
        )
        return None
    
    # Handle both "Bearer token" and just "token" formats
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    
    payload = decode_access_token(token)
    
    if not payload or "user_id" not in payload:
        _auth_failure_log(
            "invalid_or_expired_access_token",
            source=source,
            path=str(getattr(getattr(request, "url", None), "path", "")),
        )
        return None
    
    user_id = payload["user_id"]
    
    # First try to get from in-memory store
    user = users_db.get(user_id)
    
    # If not in memory but token is valid, reconstruct user from token payload
    if not user and payload.get("user_data"):
        user_data = payload["user_data"]
        user = User(
            id=user_id,
            github_id=user_data.get("github_id"),
            username=user_data.get("username"),
            email=user_data.get("email"),
            avatar_url=user_data.get("avatar_url"),
            access_token=user_data.get("access_token", ""),
            subscription_tier=user_data.get("subscription_tier", "free"),
            vercel_access_token=user_data.get("vercel_access_token"),
            vercel_team_id=user_data.get("vercel_team_id"),
        )
        # Store back in memory for future requests
        users_db[user_id] = user
        # Save to persistence
        save_users(users_db)
    if not user:
        _auth_failure_log(
            "user_missing_for_valid_token",
            source=source,
            user_id=str(user_id),
            path=str(getattr(getattr(request, "url", None), "path", "")),
        )
    
    return user


@router.get("/github")
async def github_auth():
    """Initiate GitHub OAuth flow"""
    state = secrets.token_urlsafe(32)
    
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
        f"&scope=repo,read:user,user:email"
        f"&state={state}"
    )
    
    return {"auth_url": github_auth_url, "state": state}


@router.get("/github/callback")
async def github_callback(code: str, state: str):
    """Handle GitHub OAuth callback"""
    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
            headers={"Accept": "application/json"}
        )
        
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get access token")
        
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token received")
        
        # Get user info from GitHub
        user_response = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json"
            }
        )
        
        if user_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        
        github_user = user_response.json()
        
        # Get user email
        emails_response = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json"
            }
        )
        
        primary_email = None
        if emails_response.status_code == 200:
            emails = emails_response.json()
            for email in emails:
                if email.get("primary"):
                    primary_email = email.get("email")
                    break
    
    # Create or update user
    user_id = f"user_{github_user['id']}"
    
    # Check if existing user (preserve subscription tier)
    existing_user = users_db.get(user_id)
    existing_tier = existing_user.subscription_tier if existing_user else "free"
    existing_rzp_id = existing_user.razorpay_customer_id if existing_user else None
    
    user = User(
        id=user_id,
        github_id=github_user["id"],
        username=github_user["login"],
        email=primary_email,
        avatar_url=github_user.get("avatar_url"),
        access_token=access_token,
        subscription_tier=existing_tier,
        razorpay_customer_id=existing_rzp_id,
    )
    
    users_db[user_id] = user
    
    # Save to persistence
    save_users(users_db)
    
    # Initialize free subscription if new user
    if not existing_user:
        from datetime import timezone as tz
        sub_data = {
            "user_id": user_id,
            "tier": "free",
            "currency": "INR",
            "status": "active",
            "usage": {"walkthroughs": 0, "signals": 0, "provenance": 0, "explains": 0, "repos": 0},
            "created_at": datetime.now(tz.utc).isoformat(),
            "updated_at": datetime.now(tz.utc).isoformat(),
        }
        save_subscription(sub_data)
    
    # Issue access token (8 h) + refresh token (30 d).
    # The access token travels in Authorization headers.
    # The refresh token is sent as HttpOnly cookie (set by /auth/refresh).
    access_token = create_access_token({
        "user_id": user_id,
        "user_data": {
            "github_id": github_user["id"],
            "username": github_user["login"],
            "email": primary_email,
            "avatar_url": github_user.get("avatar_url"),
            "access_token": access_token,
        }
    })
    refresh_token = create_refresh_token(user_id)

    # Redirect to frontend with access token in URL + refresh token as cookie.
    # The frontend stores access_token in memory (not localStorage).
    redirect = RedirectResponse(
        url=f"{settings.frontend_url}/auth/callback?token={access_token}",
        status_code=302,
    )
    redirect.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        path="/api/auth",
    )
    return redirect


@router.get("/me")
async def get_me(authorization: Opt[str] = Header(None, alias="Authorization")):
    """Get current user info"""
    user = await get_current_user(authorization, source="auth_me")
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get subscription info
    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else user.subscription_tier
    
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        avatar_url=user.avatar_url,
        subscription_tier=tier,
    )


@router.post("/logout")
async def logout(
    response: Response,
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """Logout: revoke access token and clear refresh-token cookie."""
    if authorization and authorization.startswith("Bearer "):
        revoke_token(authorization[7:])
    response.delete_cookie("refresh_token", path="/api/auth")
    return APIResponse(success=True, message="Logged out successfully")


@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    refresh_token_cookie: Opt[str] = Cookie(None, alias="refresh_token"),
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """Exchange a refresh-token cookie for a new access token.

    Falls back to the Authorization header for backward compatibility with
    clients that still store the long-lived token.
    """
    user: Optional[User] = None

    # Try refresh token cookie first
    if refresh_token_cookie:
        try:
            payload = jwt.decode(
                refresh_token_cookie,
                settings.secret_key + ":refresh",
                algorithms=["HS256"],
            )
            if payload.get("type") == "refresh" and payload.get("jti") not in _revoked_jtis:
                user_id = payload.get("user_id")
                user = users_db.get(user_id) if user_id else None
        except JWTError:
            _auth_failure_log(
                "invalid_refresh_cookie",
                source="auth_refresh",
                path=str(request.url.path),
            )
            pass

    # Backward-compat: accept current access token (will be revoked after rotation)
    if not user and authorization:
        user = await get_current_user(
            authorization,
            request=request,
            source="auth_refresh_header_fallback",
        )
        if user and authorization.startswith("Bearer "):
            revoke_token(authorization[7:])   # rotate: revoke old access token

    if not user:
        _auth_failure_log(
            "refresh_rejected",
            source="auth_refresh",
            has_refresh_cookie=bool(refresh_token_cookie),
            has_authorization=bool(authorization),
            path=str(request.url.path),
        )
        raise HTTPException(status_code=401, detail="Not authenticated")

    new_access = create_access_token({
        "user_id": user.id,
        "user_data": {
            "github_id": user.github_id,
            "username": user.username,
            "email": user.email,
            "avatar_url": user.avatar_url,
            "access_token": user.access_token,
        }
    })
    new_refresh = create_refresh_token(user.id)

    # Rotate refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        path="/api/auth",
    )

    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else user.subscription_tier

    return {
        "token": new_access,
        "user": UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            avatar_url=user.avatar_url,
            subscription_tier=tier,
        )
    }


@router.get("/verify")
async def verify_token(authorization: Opt[str] = Header(None, alias="Authorization")):
    """Verify if token is valid"""
    user = await get_current_user(authorization, source="auth_verify")
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    # Get subscription tier
    sub = load_subscription(user.id)
    tier = sub.get("tier", "free") if sub else user.subscription_tier
    
    return {
        "valid": True,
        "user": UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            avatar_url=user.avatar_url,
            subscription_tier=tier,
        )
    }


# ---------------------------------------------------------------------------
# Vercel personal access token (Phase 3)
# ---------------------------------------------------------------------------

class _VercelConnectBody(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    team_id: Optional[str] = Field(None, max_length=64)


@router.post("/integrations/vercel/connect")
async def connect_vercel(
    body: _VercelConnectBody,
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """Store the user's Vercel personal access token."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user.vercel_access_token = body.token
    user.vercel_team_id = body.team_id
    users_db[user.id] = user
    save_users(users_db)
    return {"connected": True, "team_id": body.team_id}


@router.delete("/integrations/vercel")
async def disconnect_vercel(
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    """Remove the user's stored Vercel token."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user.vercel_access_token = None
    user.vercel_team_id = None
    users_db[user.id] = user
    save_users(users_db)
    return {"connected": False}


@router.get("/integrations/vercel")
async def vercel_status(
    authorization: Opt[str] = Header(None, alias="Authorization"),
):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "connected": bool(user.vercel_access_token),
        "team_id": user.vercel_team_id,
    }

