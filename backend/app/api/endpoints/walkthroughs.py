"""
Walkthrough Generation Endpoints - The Core Auto-Cast Feature
"""

import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from fastapi.responses import Response

from app.config import get_settings
from app.models.schemas import (
    WalkthroughRequest,
    WalkthroughScript,
    ScriptSegment,
    AudioWalkthrough,
    AudioSegment,
    ViewMode,
    APIResponse,
)
from app.api.endpoints.auth import get_current_user
from app.api.endpoints.repositories import repositories_db, _ensure_repo_cloned
from app.services.persistence import (
    save_walkthroughs, load_walkthroughs,
    save_audio_walkthroughs, load_audio_walkthroughs,
    save_audio_bytes, load_audio_bytes, delete_audio_bytes,
    delete_walkthrough_record, delete_audio_walkthrough,
)

router = APIRouter()
settings = get_settings()

# Load persisted walkthrough data (survives server restarts)
walkthroughs_db: dict[str, WalkthroughScript] = load_walkthroughs()
audio_walkthroughs_db: dict[str, AudioWalkthrough] = load_audio_walkthroughs()
audio_bytes_store: dict[str, bytes] = load_audio_bytes()
audio_failed: dict[str, str] = {}  # walkthrough_id → error message
audio_generating: set[str] = set()  # walkthrough IDs currently being generated
print(f"[walkthroughs] Loaded {len(walkthroughs_db)} walkthroughs, {len(audio_walkthroughs_db)} audio records from disk")


@router.post("/generate", response_model=WalkthroughScript)
async def generate_walkthrough(
    request: WalkthroughRequest,
    background_tasks: BackgroundTasks,
    authorization: str = Header(None)
):
    """Generate a walkthrough script for a file"""
    from app.services.script_generator import ScriptGeneratorService
    from app.services.parser import ParserService
    
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(request.repository_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    if not repo.local_path:
        raise HTTPException(status_code=400, detail="Repository not cloned yet")
    
    # Re-clone if local files are missing (App Runner restart)
    if not os.path.exists(repo.local_path):
        if repo.source == "upload":
            raise HTTPException(
                status_code=400,
                detail="Uploaded project files are no longer available. Please re-upload the ZIP file.",
            )
        await _ensure_repo_cloned(repo, user.access_token)
        if not repo.local_path or not os.path.exists(repo.local_path):
            raise HTTPException(
                status_code=500,
                detail="Failed to re-download repository files. Please try reconnecting the repository.",
            )
    
    # Read file content
    safe_path = os.path.normpath(request.file_path).lstrip(os.sep).lstrip("/")
    full_path = os.path.join(repo.local_path, safe_path)
    
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")
    
    # ── Smart file filtering: reject low-value files ─────────────────
    _BLOCKED_EXTENSIONS = {
        ".md", ".txt", ".rst", ".json", ".yaml", ".yml", ".toml", ".cfg",
        ".ini", ".csv", ".xml", ".env", ".gitignore", ".editorconfig",
        ".lock", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
        ".woff", ".woff2", ".ttf", ".eot", ".map", ".min.js", ".min.css",
        ".log", ".pid", ".DS_Store",
    }
    _BLOCKED_FILENAMES = {
        "readme.md", "readme.txt", "readme.rst", "readme",
        "license", "license.md", "license.txt",
        "changelog.md", "changelog.txt", "changelog",
        "contributing.md", "code_of_conduct.md",
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
        "composer.lock", "gemfile.lock", "poetry.lock",
        ".prettierrc", ".prettierrc.json", ".prettierrc.yaml",
        ".eslintrc", ".eslintrc.json", ".eslintrc.js",
        "tsconfig.json", "jsconfig.json",
        ".babelrc", ".babelrc.json",
        ".dockerignore", ".gitattributes",
        "makefile", "dockerfile", "procfile",
    }

    file_basename = os.path.basename(safe_path).lower()
    _, file_ext = os.path.splitext(file_basename)

    if file_ext in _BLOCKED_EXTENSIONS or file_basename in _BLOCKED_FILENAMES:
        raise HTTPException(
            status_code=400,
            detail="Walkthroughs are only generated for source code files. "
                   f"'{os.path.basename(safe_path)}' is a config/doc/asset file and not eligible.",
        )

    # Parse file to get structure
    parser = ParserService()
    language = parser.detect_language(safe_path)
    
    if not language:
        raise HTTPException(status_code=400, detail="Unsupported file type for walkthrough")
    
    # For text files (markdown, json, etc.), use section-based parsing
    if parser.is_text_language(language):
        ast_nodes = parser.parse_text_file(content, safe_path)
    else:
        ast_nodes = parser.parse_file(content, language, safe_path)
    
    # Generate walkthrough script
    script_generator = ScriptGeneratorService()
    
    try:
        script = await script_generator.generate_script(
            file_path=safe_path,
            content=content,
            ast_nodes=ast_nodes,
            view_mode=request.view_mode,
            repository=repo,
        )
        
        walkthroughs_db[script.id] = script
        save_walkthroughs(walkthroughs_db)  # persist to disk
        
        # Queue audio generation in background
        background_tasks.add_task(
            generate_audio_for_walkthrough,
            script.id
        )
        
        return script
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating walkthrough: {str(e)}")


@router.get("/{walkthrough_id}", response_model=WalkthroughScript)
async def get_walkthrough(walkthrough_id: str, authorization: str = Header(None)):
    """Get a walkthrough script by ID"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    walkthrough = walkthroughs_db.get(walkthrough_id)
    
    if not walkthrough:
        raise HTTPException(status_code=404, detail="Walkthrough not found")
    
    return walkthrough


@router.get("/{walkthrough_id}/audio")
async def get_walkthrough_audio(walkthrough_id: str, authorization: str = Header(None)):
    """Get audio data for a walkthrough (returns 202 while generating, 200 when ready)"""
    user = await get_current_user(authorization)

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Check the walkthrough itself exists
    walkthrough = walkthroughs_db.get(walkthrough_id)
    if not walkthrough:
        raise HTTPException(status_code=404, detail="Walkthrough not found")

    # Check if audio generation failed
    fail_msg = audio_failed.get(walkthrough_id)
    if fail_msg:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "failed", "message": fail_msg},
        )

    audio = audio_walkthroughs_db.get(walkthrough_id)
    has_bytes = bool(audio_bytes_store.get(walkthrough_id))

    if not audio or not has_bytes:
        # If no background task is running, auto-trigger audio generation
        if walkthrough_id not in audio_generating:
            print(f"🔄 Auto-triggering audio generation for stale walkthrough {walkthrough_id}")
            from fastapi import BackgroundTasks as BT
            import asyncio
            audio_generating.add(walkthrough_id)
            # Run audio generation in background
            asyncio.ensure_future(generate_audio_for_walkthrough(walkthrough_id))

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={"status": "generating", "message": "Audio is being generated…"},
        )

    return audio


@router.get("/{walkthrough_id}/audio/stream")
async def stream_walkthrough_audio(walkthrough_id: str, authorization: str = Header(None)):
    """Stream pre-generated audio for a walkthrough (MP3)"""
    from app.services.audio_generator import AudioGeneratorService

    user = await get_current_user(authorization)

    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    walkthrough = walkthroughs_db.get(walkthrough_id)

    if not walkthrough:
        raise HTTPException(status_code=404, detail="Walkthrough not found")

    # Prefer pre-generated audio from the background task
    stored_bytes = audio_bytes_store.get(walkthrough_id)
    if stored_bytes and len(stored_bytes) > 0:
        return Response(
            content=stored_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f'inline; filename="walkthrough_{walkthrough_id}.mp3"',
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(stored_bytes)),
            },
        )

    # Fallback: generate on-the-fly (slower first request)
    audio_generator = AudioGeneratorService()
    all_bytes = b""
    for segment in walkthrough.segments:
        audio_data = await audio_generator.generate_segment_audio(segment.text)
        if audio_data:
            all_bytes += audio_data

    if not all_bytes:
        raise HTTPException(status_code=503, detail="Audio generation failed – check ElevenLabs API key and quota")

    return Response(
        content=all_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="walkthrough_{walkthrough_id}.mp3"',
            "Content-Length": str(len(all_bytes)),
        },
    )


@router.post("/{walkthrough_id}/audio/regenerate")
async def regenerate_audio(walkthrough_id: str, authorization: str = Header(None)):
    """Re-trigger audio generation for an existing walkthrough (clears old state)."""
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    walkthrough = walkthroughs_db.get(walkthrough_id)
    if not walkthrough:
        raise HTTPException(status_code=404, detail="Walkthrough not found")

    # Clear old audio state
    audio_failed.pop(walkthrough_id, None)
    if walkthrough_id in audio_walkthroughs_db:
        del audio_walkthroughs_db[walkthrough_id]
        save_audio_walkthroughs(audio_walkthroughs_db)
    if walkthrough_id in audio_bytes_store:
        del audio_bytes_store[walkthrough_id]
        delete_audio_bytes(walkthrough_id)
    audio_generating.discard(walkthrough_id)

    # Re-trigger audio generation
    import asyncio
    audio_generating.add(walkthrough_id)
    asyncio.ensure_future(generate_audio_for_walkthrough(walkthrough_id))

    return APIResponse(success=True, message="Audio regeneration started")


@router.get("/file/{repo_id}")
async def get_walkthroughs_for_file(
    repo_id: str,
    file_path: str,
    authorization: str = Header(None)
) -> List[WalkthroughScript]:
    """Get all walkthroughs for a specific file"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Find walkthroughs for this file in this repo
    walkthroughs = [
        wt for wt in walkthroughs_db.values()
        if wt.file_path == file_path
        and wt.metadata.get("repository_id") == repo_id
    ]
    
    return walkthroughs


@router.get("/repo/{repo_id}")
async def get_walkthroughs_for_repo(
    repo_id: str,
    authorization: str = Header(None)
) -> List[WalkthroughScript]:
    """Get all walkthroughs for a specific repository"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    repo = repositories_db.get(repo_id)
    
    if not repo or repo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Find all walkthroughs belonging to this repo
    repo_walkthroughs = [
        wt for wt in walkthroughs_db.values()
        if wt.metadata.get("repository_id") == repo_id
    ]
    
    return repo_walkthroughs


@router.delete("/{walkthrough_id}")
async def delete_walkthrough(walkthrough_id: str, authorization: str = Header(None)):
    """Delete a walkthrough"""
    user = await get_current_user(authorization)
    
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if walkthrough_id not in walkthroughs_db:
        raise HTTPException(status_code=404, detail="Walkthrough not found")
    
    del walkthroughs_db[walkthrough_id]
    delete_walkthrough_record(walkthrough_id)
    
    # Also delete audio if exists
    if walkthrough_id in audio_walkthroughs_db:
        del audio_walkthroughs_db[walkthrough_id]
        delete_audio_walkthrough(walkthrough_id)
    if walkthrough_id in audio_bytes_store:
        del audio_bytes_store[walkthrough_id]
        delete_audio_bytes(walkthrough_id)
    audio_failed.pop(walkthrough_id, None)
    
    return APIResponse(success=True, message="Walkthrough deleted")


async def generate_audio_for_walkthrough(walkthrough_id: str):
    """Background task to generate audio for walkthrough (parallel)."""
    from app.services.audio_generator import AudioGeneratorService
    import time

    walkthrough = walkthroughs_db.get(walkthrough_id)

    if not walkthrough:
        return

    audio_generating.add(walkthrough_id)
    audio_generator = AudioGeneratorService()
    start = time.perf_counter()

    # Generate all segment audio in PARALLEL (up to 4 concurrent)
    texts = [seg.text for seg in walkthrough.segments]
    audio_chunks = await audio_generator.generate_segments_parallel(texts, max_concurrent=4)

    audio_segments = []
    all_audio_bytes = b""
    current_time = 0.0
    failed_count = 0

    for i, segment in enumerate(walkthrough.segments):
        audio_data = audio_chunks[i] if i < len(audio_chunks) else b""
        duration = audio_generator.estimate_duration(segment.text)

        if audio_data and len(audio_data) > 0:
            all_audio_bytes += audio_data
        else:
            failed_count += 1

        audio_segment = AudioSegment(
            id=f"audio_{uuid.uuid4().hex[:8]}",
            script_segment_id=segment.id,
            audio_url=f"/api/walkthroughs/{walkthrough_id}/audio/segment/{segment.id}",
            duration=duration,
            start_time=current_time,
            end_time=current_time + duration,
        )

        audio_segments.append(audio_segment)
        current_time += duration

    elapsed = time.perf_counter() - start

    # Only store audio if we actually have valid bytes
    if len(all_audio_bytes) > 0:
        audio_walkthrough = AudioWalkthrough(
            id=walkthrough_id,
            walkthrough_script_id=walkthrough_id,
            file_path=walkthrough.file_path,
            audio_segments=audio_segments,
            full_audio_url=f"/api/walkthroughs/{walkthrough_id}/audio/stream",
            total_duration=current_time,
        )

        audio_walkthroughs_db[walkthrough_id] = audio_walkthrough
        audio_bytes_store[walkthrough_id] = all_audio_bytes

        save_audio_walkthroughs(audio_walkthroughs_db)
        save_audio_bytes(audio_bytes_store)
        print(f"✅ Audio generated & saved for walkthrough {walkthrough_id} "
              f"({len(audio_segments)} segments, {current_time:.1f}s audio, {elapsed:.1f}s wall-time)")
    else:
        error_msg = f"Audio generation failed for all {failed_count} segments – check ElevenLabs API key and quota"
        audio_failed[walkthrough_id] = error_msg
        print(f"⚠️  {error_msg} (walkthrough {walkthrough_id})")

    audio_generating.discard(walkthrough_id)

