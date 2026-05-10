from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict


def _scan_text_files_for_patterns(
    root: Path, patterns: list[re.Pattern[str]], max_files: int = 120
) -> Dict[str, Any]:
    hits: dict[str, int] = {p.pattern: 0 for p in patterns}
    scanned = 0
    for p in root.rglob("*"):
        if scanned >= max_files:
            break
        if not p.is_file():
            continue
        parts = set(p.parts)
        if parts & {"node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache"}:
            continue
        if p.suffix.lower() not in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".env"}:
            continue
        scanned += 1
        try:
            txt = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for pat in patterns:
            if pat.search(txt):
                hits[pat.pattern] = int(hits.get(pat.pattern, 0)) + 1
    return {"scanned_files": scanned, "hits": hits}


def analyze_repo_topology(
    package_root: Path, plan: Dict[str, Any] | None, phase_cmds: Dict[str, Any]
) -> Dict[str, Any]:
    fw = str((plan or {}).get("framework") or "").lower()
    frontish = fw in {"vite", "nextjs", "remix", "nuxt", "sveltekit", "astro"}
    pkg_json = package_root / "package.json"
    pkg = {}
    if pkg_json.is_file():
        try:
            pkg = json.loads(pkg_json.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            pkg = {}
    deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
    scripts = pkg.get("scripts") or {}
    has_backend_signal = any(
        k in deps
        for k in ("express", "fastify", "koa", "@nestjs/core", "hono", "axios", "http-proxy-middleware")
    ) or any(k in scripts for k in ("api", "backend", "server", "dev:api"))
    vite_cfg = next(
        (
            package_root / n
            for n in ("vite.config.ts", "vite.config.js", "vite.config.mjs")
            if (package_root / n).is_file()
        ),
        None,
    )
    vite_proxy_hint = False
    if vite_cfg:
        try:
            cfg = vite_cfg.read_text(encoding="utf-8", errors="replace").lower()
            vite_proxy_hint = "proxy" in cfg and ("localhost" in cfg or "127.0.0.1" in cfg)
        except Exception:
            vite_proxy_hint = False

    scan = _scan_text_files_for_patterns(
        package_root,
        [
            re.compile(r"https?://localhost[:/]", re.I),
            re.compile(r"https?://127\.0\.0\.1[:/]", re.I),
            re.compile(r"\bfetch\s*\(", re.I),
            re.compile(r"\baxios\b", re.I),
            re.compile(r"\bnew\s+websocket\s*\(", re.I),
        ],
        max_files=120,
    )
    hits = scan.get("hits") or {}
    localhost_refs = int(hits.get(r"https?://localhost[:/]", 0)) + int(
        hits.get(r"https?://127\.0\.0\.1[:/]", 0)
    )
    topology_kind = "frontend_only"
    if frontish and has_backend_signal:
        topology_kind = "hybrid_frontend_backend"
    elif not frontish and has_backend_signal:
        topology_kind = "backend_or_fullstack_server"
    issues: list[Dict[str, str]] = []
    if frontish and localhost_refs > 0:
        issues.append(
            {
                "code": "LOCALHOST_API_USAGE_IN_PREVIEW",
                "message": "Frontend appears to call localhost/127.0.0.1 directly; this often breaks in containerized Studio preview.",
            }
        )
    if frontish and vite_proxy_hint:
        issues.append(
            {
                "code": "VITE_PROXY_TARGET_LOCALHOST",
                "message": "Vite proxy target appears localhost-bound; verify proxy target resolvability in runtime container topology.",
            }
        )
    return {
        "topology_kind": topology_kind,
        "frontend_framework": fw if frontish else None,
        "hybrid_repo_signals": bool(has_backend_signal),
        "vite_proxy_localhost_hint": bool(vite_proxy_hint),
        "localhost_reference_hits": localhost_refs,
        "scan_summary": scan,
        "potential_topology_issues": issues[:8],
        "lifecycle_category_hint": (
            "topology_mismatch" if issues else "post_start_application_state"
        ),
        "runtime_command": str(phase_cmds.get("start") or "").strip(),
    }

