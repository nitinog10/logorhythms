"""
DocuVerse — Structured Logging  (SEV-1 fix: F2)

Configures structlog for JSON output with trace_id on every log line.
Also provides a FastAPI middleware that:
  1. Generates a unique trace_id per request (or reads X-Trace-Id header)
  2. Injects it into structlog's context
  3. Attaches it to the response as X-Trace-Id

Usage:
    from app.logging_config import get_logger
    log = get_logger(__name__)
    log.info("doing_thing", key=value)
"""

from __future__ import annotations

import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# ── Context variable for trace propagation ──────────────────────────────────
_trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")


def current_trace_id() -> str:
    return _trace_id_var.get("")


# ── structlog configuration ──────────────────────────────────────────────────

def _add_trace_id(logger, method_name, event_dict):  # noqa: ANN001
    tid = current_trace_id()
    if tid:
        event_dict["trace_id"] = tid
    return event_dict


def configure_logging(json_output: bool = True) -> None:
    """Call once at application startup.

    ``PrintLoggerFactory`` backs ``get_logger`` — it does **not** attach a
    ``.name`` to the logger object, so ``structlog.stdlib.add_logger_name``
    must not be used (it expects a stdlib ``logging.Logger``).
    """
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        _add_trace_id,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if json_output:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=shared_processors + [renderer],
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Bridge stdlib logging through structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
    for name in ("uvicorn", "uvicorn.access", "fastapi"):
        logging.getLogger(name).handlers = []


def get_logger(name: str) -> structlog.BoundLogger:
    return structlog.get_logger(name)


# ── Middleware ───────────────────────────────────────────────────────────────

class TraceMiddleware(BaseHTTPMiddleware):
    """Assigns a trace_id to every request and propagates it through logs."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        trace_id = request.headers.get("X-Trace-Id") or uuid.uuid4().hex
        token = _trace_id_var.set(trace_id)
        t0 = time.perf_counter()

        log = get_logger("http")
        log.info(
            "request_started",
            method=request.method,
            path=request.url.path,
        )

        response: Response | None = None
        try:
            response = await call_next(request)
        except Exception:
            log.exception(
                "request_unhandled_error",
                method=request.method,
                path=request.url.path,
            )
            raise
        finally:
            elapsed_ms = round((time.perf_counter() - t0) * 1000)
            log.info(
                "request_finished",
                method=request.method,
                path=request.url.path,
                status=(response.status_code if response is not None else 0),
                elapsed_ms=elapsed_ms,
            )
            _trace_id_var.reset(token)

        if response is not None:
            response.headers["X-Trace-Id"] = trace_id
        return response
