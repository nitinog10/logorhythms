"""Shim: canonical implementation lives in ``app.runtime_intel.readiness_engine``."""

from __future__ import annotations

from app.runtime_intel.readiness_engine import http_probe, probe_runtime_ready

__all__ = ["http_probe", "probe_runtime_ready"]
