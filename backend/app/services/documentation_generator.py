"""
Documentation Generator Service

Generates structured, MNC-standard documentation for repository code files
and folders using AWS Bedrock Nova models with tree-sitter AST context.
"""

import asyncio
import hashlib
import os
import logging
from typing import List, Dict, Any, Optional

from app.config import get_settings
from app.services.parser import ParserService, LANGUAGE_EXTENSIONS, TEXT_EXTENSIONS
from app.services.bedrock_client import (
    call_nova_micro,
    call_nova_lite,
    call_nova_pro,
    BEDROCK_MAX_CONCURRENCY,
)

logger = logging.getLogger(__name__)

# Files/folders to skip during documentation
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".next", "dist", "build",
    ".venv", "venv", "env", ".env", ".idea", ".vscode", "coverage",
    ".mypy_cache", ".pytest_cache", "egg-info",
}
SKIP_FILES = {
    ".DS_Store", "Thumbs.db", ".gitignore", ".env", "package-lock.json",
    "yarn.lock", "pnpm-lock.yaml", ".eslintcache",
}
# Non-source extensions to skip for per-file LLM documentation
SKIP_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".ttf", ".eot", ".mp3", ".mp4", ".wav", ".webm", ".zip", ".tar",
    ".gz", ".lock", ".map", ".min.js", ".min.css",
}
MAX_FILE_SIZE = 100_000  # 100KB max per file
MAX_FILES = 60  # cap number of files sent to LLM


class DocumentationGenerator:
    """Generates structured documentation for an entire repository."""

    def __init__(self):
        self.parser = ParserService()
        # Per-file cache: (repo_id, file_path, content_hash) -> doc dict
        self._file_cache: Dict[str, Dict[str, Any]] = {}
        self._semaphore = asyncio.Semaphore(BEDROCK_MAX_CONCURRENCY)

    @staticmethod
    def _classify_file_complexity(source: str, ast_nodes: list) -> str:
        """Route files to the appropriate Nova model tier."""
        line_count = source.count("\n") + 1
        node_count = len(ast_nodes)
        if line_count < 50 and node_count < 5:
            return "simple"
        if line_count > 200 or node_count > 30:
            return "complex"
        return "standard"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_repository_docs(self, repo_path: str) -> Dict[str, Any]:
        """
        Generate full documentation for a repository.

        Returns a dict with:
          - overview: str
          - architecture: str
          - folder_tree: str
          - files: list[FileDocumentation]
          - dependencies: str
        """
        logger.info("Generating repository documentation for %s", repo_path)

        # 1. Walk the tree and collect file metadata
        tree_str, file_paths = self._walk_tree(repo_path)

        # 2. Generate per-file documentation IN PARALLEL (capped at CONCURRENCY)
        async def _safe_doc(fpath: str) -> Optional[Dict[str, Any]]:
            try:
                return await self._document_file(repo_path, fpath)
            except Exception as exc:
                logger.warning("Skipping %s: %s", fpath, exc)
                return None

        results = await asyncio.gather(*[_safe_doc(fp) for fp in file_paths])
        file_docs: List[Dict[str, Any]] = [d for d in results if d]

        # 3. Build high-level summaries via LLM — all three in parallel
        overview, architecture, dependencies = await asyncio.gather(
            self._generate_overview(repo_path, tree_str, file_docs),
            self._generate_architecture(tree_str, file_docs),
            self._generate_dependencies(repo_path, file_docs),
        )

        return {
            "overview": overview,
            "architecture": architecture,
            "folder_tree": tree_str,
            "files": file_docs,
            "dependencies": dependencies,
        }

    async def generate_file_docs(self, repo_path: str, file_path: str) -> Dict[str, Any]:
        """Generate documentation for a single file (on-demand)."""
        doc = await self._document_file(repo_path, file_path)
        if not doc:
            return {"path": file_path, "sections": [], "summary": "Could not parse file."}
        return doc

    async def generate_readme(
        self, docs: Dict[str, Any], repo_name: str, project_description: str = ""
    ) -> str:
        """
        Generate a concise, developer-grade README from existing docs.

        Instead of dumping every file's documentation, this produces the kind
        of README a developer would actually write: project intro, features,
        tech stack, getting started, brief structure, and contributing guide.
        """
        # Build condensed context from the full docs for the LLM
        overview = docs.get("overview", "")[:2000]
        architecture = docs.get("architecture", "")[:1500]
        dependencies = docs.get("dependencies", "")[:1500]
        folder_tree = docs.get("folder_tree", "")[:2000]

        file_summaries = "\n".join(
            f"- `{d['path']}`: {d['summary'][:100]}"
            for d in docs.get("files", [])[:30]
        )

        context_block = ""
        if project_description.strip():
            context_block = (
                f"\n**Project Description (from the developer):**\n"
                f"{project_description.strip()}\n"
            )

        prompt = f"""You are a senior developer writing a README.md for your open-source project.
Write a clean, concise, professional README — the kind you'd actually put on GitHub.

Repository name: **{repo_name}**
{context_block}
Here is context about the project (from auto-generated documentation):

**Overview:**
{overview}

**Architecture (condensed):**
{architecture[:800]}

**Key files:**
{file_summaries}

**Folder structure:**
```
{folder_tree[:1200]}
```

**Dependencies:**
{dependencies[:800]}

---

Write the README with these sections (skip any that don't apply):
1. **Title** — repo name as H1, with a one-line tagline underneath
2. **About** — 2-3 sentences max on what this project does and why it exists
3. **Features** — bullet list of key features (5-8 items)
4. **Tech Stack** — brief list of languages, frameworks, and major libraries
5. **Getting Started** — prerequisites, installation steps, and how to run
6. **Project Structure** — brief overview of the main directories (NOT the full tree, just the important top-level folders with one-line descriptions)
7. **Contributing** — short paragraph inviting contributions
8. **License** — one line (default to MIT if unknown)

Rules:
- Be concise. Real developers don't write essays in READMEs.
- Use practical, actionable language ("Run `npm install`" not "You should install the dependencies").
- Use code blocks for commands.
- Do NOT include per-file documentation. That's too verbose for a README.
- Do NOT use filler phrases like "This project is designed to..." — just say what it does.
- Output ONLY the markdown. No preamble, no commentary.
- If the developer provided a project description, use it to inform the tone and focus of the README."""

        system = "You are a documentation engineer. Output only clean markdown."

        try:
            result = await call_nova_pro(
                prompt, max_tokens=3000, temperature=0.3, system_prompt=system
            )
            return result.strip()
        except Exception as exc:
            logger.warning("Nova Pro readme failed (%s), falling back to Nova Lite", exc)
            try:
                result = await call_nova_lite(
                    prompt, max_tokens=3000, temperature=0.3, system_prompt=system
                )
                return result.strip()
            except Exception as exc2:
                logger.error("README generation failed: %s", exc2)
                return f"# {repo_name}\n\nREADME generation failed: {exc2}"

    # ------------------------------------------------------------------
    # Tree walker
    # ------------------------------------------------------------------

    def _walk_tree(self, repo_path: str) -> tuple:
        """Return (tree_string, list_of_relative_file_paths). Filters non-source files."""
        lines: List[str] = []
        file_paths: List[str] = []

        def _recurse(directory: str, prefix: str = ""):
            try:
                entries = sorted(os.listdir(directory))
            except PermissionError:
                return

            dirs = [e for e in entries if os.path.isdir(os.path.join(directory, e)) and e not in SKIP_DIRS]
            files = [e for e in entries if os.path.isfile(os.path.join(directory, e)) and e not in SKIP_FILES]

            for i, fname in enumerate(files):
                connector = "├── " if (i < len(files) - 1 or dirs) else "└── "
                lines.append(f"{prefix}{connector}{fname}")
                ext = os.path.splitext(fname)[1].lower()
                # Only queue source-code files for LLM documentation
                if ext not in SKIP_EXTS:
                    rel = os.path.relpath(os.path.join(directory, fname), repo_path).replace("\\", "/")
                    file_paths.append(rel)

            for i, dname in enumerate(dirs):
                connector = "├── " if i < len(dirs) - 1 else "└── "
                lines.append(f"{prefix}{connector}{dname}/")
                extension = "│   " if i < len(dirs) - 1 else "    "
                _recurse(os.path.join(directory, dname), prefix + extension)

        _recurse(repo_path)
        # Cap number of files to avoid excessive LLM calls
        if len(file_paths) > MAX_FILES:
            logger.info("Capping documentation to %d of %d files", MAX_FILES, len(file_paths))
            file_paths = file_paths[:MAX_FILES]
        return "\n".join(lines), file_paths

    # ------------------------------------------------------------------
    # Per-file documentation
    # ------------------------------------------------------------------

    async def _document_file(self, repo_path: str, rel_path: str) -> Optional[Dict[str, Any]]:
        abs_path = os.path.join(repo_path, rel_path)
        if not os.path.isfile(abs_path):
            return None

        size = os.path.getsize(abs_path)
        if size > MAX_FILE_SIZE:
            return {
                "path": rel_path,
                "language": self._detect_lang(rel_path),
                "summary": "File too large for inline documentation.",
                "sections": [],
            }

        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                source = f.read()
        except Exception:
            return None

        if not source.strip():
            return {
                "path": rel_path,
                "language": self._detect_lang(rel_path),
                "summary": "Empty file.",
                "sections": [],
            }

        # Check per-file cache by content hash
        content_hash = hashlib.md5(source.encode("utf-8")).hexdigest()
        cache_key = f"{repo_path}::{rel_path}::{content_hash}"
        if cache_key in self._file_cache:
            logger.debug("Cache hit for %s", rel_path)
            return self._file_cache[cache_key]

        # Attempt AST parse for richer context
        lang = self._detect_lang(rel_path)
        ast_nodes = []
        if lang and lang not in {"text", "unknown"}:
            try:
                ext = os.path.splitext(rel_path)[1]
                if ext in LANGUAGE_EXTENSIONS:
                    ast_nodes = self.parser.parse_file(abs_path)
            except Exception:
                pass

        sections = await self._build_file_sections(rel_path, source, lang, ast_nodes)
        summary = sections[0]["content"] if sections else ""

        result = {
            "path": rel_path,
            "language": lang,
            "summary": summary,
            "sections": sections,
        }
        self._file_cache[cache_key] = result
        return result

    async def _build_file_sections(
        self, rel_path: str, source: str, lang: str, ast_nodes: list
    ) -> List[Dict[str, str]]:
        """Ask LLM to produce structured documentation sections for a file."""
        # Build AST summary if available
        ast_summary = ""
        if ast_nodes:
            parts = []
            for node in ast_nodes[:40]:  # cap at 40 nodes
                parts.append(f"- {node.node_type.value}: {node.name} (L{node.start_line}-{node.end_line})")
            ast_summary = "\n".join(parts)

        # Truncate very long files for the prompt
        src_for_prompt = source[:12000] if len(source) > 12000 else source

        prompt = f"""You are a senior software engineer writing internal documentation for your team.
Write as if you're explaining this file to a smart junior developer who just joined the project.
Use a natural, conversational-but-professional tone — the way a real engineer would explain things in a design doc or code review.

Document the file **{rel_path}** ({lang or 'unknown language'}).

Guidelines:
- Start with a **Module Overview**: one concise paragraph explaining what this file does and why it exists in the codebase. Be direct — avoid filler phrases like "This file is responsible for..." or "This module serves as...". Just say what it does.
- Add a **Dependencies** section listing key imports and what they bring to the table.
- For classes, add a **Classes** section with a table: | Class | Purpose | Key Methods |
- For functions, add a **Functions** section with a table: | Function | Parameters | Returns | Description |
- If relevant, add **Configuration** or **Constants** section.
- End with **Notes** if there are gotchas, edge cases, or things the next developer should know.
- Use backtick notation for code identifiers (e.g. `functionName`), NEVER wrap identifiers in single quotes.
- Do NOT use phrases like "it is important to note", "it should be noted", "as we can see". Just state facts directly.
- Keep it concise. Engineers skim docs — respect their time.
- Output ONLY valid markdown. No preamble or meta-commentary.

{("AST Structure:" + chr(10) + ast_summary) if ast_summary else ""}

Source code:
```{lang or ''}
{src_for_prompt}
```"""

        system = "You are a documentation engineer. Output only markdown."
        complexity = self._classify_file_complexity(source, ast_nodes)
        try:
            async with self._semaphore:
                if complexity == "simple":
                    text = await call_nova_micro(prompt, max_tokens=1500, temperature=0.2, system_prompt=system)
                elif complexity == "complex":
                    text = await call_nova_pro(prompt, max_tokens=1500, temperature=0.2, system_prompt=system)
                else:
                    text = await call_nova_lite(prompt, max_tokens=1500, temperature=0.2, system_prompt=system)
            text = text.strip()
        except Exception as exc:
            logger.warning("Primary Bedrock call failed for %s (%s), falling back", rel_path, exc)
            try:
                async with self._semaphore:
                    text = await call_nova_lite(prompt, max_tokens=1500, temperature=0.2, system_prompt=system)
                text = text.strip()
            except Exception as exc2:
                logger.error("Fallback Bedrock call also failed for %s: %s", rel_path, exc2)
                text = f"## Module Overview\n\nDocumentation generation failed: {exc2}"

        # Split LLM markdown into sections by ## headings
        return self._split_markdown_sections(text)

    @staticmethod
    def _split_markdown_sections(md: str) -> List[Dict[str, str]]:
        sections: List[Dict[str, str]] = []
        current_title = "Overview"
        current_lines: List[str] = []

        for line in md.split("\n"):
            if line.startswith("## "):
                if current_lines:
                    sections.append({"title": current_title, "content": "\n".join(current_lines).strip()})
                current_title = line.lstrip("# ").strip()
                current_lines = []
            else:
                current_lines.append(line)

        if current_lines:
            sections.append({"title": current_title, "content": "\n".join(current_lines).strip()})

        return sections

    # ------------------------------------------------------------------
    # High-level summaries
    # ------------------------------------------------------------------

    async def _generate_overview(
        self, repo_path: str, tree_str: str, file_docs: List[Dict]
    ) -> str:
        repo_name = os.path.basename(repo_path)
        file_summaries = "\n".join(
            f"- **{d['path']}**: {d['summary'][:120]}" for d in file_docs[:40]
        )
        prompt = f"""Write a clear **Project Overview** (3-5 paragraphs) for the repository "{repo_name}".
Write like a senior engineer briefing a new team member. Be direct and informative.

Folder structure:
```
{tree_str[:3000]}
```

File summaries:
{file_summaries[:4000]}

Cover: what this project does, the tech stack, how the pieces fit together, and who would use it.
Don't use filler phrases like "This project is designed to..." — just explain what it does.
Use backtick notation for code identifiers, never single quotes.
Output only markdown (no title heading needed)."""

        system = "You are a documentation engineer. Output only markdown."
        try:
            result = await call_nova_pro(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
            return result.strip()
        except Exception as exc:
            logger.warning("Nova Pro overview failed (%s), falling back to Nova Lite", exc)
            try:
                result = await call_nova_lite(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
                return result.strip()
            except Exception as exc2:
                logger.error("Overview generation failed: %s", exc2)
                return f"Overview generation failed: {exc2}"

    async def _generate_architecture(self, tree_str: str, file_docs: List[Dict]) -> str:
        file_summaries = "\n".join(
            f"- **{d['path']}**: {d['summary'][:100]}" for d in file_docs[:40]
        )
        prompt = f"""Based on this repository structure and file summaries, write an **Architecture** section.
Write like you're explaining the codebase architecture to a new team member during onboarding.

Structure:
```
{tree_str[:3000]}
```

Files:
{file_summaries[:4000]}

Cover: how the code is organized (layers, modules), how data flows through the system, key design patterns used, and where the main entry points are.
Be practical — describe what matters for someone who needs to work on this code.
Use backtick notation for code identifiers, never single quotes.
Output only markdown (no title heading needed)."""

        system = "You are a documentation engineer. Output only markdown."
        try:
            result = await call_nova_pro(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
            return result.strip()
        except Exception as exc:
            logger.warning("Nova Pro architecture failed (%s), falling back to Nova Lite", exc)
            try:
                result = await call_nova_lite(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
                return result.strip()
            except Exception as exc2:
                logger.error("Architecture generation failed: %s", exc2)
                return f"Architecture generation failed: {exc2}"

    async def _generate_dependencies(self, repo_path: str, file_docs: List[Dict]) -> str:
        # Try to read requirements.txt / package.json
        dep_files = {}
        for name in ("requirements.txt", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"):
            p = os.path.join(repo_path, name)
            if os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        dep_files[name] = f.read()[:4000]
                except Exception:
                    pass

        if not dep_files:
            return "No dependency manifest found."

        dep_text = "\n\n".join(f"**{k}**:\n```\n{v}\n```" for k, v in dep_files.items())
        prompt = f"""Analyze these dependency files and write a **Dependencies** section.

{dep_text}

Include: major libraries with their purpose, version constraints, dev vs prod deps.
Output only markdown (no title heading needed)."""

        system = "You are a documentation engineer. Output only markdown."
        try:
            result = await call_nova_lite(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
            return result.strip()
        except Exception as exc:
            logger.warning("Nova Lite dependencies failed (%s), falling back to Nova Micro", exc)
            try:
                result = await call_nova_micro(prompt, max_tokens=2000, temperature=0.2, system_prompt=system)
                return result.strip()
            except Exception as exc2:
                logger.error("Dependencies generation failed: %s", exc2)
                return f"Dependency analysis failed: {exc2}"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_lang(rel_path: str) -> str:
        ext = os.path.splitext(rel_path)[1].lower()
        if ext in LANGUAGE_EXTENSIONS:
            return LANGUAGE_EXTENSIONS[ext]
        if ext in TEXT_EXTENSIONS:
            return ext.lstrip(".")
        return "unknown"
