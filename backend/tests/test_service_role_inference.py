"""Service-role / preview-surface scoring heuristics."""

from app.runtime_intel import service_role_inference as sri


def test_split_mode_deprioritizes_studio_backend_internal_port():
    fp = {"ok": True, "status": 200, "html_like": True, "server": "nginx"}
    pri, role = sri.preview_surface_priority_score(
        8787,
        fp,
        framework="vite",
        topology_analysis={"topology_kind": "hybrid_frontend_backend"},
        primary_listen=3000,
        split_preview_mode=True,
    )
    pri_fe, _ = sri.preview_surface_priority_score(
        5173,
        fp,
        framework="vite",
        topology_analysis={"topology_kind": "hybrid_frontend_backend"},
        primary_listen=3000,
        split_preview_mode=True,
    )
    assert pri < pri_fe
    assert role == sri.SERVICE_ROLE_API


def test_uvicorn_like_server_classed_api():
    fp = {
        "ok": True,
        "status": 200,
        "json_like": True,
        "html_like": False,
        "server": "uvicorn",
    }
    _, role = sri.preview_surface_priority_score(
        8000,
        fp,
        framework="vite",
        topology_analysis={"topology_kind": "hybrid_frontend_backend"},
        primary_listen=3000,
        split_preview_mode=False,
    )
    assert role == sri.SERVICE_ROLE_API


def test_html_snippet_classed_frontend():
    fp = {
        "ok": True,
        "status": 200,
        "html_like": True,
        "json_like": False,
        "server": "",
        "vite_hmr_hint": True,
    }
    _, role = sri.preview_surface_priority_score(
        5173,
        fp,
        framework="vite",
        topology_analysis={"topology_kind": "hybrid_frontend_backend"},
        primary_listen=5173,
        split_preview_mode=False,
    )
    assert role == sri.SERVICE_ROLE_FRONTEND
