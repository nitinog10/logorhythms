"""
Application configuration using Pydantic Settings
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.monorepo_paths import default_repos_dir

# Parent of the ``app/`` package — used to anchor relative ``repos_directory``.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
# Always load ``backend/.env`` when present, regardless of process cwd (uvicorn may start
# from repo root in some setups).
_DOTENV_PATH = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    secret_key: str = "change-me-in-production"
    
    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/docuverse"
    
    # GitHub OAuth
    github_client_id: str = "Ov23lipAHJ0el64psJc9"
    github_client_secret: str = "cd309ef803b76fb9b37c3c42d6999132871578f3"
    github_redirect_uri: str = "http://localhost:3000/api/auth/callback/github"
    
    # OpenAI
    openai_api_key: str = ""
    
    # ElevenLabs Text-to-Speech
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel voice
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    
    # AWS Configuration
    aws_region: str = "ap-south-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    dynamodb_table_prefix: str = "docusense"
    s3_audio_bucket: str = "docusense-audio"
    
    # AWS Bedrock
    bedrock_region: str = "ap-south-1"
    bedrock_max_concurrency: int = 6
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Studio previews — iframe can load via authenticated API proxy (Python API
    # stacks) instead of hitting loopback ports directly. Node dev servers disable
    # proxy by default (HMR / absolute asset paths). Set PUBLIC_API_BASE_URL when
    # the API sits behind TLS or a hostname that differs from where uvicorn listens.
    studio_runtime_mode: str = Field(
        default="host",
        description="Preview runtime backend: host|docker",
    )
    studio_preview_proxy_enabled: bool = Field(default=True)
    studio_preview_gateway_mode: str = Field(
        default="local",
        description="Preview URL surface: local|preview_domain",
    )
    studio_preview_domain: str = Field(
        default="",
        description="Public preview host (e.g. preview.docuverse.ai)",
    )
    public_api_base_url: str = Field(default="", description="e.g. https://api.example.com")
    studio_preview_docker_install: bool = Field(default=False)
    studio_runtime_docker_node_image: str = Field(default="node:20-bookworm-slim")
    studio_runtime_docker_python_image: str = Field(
        default="python:3.11-bookworm",
        description=(
            "Python image for Studio Docker API previews and pure-Python stacks. "
            "Use bookworm/full variants where possible; slim purges wget and complicates fallback."
        ),
    )
    studio_runtime_docker_split_stack_image: str = Field(
        default="",
        description=(
            "Optional adapter-owned image that already bundles Node/npm **and** the split "
            "backend runtime when no more specific hybrid image is set. When chosen for "
            "a split preview that would otherwise use `studio_embed_node`, that bootstrap "
            "is skipped. Prefer `studio_runtime_docker_split_node_python_image` / "
            "`studio_runtime_docker_split_node_go_image` when backends differ."
        ),
    )
    studio_runtime_docker_split_node_python_image: str = Field(
        default="",
        description=(
            "Hybrid image with Node/npm and Python tooling for JS frontend + FastAPI/Django/etc. "
            "split previews. Highest precedence for splits whose backend directory has Python "
            "markers (requirements.txt, pyproject.toml, setup.py). "
            "Example dev pull (pin/review trust for production): "
            "docker.io/nikolaik/python-nodejs:python3.11-nodejs20-bookworm"
        ),
    )
    studio_runtime_docker_split_node_go_image: str = Field(
        default="",
        description=(
            "Hybrid image with Node/npm and Go for JS frontend + Go API split previews. "
            "Used when the backend tree includes `go.mod`."
        ),
    )
    studio_runtime_allow_split_embed_node_fallback: bool = Field(
        default=False,
        description=(
            "When False (recommended for production), Node-based split previews (Next.js, "
            "Vite, etc.) beside Python/Go backends must set split hybrid image env vars; "
            "Studio refuses launch rather than downloading Node inside a non-Node image. "
            "Set True only for legacy/dev when hybrid images are unavailable."
        ),
    )
    studio_runtime_docker_run_timeout_seconds: int = Field(
        default=300,
        ge=30,
        le=1800,
        description=(
            "Subprocess timeout for ``docker run -d`` (includes image pulls on cold cache). "
            "Raise if Docker RUN fails with TimeoutExpired on slow networks / Docker Desktop."
        ),
    )
    studio_runtime_docker_go_image: str = Field(default="golang:1.22-bookworm")
    studio_runtime_cpus: float = Field(default=1.5)
    studio_runtime_memory: str = Field(default="2g")
    studio_runtime_pids_limit: int = Field(default=256)
    studio_runtime_start_timeout_seconds: int = Field(
        default=240,
        ge=20,
        le=3600,
        description=(
            "Max seconds to wait for the preview URL to respond after the Studio Docker "
            "container starts. Includes dependency install and first Next/Turbopack compile — "
            "raise (e.g. 360) on slow hosts or cold npm cache."
        ),
    )
    studio_runtime_http_probe_timeout_seconds: float = Field(
        default=25.0,
        ge=1.0,
        le=180.0,
        description=(
            "Per-attempt HTTP timeout when probing loopback for Studio preview readiness "
            "(Next.js / Turbopack first compile often exceeds a couple of seconds)."
        ),
    )
    studio_runtime_docker_post_mortem_retain_seconds: int = Field(
        default=120,
        ge=0,
        description=(
            "After a Studio preview container stops or fails, keep it this many seconds "
            "before deferred docker rm so inspect/logs remain available."
        ),
    )
    studio_runtime_docker_autoremove: bool = Field(
        default=False,
        description="If True, docker run uses --rm (discouraged; loses diagnostics on fast exits).",
    )
    studio_runtime_cleanup_interval_seconds: int = Field(default=60)
    studio_runtime_idle_timeout_seconds: int = Field(default=1800)
    studio_runtime_allow_custom_dockerfile: bool = Field(default=False)
    studio_runtime_custom_dockerfile_trusted_only: bool = Field(default=True)
    # Empty = omit --user so bind mounts (especially Docker Desktop on Windows) stay
    # writable; set e.g. "1000:1000" on Linux hosts that need a fixed UID.
    studio_runtime_docker_user: str = Field(default="")
    studio_gateway_provider: str = Field(
        default="none",
        description="Preview gateway backend: none|traefik_file",
    )
    studio_gateway_traefik_dynamic_config_path: str = Field(
        default="",
        description="Path to Traefik dynamic config file managed by Studio",
    )
    studio_gateway_traefik_entrypoint: str = Field(default="websecure")
    
    # Repository Storage. Default: sibling ``docuverse_data/repos`` beside
    # ``backend/`` in dev (avoids uvicorn reload on ``npm install``). Relative
    # values resolve under ``backend/``; overrides via REPOS_DIRECTORY in .env.
    repos_directory: str = Field(default_factory=default_repos_dir)

    @field_validator("repos_directory", mode="after")
    @classmethod
    def _normalize_repos_directory(cls, v: str) -> str:
        raw = (v or default_repos_dir()).strip()
        if not raw:
            raw = default_repos_dir()
        p = Path(raw)
        if not p.is_absolute():
            p = (_BACKEND_ROOT / p).resolve()
        else:
            p = p.resolve()
        return str(p)

    @field_validator("studio_runtime_mode", mode="after")
    @classmethod
    def _normalize_studio_runtime_mode(cls, v: str) -> str:
        mode = (v or "host").strip().lower()
        if mode not in {"host", "docker"}:
            raise ValueError("studio_runtime_mode must be 'host' or 'docker'")
        return mode

    @field_validator("studio_preview_gateway_mode", mode="after")
    @classmethod
    def _normalize_preview_gateway_mode(cls, v: str) -> str:
        mode = (v or "local").strip().lower()
        return mode if mode in {"local", "preview_domain"} else "local"

    @field_validator("studio_gateway_provider", mode="after")
    @classmethod
    def _normalize_studio_gateway_provider(cls, v: str) -> str:
        mode = (v or "none").strip().lower()
        return mode if mode in {"none", "traefik_file"} else "none"

    # DocuVerse Provenance (GitHub evidence + LLM synthesis)
    provenance_max_history_commits: int = 30
    provenance_max_prs: int = 15
    provenance_confidence_threshold: float = 0.35
    provenance_cache_ttl_seconds: int = 3600

    # DocuVerse Signal (Customer Voice-to-Code)
    linear_api_key: str = ""
    zendesk_subdomain: str = ""
    zendesk_api_token: str = ""
    intercom_access_token: str = ""
    signal_default_priority_threshold: float = 0.5
    signal_max_cluster_distance: float = 0.3

    # Razorpay Payment Gateway
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Stitch AI (Google) — App Studio
    stitch_api_key: str = ""

    # Studio surgical edits — when deterministic regex planner produces no ops but the
    # user has a valid anchor, call Bedrock Nova Lite to propose class/text edits.
    studio_surgical_llm_planner: bool = Field(
        default=True,
        description="Use Nova Lite for anchored edits when heuristic planner is empty.",
    )

    model_config = SettingsConfigDict(
        env_file=str(_DOTENV_PATH) if _DOTENV_PATH.is_file() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
