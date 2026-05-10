"""
DocuVerse FastAPI Application Entry Point
"""

# Force UTF-8 output on Windows (prevents CP1252 UnicodeEncodeError with emojis)
import sys, io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Pin the Proactor event loop policy on Windows so asyncio subprocess works
# inside FastAPI request handlers. Some uvicorn / Python combinations leave
# the SelectorEventLoop active, which raises NotImplementedError when any
# code tries `asyncio.create_subprocess_shell()` (the Studio launcher does).
# Must be done at import time, before any event loop is created.
if sys.platform == "win32":
    import asyncio as _asyncio
    try:
        _asyncio.set_event_loop_policy(_asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

import logging
import os
import re
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.api.routes import router as api_router
from app.services.vector_store import VectorStoreService
from app.services.parser import ParserService
from app.logging_config import configure_logging, TraceMiddleware, get_logger
from app.middleware.idempotency import IdempotencyMiddleware
from app.errors import ErrorCode, _error_body
from app.services.runtime_manager import get_runtime_manager

# Configure structured logging at module-load time.
# Use JSON in production (non-debug), console-pretty in dev.
_json_logs = not bool(os.getenv("DEV_LOGGING", ""))
configure_logging(json_output=_json_logs)

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    settings = get_settings()
    
    # Initialize services on startup
    print("🚀 Initializing DocuVerse services...")
    
    # Initialize Vector Store
    vector_store = VectorStoreService()
    app.state.vector_store = vector_store
    
    # Initialize Parser Service
    parser_service = ParserService()
    app.state.parser = parser_service
    
    print("✅ DocuVerse services initialized successfully!")

    # Runtime cleanup worker (Phase 1 reliability):
    # - startup orphan recovery
    # - periodic stale runtime/container cleanup
    cleanup_manager = get_runtime_manager()
    try:
        await cleanup_manager.cleanup()
    except Exception:
        log.exception("runtime_cleanup_startup_failed")

    async def _runtime_cleanup_loop():
        settings = get_settings()
        interval = max(15, int(settings.studio_runtime_cleanup_interval_seconds))
        while True:
            await asyncio.sleep(interval)
            try:
                await cleanup_manager.cleanup()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("runtime_cleanup_tick_failed")

    cleanup_task = asyncio.create_task(_runtime_cleanup_loop(), name="studio-runtime-cleanup")
    
    yield
    
    # Cleanup on shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    except Exception:
        log.exception("runtime_cleanup_shutdown_failed")
    print("🛑 Shutting down DocuVerse services...")


def create_app() -> FastAPI:
    """Factory function to create FastAPI application"""
    settings = get_settings()
    
    app = FastAPI(
        title="DocuVerse API",
        description="Generative Media Documentation Engine - Transform codebases into interactive walkthroughs",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    
    # CORS Configuration
    # SECURITY: never use .* in origin_regex with allow_credentials=True.
    # An attacker who deploys anything to *.netlify.app can issue authenticated
    # requests from a victim's browser. We allow only exact registered domains.
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    if settings.frontend_url:
        _fu = str(settings.frontend_url).strip().rstrip("/")
        if _fu:
            allowed_origins.append(_fu)

    # Additional trusted origins can be appended at deploy time via env var.
    # Format: comma-separated exact origin strings, e.g.:
    #   EXTRA_CORS_ORIGINS=https://app.logorhythms.in,https://staging.logorhythms.in
    extra_origins = os.getenv("EXTRA_CORS_ORIGINS", "")
    if extra_origins:
        allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

    # Regex for Netlify deploy-preview URLs. Scoped to a specific site slug —
    # replace NETLIFY_SITE_SLUG with your actual Netlify site name.
    netlify_slug = os.getenv("NETLIFY_SITE_SLUG", "").strip()
    if netlify_slug:
        prod_netlify_origin = f"https://{netlify_slug}.netlify.app".rstrip("/")
        if prod_netlify_origin not in allowed_origins:
            allowed_origins.append(prod_netlify_origin)
    origin_regex = (
        rf"https://deploy-preview-\d+--{re.escape(netlify_slug)}\.netlify\.app"
        if netlify_slug
        else None
    )

    middleware_kwargs: dict = {
        "allow_origins": [o for o in allowed_origins if o],
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        "allow_headers": ["*"],
        "expose_headers": ["*"],
    }
    if origin_regex:
        middleware_kwargs["allow_origin_regex"] = origin_regex

    log.info(
        "cors_configured",
        allow_credentials=middleware_kwargs.get("allow_credentials"),
        allow_origins=middleware_kwargs.get("allow_origins"),
        allow_origin_regex=middleware_kwargs.get("allow_origin_regex"),
    )

    # Middleware runs in reverse registration order. CORSMiddleware MUST be
    # registered last so it is the outermost layer and handles OPTIONS
    # preflight before BaseHTTPMiddleware inner layers (avoids missing
    # Access-Control-Allow-Origin on preflight).
    app.add_middleware(TraceMiddleware)
    app.add_middleware(IdempotencyMiddleware)
    app.add_middleware(CORSMiddleware, **middleware_kwargs)

    # Include API routes
    app.include_router(api_router, prefix="/api")

    # Global exception handler — structured JSON with error code.
    @app.exception_handler(Exception)
    async def _unhandled_exception_handler(request: Request, exc: Exception):
        log.exception(
            "unhandled_error",
            method=request.method,
            path=request.url.path,
            exc_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content=_error_body(
                ErrorCode.INTERNAL_ERROR,
                f"Internal server error: {type(exc).__name__}",
            ),
        )
    
    @app.get("/")
    async def root():
        """Root endpoint with API information"""
        return {
            "service": "DocuVerse API",
            "version": "1.0.0",
            "status": "running",
            "docs": "/api/docs",
            "redoc": "/api/redoc",
            "health": "/health"
        }
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint"""
        return {
            "status": "healthy",
            "service": "DocuVerse API",
            "version": "1.0.0"
        }
    
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    from pathlib import Path as _Path

    settings = get_settings()
    reload_extra = {}
    if settings.debug:
        # Watch only ``backend/app``. Studio runs ``npm install`` under
        # ``repos/`` and ``workspace/`` — full-tree reload would restart
        # uvicorn mid-install and strand preview launches.
        reload_extra["reload_dirs"] = [str(_Path(__file__).resolve().parent)]

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        **reload_extra,
    )
