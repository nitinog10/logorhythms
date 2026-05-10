"""Delegates to canonical Studio runtime failure classification (single source of truth)."""

from __future__ import annotations

from app.runtime_intel.failure_classifier import classify_runtime_failure

__all__ = ["classify_runtime_failure"]
