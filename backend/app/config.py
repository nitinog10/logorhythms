"""
Application configuration using Pydantic Settings
"""

from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings


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
    
    # Repository Storage
    repos_directory: str = "./repos"

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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra fields in .env file


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
