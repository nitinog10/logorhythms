"""
Persistence layer using AWS DynamoDB for structured data and S3 for audio files.

Replaces the previous file-based JSON persistence with cloud-native AWS services.
"""

import json
import os
import base64
from typing import Dict, Optional, Any, List
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings
from app.models.schemas import (
    Repository, User,
    WalkthroughScript, ScriptSegment, ViewMode,
    AudioWalkthrough, AudioSegment,
    ProvenanceCard, EvidenceLink, AssumptionEntry, StaleAssumptionAlert,
    DecisionThread, EvidenceSourceType, AssumptionStatus,
)

settings = get_settings()


# ---------------------------------------------------------------------------
# AWS Client Helpers
# ---------------------------------------------------------------------------

def _get_dynamodb_resource():
    """Get a boto3 DynamoDB resource"""
    kwargs = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.resource("dynamodb", **kwargs)


def _get_s3_client():
    """Get a boto3 S3 client"""
    kwargs = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("s3", **kwargs)


def _table_name(suffix: str) -> str:
    """Build full table name from prefix"""
    return f"{settings.dynamodb_table_prefix}_{suffix}"


def _safe_int(value, default=0):
    """Convert DynamoDB Decimal to int safely"""
    if value is None:
        return default
    return int(value)


def _safe_float(value, default=0.0):
    """Convert DynamoDB Decimal to float safely"""
    if value is None:
        return default
    return float(value)


# ---------------------------------------------------------------------------
# Repository Persistence
# ---------------------------------------------------------------------------

def save_repositories(repositories: Dict[str, Repository]):
    """Save repositories to DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("repositories"))

        with table.batch_writer() as batch:
            for repo_id, repo in repositories.items():
                item = {
                    "id": repo.id,
                    "user_id": repo.user_id,
                    "github_repo_id": repo.github_repo_id,
                    "name": repo.name,
                    "full_name": repo.full_name,
                    "description": repo.description or "",
                    "default_branch": repo.default_branch,
                    "language": repo.language or "",
                    "clone_url": repo.clone_url,
                    "local_path": repo.local_path or "",
                    "is_indexed": repo.is_indexed,
                    "indexed_at": repo.indexed_at.isoformat() if repo.indexed_at else "",
                    "created_at": repo.created_at.isoformat() if repo.created_at else "",
                    "source": repo.source or "github",
                }
                batch.put_item(Item=item)
    except Exception as e:
        print(f"Error saving repositories to DynamoDB: {e}")


def delete_repository(repo_id: str):
    """Delete a single repository from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("repositories"))
        table.delete_item(Key={"id": repo_id})
    except Exception as e:
        print(f"Error deleting repository from DynamoDB: {e}")


def load_repositories() -> Dict[str, Repository]:
    """Load repositories from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("repositories"))
        response = table.scan()

        repositories = {}
        for item in response.get("Items", []):
            indexed_at = None
            if item.get("indexed_at"):
                try:
                    indexed_at = datetime.fromisoformat(item["indexed_at"])
                except Exception:
                    pass

            created_at = datetime.now(timezone.utc)
            if item.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(item["created_at"])
                except Exception:
                    pass

            # Reconstruct local_path from current repos_directory
            stored_path = item.get("local_path") or None
            repo_id = item["id"]
            if stored_path:
                local_path = os.path.join(settings.repos_directory, repo_id)
            else:
                local_path = None

            # Infer source from ID prefix if not stored (backcompat)
            source = item.get("source") or ("upload" if repo_id.startswith("upload_") else "github")

            repositories[repo_id] = Repository(
                id=repo_id,
                user_id=item["user_id"],
                github_repo_id=_safe_int(item.get("github_repo_id")),
                name=item["name"],
                full_name=item["full_name"],
                description=item.get("description") or None,
                default_branch=item.get("default_branch", "main"),
                language=item.get("language") or None,
                clone_url=item["clone_url"],
                local_path=local_path,
                is_indexed=item.get("is_indexed", False),
                indexed_at=indexed_at,
                created_at=created_at,
                source=source,
            )

        # Handle pagination
        while response.get("LastEvaluatedKey"):
            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            for item in response.get("Items", []):
                indexed_at = None
                if item.get("indexed_at"):
                    try:
                        indexed_at = datetime.fromisoformat(item["indexed_at"])
                    except Exception:
                        pass
                created_at = datetime.now(timezone.utc)
                if item.get("created_at"):
                    try:
                        created_at = datetime.fromisoformat(item["created_at"])
                    except Exception:
                        pass

                stored_path = item.get("local_path") or None
                repo_id = item["id"]
                if stored_path:
                    local_path = os.path.join(settings.repos_directory, repo_id)
                else:
                    local_path = None

                # Infer source from ID prefix if not stored (backcompat)
                source = item.get("source") or ("upload" if repo_id.startswith("upload_") else "github")

                repositories[repo_id] = Repository(
                    id=repo_id,
                    user_id=item["user_id"],
                    github_repo_id=_safe_int(item.get("github_repo_id")),
                    name=item["name"],
                    full_name=item["full_name"],
                    description=item.get("description") or None,
                    default_branch=item.get("default_branch", "main"),
                    language=item.get("language") or None,
                    clone_url=item["clone_url"],
                    local_path=local_path,
                    is_indexed=item.get("is_indexed", False),
                    indexed_at=indexed_at,
                    created_at=created_at,
                    source=source,
                )

        return repositories
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"⚠️ DynamoDB table '{_table_name('repositories')}' not found.")
        else:
            print(f"Error loading repositories: {e}")
        return {}
    except Exception as e:
        print(f"Error loading repositories: {e}")
        return {}


# ---------------------------------------------------------------------------
# User Persistence
# ---------------------------------------------------------------------------

def save_users(users: Dict[str, User]):
    """Save users to DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("users"))

        with table.batch_writer() as batch:
            for user_id, user in users.items():
                item = {
                    "id": user.id,
                    "github_id": user.github_id,
                    "username": user.username,
                    "email": user.email or "",
                    "avatar_url": user.avatar_url or "",
                    "access_token": user.access_token,
                    "created_at": user.created_at.isoformat() if user.created_at else "",
                }
                batch.put_item(Item=item)
    except Exception as e:
        print(f"Error saving users to DynamoDB: {e}")


def load_users() -> Dict[str, User]:
    """Load users from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("users"))
        response = table.scan()

        users = {}
        for item in response.get("Items", []):
            created_at = datetime.now(timezone.utc)
            if item.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(item["created_at"])
                except Exception:
                    pass

            users[item["id"]] = User(
                id=item["id"],
                github_id=_safe_int(item.get("github_id")),
                username=item["username"],
                email=item.get("email") or None,
                avatar_url=item.get("avatar_url") or None,
                access_token=item["access_token"],
                created_at=created_at,
            )

        return users
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"⚠️ DynamoDB table '{_table_name('users')}' not found.")
        else:
            print(f"Error loading users: {e}")
        return {}
    except Exception as e:
        print(f"Error loading users: {e}")
        return {}


# ---------------------------------------------------------------------------
# Walkthrough Persistence
# ---------------------------------------------------------------------------

def save_walkthroughs(walkthroughs: Dict[str, WalkthroughScript]):
    """Save walkthrough scripts to DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("walkthroughs"))

        with table.batch_writer() as batch:
            for wt_id, wt in walkthroughs.items():
                segments_data = [
                    {
                        "id": seg.id,
                        "order": seg.order,
                        "text": seg.text,
                        "start_line": seg.start_line,
                        "end_line": seg.end_line,
                        "highlight_lines": seg.highlight_lines,
                        "duration_estimate": str(seg.duration_estimate),
                        "code_context": seg.code_context or "",
                    }
                    for seg in wt.segments
                ]

                item = {
                    "id": wt.id,
                    "file_path": wt.file_path,
                    "title": wt.title,
                    "summary": wt.summary,
                    "view_mode": wt.view_mode.value,
                    "segments_json": json.dumps(segments_data),
                    "total_duration": str(wt.total_duration),
                    "created_at": wt.created_at.isoformat() if wt.created_at else "",
                    "metadata_json": json.dumps(wt.metadata, default=str),
                }
                batch.put_item(Item=item)
    except Exception as e:
        print(f"Error saving walkthroughs to DynamoDB: {e}")


def delete_walkthrough_record(walkthrough_id: str):
    """Delete a single walkthrough from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("walkthroughs"))
        table.delete_item(Key={"id": walkthrough_id})
    except Exception as e:
        print(f"Error deleting walkthrough from DynamoDB: {e}")


def load_walkthroughs() -> Dict[str, WalkthroughScript]:
    """Load walkthrough scripts from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("walkthroughs"))
        response = table.scan()

        walkthroughs: Dict[str, WalkthroughScript] = {}
        for item in response.get("Items", []):
            created_at = datetime.now(timezone.utc)
            if item.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(item["created_at"])
                except Exception:
                    pass

            segments_data = json.loads(item.get("segments_json", "[]"))
            segments = [
                ScriptSegment(
                    id=seg["id"],
                    order=seg["order"],
                    text=seg["text"],
                    start_line=seg["start_line"],
                    end_line=seg["end_line"],
                    highlight_lines=seg.get("highlight_lines", []),
                    duration_estimate=float(seg.get("duration_estimate", 0)),
                    code_context=seg.get("code_context") or None,
                )
                for seg in segments_data
            ]

            metadata = json.loads(item.get("metadata_json", "{}"))

            walkthroughs[item["id"]] = WalkthroughScript(
                id=item["id"],
                file_path=item["file_path"],
                title=item["title"],
                summary=item["summary"],
                view_mode=ViewMode(item.get("view_mode", "developer")),
                segments=segments,
                total_duration=float(item.get("total_duration", 0)),
                created_at=created_at,
                metadata=metadata,
            )

        return walkthroughs
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"⚠️ DynamoDB table '{_table_name('walkthroughs')}' not found.")
        else:
            print(f"Error loading walkthroughs: {e}")
        return {}
    except Exception as e:
        print(f"Error loading walkthroughs: {e}")
        return {}


# ---------------------------------------------------------------------------
# Audio Walkthrough Persistence
# ---------------------------------------------------------------------------

def save_audio_walkthroughs(audio_walkthroughs: Dict[str, AudioWalkthrough]):
    """Save audio walkthrough metadata to DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("audio_walkthroughs"))

        with table.batch_writer() as batch:
            for aw_id, aw in audio_walkthroughs.items():
                segments_data = [
                    {
                        "id": seg.id,
                        "script_segment_id": seg.script_segment_id,
                        "audio_url": seg.audio_url,
                        "duration": str(seg.duration),
                        "start_time": str(seg.start_time),
                        "end_time": str(seg.end_time),
                    }
                    for seg in aw.audio_segments
                ]

                item = {
                    "id": aw.id,
                    "walkthrough_script_id": aw.walkthrough_script_id,
                    "file_path": aw.file_path,
                    "audio_segments_json": json.dumps(segments_data),
                    "full_audio_url": aw.full_audio_url or "",
                    "total_duration": str(aw.total_duration),
                    "created_at": aw.created_at.isoformat() if aw.created_at else "",
                }
                batch.put_item(Item=item)
    except Exception as e:
        print(f"Error saving audio walkthroughs to DynamoDB: {e}")


def delete_audio_walkthrough(walkthrough_id: str):
    """Delete a single audio walkthrough from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("audio_walkthroughs"))
        table.delete_item(Key={"id": walkthrough_id})
    except Exception as e:
        print(f"Error deleting audio walkthrough from DynamoDB: {e}")


def load_audio_walkthroughs() -> Dict[str, AudioWalkthrough]:
    """Load audio walkthrough metadata from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("audio_walkthroughs"))
        response = table.scan()

        audio_walkthroughs: Dict[str, AudioWalkthrough] = {}
        for item in response.get("Items", []):
            created_at = datetime.now(timezone.utc)
            if item.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(item["created_at"])
                except Exception:
                    pass

            segments_data = json.loads(item.get("audio_segments_json", "[]"))
            audio_segments = [
                AudioSegment(
                    id=seg["id"],
                    script_segment_id=seg["script_segment_id"],
                    audio_url=seg["audio_url"],
                    duration=float(seg["duration"]),
                    start_time=float(seg["start_time"]),
                    end_time=float(seg["end_time"]),
                )
                for seg in segments_data
            ]

            audio_walkthroughs[item["id"]] = AudioWalkthrough(
                id=item["id"],
                walkthrough_script_id=item["walkthrough_script_id"],
                file_path=item["file_path"],
                audio_segments=audio_segments,
                full_audio_url=item.get("full_audio_url") or None,
                total_duration=float(item.get("total_duration", 0)),
                created_at=created_at,
            )

        return audio_walkthroughs
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"⚠️ DynamoDB table '{_table_name('audio_walkthroughs')}' not found.")
        else:
            print(f"Error loading audio walkthroughs: {e}")
        return {}
    except Exception as e:
        print(f"Error loading audio walkthroughs: {e}")
        return {}


# ---------------------------------------------------------------------------
# Audio Bytes (S3)
# ---------------------------------------------------------------------------

def save_audio_bytes(audio_bytes_store: Dict[str, bytes]):
    """Save audio bytes to S3"""
    try:
        s3 = _get_s3_client()
        for wt_id, audio_data in audio_bytes_store.items():
            s3.put_object(
                Bucket=settings.s3_audio_bucket,
                Key=f"audio/{wt_id}.mp3",
                Body=audio_data,
                ContentType="audio/mpeg",
            )
    except Exception as e:
        print(f"Error saving audio bytes to S3: {e}")


def load_audio_bytes() -> Dict[str, bytes]:
    """Load audio bytes from S3"""
    try:
        s3 = _get_s3_client()
        audio_bytes_store: Dict[str, bytes] = {}

        # List all audio files in the bucket
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(
            Bucket=settings.s3_audio_bucket, Prefix="audio/"
        ):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".mp3"):
                    wt_id = key.replace("audio/", "").replace(".mp3", "")
                    response = s3.get_object(
                        Bucket=settings.s3_audio_bucket, Key=key
                    )
                    audio_bytes_store[wt_id] = response["Body"].read()

        return audio_bytes_store
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchBucket":
            print(f"⚠️ S3 bucket '{settings.s3_audio_bucket}' not found.")
        else:
            print(f"Error loading audio bytes from S3: {e}")
        return {}
    except Exception as e:
        print(f"Error loading audio bytes from S3: {e}")
        return {}


def delete_audio_bytes(walkthrough_id: str):
    """Delete audio bytes file for a specific walkthrough from S3"""
    try:
        s3 = _get_s3_client()
        s3.delete_object(
            Bucket=settings.s3_audio_bucket,
            Key=f"audio/{walkthrough_id}.mp3",
        )
    except Exception as e:
        print(f"Error deleting audio bytes from S3: {e}")


# ---------------------------------------------------------------------------
# Documentation Cache Persistence
# ---------------------------------------------------------------------------

def save_documentation_cache(docs_cache: Dict[str, Any]):
    """Save documentation cache to DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("documentation_cache"))

        with table.batch_writer() as batch:
            for repo_id, doc_data in docs_cache.items():
                item = {
                    "repo_id": repo_id,
                    "data_json": json.dumps(doc_data, default=str),
                }
                batch.put_item(Item=item)
    except Exception as e:
        print(f"Error saving documentation cache to DynamoDB: {e}")


def load_documentation_cache() -> Dict[str, Any]:
    """Load documentation cache from DynamoDB"""
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("documentation_cache"))
        response = table.scan()

        docs_cache = {}
        for item in response.get("Items", []):
            docs_cache[item["repo_id"]] = json.loads(
                item.get("data_json", "{}")
            )

        return docs_cache
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            print(f"⚠️ DynamoDB table '{_table_name('documentation_cache')}' not found.")
        else:
            print(f"Error loading documentation cache: {e}")
        return {}
    except Exception as e:
        print(f"Error loading documentation cache: {e}")
        return {}


# ---------------------------------------------------------------------------
# GitHub Automation History Persistence
# ---------------------------------------------------------------------------

# In-memory fallback for when DynamoDB table doesn't exist yet
_automation_history_cache: Dict[str, dict] = {}


def save_automation_history(full_name: str, data: dict):
    """Save automation history for a repo (owner/repo) to DynamoDB with in-memory fallback."""
    _automation_history_cache[full_name] = data
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("automation_history"))
        table.put_item(Item={
            "full_name": full_name,
            "data_json": json.dumps(data, default=str),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving automation history to DynamoDB: {e}")
    except Exception as e:
        print(f"Error saving automation history to DynamoDB: {e}")


def load_automation_history(full_name: str) -> dict:
    """Load automation history for a repo. Falls back to in-memory cache."""
    # Try in-memory first (fast path + covers DynamoDB-missing scenario)
    if full_name in _automation_history_cache:
        return _automation_history_cache[full_name]

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("automation_history"))
        resp = table.get_item(Key={"full_name": full_name})
        item = resp.get("Item")
        if item:
            data = json.loads(item.get("data_json", "{}"))
            _automation_history_cache[full_name] = data
            return data
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading automation history from DynamoDB: {e}")
    except Exception as e:
        print(f"Error loading automation history from DynamoDB: {e}")

    return {}


# ---------------------------------------------------------------------------
# Provenance cards (per repo + file + symbol)
# ---------------------------------------------------------------------------

_provenance_memory: Dict[str, dict] = {}


def _provenance_memory_key(repo_id: str, file_path: str, symbol: Optional[str]) -> str:
    return f"{repo_id}\0{file_path}\0{symbol or '__file__'}"


def _provenance_sort_key(file_path: str, symbol: Optional[str]) -> str:
    return f"{file_path}\0{symbol or '__file__'}"


def _card_from_json(data: dict) -> ProvenanceCard:
    evs = []
    for e in data.get("evidence_links", []):
        st = e.get("source_type", "commit")
        try:
            st_enum = EvidenceSourceType(st)
        except ValueError:
            st_enum = EvidenceSourceType.OTHER
        ca = e.get("created_at")
        created = None
        if ca:
            try:
                created = datetime.fromisoformat(ca.replace("Z", "+00:00"))
            except Exception:
                pass
        evs.append(
            EvidenceLink(
                id=e["id"],
                source_type=st_enum,
                source_url=e.get("source_url", ""),
                title=e.get("title", ""),
                excerpt=e.get("excerpt", ""),
                confidence=float(e.get("confidence", 0.5)),
                created_at=created,
            )
        )
    assumptions = []
    for a in data.get("assumptions", []):
        st = a.get("status", "unknown")
        try:
            ast = AssumptionStatus(st)
        except ValueError:
            ast = AssumptionStatus.UNKNOWN
        lv = a.get("last_validated_at")
        last_v = None
        if lv:
            try:
                last_v = datetime.fromisoformat(lv.replace("Z", "+00:00"))
            except Exception:
                pass
        assumptions.append(
            AssumptionEntry(
                id=a["id"],
                statement=a.get("statement", ""),
                status=ast,
                confidence=float(a.get("confidence", 0.5)),
                evidence_ids=a.get("evidence_ids", []),
                last_validated_at=last_v,
            )
        )
    stale = []
    for s in data.get("stale_assumptions", []):
        stale.append(
            StaleAssumptionAlert(
                id=s["id"],
                assumption_id=s.get("assumption_id", ""),
                statement=s.get("statement", ""),
                file_path=s.get("file_path", ""),
                symbol=s.get("symbol"),
                reason=s.get("reason", ""),
                severity=s.get("severity", "medium"),
                evidence_ids=s.get("evidence_ids", []),
            )
        )
    threads = []
    for t in data.get("decision_threads", []):
        threads.append(
            DecisionThread(
                id=t["id"],
                summary=t.get("summary", ""),
                evidence_ids=t.get("evidence_ids", []),
                confidence=float(t.get("confidence", 0.5)),
            )
        )
    cr = data.get("created_at")
    up = data.get("updated_at")
    created_at = datetime.now(timezone.utc)
    updated_at = datetime.now(timezone.utc)
    if cr:
        try:
            created_at = datetime.fromisoformat(cr.replace("Z", "+00:00"))
        except Exception:
            pass
    if up:
        try:
            updated_at = datetime.fromisoformat(up.replace("Z", "+00:00"))
        except Exception:
            pass

    return ProvenanceCard(
        id=data["id"],
        repo_id=data["repo_id"],
        file_path=data["file_path"],
        symbol=data.get("symbol"),
        symbol_type=data.get("symbol_type"),
        current_purpose=data.get("current_purpose", ""),
        origin_summary=data.get("origin_summary", ""),
        decision_summary=data.get("decision_summary", ""),
        assumptions=assumptions,
        stale_assumptions=stale,
        safe_change_notes=data.get("safe_change_notes", []),
        evidence_links=evs,
        confidence_score=float(data.get("confidence_score", 0.5)),
        decision_threads=threads,
        created_at=created_at,
        updated_at=updated_at,
        metadata=data.get("metadata") or {},
    )


def _card_to_dict(card: ProvenanceCard) -> dict:
    return json.loads(card.model_dump_json())


def save_provenance_card(card: ProvenanceCard) -> None:
    """Persist a single provenance card (DynamoDB + in-memory fallback)."""
    key = _provenance_memory_key(card.repo_id, card.file_path, card.symbol)
    _provenance_memory[key] = _card_to_dict(card)

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("provenance"))
        sk = _provenance_sort_key(card.file_path, card.symbol)
        table.put_item(
            Item={
                "repo_id": card.repo_id,
                "sk": sk,
                "file_path": card.file_path,
                "symbol": card.symbol or "",
                "updated_at": card.updated_at.isoformat(),
                "card_json": json.dumps(_card_to_dict(card), default=str),
            }
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving provenance card: {e}")
    except Exception as e:
        print(f"Error saving provenance card: {e}")


def load_provenance_card(repo_id: str, file_path: str, symbol: Optional[str]) -> Optional[ProvenanceCard]:
    """Load provenance card if present."""
    mem_key = _provenance_memory_key(repo_id, file_path, symbol)
    raw = _provenance_memory.get(mem_key)
    if raw:
        return _card_from_json(raw)

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("provenance"))
        sk = _provenance_sort_key(file_path, symbol)
        resp = table.get_item(Key={"repo_id": repo_id, "sk": sk})
        item = resp.get("Item")
        if not item:
            return None
        data = json.loads(item.get("card_json", "{}"))
        card = _card_from_json(data)
        _provenance_memory[mem_key] = _card_to_dict(card)
        return card
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading provenance card: {e}")
        return None
    except Exception as e:
        print(f"Error loading provenance card: {e}")
        return None


def delete_provenance_card(repo_id: str, file_path: str, symbol: Optional[str]) -> None:
    mem_key = _provenance_memory_key(repo_id, file_path, symbol)
    _provenance_memory.pop(mem_key, None)
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("provenance"))
        sk = _provenance_sort_key(file_path, symbol)
        table.delete_item(Key={"repo_id": repo_id, "sk": sk})
    except Exception as e:
        print(f"Error deleting provenance card: {e}")


def list_provenance_cards_for_repo(repo_id: str) -> List[ProvenanceCard]:
    """Query all provenance cards for a repository (for stale-assumption rollup)."""
    out: List[ProvenanceCard] = []
    seen_sk: set[str] = set()
    for k, v in _provenance_memory.items():
        if k.startswith(repo_id + "\0"):
            try:
                card = _card_from_json(v)
                sk = _provenance_sort_key(card.file_path, card.symbol)
                if sk not in seen_sk:
                    seen_sk.add(sk)
                    out.append(card)
            except Exception:
                continue

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("provenance"))
        resp = table.query(
            KeyConditionExpression="repo_id = :r",
            ExpressionAttributeValues={":r": repo_id},
        )
        for item in resp.get("Items", []):
            sk = item.get("sk", "")
            if sk in seen_sk:
                continue
            seen_sk.add(sk)
            try:
                data = json.loads(item.get("card_json", "{}"))
                out.append(_card_from_json(data))
            except Exception:
                continue
        while "LastEvaluatedKey" in resp:
            resp = table.query(
                KeyConditionExpression="repo_id = :r",
                ExpressionAttributeValues={":r": repo_id},
                ExclusiveStartKey=resp["LastEvaluatedKey"],
            )
            for item in resp.get("Items", []):
                sk = item.get("sk", "")
                if sk in seen_sk:
                    continue
                seen_sk.add(sk)
                try:
                    data = json.loads(item.get("card_json", "{}"))
                    out.append(_card_from_json(data))
                except Exception:
                    continue
        return out
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error listing provenance cards: {e}")
        return out
    except Exception as e:
        print(f"Error listing provenance cards: {e}")
        return out


# ---------------------------------------------------------------------------
# Signal Persistence (Customer Voice-to-Code)
# ---------------------------------------------------------------------------

_signal_configs_memory: Dict[str, dict] = {}
_signals_memory: Dict[str, dict] = {}
_signal_packets_memory: Dict[str, dict] = {}
_signal_clusters_memory: Dict[str, dict] = {}


# ── Signal Config ──

def save_signal_config(config_data: dict) -> None:
    """Save signal source config (DynamoDB + in-memory fallback)."""
    key = config_data.get("repo_id", "")
    _signal_configs_memory[key] = config_data
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_configs"))
        table.put_item(Item={
            "repo_id": key,
            "data_json": json.dumps(config_data, default=str),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving signal config: {e}")
    except Exception as e:
        print(f"Error saving signal config: {e}")


def load_signal_config(repo_id: str) -> Optional[dict]:
    """Load signal source config for a repo."""
    if repo_id in _signal_configs_memory:
        return _signal_configs_memory[repo_id]
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_configs"))
        resp = table.get_item(Key={"repo_id": repo_id})
        item = resp.get("Item")
        if item:
            data = json.loads(item.get("data_json", "{}"))
            _signal_configs_memory[repo_id] = data
            return data
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading signal config: {e}")
    except Exception as e:
        print(f"Error loading signal config: {e}")
    return None


# ── Customer Signals ──

def save_customer_signal(signal_data: dict) -> None:
    """Save a customer signal (DynamoDB + in-memory)."""
    sid = signal_data.get("id", "")
    _signals_memory[sid] = signal_data
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signals"))
        table.put_item(Item={
            "repo_id": signal_data.get("repo_id", ""),
            "id": sid,
            "data_json": json.dumps(signal_data, default=str),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving customer signal: {e}")
    except Exception as e:
        print(f"Error saving customer signal: {e}")


def load_customer_signals(repo_id: str) -> List[dict]:
    """Load all customer signals for a repo."""
    results = []
    seen_ids: set = set()

    # In-memory first
    for sid, data in _signals_memory.items():
        if data.get("repo_id") == repo_id:
            results.append(data)
            seen_ids.add(sid)

    # DynamoDB
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signals"))
        resp = table.query(
            KeyConditionExpression="repo_id = :r",
            ExpressionAttributeValues={":r": repo_id},
        )
        for item in resp.get("Items", []):
            sid = item.get("id", "")
            if sid in seen_ids:
                continue
            seen_ids.add(sid)
            data = json.loads(item.get("data_json", "{}"))
            _signals_memory[sid] = data
            results.append(data)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading signals: {e}")
    except Exception as e:
        print(f"Error loading signals: {e}")

    return results


# ── Signal Packets ──

def save_signal_packet(packet_data: dict) -> None:
    """Save a signal packet (DynamoDB + in-memory)."""
    pid = packet_data.get("id", "")
    _signal_packets_memory[pid] = packet_data
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_packets"))
        table.put_item(Item={
            "repo_id": packet_data.get("repo_id", ""),
            "id": pid,
            "data_json": json.dumps(packet_data, default=str),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving signal packet: {e}")
    except Exception as e:
        print(f"Error saving signal packet: {e}")


def load_signal_packets(repo_id: str) -> List[dict]:
    """Load all signal packets for a repo."""
    results = []
    seen_ids: set = set()

    for pid, data in _signal_packets_memory.items():
        if data.get("repo_id") == repo_id:
            results.append(data)
            seen_ids.add(pid)

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_packets"))
        resp = table.query(
            KeyConditionExpression="repo_id = :r",
            ExpressionAttributeValues={":r": repo_id},
        )
        for item in resp.get("Items", []):
            pid = item.get("id", "")
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            data = json.loads(item.get("data_json", "{}"))
            _signal_packets_memory[pid] = data
            results.append(data)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading signal packets: {e}")
    except Exception as e:
        print(f"Error loading signal packets: {e}")

    return results


def load_signal_packet(packet_id: str) -> Optional[dict]:
    """Load a single signal packet by ID."""
    if packet_id in _signal_packets_memory:
        return _signal_packets_memory[packet_id]
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_packets"))
        # Scan with filter since we don't have the partition key
        resp = table.scan(
            FilterExpression="id = :pid",
            ExpressionAttributeValues={":pid": packet_id},
            Limit=1,
        )
        items = resp.get("Items", [])
        if items:
            data = json.loads(items[0].get("data_json", "{}"))
            _signal_packets_memory[packet_id] = data
            return data
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading signal packet: {e}")
    except Exception as e:
        print(f"Error loading signal packet: {e}")
    return None


# ── Signal Clusters ──

def save_signal_cluster(cluster_data: dict) -> None:
    """Save a signal cluster (DynamoDB + in-memory)."""
    cid = cluster_data.get("id", "")
    _signal_clusters_memory[cid] = cluster_data
    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_clusters"))
        table.put_item(Item={
            "repo_id": cluster_data.get("repo_id", ""),
            "id": cid,
            "data_json": json.dumps(cluster_data, default=str),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving signal cluster: {e}")
    except Exception as e:
        print(f"Error saving signal cluster: {e}")


def load_signal_clusters(repo_id: str) -> List[dict]:
    """Load all signal clusters for a repo."""
    results = []
    seen_ids: set = set()

    for cid, data in _signal_clusters_memory.items():
        if data.get("repo_id") == repo_id:
            results.append(data)
            seen_ids.add(cid)

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("signal_clusters"))
        resp = table.query(
            KeyConditionExpression="repo_id = :r",
            ExpressionAttributeValues={":r": repo_id},
        )
        for item in resp.get("Items", []):
            cid = item.get("id", "")
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            data = json.loads(item.get("data_json", "{}"))
            _signal_clusters_memory[cid] = data
            results.append(data)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading signal clusters: {e}")
    except Exception as e:
        print(f"Error loading signal clusters: {e}")

    return results


# ---------------------------------------------------------------------------
# Subscription Persistence
# ---------------------------------------------------------------------------

_subscription_memory: Dict[str, dict] = {}


def save_subscription(sub_data: dict) -> None:
    """Save a subscription record to DynamoDB + in-memory cache."""
    user_id = sub_data["user_id"]
    _subscription_memory[user_id] = sub_data

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("subscriptions"))
        table.put_item(Item={
            "user_id": user_id,
            "data_json": json.dumps(sub_data, default=str),
            "tier": sub_data.get("tier", "free"),
            "updated_at": sub_data.get("updated_at", datetime.now(timezone.utc).isoformat()),
        })
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error saving subscription to DynamoDB: {e}")
    except Exception as e:
        print(f"Error saving subscription to DynamoDB: {e}")


def load_subscription(user_id: str) -> Optional[dict]:
    """Load a subscription record for a user."""
    # In-memory fast path
    if user_id in _subscription_memory:
        return _subscription_memory[user_id]

    try:
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("subscriptions"))
        resp = table.get_item(Key={"user_id": user_id})
        item = resp.get("Item")
        if item:
            data = json.loads(item.get("data_json", "{}"))
            _subscription_memory[user_id] = data
            return data
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            print(f"Error loading subscription from DynamoDB: {e}")
    except Exception as e:
        print(f"Error loading subscription from DynamoDB: {e}")

    return None


def update_subscription_usage(user_id: str, feature: str, increment: int = 1) -> dict:
    """Increment a usage counter for a user's subscription. Returns updated usage dict."""
    sub = load_subscription(user_id)
    if not sub:
        # Create a default free subscription
        sub = {
            "user_id": user_id,
            "tier": "free",
            "currency": "INR",
            "status": "active",
            "usage": {
                "walkthroughs": 0,
                "signals": 0,
                "provenance": 0,
                "explains": 0,
                "repos": 0,
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    usage = sub.get("usage", {})
    usage[feature] = usage.get(feature, 0) + increment
    sub["usage"] = usage
    sub["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_subscription(sub)
    return usage


def reset_subscription_usage(user_id: str) -> None:
    """Reset all monthly usage counters to 0 (called at period start)."""
    sub = load_subscription(user_id)
    if not sub:
        return

    sub["usage"] = {
        "walkthroughs": 0,
        "signals": 0,
        "provenance": 0,
        "explains": 0,
        "repos": 0,
    }
    sub["updated_at"] = datetime.now(timezone.utc).isoformat()
    save_subscription(sub)

