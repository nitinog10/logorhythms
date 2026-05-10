"""
End-to-end HTTP integration: Studio imported session → bootstrap → launch preview → proxy.

Uses ``create_app()`` (real routes, real ``preview_runner``, real ``detect_bootstrap_plan``).
Needs one-time network for ``pip install`` into a new ``.venv``.

Disable with ``PYTEST_SKIP_STUDIO_HTTP_INTEGRATION=1`` (offline CI).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


SKIP_STUDIO_HTTP = os.getenv(
    "PYTEST_SKIP_STUDIO_HTTP_INTEGRATION", ""
).strip().lower() in ("1", "true", "yes")


def _write_fastapi_workspace(repo_root: Path) -> None:
    repo_root.mkdir(parents=True, exist_ok=True)
    (repo_root / "requirements.txt").write_text(
        "fastapi>=0.104\nuvicorn[standard]>=0.23\n",
        encoding="utf-8",
    )
    (repo_root / "main.py").write_text(
        """
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse

app = FastAPI(title="studio-integration")

@app.get("/")
async def root():
    return PlainTextResponse("studio-e2e-marker")
""".strip(),
        encoding="utf-8",
    )


@pytest.fixture()
def isolated_studio_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import app.services.studio_session_service as sss

    work = (tmp_path / "studio_integration_root").resolve()
    work.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(sss, "_workspace_root", lambda: work)
    monkeypatch.setattr(sss, "_try_dynamo", lambda: False)
    sss._sessions_cache.clear()
    yield work


@pytest.fixture()
def integration_users_and_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, isolated_studio_env):
    from datetime import timezone
    from datetime import datetime as _dt

    from app.models.schemas import Repository, User
    from app.api.endpoints import repositories as repos_mod

    uid = "integration_studio_uid"
    repo_id = "integration_studio_repo"
    repo_path = tmp_path / "cloned_repo"
    _write_fastapi_workspace(repo_path)

    u = User(
        id=uid,
        github_id=9000123,
        username="studio_integration",
        email="studio-it@localhost",
        access_token="",
        subscription_tier="free",
        created_at=_dt.now(timezone.utc),
    )

    r = Repository(
        id=repo_id,
        user_id=uid,
        github_repo_id=42424242,
        name="studio-it",
        full_name="fixture/studio-it",
        clone_url="https://github.com/fixture/studio-it.git",
        local_path=str(repo_path.resolve()),
        source="github",
        created_at=_dt.now(timezone.utc),
    )
    monkeypatch.setitem(repos_mod.repositories_db, repo_id, r)

    from app.api.endpoints.auth import create_access_token

    token = create_access_token(
        {
            "user_id": uid,
            "user_data": {
                "github_id": u.github_id,
                "username": u.username,
                "email": u.email or "",
                "avatar_url": "",
                "access_token": "",
                "subscription_tier": u.subscription_tier,
            },
        }
    )
    headers = {"Authorization": f"Bearer {token}"}
    return {"user": u, "repo_id": repo_id, "headers": headers, "repo_path": repo_path}


@pytest.fixture()
def full_client(integration_users_and_repo, isolated_studio_env):
    from starlette.testclient import TestClient
    from app.main import create_app

    with TestClient(create_app(), raise_server_exceptions=True) as client:
        yield client


@pytest.mark.skipif(SKIP_STUDIO_HTTP, reason="PYTEST_SKIP_STUDIO_HTTP_INTEGRATION set")
def test_studio_imported_bootstrap_launch_proxy_chain(
    full_client,
    integration_users_and_repo,
    monkeypatch: pytest.MonkeyPatch,
):
    """Full chain: create session → bootstrap → launch → proxy GET returns app body."""

    monkeypatch.setattr(
        "app.api.endpoints.studio.get_settings",
        lambda: SimpleNamespace(
            studio_preview_proxy_enabled=True,
            studio_preview_docker_install=False,
            public_api_base_url="",
        ),
    )

    rid = integration_users_and_repo["repo_id"]
    h = integration_users_and_repo["headers"]

    cre = full_client.post(
        "/api/studio/sessions",
        json={"kind": "imported", "source_id": rid},
        headers=h,
    )
    assert cre.status_code == 200, cre.text
    session_id = cre.json()["id"]

    bs = full_client.post(
        f"/api/studio/sessions/{session_id}/bootstrap",
        headers=h,
    )
    assert bs.status_code == 200, bs.text
    sess = bs.json()
    assert "bootstrap" in sess and sess["bootstrap"].get("framework") == "fastapi", sess

    launch = full_client.post(
        f"/api/studio/sessions/{session_id}/launch",
        headers=h,
    )
    assert launch.status_code == 200, launch.text
    launch_body = launch.json()
    assert launch_body.get("status") == "running", launch_body

    st = full_client.get(
        f"/api/studio/sessions/{session_id}/preview-status",
        headers=h,
    )
    assert st.status_code == 200
    assert st.json().get("status") == "running"

    url = launch_body.get("url") or ""
    proxy_path = (
        url.replace("http://testserver", "")
        if "testserver" in url
        else f"/api/studio/sessions/{session_id}/preview/"
    )

    pv = full_client.get(proxy_path, headers=h)
    assert pv.status_code == 200, pv.text
    assert "studio-e2e-marker" in pv.text

    stop = full_client.post(
        f"/api/studio/sessions/{session_id}/stop",
        headers=h,
    )
    assert stop.status_code == 200
