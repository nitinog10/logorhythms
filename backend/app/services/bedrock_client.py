"""
Shared AWS Bedrock client for all AI services.

Provides a unified async interface to Amazon Nova models via the
Bedrock Converse API with intelligent model routing:

  - Nova Micro  → simple tasks (configs, short summaries, < 50 lines)
  - Nova Lite   → standard tasks (functions, diagrams, mid-length narrations)
  - Nova Pro    → complex tasks (multi-file analysis, repo summaries, > 200 lines)
"""

import asyncio
import logging
import os
import time
from functools import partial
from typing import Optional

import boto3
from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Configuration (from Pydantic Settings, which reads .env) ─────────
_settings = get_settings()
BEDROCK_REGION = _settings.bedrock_region
BEDROCK_MAX_CONCURRENCY = _settings.bedrock_max_concurrency

# Model identifiers — cross-region inference profiles required outside us-east-1
# Mapping from AWS region prefix to Bedrock inference-profile prefix
_INFERENCE_PREFIX_MAP = {
    "us": "us",
    "eu": "eu",
    "ap": "apac",
}
_REGION_PREFIX = _INFERENCE_PREFIX_MAP.get(
    BEDROCK_REGION.split("-")[0], BEDROCK_REGION.split("-")[0]
)
NOVA_MICRO = f"{_REGION_PREFIX}.amazon.nova-micro-v1:0"
NOVA_LITE = f"{_REGION_PREFIX}.amazon.nova-lite-v1:0"
NOVA_PRO = f"{_REGION_PREFIX}.amazon.nova-pro-v1:0"

# ── Boto3 client (shared, thread-safe for read-only converse calls) ──
_boto_kwargs: dict = {"region_name": BEDROCK_REGION}
if _settings.aws_access_key_id and _settings.aws_secret_access_key:
    _boto_kwargs["aws_access_key_id"] = _settings.aws_access_key_id
    _boto_kwargs["aws_secret_access_key"] = _settings.aws_secret_access_key
_bedrock = boto3.client("bedrock-runtime", **_boto_kwargs)


# ── Core async wrapper ────────────────────────────────────────────────

async def _call_bedrock(
    model_id: str,
    prompt: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    use_latency_opt: bool = False,
    system_prompt: Optional[str] = None,
) -> str:
    """
    Call a Bedrock model via the Converse API.

    Args:
        model_id: Bedrock model identifier (e.g. ``amazon.nova-pro-v1:0``).
        prompt: User message text.
        max_tokens: Maximum tokens in the response.
        temperature: Sampling temperature.
        use_latency_opt: If True, adds ``performanceConfig.latency = "optimized"``.
        system_prompt: Optional system-level instruction (separate from user prompt).

    Returns:
        The model's text response.
    """
    kwargs: dict = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
    }

    if system_prompt:
        kwargs["system"] = [{"text": system_prompt}]

    # Note: performanceConfig.latency="optimized" is NOT supported for
    # cross-region inference profiles (e.g. apac.*). Only enable when using
    # direct model IDs in us-east-1.
    if use_latency_opt and not "." in model_id:
        kwargs["performanceConfig"] = {"latency": "optimized"}

    # Determine tier label for logging
    if "micro" in model_id:
        tier = "Nova Micro"
    elif "lite" in model_id:
        tier = "Nova Lite"
    else:
        tier = "Nova Pro"

    loop = asyncio.get_event_loop()
    t0 = time.perf_counter()
    resp = await loop.run_in_executor(None, partial(_bedrock.converse, **kwargs))
    latency_ms = (time.perf_counter() - t0) * 1000

    logger.info("Bedrock %s call completed in %.0f ms", tier, latency_ms)
    return resp["output"]["message"]["content"][0]["text"]


# ── Convenience wrappers ──────────────────────────────────────────────

async def call_nova_micro(prompt: str, max_tokens: int = 1024, **kw) -> str:
    """Simple tasks — configs, short summaries, small files."""
    return await _call_bedrock(NOVA_MICRO, prompt, max_tokens, **kw)


async def call_nova_lite(prompt: str, max_tokens: int = 2048, **kw) -> str:
    """Standard tasks — regular functions, diagrams, mid-length narrations."""
    return await _call_bedrock(NOVA_LITE, prompt, max_tokens, **kw)


async def call_nova_pro(prompt: str, max_tokens: int = 4096, **kw) -> str:
    """Complex tasks — multi-file analysis, repo summaries, long walkthroughs."""
    return await _call_bedrock(
        NOVA_PRO, prompt, max_tokens, use_latency_opt=True, **kw
    )


def call_nova_lite_sync(
    prompt: str,
    *,
    max_tokens: int = 2048,
    temperature: float = 0.2,
    system_prompt: Optional[str] = None,
) -> str:
    """Synchronous Nova Lite call for worker threads (e.g. ``surgical_edit_engine``).

    Avoids asyncio in threads run via ``asyncio.to_thread``.
    """
    kwargs: dict = {
        "modelId": NOVA_LITE,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
    }
    if system_prompt:
        kwargs["system"] = [{"text": system_prompt}]
    resp = _bedrock.converse(**kwargs)
    return resp["output"]["message"]["content"][0]["text"]
