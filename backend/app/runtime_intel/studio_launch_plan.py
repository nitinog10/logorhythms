"""
Studio Docker launch planning — adapter-owned, validated before container start.

Builds phase commands (install/build/start), resolves monorepo app roots, rejects
build-only foreground commands for live preview, and verifies scripts / manifests / env.

Mainstream JS frameworks use ``studio_runtime_docker_node_image``, Python stacks use
the Python image, and split FE+API previews optionally use
``studio_runtime_docker_split_node_python_image`` /
``studio_runtime_docker_split_node_go_image`` /
``studio_runtime_docker_split_stack_image`` so Node is present in the image instead
of downloading at container start unless ``studio_runtime_allow_split_embed_node_fallback``
is enabled for legacy/dev only.

Used by DockerRuntimeManager only; host preview continues to use preview_runner.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from app.runtime_intel.framework_adapters import FrameworkAdapter, get_framework_adapter
from app.config import get_settings
from app.services.repo_bootstrap import (
    discover_classic_frontend_backend_split,
    synthesize_split_install_line,
)

# ── Build-only foreground detection (never run build-only as live-preview start cmd) ──

_BUILD_ONLY_MARKERS = (
    " vite build",
    " next build",
    " nuxt build",
    " remix build",
    " astro build",
    " svelte-kit build",
    " webpack",
    " rollup -c",
    " esbuild ",
    " parcel build",
    " tsc -b",
    " tsc ",
    "react-scripts build",
    " prisma migrate",
    " prisma generate",
    "turbo build",
    "vite build",
    "next build",
    "npm run build",
    "pnpm run build",
    "yarn build",
    "yarn run build",
    "bun run build",
)


def looks_like_build_only_foreground(cmd: str) -> bool:
    """True if cmd is overwhelmingly a bundler/typecheck/production build."""
    low = str(cmd or "").strip().lower()
    if not low:
        return False
    direct = ("webpack", "rollup", "esbuild", "parcel")
    tok0 = low.split()[0] if low.split() else ""
    if tok0 in direct and "dev" not in low and "serve" not in low:
        return True
    return any(m in low for m in _BUILD_ONLY_MARKERS)


def looks_like_long_running_server(cmd: str) -> bool:
    """Heuristic for dev-servers / interpreters that keep process alive."""
    low = str(cmd or "").strip().lower()
    if not low:
        return False
    if looks_like_build_only_foreground(low):
        return False
    if re.match(r"^npm\s+(install|ci)\b", low):
        return False
    if re.match(r"^pnpm\s+install\b", low):
        return False
    if re.match(r"^yarn\s+install\b", low):
        return False
    if re.match(r"^yarn\s+$", low):
        return False
    server_tokens = (
        " dev",
        " run dev",
        " start:dev",
        " serve",
        "next dev",
        "nuxt dev",
        " vite",
        "remix vite:dev",
        "astro dev",
        "svelte-kit dev",
        "uvicorn ",
        "gunicorn ",
        "runserver",
        " flask ",
        "-m flask",
        " manage.py ",
        "air ",
        " go run ",
        " npx serve",
        "manage.py",
        )
    if any(t in low for t in server_tokens):
        return True
    # npm/pnpm/yarn/bun starting a named script often long-running — allowed if not build-only
    if re.match(r"^(npm|pnpm|yarn|bun)(\s|$)", low):
        if "run" in low:
            rn = low
            if " build" in rn or rn.endswith(" build") or re.search(r"\bbuild\b", rn):
                if "run build" in rn:
                    return False
            return not looks_like_build_only_foreground(low)
        if re.match(r"^pnpm\s+\S+", low) or re.match(r"^yarn\s+\S+", low):
            return not looks_like_build_only_foreground(low)
    if low.startswith(("python ", "python3 ", "py ")):
        return True
    if "hypercorn" in low or "daphne" in low:
        return True
    if "http.server" in low or "-m http" in low:
        return True
    return False


def _inject_port_best_effort(cmd: str, port: int) -> str:
    s = (cmd or "").strip()
    if not s:
        return s
    low = s.lower()
    if any(tok in low for tok in ("--port", "-p ", " port=", " p=")):
        return s
    if re.match(r"^npm\s+run\s+", s, re.I):
        return f"{s} -- --host 0.0.0.0 --port {int(port)}"
    if re.match(r"^pnpm\s+run\s+", s, re.I):
        return f"{s} -- --host 0.0.0.0 --port {int(port)}"
    if re.match(r"^pnpm\s+\S+", s, re.I):
        return f"{s} --host 0.0.0.0 --port {int(port)}"
    if re.match(r"^yarn\s+\S+", s, re.I):
        return f"{s} --host 0.0.0.0 --port {int(port)}"
    if "next dev" in low:
        return f"{s} --hostname 0.0.0.0 --port {int(port)}"
    if "vite" in low:
        return f"{s} --host 0.0.0.0 --port {int(port)}"
    if "uvicorn" in low:
        return f"{s} --port {int(port)} --host 0.0.0.0" if "--host" not in low else f"{s} --port {int(port)}"
    if "flask" in low and "run" in low:
        return f"{s} --port {int(port)} --host 0.0.0.0"
    return s


def _looks_production_build_command(cmd: str) -> bool:
    low = str(cmd or "").strip().lower()
    if not low:
        return False
    markers = (
        "vite build",
        "next build",
        "nuxt build",
        "remix build",
        "astro build",
        "webpack",
        "rollup",
        "esbuild",
        "parcel build",
        "tsc -b",
        "react-scripts build",
    )
    return any(tok in low for tok in markers)


def classify_preview_strategy(
    plan: Mapping[str, Any], dev_cmd: str, build_cmd: str
) -> Dict[str, Any]:
    fw = str(plan.get("framework") or "").lower()
    adapter = get_framework_adapter(fw)
    explicit = str(plan.get("preview_strategy") or "").strip().lower()
    if explicit in {"live_preview", "deployment_build"}:
        strategy = explicit
        reason = "explicit_plan_preview_strategy"
    elif explicit in {"deploy", "production", "build"}:
        strategy = "deployment_build"
        reason = "explicit_plan_preview_strategy_alias"
    elif fw in {"vite", "nextjs", "cra", "remix", "nuxt", "sveltekit", "astro"}:
        strategy = "live_preview"
        reason = "framework_is_interactive_dev_server_first"
    elif _looks_production_build_command(build_cmd) and ("dev" in str(dev_cmd or "").lower()):
        strategy = "live_preview"
        reason = "production_build_detected_but_dev_server_available"
    else:
        strategy = str(adapter.launch_strategy or "live_preview")
        reason = f"framework_adapter:{adapter.name}"
    return {
        "preview_strategy": strategy,
        "preview_strategy_reason": reason,
        "build_is_production_style": _looks_production_build_command(build_cmd),
    }


def _markers_satisfied(package_root: Path, markers: Tuple[str, ...]) -> Tuple[bool, List[str]]:
    if not markers:
        return True, []
    hits = [m for m in markers if (package_root / m).exists()]
    return len(hits) > 0, hits


def _read_package_scripts(package_root: Path) -> Dict[str, str]:
    pj = package_root / "package.json"
    if not pj.is_file():
        return {}
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
        scripts = data.get("scripts") or {}
        return {str(k): str(v) for k, v in scripts.items() if isinstance(v, str)}
    except Exception:
        return {}


def _extract_npm_script_name(cmd: str) -> Optional[str]:
    s = cmd.strip()
    m = re.match(
        r"^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([A-Za-z0-9_:-]+)",
        s,
        re.I,
    )
    if not m:
        return None
    name = m.group(1).lower()
    if name in {"install", "i", "add", "exec", "dlx"}:
        return None
    return m.group(1)


def monorepo_root_mismatch_hint(
    project_dir: Path, plan: Mapping[str, Any], package_root: Path, adapter: FrameworkAdapter
) -> Optional[str]:
    """If bootstrap left us at repo root but real apps live deeper, hint user."""
    monorepo_tool = bool(plan.get("monorepo_tool"))
    candidates = plan.get("candidate_apps") or []
    if not isinstance(candidates, list):
        candidates = []
    app_rel = str(plan.get("app_root_rel") or ".").replace("\\", "/").strip() or "."
    if not monorepo_tool or app_rel != ".":
        return None

    markers = adapter.package_root_markers
    if not markers:
        return None
    ok_root, _ = _markers_satisfied(project_dir, markers)
    ok_pkg, _ = _markers_satisfied(package_root, markers)

    nested_pkg = []
    root_pj = project_dir / "package.json"
    if root_pj.is_file():
        try:
            pj = json.loads(root_pj.read_text(encoding="utf-8"))
            if pj.get("workspaces") or (project_dir / "pnpm-workspace.yaml").exists():
                for sub in ["apps", "packages", "services"]:
                    base = project_dir / sub
                    if base.is_dir():
                        nested_pkg.extend(list(base.glob("*/package.json"))[:8])
        except Exception:
            pass

    if (
        nested_pkg
        and not ok_pkg
        and candidates
        and not ok_root
    ):
        cand = candidates[0]
        return (
            "Monorepo detected but app_root_rel is '.'; pick the real app folder "
            f"(bootstrap suggested `{cand}`). Re-run framework detection."
        )

    scripts = _read_package_scripts(project_dir)
    if monorepo_tool and app_rel == "." and markers == ("package.json",):
        dev = scripts.get("dev", "")
        start = scripts.get("start", "")
        if root_pj.is_file() and not dev.strip() and not start.strip():
            if candidates:
                return (
                    "Monorepo workspace root lacks a runnable dev/start script—"
                    "set app root to `" + candidates[0] + "` or re-bootstrap."
                )
    return None


def validate_required_env_vars(
    plan: Mapping[str, Any], env_config: Optional[Mapping[str, str]]
) -> List[str]:
    """Return missing required env KEY names."""
    cfg = dict(env_config or {})
    req = list(plan.get("env_keys_required") or [])
    if not isinstance(req, list):
        return []
    missing: List[str] = []
    for key in req:
        k = str(key).strip()
        if not k:
            continue
        val = str(cfg.get(k) or "").strip()
        if not val:
            missing.append(k)
    return missing


def validate_npm_run_script(package_root: Path, start_cmd: str) -> Optional[str]:
    """If command is npm/pnpm/yarn run <script>, verify script exists."""
    name = _extract_npm_script_name(start_cmd)
    if not name:
        return None
    scripts = _read_package_scripts(package_root)
    if not scripts:
        return f"No package.json scripts in cwd; referenced script `{name}` missing."
    if name not in scripts:
        avail = sorted(scripts.keys())[:12]
        return (
            f"package.json has no `{name}` script (available: {avail}). Fix dev_cmd/bootstrap."
        )
    return None


def build_phase_commands_from_plan(
    plan: Mapping[str, Any],
    internal_port: int,
) -> Dict[str, Any]:
    fw = str(plan.get("framework") or "").lower()
    install = str(plan.get("install_cmd") or "").strip()
    build = str(plan.get("build_cmd") or "").strip()
    dev = str(plan.get("dev_cmd") or "").strip()

    if not dev:
        dev = (
            "npm run dev"
            if fw not in {"go", "static", "fastapi", "django", "flask", "unknown"}
            else ""
        )
    if not install and fw not in {"go", "static"}:
        install = "npm install --no-audit --no-fund"
    if not install and fw == "go":
        install = "go mod download"

    strat = classify_preview_strategy(plan, dev, build)
    force_build = bool(plan.get("require_build_before_start"))

    preview_kind = strat.get("preview_strategy")
    # Studio default — never foreground build-only for live_preview
    if preview_kind == "live_preview" and not force_build and build.strip():
        build = ""

    dev = _inject_port_best_effort(dev, internal_port)

    return {
        "detect": ":",
        "install": install,
        "build": build,
        "start": dev,
        "preview_strategy": str(preview_kind or "live_preview"),
        "preview_strategy_reason": str(
            strat.get("preview_strategy_reason") or "studio_launch_plan"
        ),
        "build_is_production_style": bool(strat.get("build_is_production_style")),
    }


def _runtime_shell_phase_note(ph: str) -> str:
    return f"[runtime-phase] {ph}"


def compose_shell_launch_chain(phase_cmds: Mapping[str, str]) -> str:
    parts = [f"echo '{_runtime_shell_phase_note('detect')}'"]
    install = str(phase_cmds.get("install") or "").strip()
    build = str(phase_cmds.get("build") or "").strip()
    start = str(phase_cmds.get("start") or "").strip()
    if install:
        parts += [f"echo '{_runtime_shell_phase_note('install')}'", install]
    if build:
        parts += [f"echo '{_runtime_shell_phase_note('build')}'", build]
    parts += [f"echo '{_runtime_shell_phase_note('start')}'", start]
    return " && ".join(parts)


# ── Opinionated multi-strategy execution (Docker Studio) ─────────────────────

STUDIO_CONTAINER_PUBLISH_PORTS: Tuple[int, ...] = (
    3000,
    5173,
    5174,
    4173,
    8080,
    8000,
    5000,
    4000,
    3001,
)
STUDIO_SPLIT_BACKEND_INTERNAL_PORT = 8787
DV_BACKEND_ORIGIN_PLACEHOLDER = "__DV_STUDIO_BACKEND_ORIGIN__"


def studio_split_embed_node_bootstrap_sh() -> str:
    """
    Python/Go runtime images do not include Node; split previews need npm for the UI.
    Downloads the official Node tarball without apt (cap-drop friendly).

    - Uses ``.tar.gz`` + ``tar -xzf`` so minimal/busybox tar works (``.tar.xz`` needs GNU tar + xz).
    - Prefers Python ``urllib`` with default SSL, then curl/wget, then Go (with TLS verify retry).
    - Does not put ``/opt/studio-node/bin`` on ``PATH`` until after install.
    """
    return r"""set -e
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH}"
if [ ! -x /opt/studio-node/bin/node ]; then
  echo '[runtime-phase] studio_embed_node'
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) NA=linux-x64 ;;
    aarch64|arm64) NA=linux-arm64 ;;
    *) echo "Studio: unsupported arch for embedded Node: $ARCH"; exit 2 ;;
  esac
  VER=v20.18.0
  mkdir -p /opt/studio-node
  URL="https://nodejs.org/dist/${VER}/node-${VER}-${NA}.tar.gz"
  TMP=/tmp/studio-node-bootstrap.tar.gz
  rm -f "$TMP"

  _pick_py() {
    _PY_TRY=""
    for _try in python3 python python3.11 python3.12; do
      if command -v "${_try}" >/dev/null 2>&1; then _PY_TRY=$(command -v "${_try}"); echo "${_PY_TRY}"; return 0; fi
    done
    for _p in /usr/local/bin/python3 /usr/local/bin/python /usr/bin/python3 /usr/bin/python; do
      if [ -x "${_p}" ]; then echo "${_p}"; return 0; fi
    done
    return 1
  }

  FOUND_DL=""
  PY_BIN=""
  if PY_BIN="$(_pick_py)"; then
    PY_BIN="$(echo "${PY_BIN}" | head -n1)"
    if "${PY_BIN}" - "$URL" "$TMP" <<'EOSP'; then FOUND_DL=1; fi
import ssl
import sys
import urllib.request

def main():
    if len(sys.argv) != 3:
        raise SystemExit(2)
    url, path = sys.argv[1], sys.argv[2]
    req = urllib.request.Request(url, headers={"User-Agent": "studio-node-bootstrap/1.0"})
    for ctx in (ssl.create_default_context(), ssl._create_unverified_context()):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=300) as resp:
                if getattr(resp, "status", 200) != 200:
                    continue
                with open(path, "wb") as out:
                    out.write(resp.read())
            return
        except Exception:
            continue
    raise SystemExit(1)


if __name__ == "__main__":
    main()
EOSP
  fi
  if [ -z "$FOUND_DL" ] && command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o "$TMP" && FOUND_DL=1
  fi
  if [ -z "$FOUND_DL" ] && command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP" "$URL" && FOUND_DL=1
  fi
  if [ -z "$FOUND_DL" ] && command -v go >/dev/null 2>&1; then
    cat <<'EOSN' >/tmp/sn-dl-main.go
package main

import (
	"crypto/tls"
	"io"
	"net/http"
	"os"
)

func download(url, path string, insecure bool) error {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if insecure {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	c := &http.Client{Transport: tr}
	resp, err := c.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		os.Exit(1)
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func main() {
	if len(os.Args) != 3 {
		os.Exit(2)
	}
	if err := download(os.Args[1], os.Args[2], false); err == nil {
		return
	}
	if err := download(os.Args[1], os.Args[2], true); err != nil {
		panic(err)
	}
}
EOSN
    ( cd /tmp && go run ./sn-dl-main.go "$URL" "$TMP" ) && FOUND_DL=1
    rm -f /tmp/sn-dl-main.go
  fi
  if [ -z "$FOUND_DL" ]; then
    echo "Studio: cannot download Node (no working python/curl/wget/go or TLS failed). Use python:3.11-bookworm or an image with curl, or ensure HTTPS to nodejs.org works."
    exit 2
  fi
  tar -xzf "$TMP" --strip-components=1 -C /opt/studio-node
  rm -f "$TMP"
fi
export PATH="/opt/studio-node/bin:${PATH}"
"""



def merged_listen_publish_ports(primary: int = 3000) -> Tuple[int, ...]:
    """Preserve order preference: primary ports first then common dev-server ports."""
    return tuple(dict.fromkeys((primary, *STUDIO_CONTAINER_PUBLISH_PORTS)).keys())


def resolve_split_hybrid_toolchain_image(
    *,
    needs_embedded_node: bool,
    be_has_py: bool,
    be_has_go: bool,
    split_py: str,
    split_go: str,
    split_any: str,
) -> Tuple[str, Optional[str]]:
    """
    Pick a deterministic hybrid Docker image for split previews that need Node plus a
    companion backend toolchain. Embed-node bootstrap applies when no image resolves.
    """
    if not needs_embedded_node:
        return "", None
    if be_has_py and be_has_go:
        if split_any:
            return split_any, "split_stack_image"
        if split_py:
            return split_py, "split_node_python_image"
        if split_go:
            return split_go, "split_node_go_image"
        return "", None
    if be_has_go:
        if split_go:
            return split_go, "split_node_go_image"
        if split_any:
            return split_any, "split_stack_image"
        return "", None
    if be_has_py:
        if split_py:
            return split_py, "split_node_python_image"
        if split_any:
            return split_any, "split_stack_image"
        return "", None
    return "", None


@dataclass
class PreparedDockerLaunch:
    phase_cmds: Dict[str, Any]
    package_root: Path
    app_root_rel: str
    container_workdir: str
    healthcheck_path: str
    adapter: FrameworkAdapter
    shell_command: str
    docker_publish_ports: Tuple[int, ...] = field(
        default_factory=lambda: merged_listen_publish_ports(3000)
    )
    split_backend_origin_placeholder: Optional[str] = None
    frontend_internal_port_hint: Optional[int] = None


def _sh_single_quote(val: str) -> str:
    return "'" + str(val).replace("'", "'\"'\"'") + "'"


def _normalized_roots_to_try(plan: Mapping[str, Any]) -> List[str]:
    ordered: List[str] = []
    ar = str(plan.get("app_root_rel") or ".").replace("\\", "/").strip()
    ar = "." if ar in {"", "."} else ar
    ordered.append(ar)
    cand = plan.get("candidate_apps") or []
    if isinstance(cand, list):
        for c in cand:
            rel = str(c).replace("\\", "/").strip().strip("./")
            rel = "." if rel in {"", "."} else rel
            ordered.append(rel)
    out: List[str] = []
    seen: set[str] = set()
    for rel in ordered:
        if rel in seen:
            continue
        seen.add(rel)
        out.append(rel)
    return out


def _dedupe_command_list(lines: List[str]) -> List[str]:
    uniq: List[str] = []
    seen: set[str] = set()
    for raw in lines:
        t = str(raw or "").strip()
        low = t.lower()
        if not t or looks_like_build_only_foreground(t) or low in seen:
            continue
        seen.add(low)
        uniq.append(t)
    return uniq


def _infer_package_manager(workspace_root: Path, package_root: Path, plan_pm: str) -> str:
    pm = str(plan_pm or "").lower().strip()
    if pm in {"pnpm", "yarn", "npm", "bun"}:
        return pm
    wr = workspace_root.resolve()
    pr = package_root.resolve()
    if (wr / "pnpm-lock.yaml").is_file() or (pr / "pnpm-lock.yaml").is_file():
        return "pnpm"
    if (wr / "yarn.lock").is_file() or (pr / "yarn.lock").is_file():
        return "yarn"
    if (pr / "bun.lockb").is_file():
        return "bun"
    return "npm"


def _read_package_dependency_names(package_root: Path) -> set[str]:
    pj = package_root / "package.json"
    names: set[str] = set()
    if not pj.is_file():
        return names
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
        for tbl in ("dependencies", "devDependencies"):
            for k in (data.get(tbl) or {}):
                names.add(str(k).lower())
    except Exception:
        pass
    return names


def _pm_script(pm: str, script_name: str) -> str:
    if pm == "pnpm":
        return f"pnpm run {script_name}"
    if pm == "yarn":
        return f"yarn {script_name}"
    if pm == "bun":
        return f"bun run {script_name}"
    return f"npm run {script_name}"


def _inject_django_bind(cmd: str, port: int) -> str:
    s = (cmd or "").strip()
    low = s.lower()
    if not s or "manage.py" not in low or "runserver" not in low:
        return s
    if "0.0.0.0" in low or "::" in low:
        return s
    if re.search(r"runserver\s+.*:[0-9]+", low):
        return s
    return f"{s.rstrip()} 0.0.0.0:{int(port)}"


def collect_opinionated_start_candidates(
    framework: str,
    *,
    workspace_root: Path,
    package_root: Path,
    plan: Mapping[str, Any],
    bootstrap_dev: str,
    internal_port: int,
) -> List[str]:
    fw = str(framework or "unknown").lower().strip()
    scripts = _read_package_scripts(package_root)
    deps = _read_package_dependency_names(package_root)
    is_cra = "react-scripts" in deps or fw == "cra"
    pm = _infer_package_manager(
        workspace_root, package_root, str(plan.get("package_manager") or "")
    )

    cmds: List[str] = []
    bd = bootstrap_dev.strip()
    if bd:
        cmds.append(bd)
    ds = scripts.get("dev") or ""

    # Battle-tested launcher lists (prefer real package scripts when present).
    if fw == "vite" or fw == "unknown":
        cmds.extend(
            [
                _pm_script(pm, "dev") if scripts.get("dev") else "",
                "npm run dev",
                "pnpm dev",
                "yarn dev",
                "npx vite",
                "./node_modules/.bin/vite",
            ]
        )
    elif fw == "nextjs":
        cmds.extend(
            [
                _pm_script(pm, "dev") if scripts.get("dev") else "",
                "npm run dev",
                "pnpm dev",
                f"npx next dev --hostname 0.0.0.0 --port {int(internal_port)}",
                f"yarn next dev --hostname 0.0.0.0 --port {int(internal_port)}",
            ]
        )
    elif fw in {"remix", "sveltekit", "astro", "nuxt"}:
        cmds.extend(
            [
                _pm_script(pm, "dev") if ds else "",
                "npm run dev",
                "pnpm dev",
                "npx vite",
            ]
        )
    elif fw == "cra" or is_cra:
        cmds.extend(
            [
                "DISABLE_ESLINT_PLUGIN=true npm start",
                "HOST=0.0.0.0 npm start",
                _pm_script("npm", "start") if scripts.get("start") else "",
                "npm start",
            ]
        )
    elif fw in {"express", "node-server"}:
        cmds.extend(
            [
                _pm_script(pm, "dev") if ds else "",
                _pm_script(pm, "start") if scripts.get("start") else "",
                "node server.js",
                "node src/server.js",
                "node index.js",
            ]
        )
    elif fw == "fastapi":
        cmds.extend(
            [
                "python -m uvicorn main:app --reload --port %d --host 0.0.0.0"
                % internal_port,
                "python -m uvicorn app.main:app --reload --port %d --host 0.0.0.0"
                % internal_port,
                "uvicorn main:app --reload --port %d --host 0.0.0.0" % internal_port,
            ]
        )
    elif fw == "flask":
        cmds.extend(
            [
                f"flask --app app run --debug --host 0.0.0.0 --port {internal_port}",
                f"flask run --debug --host 0.0.0.0 --port {internal_port}",
            ]
        )
    elif fw == "django":
        cmds.extend(
            [
                f"python manage.py runserver 0.0.0.0:{internal_port}",
            ]
        )
    elif fw == "go":
        cmds.extend(["air", "go run ./...", "go run .", "go run main.go"])

    if fw not in {"go", "fastapi", "flask", "django"}:
        if scripts.get("dev"):
            cmds.append(_pm_script("npm", "dev"))
        if scripts.get("start"):
            cmds.append(_pm_script("npm", "start"))

    normalized = []
    for c in cmds:
        t = str(c or "").strip()
        if not t:
            continue
        t = _inject_port_best_effort(_inject_django_bind(t, internal_port), internal_port)
        normalized.append(t)
    return _dedupe_command_list(normalized)


def compose_quick_fallback_chain(
    *,
    install: str,
    build: str,
    candidates: Sequence[str],
) -> str:
    parts: List[str] = [f"echo '{_runtime_shell_phase_note('detect')}'"]
    si = install.strip()
    sb = build.strip()
    cand = list(candidates or [])
    if si:
        parts += [f"echo '{_runtime_shell_phase_note('install')}'", si]
    if sb:
        parts += [f"echo '{_runtime_shell_phase_note('build')}'", sb]
    if not cand:
        parts.append(":")
        return " && ".join(parts)
    if len(cand) == 1:
        parts += [
            f"echo '{_runtime_shell_phase_note('start')}'",
            "exec sh -c " + _sh_single_quote(cand[0]),
        ]
        return " && ".join(parts)
    chained = "(" + " || ".join(["sh -lc " + _sh_single_quote(c) for c in cand]) + ")"
    parts += [f"echo '{_runtime_shell_phase_note('start')}'", chained]
    return " && ".join(parts)


def _build_split_shell(
    *,
    install: str,
    be_rel: str,
    fe_rel: str,
    be_cmd: str,
    fe_cmd: str,
    be_port: int,
    fe_port: int,
    extra_background: str = "",
    origin_placeholder: str = DV_BACKEND_ORIGIN_PLACEHOLDER,
) -> str:
    be_mount = "/workspace" if be_rel == "." else f"/workspace/{be_rel}"
    fe_mount = "/workspace" if fe_rel == "." else f"/workspace/{fe_rel}"
    qb = _sh_single_quote(be_cmd)
    qf = _sh_single_quote(fe_cmd)
    ist = ""
    if install.strip():
        ist = f"echo '{_runtime_shell_phase_note('install')}' && {install.strip()} && "
    be_ssr_origin = f"http://127.0.0.1:{int(be_port)}"
    env_exports = (
        f'export NEXT_PUBLIC_API_URL="{origin_placeholder}" '
        f'VITE_API_URL="{origin_placeholder}" '
        f'REACT_APP_API_URL="{origin_placeholder}" '
        f'PUBLIC_API_URL="{origin_placeholder}" '
        f'STUDIO_PREVIEW_API_ORIGIN="{origin_placeholder}" '
        f'NEXT_BACKEND_API_URL="{be_ssr_origin}" '
    )
    return (
        f"{ist}"
        f"{extra_background}"
        f"( cd {be_mount} && export HOST=0.0.0.0 PORT={int(be_port)} "
        f"&& exec sh -lc {qb} ) &\n"
        f"sleep 5\n"
        f"( cd {fe_mount} && export HOST=0.0.0.0 PORT={int(fe_port)} && "
        f"{env_exports.strip()}exec sh -lc {qf} )"
    )


def _attempt_split_launch(
    workspace_root: Path,
    plan: Mapping[str, Any],
    env_config: Optional[Mapping[str, str]],
    fe_internal_port: int,
) -> Tuple[Optional[PreparedDockerLaunch], Optional[Tuple[str, str, str, Dict[str, Any]]]]:
    raw = plan.get("preview_processes")
    if not isinstance(raw, list) or len(raw) < 2:
        return None, None
    rows = [dict(x) for x in raw if isinstance(x, dict)]
    primaries = [p for p in rows if p.get("primary")]
    if len(primaries) != 1:
        return None, None
    primary = primaries[0]
    companions = [p for p in rows if not p.get("primary")]
    if not companions:
        return None, None

    be = companions[0]
    extra_bg = ""
    for i, ex in enumerate(companions[1:4], start=1):
        er = str(ex.get("cwd_rel") or ".").replace("\\", "/").strip()
        ec = str(ex.get("cmd") or "").strip()
        if not ec:
            continue
        xp = STUDIO_SPLIT_BACKEND_INTERNAL_PORT + (i + 10) * 11
        em = "/workspace" if er == "." else f"/workspace/{er}"
        xinj = _inject_port_best_effort(ec, xp)
        extra_bg += (
            f"( cd {em} && export HOST=0.0.0.0 PORT={xp} && "
            f"exec sh -lc {_sh_single_quote(xinj)} ) & "
        )

    be_rel = str(be.get("cwd_rel") or ".").replace("\\", "/").strip() or "."
    fe_rel = str(primary.get("cwd_rel") or ".").replace("\\", "/").strip() or "."

    fe_cmd_raw = str(primary.get("cmd") or "").strip()
    be_cmd_raw = str(be.get("cmd") or "").strip()
    if not fe_cmd_raw or not be_cmd_raw:
        return (
            None,
            (
                "detect",
                "LAUNCH_PLAN_SPLIT_INCOMPLETE",
                "preview_processes missing cmd for split preview.",
                {"preview_processes": raw},
            ),
        )

    fe_port = int(fe_internal_port)
    be_port = int(STUDIO_SPLIT_BACKEND_INTERNAL_PORT)
    be_internal_origin = f"http://127.0.0.1:{be_port}"
    be_path = workspace_root / be_rel if be_rel != "." else workspace_root
    fe_pkg_path = workspace_root / fe_rel / "package.json" if fe_rel != "." else workspace_root / "package.json"
    needs_embedded_node = fe_pkg_path.is_file() and (
        (be_path / "requirements.txt").is_file()
        or (be_path / "pyproject.toml").is_file()
        or (be_path / "setup.py").is_file()
        or (be_path / "go.mod").is_file()
    )

    fw = str(plan.get("framework") or "unknown").strip().lower()
    adapter = get_framework_adapter(fw)
    diag_env = dict(env_config or {})
    for key, default in (
        ("PORT", str(fe_port)),
        ("HOST", "0.0.0.0"),
        ("DATABASE_URL", "file:./dev.db"),
        # Server-side Next (RSC/route handlers) calls the co-located backend on the
        # split internal port inside the same container — not the browser-facing origin.
        ("NEXT_BACKEND_API_URL", be_internal_origin),
    ):
        if key not in diag_env or not str(diag_env.get(key) or "").strip():
            diag_env[key] = default
    miss = validate_required_env_vars(plan, diag_env)
    if miss:
        return None, (
            "detect",
            "LAUNCH_PLAN_MISSING_ENV_VARS",
            "Required environment variables missing: " + ", ".join(miss),
            {"missing_env_keys": miss},
        )

    install_line = str(plan.get("install_cmd") or "").strip()
    if not install_line:
        install_line = synthesize_split_install_line(workspace_root, be_rel, fe_rel)

    cfg = get_settings()
    split_py = str(getattr(cfg, "studio_runtime_docker_split_node_python_image", "") or "").strip()
    split_go = str(getattr(cfg, "studio_runtime_docker_split_node_go_image", "") or "").strip()
    split_any = str(getattr(cfg, "studio_runtime_docker_split_stack_image", "") or "").strip()

    be_has_go = (be_path / "go.mod").is_file()
    be_has_py = (
        (be_path / "requirements.txt").is_file()
        or (be_path / "pyproject.toml").is_file()
        or (be_path / "setup.py").is_file()
    )
    split_stack, split_stack_source = resolve_split_hybrid_toolchain_image(
        needs_embedded_node=needs_embedded_node,
        be_has_py=be_has_py,
        be_has_go=be_has_go,
        split_py=split_py,
        split_go=split_go,
        split_any=split_any,
    )

    use_predetermined_split = bool(needs_embedded_node and split_stack)
    allow_embed = bool(
        getattr(cfg, "studio_runtime_allow_split_embed_node_fallback", False)
    )
    if needs_embedded_node and not split_stack and not allow_embed:
        return None, (
            "detect",
            "MISSING_REQUIRED_TOOLCHAIN",
            (
                "Split preview has a frontend package manager (npm/pnpm/yarn/bun via package.json) "
                "alongside a Python or Go companion service; Docker must use a hybrid image that "
                "already includes Node/npm and that backend toolchain. Configure one of "
                "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE, "
                "STUDIO_RUNTIME_DOCKER_SPLIT_NODE_GO_IMAGE, or STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE. "
                "For dev-only use STUDIO_RUNTIME_ALLOW_SPLIT_EMBED_NODE_FALLBACK=true (not recommended in production)."
            ),
            {
                "code": "MISSING_REQUIRED_TOOLCHAIN",
                "framework_adapter": adapter.name,
                "adapter_primary_toolchain": adapter.studio_docker_primary_toolchain,
                "split_backend_has_python_markers": be_has_py,
                "split_backend_has_go_markers": be_has_go,
                "hybrid_candidate_env_configured": {
                    "studio_runtime_docker_split_node_python_image": bool(split_py),
                    "studio_runtime_docker_split_node_go_image": bool(split_go),
                    "studio_runtime_docker_split_stack_image": bool(split_any),
                },
                "studio_runtime_allow_split_embed_node_fallback": allow_embed,
            },
        )

    strat = (
        "predetermined_image"
        if use_predetermined_split
        else ("embed_node_fallback" if needs_embedded_node else "adapter_base_image")
    )
    node_bootstrap = (
        ""
        if use_predetermined_split
        else (studio_split_embed_node_bootstrap_sh() if needs_embedded_node else "")
    )

    shell = (
        node_bootstrap
        + _build_split_shell(
            install=install_line,
            be_rel=be_rel,
            fe_rel=fe_rel,
            be_cmd=_inject_port_best_effort(be_cmd_raw, be_port),
            fe_cmd=_inject_port_best_effort(fe_cmd_raw, fe_port),
            be_port=be_port,
            fe_port=fe_port,
            extra_background=extra_bg,
            origin_placeholder=DV_BACKEND_ORIGIN_PLACEHOLDER,
        )
    )
    pkg_fe = workspace_root / fe_rel if fe_rel != "." else workspace_root

    internal_ports_extra = tuple(
        STUDIO_SPLIT_BACKEND_INTERNAL_PORT + (i + 10) * 11
        for i in range(1, min(len(companions), 4))
    )
    pub = tuple(dict.fromkeys((be_port, fe_port, *internal_ports_extra)).keys())

    phases = {
        "detect": ":",
        "install": install_line,
        "build": "",
        "start": fe_cmd_raw,
        "preview_strategy": "live_preview",
        "preview_strategy_reason": "studio_split_preview_processes",
        "studio_split_preview_mode": True,
        "studio_split_backend_has_python": be_has_py,
        "studio_split_backend_has_go": be_has_go,
        "studio_split_needs_embedded_node": needs_embedded_node,
        "studio_runtime_allow_split_embed_node_fallback_applied": allow_embed,
        "studio_split_toolchain_strategy": strat,
        "backend_dev_command_wired": be_cmd_raw,
        "start_fallback_candidates": collect_opinionated_start_candidates(
            fw,
            workspace_root=workspace_root,
            package_root=pkg_fe.resolve(),
            plan=plan,
            bootstrap_dev=fe_cmd_raw,
            internal_port=fe_port,
        ),
    }
    if use_predetermined_split:
        phases["studio_split_toolchain_image"] = split_stack
        if split_stack_source:
            phases["studio_split_toolchain_image_source"] = split_stack_source

    cw = "/workspace" if fe_rel == "." else f"/workspace/{fe_rel}"
    health_plan = str(plan.get("healthcheck_path") or "").strip()
    health_resolved = adapter.healthcheck_path if not health_plan else health_plan
    hp_fix = (
        health_resolved
        if str(health_resolved).startswith("/")
        else f"/{health_resolved}"
    )
    prep = PreparedDockerLaunch(
        phase_cmds=phases,
        package_root=pkg_fe.resolve(),
        app_root_rel=fe_rel if fe_rel != "." else ".",
        container_workdir=cw,
        healthcheck_path=hp_fix,
        adapter=adapter,
        shell_command=shell,
        docker_publish_ports=pub,
        split_backend_origin_placeholder=DV_BACKEND_ORIGIN_PLACEHOLDER,
        frontend_internal_port_hint=fe_port,
    )
    return prep, None


def resolve_paths(
    project_dir: Path, plan: Mapping[str, Any]
) -> Tuple[str, Path, Path]:
    """app_root_rel, workspace_root resolved, package_root resolved."""
    app_rel = str(plan.get("app_root_rel") or ".").replace("\\", "/").strip() or "."
    workspace_root = project_dir.resolve()
    if app_rel in {"", "."}:
        package_root = workspace_root
        norm_rel = "."
    else:
        package_root = (workspace_root / app_rel).resolve()
        norm_rel = app_rel
    try:
        package_root.relative_to(workspace_root)
    except ValueError:
        raise ValueError(f"app_root_escapes_workspace:{app_rel}")
    return norm_rel, workspace_root, package_root


def _prepare_single_root_studio_launch(
    project_dir: Path,
    *,
    workspace_root: Path,
    merged_plan: Mapping[str, Any],
    env_config: Optional[Mapping[str, str]],
    internal_port: int,
    compose_chain: bool,
) -> Tuple[Optional[PreparedDockerLaunch], Optional[Tuple[str, str, str, Dict[str, Any]]]]:
    phase = "detect"
    fw_raw = str(merged_plan.get("framework") or "unknown").lower().strip()
    adapter = get_framework_adapter(fw_raw)
    diagnostics: Dict[str, Any] = {
        "resolved_framework_adapter": adapter.name,
        "framework_from_plan": fw_raw or "unknown",
    }

    norm_rel_eff, ws, package_root = resolve_paths(project_dir, merged_plan)
    if ws != workspace_root.resolve():
        diagnostics["hint"] = "workspace_root mismatch during multi-root probing"
        return None, ("detect", "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH", "Internal workspace mismatch.", diagnostics)

    diagnostics.update(
        {
            "workspace_root": str(ws),
            "app_root_rel": norm_rel_eff,
            "package_root": str(package_root),
            "container_workdir": (
                "/workspace" if norm_rel_eff == "." else f"/workspace/{norm_rel_eff}"
            ),
            "adapter_healthcheck_defaults": adapter.healthcheck_path,
        }
    )

    if not ws.is_dir():
        diagnostics["hint"] = "workspace directory missing"
        return (
            None,
            (phase, "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH", "Project workspace directory does not exist.", diagnostics),
        )

    if not package_root.is_dir():
        diagnostics["hint"] = (
            "package_root does not exist — wrong app_root_rel for monorepo?"
        )
        return (
            None,
            (
                phase,
                "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH",
                f"No directory at `{norm_rel_eff}` under workspace.",
                diagnostics,
            ),
        )

    markers = adapter.package_root_markers
    ok_markers, found = _markers_satisfied(package_root, markers)
    diagnostics["manifest_hits"] = found
    if markers and not ok_markers:
        diagnostics["expected_markers"] = list(markers)
        diagnostics["hint"] = monorepo_root_mismatch_hint(
            ws, merged_plan, package_root, adapter
        )
        msg = (
            f"Missing expected project files ({markers}) under `{norm_rel_eff}`; "
            "wrong app_root for this framework/monorepo."
        )
        return None, (
            phase,
            "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH",
            msg,
            diagnostics,
        )

    mm_hint = monorepo_root_mismatch_hint(ws, merged_plan, package_root, adapter)
    if mm_hint:
        diagnostics.setdefault("studio_launch_hints", []).append(mm_hint)

    phase_cmds = build_phase_commands_from_plan(merged_plan, internal_port)

    strat = phase_cmds.get("preview_strategy")

    missing_env = validate_required_env_vars(merged_plan, env_config)
    diagnostics["missing_env_keys"] = missing_env

    diagnostic_env = dict(env_config or {})
    for key, default in (
        ("PORT", str(internal_port)),
        ("HOST", "0.0.0.0"),
        ("DATABASE_URL", "file:./dev.db"),
    ):
        if key not in diagnostic_env or not str(diagnostic_env.get(key) or "").strip():
            diagnostic_env[key] = default
    diagnostics["applied_default_env_hints"] = list(
        {"PORT", "HOST", "DATABASE_URL"} & set(diagnostic_env.keys()),
    )

    missing_env_after_defaults = validate_required_env_vars(merged_plan, diagnostic_env)
    diagnostics["missing_env_keys_after_defaults"] = missing_env_after_defaults
    missing_eff = missing_env_after_defaults if missing_env_after_defaults else missing_env

    if missing_eff:
        diagnostics["hint"] = (
            "Provide missing keys via session/env_config or `.env.example`."
        )
        return None, (
            phase,
            "LAUNCH_PLAN_MISSING_ENV_VARS",
            "Required environment variables are missing: " + ", ".join(missing_eff),
            diagnostics,
        )

    bootstrap_start = str(phase_cmds.get("start") or "").strip()
    fallback_chain = collect_opinionated_start_candidates(
        fw_raw,
        workspace_root=ws,
        package_root=package_root,
        plan=merged_plan,
        bootstrap_dev=bootstrap_start,
        internal_port=internal_port,
    )
    diagnostics["start_fallback_candidates"] = fallback_chain.copy()

    if not fallback_chain:
        diagnostics["hint"] = (
            "No viable Studio preview commands were derived for this app root/framework."
        )
        return None, (
            "start",
            "LAUNCH_PLAN_INVALID_START_COMMAND",
            "Unable to synthesize preview start commands.",
            diagnostics,
        )

    single_fallback = len(fallback_chain) == 1

    starter = fallback_chain[0]
    strat_s = str(strat or "live_preview")
    if strat_s == "live_preview" and looks_like_build_only_foreground(starter) and single_fallback:
        diagnostics["hint"] = (
            "Start command resembles a production build; add preview_processes/dev_cmd or broaden fallbacks."
        )
        return None, (
            "start",
            "LAUNCH_PLAN_BUILD_ONLY_COMMAND",
            "Blocked build-only start with no fallback strategy.",
            diagnostics,
        )

    if strat_s == "live_preview" and single_fallback:
        if not looks_like_long_running_server(starter):
            diagnostics["hint"] = (
                "Command does not resemble a typical long-running preview server "
                "(enable additional fallbacks via bootstrap/monorepo candidates)."
            )
            return None, (
                "start",
                "LAUNCH_PLAN_INVALID_START_COMMAND",
                "Rejected ambiguous non-server foreground command.",
                diagnostics,
            )

    script_issue = validate_npm_run_script(package_root, starter)
    if script_issue and single_fallback:
        diagnostics["hint"] = script_issue
        return None, (
            "start",
            "LAUNCH_PLAN_SCRIPT_MISSING",
            script_issue,
            diagnostics,
        )
    if script_issue:
        diagnostics.setdefault("launch_plan_warnings", []).append(script_issue)

    install_line = str(phase_cmds.get("install") or "").strip()
    build_line = str(phase_cmds.get("build") or "").strip()

    phase_cmds["_start_fallback_candidates"] = fallback_chain[:12]
    phase_cmds["start_execution_mode"] = "multi_strategy" if len(fallback_chain) > 1 else "single"
    shell_cmd = (
        compose_quick_fallback_chain(
            install=install_line,
            build=build_line,
            candidates=fallback_chain[:12],
        )
        if compose_chain
        else ""
    )

    health = str(merged_plan.get("healthcheck_path") or "").strip() or adapter.healthcheck_path
    hp_res = health if str(health).startswith("/") else f"/{health}"

    cw = diagnostics["container_workdir"]

    prep = PreparedDockerLaunch(
        phase_cmds=phase_cmds,
        package_root=package_root.resolve(),
        app_root_rel=norm_rel_eff,
        container_workdir=cw,
        healthcheck_path=hp_res,
        adapter=adapter,
        shell_command=shell_cmd,
        docker_publish_ports=merged_listen_publish_ports(int(internal_port)),
        split_backend_origin_placeholder=None,
        frontend_internal_port_hint=int(internal_port),
    )
    diagnostics["expected_internal_listen_port"] = adapter.expected_internal_listen_port
    diagnostics["preview_strategy"] = strat
    diagnostics["resolved_start_command"] = starter
    diagnostics["healthcheck_path_resolved"] = hp_res
    diagnostics.setdefault("attempted_roots_log", []).append(norm_rel_eff)
    prep.phase_cmds["studio_launch_diagnostics"] = diagnostics.copy()
    return prep, None


def _effective_studio_launch_plan(
    workspace_root: Path, plan: Mapping[str, Any]
) -> dict[str, Any]:
    """
    When bootstrap did not attach ``preview_processes`` but the repo layout is a
    classic API + UI sibling folder, synthesize split preview for Docker orchestration.
    """
    out = dict(plan)
    raw = out.get("preview_processes")
    if isinstance(raw, list) and len(raw) >= 2:
        return out
    spec = discover_classic_frontend_backend_split(workspace_root)
    if spec is None:
        return out
    out["preview_processes"] = list(spec.preview_processes)
    hints = list(out.get("studio_topology_hints") or [])
    hints.append(
        {
            "code": "implicit_classic_fe_be_split",
            "backend_rel": spec.backend_rel,
            "frontend_rel": spec.frontend_rel,
        }
    )
    out["studio_topology_hints"] = hints
    return out


def prepare_studio_docker_launch(
    project_dir: Path,
    plan: Mapping[str, Any],
    env_config: Optional[Mapping[str, str]],
    internal_port: int,
    *,
    compose_chain: bool = True,
) -> Tuple[Optional[PreparedDockerLaunch], Optional[Tuple[str, str, str, Dict[str, Any]]]]:
    workspace_root = project_dir.resolve()
    plan_eff = _effective_studio_launch_plan(workspace_root, plan)

    split_prep, split_err = _attempt_split_launch(
        workspace_root, plan_eff, env_config, internal_port
    )
    if split_prep:
        diag = dict(split_prep.phase_cmds.get("studio_launch_diagnostics") or {})
        split_prep.phase_cmds["studio_launch_diagnostics"] = {
            **diag,
            "mode": "studio_split_preview",
        }
        return split_prep, None
    if split_err:
        return None, split_err

    attempted: List[str] = []
    last_err: Optional[Tuple[str, str, str, Dict[str, Any]]] = None
    for norm_rel_candidate in _normalized_roots_to_try(plan_eff):
        cand_dir = workspace_root / norm_rel_candidate if norm_rel_candidate != "." else workspace_root
        if not cand_dir.is_dir():
            continue
        mp = dict(plan_eff)
        mp["app_root_rel"] = norm_rel_candidate

        attempted.append(norm_rel_candidate)
        prep, err = _prepare_single_root_studio_launch(
            project_dir,
            workspace_root=workspace_root,
            merged_plan=mp,
            env_config=env_config,
            internal_port=internal_port,
            compose_chain=compose_chain,
        )
        if prep:
            diag = dict(prep.phase_cmds.get("studio_launch_diagnostics") or {})
            prep.phase_cmds["studio_launch_diagnostics"] = {
                **diag,
                "candidate_app_roots_tried": attempted,
                "successful_app_root_rel": norm_rel_candidate,
            }
            return prep, None
        last_err = err

    if last_err:
        ph, cd, ms, diag = last_err
        merged = dict(diag or {})
        merged["candidate_app_roots_tried"] = attempted or _normalized_roots_to_try(plan_eff)
        return None, (ph, cd, ms, merged)

    return None, (
        "detect",
        "LAUNCH_PLAN_PACKAGE_ROOT_MISMATCH",
        "No usable workspace candidate directories were found.",
        {"candidate_app_roots_tried": attempted},
    )


def derive_studio_docker_exit_hint(
    *,
    exit_code_normalized: Any,
    log_tail: str,
    phase_cmds: Optional[Mapping[str, Any]],
    command_metadata: Optional[Mapping[str, Any]],
) -> str:
    """
    Human-oriented hint when Docker logs are thin but Studio shell conventions imply failure mode.
    """
    if not isinstance(exit_code_normalized, int):
        return ""
    pcm = dict(phase_cmds or {})
    meta = dict(command_metadata or {})
    strat = str(
        pcm.get("studio_split_toolchain_strategy")
        or meta.get("studio_split_toolchain_strategy")
        or ""
    ).strip()
    logs_empty = not str(log_tail or "").strip()

    if exit_code_normalized == 2 and strat == "embed_node_fallback":
        be_go = bool(pcm.get("studio_split_backend_has_go"))
        be_py = bool(pcm.get("studio_split_backend_has_python"))
        if be_go and not be_py:
            return (
                "Studio reserves exit code 2 for early bootstrap failures — embed-node split previews "
                "often hit TLS/firewall/arch when downloading Node inside the companion image. "
                "Markers show a Go-only split backend; `STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE` "
                "is not used in that branch. Set `STUDIO_RUNTIME_DOCKER_SPLIT_NODE_GO_IMAGE` "
                "(or `STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE`) to an image that includes Go and Node — "
                "see `backend/docker/studio-split-go-node.Dockerfile`. If logs are empty, "
                "run `docker logs <container>` immediately."
            )
        return (
            "Studio reserves exit code 2 for early bootstrap failures — with embed-node split previews "
            "this commonly means fetching Node (TLS/firewall/arch) inside the companion image failed. "
            "Use hybrid images (`STUDIO_RUNTIME_DOCKER_SPLIT_NODE_PYTHON_IMAGE`, `*_GO_IMAGE`, "
            "`STUDIO_RUNTIME_DOCKER_SPLIT_STACK_IMAGE`). If logs are empty, run `docker logs <container>` "
            "immediately."
        )
    if exit_code_normalized == 2 and logs_empty:
        return (
            "Exit code 2 with empty captured logs usually means `set -e` aborted before stderr reached "
            "Docker's log collector; check `docker logs <container>` on the host and verify install/start commands."
        )
    return ""


def format_container_exit_failure_message(
    *,
    inspect_state: Mapping[str, Any],
    log_tail: str,
    adapter_name: str,
    container_workdir: str,
    start_command: str,
    missing_hints: Mapping[str, Any],
    exit_hint: Optional[str] = None,
) -> str:
    ec_raw = inspect_state.get("exit_code")
    ec_norm = inspect_state.get("exit_code_normalized")
    lc_hint = str(inspect_state.get("docker_lifecycle_hint") or "").strip()
    if isinstance(ec_raw, int):
        ec_line = str(ec_raw)
    elif isinstance(ec_norm, int):
        extra = f"; {lc_hint}" if lc_hint else ""
        ec_line = (
            f"{ec_norm} (normalized — Docker raw exit unavailable{extra})"
        )
    else:
        ec_line = "unknown"
    lines = [
        "Runtime container exited before becoming HTTP-ready.",
        f"- exit_code: {ec_line}",
        f"- resolved_adapter: {adapter_name}",
        f"- container_workdir: {container_workdir}",
        f"- foreground_start_command: {start_command[:500]}",
    ]
    if exit_hint:
        lines.append(f"- hint: {exit_hint}")
    for k, v in missing_hints.items():
        if v:
            lines.append(f"- {k}: {v}")
    if missing_hints.get("topology_lifecycle_hint"):
        lines.append(
            "- note: `topology_lifecycle_hint` comes from scanning source files before run "
            "(e.g. localhost URLs); it frequently does not explain the Docker exit_code."
        )
    lines.append("")
    lines.append("--- log tail ---")
    lines.append((log_tail or "(no logs)")[-2200:])
    return "\n".join(lines)
