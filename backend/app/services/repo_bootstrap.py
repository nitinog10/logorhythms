"""
DocuVerse Studio — Universal Repo Bootstrap Engine

Given a cloned repository on disk, deterministically detect:
  - the framework (Next.js / Vite / Remix / Nuxt / SvelteKit / Astro /
    Express-like Node server / FastAPI / Django / Flask / Go (+ Air) /
    static / unknown)
  - the package manager (pnpm / yarn / npm / bun / poetry / pipenv / pdm / pip)
  - the monorepo tool (turbo / pnpm-workspace / nx / lerna / rush / yarn / npm)
  - the right app entry point inside the monorepo
  - the install / dev / build / test commands
  - environment keys required to boot
  - shallow vs deeper-clone recommendation

This module is pure-Python and side-effect free: it does *not* spawn
subprocesses; the actual install/launch is handled separately by
``preview_runner.py`` / future ``sandbox_manager.py``. (It uses
``subprocess.list2cmdline`` only to build quoted shell commands.)
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data contracts
# ---------------------------------------------------------------------------

@dataclass
class DetectionEvidence:
    rule: str
    detail: str
    weight: float = 1.0


@dataclass
class BootstrapPlan:
    """Result of bootstrap detection.

    Mirrors the contract documented in the Studio architecture plan.
    """

    framework: str  # nextjs|vite|...|fastapi|django|flask|go|static|unknown
    framework_variant: Optional[str] = None  # e.g. "vite-react", "vite-vue"
    framework_version: Optional[str] = None
    runtime: str = "unknown"  # node20 | node18 | python3.11 | go | bun | unknown
    package_manager: str = "npm"  # npm | yarn | pnpm | bun | poetry | pipenv | pdm | pip
    monorepo_tool: Optional[str] = None  # turbo | pnpm | nx | lerna | rush | yarn | npm | None
    app_root_rel: str = "."
    install_cmd: str = ""
    dev_cmd: str = ""
    build_cmd: str = ""
    test_cmd: str = ""
    env_keys_required: List[str] = field(default_factory=list)
    env_keys_optional: List[str] = field(default_factory=list)
    env_keys_unused: List[str] = field(default_factory=list)
    ports_hint: Optional[int] = None
    healthcheck_path: str = "/"
    detection_evidence: List[DetectionEvidence] = field(default_factory=list)
    confidence: float = 0.0
    candidate_apps: List[str] = field(default_factory=list)  # populated for monorepos
    notes: List[str] = field(default_factory=list)
    # Parallel dev processes — each dict supports:
    #   cmd (str), cwd_rel (str, default "."), port_env (str, default PORT),
    #   primary (bool, exactly one True = iframe targets this process URL)
    preview_processes: List[Dict[str, object]] = field(default_factory=list)
    # None = derive in preview_runner from framework (SPA uses direct port; API uses proxy)
    preview_use_proxy: Optional[bool] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["detection_evidence"] = [asdict(e) for e in self.detection_evidence]
        return d


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_text(path: Path, max_bytes: int = 256 * 1024) -> Optional[str]:
    try:
        if not path.is_file():
            return None
        size = path.stat().st_size
        if size > max_bytes:
            with path.open("rb") as f:
                data = f.read(max_bytes)
            return data.decode("utf-8", errors="replace")
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        logger.debug(f"_read_text failed for {path}: {e}")
        return None


def _read_json(path: Path) -> Optional[dict]:
    txt = _read_text(path)
    if not txt:
        return None
    try:
        return json.loads(txt)
    except Exception:
        return None


def _exists(root: Path, *names: str) -> bool:
    return any((root / n).exists() for n in names)


def _glob_first(root: Path, *patterns: str) -> Optional[Path]:
    for pat in patterns:
        for p in root.glob(pat):
            return p
    return None


# ---------------------------------------------------------------------------
# Python dependency detection (strict — avoids README false positives)
# ---------------------------------------------------------------------------

def _declares_pypi_package(requirements_text: str, pyproject_text: str, package_name: str) -> bool:
    """True when requirements / pyproject *declares* the package.

    Loose ``name in blob`` catches prose and mis-boots Flask repos with
    DocuVerse-style ``uvicorn … --reload-dir app`` when ``app/`` does not exist.
    """
    pkg = package_name.strip().lower()
    if not pkg:
        return False

    for block in (requirements_text or "", pyproject_text or ""):
        for raw in block.splitlines():
            s = raw.split("#", 1)[0].strip()
            if not s:
                continue
            s = s.strip(",").strip('"').strip("'").strip()
            if not s:
                continue
            tok = re.split(r"[\s<>=!~\[]", s, maxsplit=1)[0].strip().lower()
            if tok == pkg:
                return True
            if s.lower().startswith(pkg + "["):
                return True
    return False


def _infer_uvicorn_target(app_root: Path) -> str:
    """Guess ``module:attr`` for ``uvicorn`` (FastAPI / Starlette conventions)."""
    if (app_root / "app" / "main.py").is_file():
        return "app.main:app"
    if (app_root / "api" / "main.py").is_file():
        return "api.main:app"
    if (app_root / "src" / "main.py").is_file():
        return "src.main:app"
    if (app_root / "main.py").is_file():
        return "main:app"
    return "main:app"


# ---------------------------------------------------------------------------
# Package manager detection
# ---------------------------------------------------------------------------

def _detect_package_manager(root: Path, pkg: Optional[dict]) -> Tuple[str, List[DetectionEvidence]]:
    ev: List[DetectionEvidence] = []

    # 1. Lockfiles (highest signal)
    lockfile_map = [
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
        ("bun.lockb", "bun"),
    ]
    for lock, mgr in lockfile_map:
        if (root / lock).exists():
            ev.append(DetectionEvidence("lockfile", lock, 1.0))
            return mgr, ev

    # 2. packageManager field in package.json (Corepack)
    if pkg and isinstance(pkg.get("packageManager"), str):
        spec = pkg["packageManager"]
        for mgr in ("pnpm", "yarn", "npm", "bun"):
            if spec.startswith(mgr):
                ev.append(DetectionEvidence("packageManager-field", spec, 0.9))
                return mgr, ev

    # 3. Heuristic fallback
    ev.append(DetectionEvidence("default", "no lockfile, defaulting to npm", 0.3))
    return "npm", ev


# ---------------------------------------------------------------------------
# Monorepo detection
# ---------------------------------------------------------------------------

_WEB_FRAMEWORK_DEPS = {
    "next", "vite", "remix", "@remix-run/dev", "nuxt", "@sveltejs/kit",
    "astro", "expo", "@angular/core", "@vue/cli-service",
}


def _is_app_candidate(pkg: dict) -> bool:
    """Does this package look like a runnable web app (vs. library)?"""
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    if any(d in deps for d in _WEB_FRAMEWORK_DEPS):
        return True
    scripts = pkg.get("scripts", {})
    return any(s in scripts for s in ("dev", "start"))


def _score_app_candidate(pkg_path: Path, pkg: dict) -> float:
    """Heuristic scoring for monorepo app picking."""
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    scripts = pkg.get("scripts", {})
    score = 0.0

    # Web framework deps
    if any(d in deps for d in _WEB_FRAMEWORK_DEPS):
        score += 3.0

    # Has a runnable dev script
    if "dev" in scripts:
        score += 2.0
    elif "start" in scripts:
        score += 1.5

    # Looks like an app by name
    name = (pkg.get("name") or "").lower()
    if any(tok in name for tok in ("/web", "/app", "/frontend", "/client", "/site",
                                     "-web", "-app", "-frontend", "-client", "-site")):
        score += 1.0

    # Located under apps/ or packages/web etc.
    rel = str(pkg_path.parent).lower().replace("\\", "/")
    if "/apps/" in f"/{rel}/":
        score += 1.5
    elif "/packages/" in f"/{rel}/":
        score += 0.5

    # Penalize obvious libs
    if pkg.get("private") is False and "main" in pkg and "dev" not in scripts:
        score -= 1.5

    return score


def _detect_monorepo(root: Path, root_pkg: Optional[dict]) -> Tuple[Optional[str], List[Path], List[DetectionEvidence]]:
    """Detect monorepo tool and return list of app-candidate package.json paths."""
    ev: List[DetectionEvidence] = []
    tool: Optional[str] = None

    if (root / "turbo.json").exists():
        tool = "turbo"
        ev.append(DetectionEvidence("monorepo", "turbo.json present", 1.0))
    elif (root / "pnpm-workspace.yaml").exists():
        tool = "pnpm"
        ev.append(DetectionEvidence("monorepo", "pnpm-workspace.yaml present", 1.0))
    elif (root / "nx.json").exists():
        tool = "nx"
        ev.append(DetectionEvidence("monorepo", "nx.json present", 1.0))
    elif (root / "lerna.json").exists():
        tool = "lerna"
        ev.append(DetectionEvidence("monorepo", "lerna.json present", 1.0))
    elif (root / "rush.json").exists():
        tool = "rush"
        ev.append(DetectionEvidence("monorepo", "rush.json present", 1.0))
    elif root_pkg and "workspaces" in root_pkg:
        tool = "yarn"  # also covers npm 7+ workspaces
        ev.append(DetectionEvidence("monorepo", "package.json:workspaces", 0.9))

    if not tool:
        return None, [], ev

    # Find candidate package.json files (capped depth and count for safety)
    candidates: List[Path] = []
    common_dirs = ["apps", "packages", "services", "websites", "examples"]
    for d in common_dirs:
        sub = root / d
        if not sub.is_dir():
            continue
        for pj in sub.glob("*/package.json"):
            candidates.append(pj)
            if len(candidates) >= 50:
                break
        if len(candidates) >= 50:
            break

    # Fall back to a wider but bounded search
    if not candidates:
        for pj in root.rglob("package.json"):
            # Skip nested node_modules and root itself
            parts = set(pj.parts)
            if "node_modules" in parts or pj.parent == root:
                continue
            candidates.append(pj)
            if len(candidates) >= 50:
                break

    return tool, candidates, ev


# ---------------------------------------------------------------------------
# Framework detection (per app root)
# ---------------------------------------------------------------------------

def _detect_framework(app_root: Path, pkg: Optional[dict]) -> Tuple[str, Optional[str], Optional[str], List[DetectionEvidence]]:
    """Return (framework, variant, version, evidence)."""
    ev: List[DetectionEvidence] = []
    deps: Dict[str, str] = {}
    if pkg:
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

    def has_file(*names: str) -> Optional[str]:
        for n in names:
            if (app_root / n).exists():
                return n
        return None

    # Next.js
    cfg = has_file("next.config.js", "next.config.mjs", "next.config.ts")
    if cfg or "next" in deps:
        ev.append(DetectionEvidence("framework", f"next ({cfg or 'dep'})", 1.0))
        return "nextjs", None, deps.get("next"), ev

    # Remix
    cfg = has_file("remix.config.js", "remix.config.ts")
    if cfg or any(d.startswith("@remix-run/") for d in deps):
        ev.append(DetectionEvidence("framework", f"remix ({cfg or 'dep'})", 1.0))
        return "remix", None, deps.get("@remix-run/dev"), ev

    # Nuxt
    cfg = has_file("nuxt.config.js", "nuxt.config.ts", "nuxt.config.mjs")
    if cfg or "nuxt" in deps or "nuxt3" in deps:
        ev.append(DetectionEvidence("framework", f"nuxt ({cfg or 'dep'})", 1.0))
        return "nuxt", None, deps.get("nuxt") or deps.get("nuxt3"), ev

    # SvelteKit
    if has_file("svelte.config.js", "svelte.config.ts") and "@sveltejs/kit" in deps:
        ev.append(DetectionEvidence("framework", "sveltekit", 1.0))
        return "sveltekit", None, deps.get("@sveltejs/kit"), ev

    # Astro
    cfg = has_file("astro.config.mjs", "astro.config.ts", "astro.config.js")
    if cfg or "astro" in deps:
        ev.append(DetectionEvidence("framework", f"astro ({cfg or 'dep'})", 1.0))
        return "astro", None, deps.get("astro"), ev

    # Vite (with variant detection)
    cfg = has_file("vite.config.js", "vite.config.ts", "vite.config.mjs")
    if cfg or "vite" in deps:
        variant = "vite-vanilla"
        if "react" in deps or "@vitejs/plugin-react" in deps or "@vitejs/plugin-react-swc" in deps:
            variant = "vite-react"
        elif "vue" in deps or "@vitejs/plugin-vue" in deps:
            variant = "vite-vue"
        elif "svelte" in deps or "@sveltejs/vite-plugin-svelte" in deps:
            variant = "vite-svelte"
        elif "solid-js" in deps or "vite-plugin-solid" in deps:
            variant = "vite-solid"
        ev.append(DetectionEvidence("framework", f"vite -> {variant}", 1.0))
        return "vite", variant, deps.get("vite"), ev

    # Plain Node server (express/fastify/koa/hapi/nest)
    server_libs = {"express", "fastify", "koa", "@nestjs/core", "hapi", "@hapi/hapi"}
    if any(d in deps for d in server_libs):
        present = [d for d in server_libs if d in deps]
        ev.append(DetectionEvidence("framework", f"node-server ({present[0]})", 0.9))
        return "node-server", present[0], deps.get(present[0]), ev

    # Python web — use declared deps (not arbitrary ``in blob`` mention)
    pyproject = _read_text(app_root / "pyproject.toml") or ""
    requirements = _read_text(app_root / "requirements.txt") or ""
    py_blob = (pyproject + "\n" + requirements).lower()

    if (app_root / "manage.py").exists() or _declares_pypi_package(
        requirements, pyproject, "django"
    ):
        ev.append(
            DetectionEvidence(
                "framework",
                "django (manage.py or django dependency)",
                1.0,
            )
        )
        return "django", None, None, ev

    has_flask = _declares_pypi_package(requirements, pyproject, "flask")
    has_fastapi = _declares_pypi_package(requirements, pyproject, "fastapi")
    if has_flask and not has_fastapi:
        ev.append(DetectionEvidence("framework", "flask (deps)", 0.95))
        return "flask", None, None, ev
    if has_fastapi:
        ev.append(DetectionEvidence("framework", "fastapi (deps)", 1.0))
        return "fastapi", None, None, ev
    if has_flask:
        ev.append(DetectionEvidence("framework", "flask (deps)", 0.9))
        return "flask", None, None, ev

    # Legacy heuristics only when no explicit requirement line matched
    if "fastapi" in py_blob:
        ev.append(
            DetectionEvidence("framework", "fastapi (legacy loose match)", 0.5)
        )
        return "fastapi", None, None, ev
    if "django" in py_blob and "django-" in py_blob or re.search(
        r"^django(==|>=|<=|~=|\b)", py_blob, re.M
    ):
        ev.append(
            DetectionEvidence("framework", "django (legacy loose match)", 0.5)
        )
        return "django", None, None, ev
    if "flask" in py_blob:
        ev.append(
            DetectionEvidence("framework", "flask (legacy loose match)", 0.5)
        )
        return "flask", None, None, ev

    # Go API services (Fiber/Gin/Echo/Chi/stdlib); Air.toml selects live reload.
    if (app_root / "go.mod").is_file():
        uses_air = (app_root / ".air.toml").is_file() or (app_root / "air.toml").is_file()
        variant = "air" if uses_air else "native"
        ev.append(DetectionEvidence("framework", f"go ({variant})", 1.0))
        return "go", variant, None, ev

    # Static / unknown
    if (app_root / "index.html").exists() and not pkg:
        ev.append(DetectionEvidence("framework", "static index.html", 0.6))
        return "static", None, None, ev

    ev.append(DetectionEvidence("framework", "no fingerprint matched", 0.0))
    return "unknown", None, None, ev


# ---------------------------------------------------------------------------
# Command derivation
# ---------------------------------------------------------------------------

def _derive_node_cmds(pkg: Optional[dict], pm: str) -> Tuple[str, str, str, str]:
    scripts = (pkg or {}).get("scripts", {}) or {}

    # Lenient install commands by default — preview launches must succeed
    # even when the lockfile is slightly out of sync with package.json.
    # Strict variants (`npm ci`, `--frozen-lockfile`) are saved for
    # reproducible CI builds, not interactive previews.
    # Yarn 2+ removed `--ignore-engines` (YN0050); use plain `yarn install`.
    install = {
        "pnpm": "pnpm install --no-frozen-lockfile",
        "yarn": "yarn install",
        "bun": "bun install",
        "npm": "npm install --no-audit --no-fund",
    }.get(pm, "npm install --no-audit --no-fund")

    runner = {"pnpm": "pnpm", "yarn": "yarn", "bun": "bun", "npm": "npm run"}.get(pm, "npm run")

    def script_or(default: str, *keys: str) -> str:
        for k in keys:
            if k in scripts:
                return f"{runner} {k}" if pm in ("pnpm", "yarn", "bun") else f"{runner} {k}"
        return default

    dev = script_or("npm run dev", "dev", "start")
    build = script_or("npm run build", "build")
    test = script_or("npm test", "test", "test:unit")
    return install, dev, build, test


def _pip_install_pep621_dependencies_cmd(app_root: Path) -> str:
    """Return a pip command that installs only ``[project].dependencies``.

    Installing the project tree with ``pip install .`` often fails on
    application repos that use a *flat layout* with multiple top-level
    Python packages (e.g. ``app/`` + ``main.py``): setuptools refuses
    ambiguous discovery. Declared deps install fine without building the
    local package as a wheel.
    """
    path = app_root / "pyproject.toml"
    if not path.is_file():
        return ""
    if sys.version_info < (3, 11):
        return ""
    try:
        import tomllib
    except ImportError:
        return ""
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
    except Exception:
        return ""
    project = data.get("project") or {}
    raw = project.get("dependencies")
    if not isinstance(raw, list):
        return ""
    deps = [str(d).strip() for d in raw if str(d).strip()]
    if not deps:
        return ""
    try:
        return subprocess.list2cmdline(["python", "-m", "pip", "install", *deps])
    except Exception:
        return ""


def _derive_python_cmds(
    app_root: Path,
    pkg_mgr: str,
    framework: str,
) -> Tuple[str, str, str, str]:
    if pkg_mgr in ("poetry", "pipenv", "pdm"):
        install = {
            "poetry": "poetry install --no-root",
            "pipenv": "pipenv install --deploy",
            "pdm": "pdm install --no-self",
        }[pkg_mgr]
    else:
        # Plain pip: only use -r requirements.txt when that file exists.
        # Many repos ship pyproject.toml / setup.py only; `pip install -r`
        # would fail with errno 2 and surface as a useless preview error.
        if (app_root / "requirements.txt").exists():
            install = "pip install -r requirements.txt"
        else:
            pep621 = _pip_install_pep621_dependencies_cmd(app_root)
            if pep621:
                install = pep621
            elif (app_root / "pyproject.toml").exists() or (app_root / "setup.py").exists():
                install = "python -m pip install ."
            elif (app_root / "setup.cfg").exists():
                install = "python -m pip install ."
            else:
                install = ""

    if framework == "django":
        if (app_root / "manage.py").exists():
            dev = "python manage.py runserver 0.0.0.0:8000"
        elif (app_root / "wsgi.py").exists() or (app_root / "asgi.py").exists():
            dev = "gunicorn wsgi:application --bind 0.0.0.0:8000"
        else:
            dev = "python manage.py runserver 0.0.0.0:8000"
    elif framework == "flask":
        # ``--app`` resolves the module/file; never use DocuVerse's ``uvicorn app.main:app``
        if (app_root / "wsgi.py").is_file():
            dev = "python -m flask --app wsgi:app run --debug"
        elif (app_root / "application.py").is_file():
            dev = "python -m flask --app application:app run --debug"
        elif (app_root / "app.py").is_file():
            dev = "python -m flask --app app run --debug"
        else:
            dev = "python -m flask run --debug"
    elif framework == "fastapi":
        target = _infer_uvicorn_target(app_root)
        dev = f"uvicorn {target} --reload --host 0.0.0.0"
    else:
        target = _infer_uvicorn_target(app_root)
        dev = f"uvicorn {target} --reload --host 0.0.0.0"

    build = ""
    test = "pytest -q"
    return install, dev, build, test


def _python_pkg_manager(app_root: Path) -> str:
    if (app_root / "poetry.lock").exists():
        return "poetry"
    if (app_root / "Pipfile.lock").exists():
        return "pipenv"
    if (app_root / "pdm.lock").exists():
        return "pdm"
    return "pip"


# ---------------------------------------------------------------------------
# Env detection (generalised from builder.py:detect_env_vars)
# ---------------------------------------------------------------------------

_ENV_PATTERNS = [
    re.compile(r"process\.env\.([A-Z_][A-Z0-9_]*)"),
    re.compile(r"import\.meta\.env\.([A-Z_][A-Z0-9_]*)"),
    re.compile(r'env\(\s*["\']([A-Z_][A-Z0-9_]*)["\']\s*\)'),
    re.compile(r"os\.environ\[\s*['\"]([A-Z_][A-Z0-9_]*)['\"]\s*\]"),
    re.compile(r"os\.getenv\(\s*['\"]([A-Z_][A-Z0-9_]*)['\"]"),
]

_ENV_FILE_NAMES = (".env.example", ".env.template", ".env.sample",
                   ".env.local.example", ".env.production.example")

_SECRET_LOOKALIKE_RE = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY)$")

# Code file extensions to scan (bounded — bootstrap must stay fast)
_SCAN_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
              ".py", ".vue", ".svelte", ".astro", ".prisma", ".env"}


def _scan_env_keys(app_root: Path, max_files: int = 800) -> Tuple[set, set]:
    """Return (keys_referenced_in_code, keys_documented_in_example)."""
    referenced: set = set()
    documented: set = set()

    # Documented from .env.example / template
    for name in _ENV_FILE_NAMES:
        txt = _read_text(app_root / name)
        if not txt:
            continue
        for line in txt.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"([A-Z_][A-Z0-9_]*)\s*=", line)
            if m:
                documented.add(m.group(1))

    # Referenced in code
    seen = 0
    for path in app_root.rglob("*"):
        if seen >= max_files:
            break
        if not path.is_file():
            continue
        # Skip heavy / vendor dirs
        parts = set(path.parts)
        if parts & {"node_modules", ".git", "dist", "build", ".next",
                    ".nuxt", ".turbo", "venv", ".venv", "__pycache__"}:
            continue
        if path.suffix not in _SCAN_EXTS and path.name not in (".env",):
            continue
        seen += 1
        txt = _read_text(path, max_bytes=128 * 1024)
        if not txt:
            continue
        for pat in _ENV_PATTERNS:
            for m in pat.finditer(txt):
                referenced.add(m.group(1))

    return referenced, documented


def _classify_env_keys(referenced: set, documented: set) -> Tuple[List[str], List[str], List[str]]:
    """Bucket env keys into required / optional / unused-but-documented."""
    required: List[str] = []
    optional: List[str] = []
    unused: List[str] = []

    used = referenced
    for key in sorted(used):
        if _SECRET_LOOKALIKE_RE.search(key) and key in documented:
            required.append(key)
        elif key in documented:
            required.append(key)
        else:
            optional.append(key)

    for key in sorted(documented - used):
        unused.append(key)

    return required, optional, unused


def _infer_go_run_cmd(app_root: Path) -> str:
    """Best-effort ``go run …`` target inside a Go module directory."""
    root = Path(app_root)
    cmd_root = root / "cmd"
    if cmd_root.is_dir():
        # Prefer conventional entrypoint names seen in SaaS repos.
        for prefer in ("server", "api", "svc", "app", "main"):
            mp = cmd_root / prefer / "main.go"
            if mp.is_file():
                return f"go run ./cmd/{prefer}"
        dirs = sorted(
            [p for p in cmd_root.iterdir() if p.is_dir() and (p / "main.go").is_file()],
            key=lambda p: p.name,
        )
        if dirs:
            return f"go run ./cmd/{dirs[0].name}"
    if (root / "main.go").is_file():
        return "go run ."
    mains = sorted(
        (p for p in root.rglob("main.go") if "vendor" not in set(p.parts)),
        key=lambda p: (len(p.relative_to(root).parts), str(p)),
    )
    if mains:
        inner = mains[0].parent
        try:
            rel = inner.relative_to(root).as_posix()
            if rel in (".", ""):
                return "go run ."
            return f"go run ./{rel}"
        except ValueError:
            pass
    return "go run ."


def _derive_go_cmds(app_root: Path, *, use_air: bool) -> Tuple[str, str, str, str]:
    """Install/dev/build/test commands for ``go.mod`` workspaces."""
    install = "go mod download"
    run_cmd = _infer_go_run_cmd(app_root)
    dev = "air" if use_air else run_cmd
    build = "go build ./..."
    test = "go test ./..."
    return install, dev, build, test


def _infer_backend_py_framework(backend_root: Path) -> str:
    req_txt = _read_text(backend_root / "requirements.txt") or ""
    ppt_txt = _read_text(backend_root / "pyproject.toml") or ""
    if _declares_pypi_package(req_txt, ppt_txt, "django"):
        return "django"
    if _declares_pypi_package(req_txt, ppt_txt, "flask"):
        return "flask"
    if _declares_pypi_package(req_txt, ppt_txt, "fastapi") or _declares_pypi_package(
        req_txt, ppt_txt, "uvicorn"
    ):
        return "fastapi"
    blob = (req_txt + ppt_txt).lower()
    if "django" in blob:
        return "django"
    if "flask" in blob:
        return "flask"
    return "fastapi"


class ClassicSplitPreviewSpec(NamedTuple):
    """Sibling ``backend/`` + ``frontend`` (or similar) layout for multi-process Studio preview."""

    backend_rel: str
    frontend_rel: str
    py_backend: bool
    go_use_air: bool
    preview_processes: List[Dict[str, object]]


def discover_classic_frontend_backend_split(
    repo_root: str | os.PathLike[str],
) -> Optional[ClassicSplitPreviewSpec]:
    """
    Detect classic API + Node UI repo layouts (no side effects).

    Used by Docker launch planning when ``preview_processes`` was not embedded in the plan.
    """
    root = Path(repo_root).resolve()
    pairs = (
        ("backend", "frontend"),
        ("backend", "web"),
        ("api", "web"),
        ("server", "client"),
    )
    for be_name, fe_name in pairs:
        be = root / be_name
        fe = root / fe_name
        if not be.is_dir() or not fe.is_dir():
            continue
        fe_pkg_json = fe / "package.json"
        if not fe_pkg_json.is_file():
            continue
        fe_pkg = _read_json(fe_pkg_json)
        if not fe_pkg or not _is_app_candidate(fe_pkg):
            continue

        py_backend = (
            (be / "requirements.txt").is_file()
            or (be / "pyproject.toml").is_file()
            or (be / "setup.py").is_file()
        )
        go_backend = (be / "go.mod").is_file()

        if not py_backend and not go_backend:
            continue

        fe_pm, _ = _detect_package_manager(fe, fe_pkg)
        _, f_dev, _, _ = _derive_node_cmds(fe_pkg, fe_pm)

        go_use_air = False
        if py_backend:
            py_fw = _infer_backend_py_framework(be)
            py_pm = _python_pkg_manager(be)
            _, b_dev, _, _ = _derive_python_cmds(be, py_pm, py_fw)
        else:
            go_use_air = (be / ".air.toml").is_file() or (be / "air.toml").is_file()
            _, b_dev, _, _ = _derive_go_cmds(be, use_air=go_use_air)

        processes: List[Dict[str, object]] = [
            {
                "cmd": b_dev,
                "cwd_rel": be_name,
                "port_env": "PORT",
                "primary": False,
            },
            {
                "cmd": f_dev,
                "cwd_rel": fe_name,
                "port_env": "PORT",
                "primary": True,
            },
        ]
        return ClassicSplitPreviewSpec(
            backend_rel=be_name,
            frontend_rel=fe_name,
            py_backend=bool(py_backend),
            go_use_air=bool(go_use_air),
            preview_processes=processes,
        )
    return None


def synthesize_split_install_line(
    repo_root: str | os.PathLike[str],
    backend_rel: str,
    frontend_rel: str,
) -> str:
    """
    When the repo root has no workspace install (no turbo/pnpm-workspace at root),
    install dependencies in each split app directory inside the container.
    """
    root = Path(repo_root).resolve()
    be_rel = str(backend_rel or ".").replace("\\", "/").strip() or "."
    fe_rel = str(frontend_rel or ".").replace("\\", "/").strip() or "."

    def _mount(rel: str) -> str:
        return "/workspace" if rel == "." else f"/workspace/{rel}"

    be_path = root / be_rel if be_rel != "." else root
    fe_path = root / fe_rel if fe_rel != "." else root
    be_mount = _mount(be_rel)
    fe_mount = _mount(fe_rel)
    parts: List[str] = []

    py_be = (
        (be_path / "requirements.txt").is_file()
        or (be_path / "pyproject.toml").is_file()
        or (be_path / "setup.py").is_file()
        or (be_path / "setup.cfg").is_file()
    )
    go_be = (be_path / "go.mod").is_file()

    if py_be:
        py_pm = _python_pkg_manager(be_path)
        py_fw = _infer_backend_py_framework(be_path)
        pinst, _, _, _ = _derive_python_cmds(be_path, py_pm, py_fw)
        if (pinst or "").strip():
            parts.append(f"( cd {be_mount} && {pinst.strip()} )")
    elif go_be:
        parts.append(f"( cd {be_mount} && go mod download )")

    fe_pkg = _read_json(fe_path / "package.json")
    if isinstance(fe_pkg, dict) and fe_pkg:
        fe_pm, _ = _detect_package_manager(fe_path, fe_pkg)
        finst, _, _, _ = _derive_node_cmds(fe_pkg, fe_pm)
        if (finst or "").strip():
            parts.append(f"( cd {fe_mount} && {finst.strip()} )")

    return " && ".join(parts)


def _apply_split_frontend_backend_preview(repo_root: Path, plan: BootstrapPlan) -> None:
    """Detect classic ``backend/`` + ``frontend/`` repos and populate ``preview_processes``."""
    if plan.preview_processes:
        return
    spec = discover_classic_frontend_backend_split(repo_root)
    if spec is None:
        return
    be_name = spec.backend_rel
    fe_name = spec.frontend_rel
    py_backend = spec.py_backend
    plan.preview_processes = list(spec.preview_processes)
    plan.preview_use_proxy = False
    backend_kind = "API (Python)" if py_backend else "API (Go)"
    plan.notes.append(
        f"split preview: `{be_name}` ({backend_kind}) + `{fe_name}` (UI) detected — "
        "two dev processes will launch."
    )
    split_tag = "split-py-fe" if py_backend else "split-go-fe"
    plan.detection_evidence.append(
        DetectionEvidence(split_tag, f"{be_name}+{fe_name}", 0.85)
    )
    mono = repo_root / "pnpm-workspace.yaml"
    turbo = repo_root / "turbo.json"
    if mono.is_file() or turbo.is_file() or (repo_root / "pnpm-lock.yaml").is_file():
        if (repo_root / "pnpm-lock.yaml").is_file() or mono.is_file():
            plan.install_cmd = "pnpm install"
        elif (repo_root / "yarn.lock").is_file():
            plan.install_cmd = "yarn install"
        else:
            plan.install_cmd = "npm install"
    else:
        plan.install_cmd = ""
    if not str(plan.install_cmd or "").strip():
        syn = synthesize_split_install_line(repo_root, be_name, fe_name)
        if syn.strip():
            plan.install_cmd = syn
    plan.dev_cmd = str(plan.preview_processes[1].get("cmd") or "")
    if not py_backend and spec.go_use_air:
        plan.notes.append(
            "Go + Air detected for backend: install the `air` CLI on the "
            "DocuVerse backend host (`go install github.com/air-verse/air@latest`)."
        )

    fe = repo_root / fe_name
    fe_pkg = _read_json(fe / "package.json") or {}
    fw2, var2, ver2, ev2 = _detect_framework(fe, fe_pkg)
    plan.framework_variant = var2
    plan.framework_version = ver2
    plan.framework = fw2
    plan.detection_evidence.extend(ev2)
    fe_pm, _ = _detect_package_manager(fe, fe_pkg)
    plan.package_manager = fe_pm
    plan.app_root_rel = "."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_bootstrap_plan(repo_root: str | os.PathLike) -> BootstrapPlan:
    """Produce a deterministic ``BootstrapPlan`` for an on-disk repository.

    Always returns a plan; ``framework='unknown'`` and low confidence when
    no fingerprint matches.
    """
    root = Path(repo_root).resolve()
    plan = BootstrapPlan(framework="unknown")

    if not root.is_dir():
        plan.notes.append(f"path does not exist or is not a directory: {root}")
        return plan

    root_pkg = _read_json(root / "package.json")

    # --- Monorepo ---------------------------------------------------------
    monorepo_tool, candidates, mev = _detect_monorepo(root, root_pkg)
    plan.detection_evidence.extend(mev)
    plan.monorepo_tool = monorepo_tool

    app_root = root
    chosen_pkg = root_pkg

    if candidates:
        scored = []
        for pj in candidates:
            try:
                pjson = _read_json(pj)
                if not pjson or not _is_app_candidate(pjson):
                    continue
                scored.append((_score_app_candidate(pj, pjson), pj, pjson))
            except Exception:
                continue
        scored.sort(key=lambda t: t[0], reverse=True)
        plan.candidate_apps = [str(p[1].relative_to(root).parent).replace("\\", "/")
                                for p in scored[:8]]
        if scored:
            best_score, best_pj, best_pjson = scored[0]
            app_root = best_pj.parent
            chosen_pkg = best_pjson
            plan.detection_evidence.append(DetectionEvidence(
                "monorepo-pick",
                f"{plan.candidate_apps[0]} (score={best_score:.1f})",
                0.9,
            ))

    plan.app_root_rel = str(app_root.relative_to(root)).replace("\\", "/") or "."

    # --- Package manager --------------------------------------------------
    # Prefer lockfile in app_root; fall back to root for monorepos.
    pm, pmev = _detect_package_manager(app_root, chosen_pkg)
    if pm == "npm" and root != app_root:
        # Try root-level lockfile (common in monorepos)
        pm2, pmev2 = _detect_package_manager(root, root_pkg)
        if pmev2 and pmev2[0].rule == "lockfile":
            pm, pmev = pm2, pmev2
    plan.package_manager = pm
    plan.detection_evidence.extend(pmev)

    # --- Framework --------------------------------------------------------
    fw, variant, version, fwev = _detect_framework(app_root, chosen_pkg)
    plan.framework = fw
    plan.framework_variant = variant
    plan.framework_version = version
    plan.detection_evidence.extend(fwev)

    # --- Runtime ----------------------------------------------------------
    if fw in {"fastapi", "django", "flask"}:
        plan.runtime = "python3.11"
        py_pm = _python_pkg_manager(app_root)
        plan.package_manager = py_pm
        install, dev, build, test = _derive_python_cmds(app_root, py_pm, fw)
        plan.install_cmd = install
        plan.dev_cmd = dev
        plan.build_cmd = build
        plan.test_cmd = test
        plan.ports_hint = 8000
    elif fw == "static":
        plan.runtime = "node20"
        plan.install_cmd = ""
        plan.dev_cmd = "npx serve ."
        plan.build_cmd = ""
        plan.test_cmd = ""
        plan.ports_hint = 3000
    elif fw == "go":
        plan.runtime = "go"
        plan.package_manager = "go"
        use_air = plan.framework_variant == "air"
        install, dev, build, test = _derive_go_cmds(app_root, use_air=use_air)
        plan.install_cmd = install
        plan.dev_cmd = dev
        plan.build_cmd = build
        plan.test_cmd = test
        plan.ports_hint = 8080
        if use_air:
            plan.notes.append(
                "Go + Air: install `air` on the DocuVerse server host "
                "(`go install github.com/air-verse/air@latest`) so live reload previews work."
            )
    elif fw == "unknown":
        plan.runtime = "unknown"
        plan.notes.append("framework not detected; manual configuration required")
    else:
        # Node-based frameworks
        engines = (chosen_pkg or {}).get("engines", {}) if chosen_pkg else {}
        node_engine = (engines or {}).get("node", "")
        plan.runtime = "node18" if "18" in node_engine else "node20"
        install, dev, build, test = _derive_node_cmds(chosen_pkg, plan.package_manager)
        plan.install_cmd = install
        plan.dev_cmd = dev
        plan.build_cmd = build
        plan.test_cmd = test
        plan.ports_hint = {
            "nextjs": 3000, "remix": 3000, "nuxt": 3000,
            "sveltekit": 5173, "astro": 4321, "vite": 5173,
            "node-server": 3000,
        }.get(fw, 3000)

    # --- Env --------------------------------------------------------------
    referenced, documented = _scan_env_keys(app_root)
    required, optional, unused = _classify_env_keys(referenced, documented)
    plan.env_keys_required = required
    plan.env_keys_optional = optional
    plan.env_keys_unused = unused

    _apply_split_frontend_backend_preview(root, plan)

    # --- Confidence -------------------------------------------------------
    weights = [e.weight for e in plan.detection_evidence] or [0.0]
    plan.confidence = max(0.0, min(1.0, sum(weights) / max(1.0, len(weights) * 1.0)))
    if plan.framework == "unknown":
        plan.confidence = min(plan.confidence, 0.2)

    return plan


def recommend_clone_strategy(plan: BootstrapPlan) -> Dict[str, object]:
    """Return clone-strategy guidance for ``repositories.py`` to consume.

    Currently a heuristic: shallow + partial blob filter by default; deeper
    fetch suggested only when the user opts into history/blame features.
    """
    return {
        "default": "shallow_partial",  # git clone --filter=blob:none --depth=1
        "depth": 1,
        "filter": "blob:none",
        "sparse": bool(plan.monorepo_tool and plan.app_root_rel != "."),
        "sparse_paths": [plan.app_root_rel] if plan.app_root_rel != "." else [],
        "upgrade_triggers": [
            "user-opens-blame-or-history",
            "user-rebases-onto-base-branch",
            "structural-rename-refactor",
        ],
    }


__all__ = [
    "BootstrapPlan",
    "DetectionEvidence",
    "detect_bootstrap_plan",
    "recommend_clone_strategy",
]
