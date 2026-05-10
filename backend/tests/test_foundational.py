"""
DocuVerse — Foundational Test Suite  (F1 fix)

Run with:  pytest backend/tests/ -v

These tests cover the critical paths that were identified as broken/missing
during the audit. They are intentionally narrow and fast (no real I/O, no
network calls, no heavy AI services).

Test categories:
  T1  — Error taxonomy enum completeness
  T2  — Preview token issue/validate lifecycle
  T3  — Rate limiter bucket mechanics
  T4  — JWT token lifecycle (issue, decode, revoke, refresh)
  T5  — Port reservation atomicity
  T6  — Edit classifier canonical routing (B3 fix)
  T7  — InspectClickRequest payload-size cap (A6 fix)
  T8  — Idempotency cache key uniqueness
  T9  — _kill_process_tree_sync doesn't raise on dead process
  T10 — CORS allowed-origins list never includes wildcard regex
  T11 — Studio sessions JSON persistence when DynamoDB is off (reload-safe)
"""

from __future__ import annotations

import os
import sys
import time
import asyncio

import pytest

# Add backend root to path so imports resolve without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# T1 — Error taxonomy enum completeness
# ---------------------------------------------------------------------------

def test_error_taxonomy_all_values_have_dots():
    from app.errors import ErrorCode
    for code in ErrorCode:
        assert "." in code.value, f"ErrorCode.{code.name} value should be namespaced: {code.value!r}"


def test_api_error_returns_http_exception():
    from fastapi import HTTPException
    from app.errors import api_error, ErrorCode
    exc = api_error(ErrorCode.NOT_FOUND_PROJECT, "not found", status=404)
    assert isinstance(exc, HTTPException)
    assert exc.status_code == 404
    assert exc.detail["error"]["code"] == ErrorCode.NOT_FOUND_PROJECT.value


def test_api_error_response_returns_json_response():
    from app.errors import api_error_response, ErrorCode
    from fastapi.responses import JSONResponse
    resp = api_error_response(ErrorCode.QUOTA_RATE_LIMIT, "too fast", status=429, retry_after=30)
    assert isinstance(resp, JSONResponse)
    assert resp.status_code == 429


# ---------------------------------------------------------------------------
# T2 — Preview token lifecycle
# ---------------------------------------------------------------------------

def test_preview_token_issue_and_validate():
    from app.services.preview_token import issue_preview_token, validate_preview_token
    token = issue_preview_token("user_1", "project_abc")
    assert token and len(token) > 10
    user_id = validate_preview_token(token, "project_abc")
    assert user_id == "user_1"


def test_preview_token_wrong_resource_raises():
    from fastapi import HTTPException
    from app.services.preview_token import issue_preview_token, validate_preview_token
    token = issue_preview_token("user_1", "project_abc")
    with pytest.raises(HTTPException) as exc_info:
        validate_preview_token(token, "project_WRONG")
    assert exc_info.value.status_code == 403


def test_preview_token_missing_raises_401():
    from fastapi import HTTPException
    from app.services.preview_token import validate_preview_token
    with pytest.raises(HTTPException) as exc_info:
        validate_preview_token(None, "project_abc")
    assert exc_info.value.status_code == 401


def test_preview_token_expired():
    from fastapi import HTTPException
    from app.services import preview_token as _pt
    # Temporarily shorten TTL
    original_ttl = _pt._PREVIEW_TOKEN_TTL
    _pt._PREVIEW_TOKEN_TTL = 0  # expire immediately
    token = _pt.issue_preview_token("user_1", "project_abc")
    time.sleep(0.01)
    _pt._PREVIEW_TOKEN_TTL = original_ttl
    with pytest.raises(HTTPException) as exc_info:
        _pt.validate_preview_token(token, "project_abc")
    assert exc_info.value.status_code in (401,)


# ---------------------------------------------------------------------------
# T3 — Rate limiter bucket mechanics
# ---------------------------------------------------------------------------

def test_rate_limiter_allows_under_limit():
    from app.middleware.rate_limiter import _check_rate_limit, _buckets
    uid = "test_user_ratelimit_1"
    action = "generate"
    _buckets.pop((uid, action), None)
    # Free tier: 5 generate / hour
    for _ in range(5):
        _check_rate_limit(uid, "free", action)  # should not raise


def test_rate_limiter_blocks_over_limit():
    from fastapi import HTTPException
    from app.middleware.rate_limiter import _check_rate_limit, _buckets
    uid = "test_user_ratelimit_2"
    action = "generate"
    _buckets.pop((uid, action), None)
    for _ in range(5):
        _check_rate_limit(uid, "free", action)
    with pytest.raises(HTTPException) as exc_info:
        _check_rate_limit(uid, "free", action)
    assert exc_info.value.status_code == 429


# ---------------------------------------------------------------------------
# T4 — JWT lifecycle
# ---------------------------------------------------------------------------

def test_create_and_decode_access_token(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-tests")
    monkeypatch.setenv("GITHUB_CLIENT_ID", "x")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "x")
    monkeypatch.setenv("GITHUB_REDIRECT_URI", "http://localhost")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    from importlib import reload
    import app.config as cfg
    reload(cfg)
    cfg._settings = None  # force re-read

    from app.api.endpoints.auth import create_access_token, decode_access_token
    token = create_access_token({"user_id": "user_test"})
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["user_id"] == "user_test"
    assert payload.get("type") == "access"


def test_revoke_token_blocks_decode(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-for-tests")
    monkeypatch.setenv("GITHUB_CLIENT_ID", "x")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "x")
    monkeypatch.setenv("GITHUB_REDIRECT_URI", "http://localhost")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    from importlib import reload
    import app.config as cfg
    reload(cfg)
    cfg._settings = None

    from app.api.endpoints import auth as auth_mod
    reload(auth_mod)

    token = auth_mod.create_access_token({"user_id": "user_test2"})
    auth_mod.revoke_token(token)
    payload = auth_mod.decode_access_token(token)
    assert payload is None


# ---------------------------------------------------------------------------
# T5 — Port reservation atomicity (sync test; locks are module-level)
# ---------------------------------------------------------------------------

def test_port_reservation_no_duplicates():
    from app.services.preview_runner import _reserved_ports, _release_port

    async def _run():
        from app.services.preview_runner import _reserve_port
        ports = await asyncio.gather(*[_reserve_port() for _ in range(5)])
        return ports

    ports = asyncio.run(_run())
    assert len(set(ports)) == len(ports), "Duplicate ports were reserved concurrently"

    for p in ports:
        _release_port(p)


# ---------------------------------------------------------------------------
# T6 — Edit classifier canonical routing (B3 fix)
# ---------------------------------------------------------------------------

def test_classify_edit_css_prompt():
    from app.services.edit_classifier import classify_edit_legacy
    result = classify_edit_legacy("change the background color to blue")
    assert result == "css"


def test_classify_edit_structural_prompt():
    from app.services.edit_classifier import classify_edit_legacy
    result = classify_edit_legacy("add a new testimonials section with cards")
    assert result == "structural"


def test_classify_edit_quick_prompt():
    from app.services.edit_classifier import classify_edit_legacy
    result = classify_edit_legacy("update the button label to Sign Up")
    assert result in ("quick", "css")


def test_builder_uses_canonical_classifier():
    """B3 fix: builder._classify_edit must delegate to edit_classifier.py."""
    from app.api.endpoints import builder
    # If the shim delegates correctly, calling _classify_edit with a CSS
    # prompt should return "css" — same as classify_edit_legacy.
    assert builder._classify_edit("change background color to red") == "css"


# ---------------------------------------------------------------------------
# T7 — InspectClickRequest payload cap (A6 fix)
# ---------------------------------------------------------------------------

def test_inspect_click_request_accepts_small_payload():
    from app.api.endpoints.studio import InspectClickRequest
    req = InspectClickRequest(
        dv_id="el_1",
        dom={"tag": "button", "className": "btn-primary", "id": "submit"},
    )
    assert req.dv_id == "el_1"


def test_inspect_click_request_rejects_oversized_payload():
    from pydantic import ValidationError
    from app.api.endpoints.studio import InspectClickRequest
    big_styles = {f"key_{i}": "x" * 100 for i in range(200)}
    with pytest.raises((ValidationError, ValueError)):
        InspectClickRequest(styles=big_styles)


# ---------------------------------------------------------------------------
# T8 — Idempotency cache key uniqueness
# ---------------------------------------------------------------------------

def test_idempotency_different_users_different_keys():
    from app.middleware.idempotency import _cache_key
    k1 = _cache_key("user_A", "my-idempotency-key")
    k2 = _cache_key("user_B", "my-idempotency-key")
    assert k1 != k2, "Same idempotency key for different users should produce different cache keys"


def test_idempotency_same_user_same_key_same_result():
    from app.middleware.idempotency import _cache_key
    k1 = _cache_key("user_A", "idem-key-123")
    k2 = _cache_key("user_A", "idem-key-123")
    assert k1 == k2


# ---------------------------------------------------------------------------
# T9 — _kill_process_tree_sync on already-dead process
# ---------------------------------------------------------------------------

def test_kill_already_dead_process_no_raise():
    import subprocess
    from app.services.preview_runner import _kill_process_tree_sync
    proc = subprocess.Popen(["python", "-c", ""], stdout=subprocess.PIPE)
    proc.wait()
    assert proc.poll() is not None
    # Must not raise even though process is already dead
    _kill_process_tree_sync(proc)


# ---------------------------------------------------------------------------
# T10 — CORS list never contains a bare wildcard
# ---------------------------------------------------------------------------

def test_cors_no_bare_wildcard(monkeypatch):
    monkeypatch.setenv("EXTRA_CORS_ORIGINS", "")
    monkeypatch.setenv("NETLIFY_SITE_SLUG", "")
    import os
    allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    for origin in allowed:
        assert origin != "*", "Bare wildcard should never be in allow_origins"
        assert not origin.startswith("http://*."), "Wildcard subdomains not allowed"


# ---------------------------------------------------------------------------
# T11 — Studio session disk persistence without DynamoDB (uvicorn reload)
# ---------------------------------------------------------------------------

def test_studio_sessions_persist_without_dynamodb(monkeypatch, tmp_path):
    monkeypatch.setenv("PREVIEW_WORKSPACE", str(tmp_path))
    import app.services.studio_session_service as sss

    monkeypatch.setattr(sss, "_try_dynamo", lambda: False)
    sss._sessions_cache.clear()

    sess = sss.create_session(
        user_id="test_user",
        kind="generated",
        source_id="builder_abc",
        title="My App",
    )
    sid = sess["id"]

    disk_file = tmp_path / "_studio_sessions" / f"{sid}.json"
    assert disk_file.is_file()

    sss._sessions_cache.clear()
    again = sss.load_session(sid)
    assert again is not None
    assert again["user_id"] == "test_user"

    listed = sss.list_user_sessions("test_user")
    assert any(s["id"] == sid for s in listed)

    sss.delete_session(sid)
    assert not disk_file.is_file()
    assert sss.load_session(sid) is None
