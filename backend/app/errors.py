"""
DocuVerse — Typed Error Taxonomy  (SEV-2 fix: F4, F5)

Every public API response uses one of these codes. The frontend maps each
code to a specific UI affordance (toast / modal / banner / redirect).

Usage (in endpoints):
    from app.errors import api_error, ErrorCode
    raise api_error(ErrorCode.BOOTSTRAP_NO_FRAMEWORK, "No framework detected")

    # or return a dict directly:
    return api_error_response(ErrorCode.QUOTA_EXCEEDED, "Rate limit reached", status=429)
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse


class ErrorCode(str, Enum):
    # Auth
    AUTH_MISSING_TOKEN = "auth.missing_token"
    AUTH_INVALID_TOKEN = "auth.invalid_token"
    AUTH_EXPIRED_TOKEN = "auth.expired_token"
    AUTH_FORBIDDEN = "auth.forbidden"

    # Resource
    NOT_FOUND_PROJECT = "not_found.project"
    NOT_FOUND_SESSION = "not_found.session"
    NOT_FOUND_REPO = "not_found.repository"
    NOT_FOUND_SCREEN = "not_found.screen"

    # Bootstrap
    BOOTSTRAP_NO_FRAMEWORK = "bootstrap.no_framework"
    BOOTSTRAP_REPO_MISSING = "bootstrap.repo_missing"
    BOOTSTRAP_RECLONE_FAILED = "bootstrap.reclone_failed"
    BOOTSTRAP_DETECTION_FAILED = "bootstrap.detection_failed"

    # Preview
    PREVIEW_NO_PM = "preview.no_package_manager"
    PREVIEW_INSTALL_FAILED = "preview.install_failed"
    PREVIEW_DEV_SERVER_CRASHED = "preview.dev_server_crashed"
    PREVIEW_PORT_EXHAUSTED = "preview.port_exhausted"
    PREVIEW_NO_FILES = "preview.no_files"
    PREVIEW_NO_PLAN = "preview.no_bootstrap_plan"

    # Edit
    EDIT_CLASSIFIER_FAILED = "edit.classifier_failed"
    EDIT_VALIDATOR_REJECTED = "edit.validator_rejected"
    EDIT_GENERATION_FAILED = "edit.generation_failed"
    EDIT_NO_SCREEN = "edit.no_screen"

    # Quota / billing
    QUOTA_PROJECT_LIMIT = "quota.project_limit"
    QUOTA_RATE_LIMIT = "quota.rate_limit"
    QUOTA_AI_BUDGET = "quota.ai_budget"

    # Persistence
    PERSISTENCE_DOWN = "persistence.down"
    PERSISTENCE_ITEM_TOO_LARGE = "persistence.item_too_large"

    # Generic
    INVALID_REQUEST = "request.invalid"
    INTERNAL_ERROR = "server.internal_error"
    SERVICE_DEGRADED = "server.degraded"


# Human-readable hints shown in the UI
_HINTS: Dict[ErrorCode, str] = {
    ErrorCode.AUTH_MISSING_TOKEN: "Include an Authorization: Bearer <token> header.",
    ErrorCode.AUTH_INVALID_TOKEN: "Sign out and sign in again to get a fresh token.",
    ErrorCode.AUTH_EXPIRED_TOKEN: "Your session has expired. Please sign in again.",
    ErrorCode.BOOTSTRAP_REPO_MISSING: "The repository was not found locally. Reconnect it from the Dashboard.",
    ErrorCode.BOOTSTRAP_RECLONE_FAILED: "Could not re-clone the repository. Check your GitHub connection.",
    ErrorCode.PREVIEW_NO_PM: "Install Node.js from https://nodejs.org and restart the backend.",
    ErrorCode.PREVIEW_INSTALL_FAILED: "Dependency installation failed. Check the error output for details.",
    ErrorCode.PREVIEW_DEV_SERVER_CRASHED: "The app's dev server crashed on startup. See the error output.",
    ErrorCode.PREVIEW_NO_FILES: "Run Magic Build first to generate the full-stack files.",
    ErrorCode.PREVIEW_NO_PLAN: "Run framework detection (Bootstrap) before launching a preview.",
    ErrorCode.QUOTA_PROJECT_LIMIT: "You've reached your project limit. Upgrade your plan to create more.",
    ErrorCode.QUOTA_RATE_LIMIT: "Too many requests. Wait a moment and try again.",
}


def _error_body(
    code: ErrorCode,
    message: str,
    detail: Optional[Any] = None,
    retry_after: Optional[int] = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "error": {
            "code": code.value,
            "message": message,
            "hint": _HINTS.get(code, ""),
        }
    }
    if detail is not None:
        body["error"]["detail"] = detail
    if retry_after is not None:
        body["error"]["retry_after"] = retry_after
    return body


def api_error(
    code: ErrorCode,
    message: str,
    status: int = 400,
    detail: Optional[Any] = None,
) -> HTTPException:
    """Raise as: ``raise api_error(ErrorCode.X, "message")``"""
    return HTTPException(
        status_code=status,
        detail=_error_body(code, message, detail),
    )


def api_error_response(
    code: ErrorCode,
    message: str,
    status: int = 400,
    detail: Optional[Any] = None,
    retry_after: Optional[int] = None,
) -> JSONResponse:
    """Return directly: ``return api_error_response(ErrorCode.X, "message", 429)``"""
    return JSONResponse(
        status_code=status,
        content=_error_body(code, message, detail, retry_after),
    )
