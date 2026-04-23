"""Script Generator Service - AWS Bedrock Nova Integration

Generates natural language walkthrough scripts from code analysis.
This is the core AI component that creates the "Senior Engineer" narration.
"""

import os
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime

from app.config import get_settings
from app.services.bedrock_client import call_nova_lite, call_nova_pro
from app.models.schemas import (
    WalkthroughScript,
    ScriptSegment,
    ASTNode,
    ViewMode,
    Repository,
    NodeType,
)

settings = get_settings()


class ScriptGeneratorService:
    """
    Generates walkthrough scripts using AWS Bedrock Nova models.
    
    Creates:
    - Developer Mode: Technical explanations with inputs/outputs/complexity
    - Manager Mode: High-level business summaries
    """
    
    def __init__(self):
        self._mock = False
    
    async def generate_script(
        self,
        file_path: str,
        content: str,
        ast_nodes: List[ASTNode],
        view_mode: ViewMode,
        repository: Repository,
    ) -> WalkthroughScript:
        """
        Generate a complete walkthrough script for a file.
        
        Args:
            file_path: Path to the source file
            content: Source code content
            ast_nodes: Parsed AST nodes
            view_mode: Developer or Manager mode
            repository: Repository information
            
        Returns:
            WalkthroughScript with all segments
        """
        script_id = f"wt_{uuid.uuid4().hex[:12]}"
        lines = content.split("\n")
        
        # Generate segments based on AST structure
        segments = []
        
        # Add file overview segment
        overview = await self._generate_overview(
            file_path, content, ast_nodes, view_mode
        )
        segments.append(overview)
        
        # Generate segments for each major code block
        for node in ast_nodes:
            if node.type in [NodeType.FUNCTION, NodeType.CLASS, NodeType.METHOD, NodeType.SECTION]:
                segment = await self._generate_node_segment(
                    node, lines, view_mode, len(segments)
                )
                segments.append(segment)
        
        # Add conclusion segment
        conclusion = await self._generate_conclusion(
            file_path, ast_nodes, view_mode, len(segments)
        )
        segments.append(conclusion)
        
        # Calculate total duration
        total_duration = sum(s.duration_estimate for s in segments)
        
        # Generate summary
        summary = await self._generate_summary(file_path, ast_nodes, view_mode)
        
        return WalkthroughScript(
            id=script_id,
            file_path=file_path,
            title=f"Walkthrough: {os.path.basename(file_path)}",
            summary=summary,
            view_mode=view_mode,
            segments=segments,
            total_duration=total_duration,
            metadata={
                "repository_id": repository.id,
                "repository_name": repository.name,
                "language": repository.language,
            }
        )
    
    async def _generate_overview(
        self,
        file_path: str,
        content: str,
        ast_nodes: List[ASTNode],
        view_mode: ViewMode,
    ) -> ScriptSegment:
        """Generate the opening overview segment"""
        
        # Count code elements
        functions = [n for n in ast_nodes if n.type == NodeType.FUNCTION]
        classes = [n for n in ast_nodes if n.type == NodeType.CLASS]
        imports = [n for n in ast_nodes if n.type == NodeType.IMPORT]
        
        if self._mock:
            if view_mode == ViewMode.DEVELOPER:
                text = (
                    f"Welcome to the walkthrough of {os.path.basename(file_path)}. "
                    f"This file contains {len(functions)} functions, {len(classes)} classes, "
                    f"and {len(imports)} import statements. "
                    f"Let me walk you through the key components and their implementation details."
                )
            else:
                text = (
                    f"Let's explore {os.path.basename(file_path)}. "
                    f"This module handles key functionality in the system. "
                    f"I'll explain what it does at a high level and how it fits into the larger picture."
                )
        else:
            prompt = self._get_overview_prompt(
                file_path, content[:2000], ast_nodes, view_mode
            )
            text = await self._call_llm(prompt)
        
        return ScriptSegment(
            id=f"seg_{uuid.uuid4().hex[:8]}",
            order=0,
            text=text,
            start_line=1,
            end_line=min(10, len(content.split("\n"))),
            highlight_lines=list(range(1, min(10, len(content.split("\n"))) + 1)),
            duration_estimate=self._estimate_duration(text),
        )
    
    async def _generate_node_segment(
        self,
        node: ASTNode,
        lines: List[str],
        view_mode: ViewMode,
        order: int,
    ) -> ScriptSegment:
        """Generate a segment for a specific AST node"""
        
        # Extract the code for this node
        node_code = "\n".join(lines[node.start_line - 1:node.end_line])
        
        if self._mock:
            if view_mode == ViewMode.DEVELOPER:
                if node.type == NodeType.FUNCTION:
                    params_str = ", ".join(node.parameters) if node.parameters else "no parameters"
                    # Extract key details from actual code
                    code_lines = node_code.strip().split("\n")
                    # Find return statements
                    returns = [l.strip() for l in code_lines if "return " in l]
                    return_info = f" It returns {returns[0].replace('return ', '')}. " if returns else " "
                    # Find key operations (assignments, calls)
                    body_summary = ""
                    for cl in code_lines[1:6]:  # first 5 body lines
                        stripped = cl.strip()
                        if stripped and not stripped.startswith("#") and not stripped.startswith('"""'):
                            body_summary += f" {stripped};"
                    if body_summary:
                        body_summary = f" Key operations include:{body_summary}"
                    text = (
                        f"Now let's look at the function '{node.name}'. "
                        f"It takes {params_str}. "
                        f"This function spans lines {node.start_line} to {node.end_line}."
                        f"{return_info}"
                        f"{body_summary}"
                    )
                elif node.type == NodeType.CLASS:
                    # Extract method names from class body
                    methods = [l.strip().replace("def ", "").split("(")[0] 
                              for l in node_code.split("\n") if "def " in l]
                    methods_str = ", ".join(methods[:5]) if methods else "no visible methods"
                    text = (
                        f"Here we have the class '{node.name}', "
                        f"defined from line {node.start_line} to {node.end_line}. "
                        f"It contains the following methods: {methods_str}. "
                        f"Let's examine its structure."
                    )
                elif node.type == NodeType.SECTION:
                    # For text/markdown sections, summarize the content
                    content_preview = node_code.strip()[:300]
                    text = (
                        f"Now let's look at the section '{node.name}'. "
                        f"This section spans lines {node.start_line} to {node.end_line}. "
                        f"Here is what it says: {content_preview}"
                    )
                else:
                    text = (
                        f"Let's examine '{node.name}' defined at line {node.start_line}. "
                        f"Here is the code: {node_code[:200]}"
                    )
            else:
                text = (
                    f"The {node.type.value} '{node.name}' provides important business functionality. "
                    f"It's a key component that enables the system's core features."
                )
        else:
            prompt = self._get_node_prompt(node, node_code, view_mode)
            # Route: long segments (> 5 lines) use Nova Pro, short use Nova Lite
            use_pro = (node.end_line - node.start_line) > 5
            text = await self._call_llm(prompt, use_pro=use_pro)
        
        return ScriptSegment(
            id=f"seg_{uuid.uuid4().hex[:8]}",
            order=order,
            text=text,
            start_line=node.start_line,
            end_line=node.end_line,
            # Highlight only the signature + first ~5 body lines, not the entire function
            highlight_lines=list(range(node.start_line, min(node.start_line + 6, node.end_line + 1))),
            duration_estimate=self._estimate_duration(text),
            code_context=node_code[:500],
        )
    
    async def _generate_conclusion(
        self,
        file_path: str,
        ast_nodes: List[ASTNode],
        view_mode: ViewMode,
        order: int,
    ) -> ScriptSegment:
        """Generate the closing conclusion segment using LLM"""
        node_names = [n.name for n in ast_nodes if n.type in [NodeType.FUNCTION, NodeType.CLASS, NodeType.METHOD]][:10]
        components_str = ", ".join(node_names) if node_names else "various components"

        if self._mock:
            if view_mode == ViewMode.DEVELOPER:
                text = (
                    f"So that's {os.path.basename(file_path)}. "
                    f"The key takeaway is how {components_str} work together. "
                    f"If you're going to modify this file, pay attention to the dependencies."
                )
            else:
                text = (
                    f"To recap, this file handles critical functionality. "
                    f"Understanding it helps you see how this part of the system serves the business."
                )
        else:
            if view_mode == ViewMode.DEVELOPER:
                prompt = f"""You are a Staff Engineer wrapping up a code walkthrough.

File: {os.path.basename(file_path)}
Key components covered: {components_str}

Generate a brief closing narration (2-3 sentences) that:
- Summarizes the key architectural insight or design pattern in this file
- Mentions one thing to be careful about if someone modifies this code
- Sounds like a real engineer giving practical advice, not a textbook summary
- Never say 'That concludes our walkthrough' or 'Feel free to explore'"""
            else:
                prompt = f"""Wrap up a high-level overview of {os.path.basename(file_path)} for a product manager.

Key components: {components_str}

Generate 2 sentences summarizing the business value and what to remember about this file. Be direct."""
            text = await self._call_llm(prompt)

        # Point conclusion to end of file instead of line 1
        last_node = ast_nodes[-1] if ast_nodes else None
        conclusion_start = last_node.end_line if last_node else 1
        conclusion_end = last_node.end_line if last_node else 1
        
        return ScriptSegment(
            id=f"seg_{uuid.uuid4().hex[:8]}",
            order=order,
            text=text,
            start_line=conclusion_start,
            end_line=conclusion_end,
            highlight_lines=[],
            duration_estimate=self._estimate_duration(text),
        )
    
    async def _generate_summary(
        self,
        file_path: str,
        ast_nodes: List[ASTNode],
        view_mode: ViewMode,
    ) -> str:
        """Generate a brief summary of the file"""
        functions = [n for n in ast_nodes if n.type == NodeType.FUNCTION]
        classes = [n for n in ast_nodes if n.type == NodeType.CLASS]
        
        if view_mode == ViewMode.DEVELOPER:
            return (
                f"Technical walkthrough of {os.path.basename(file_path)} covering "
                f"{len(functions)} functions and {len(classes)} classes with implementation details."
            )
        else:
            return (
                f"Business overview of {os.path.basename(file_path)} explaining "
                f"key functionality and its role in the system."
            )
    
    def _get_overview_prompt(
        self,
        file_path: str,
        content_preview: str,
        ast_nodes: List[ASTNode],
        view_mode: ViewMode,
    ) -> str:
        """Generate prompt for file overview"""
        num_funcs = len([n for n in ast_nodes if n.type == NodeType.FUNCTION])
        num_classes = len([n for n in ast_nodes if n.type == NodeType.CLASS])
        num_imports = len([n for n in ast_nodes if n.type == NodeType.IMPORT])

        if view_mode == ViewMode.DEVELOPER:
            return f"""You are a Staff Engineer with 15 years of experience. You're doing a code walkthrough with a fellow developer — the kind where you sit down, pull up a file, and explain why things are the way they are.

Generate the opening narration for a walkthrough of this file.

File: {file_path}
Code Preview:
```
{content_preview}
```

Structure: {num_funcs} functions, {num_classes} classes, {num_imports} imports.

Rules:
- Sound like a real engineer talking, not a textbook. Be practical and slightly opinionated.
- Immediately explain WHAT this file is responsible for and WHY it exists in the project.
- If you can infer the architectural role (e.g. "this is the auth middleware", "this is the data access layer"), say it.
- Mention one interesting design decision or trade-off you notice in the code preview.
- Keep it to 2-4 sentences. No filler. No "Let's dive in", no "In this file we will explore".
- Speak as if the viewer already knows how to code — don't explain basic syntax."""
        else:
            return f"""You are explaining code to a product manager who is smart but non-technical.

Generate an opening narration for a high-level overview of this file.

File: {file_path}

Rules:
- Use clear, non-technical language. Avoid jargon.
- Focus on what this file DOES for the user/business, not how it works internally.
- Frame it in terms of user-facing features or system capabilities.
- Keep it to 2-3 sentences. Be direct."""
    
    def _get_node_prompt(
        self,
        node: ASTNode,
        code: str,
        view_mode: ViewMode,
    ) -> str:
        """Generate prompt for a specific code node"""
        params_info = f"Parameters: {', '.join(node.parameters)}" if node.parameters else "No parameters."

        if view_mode == ViewMode.DEVELOPER:
            return f"""You are a Staff Engineer walking a developer through a codebase. Explain this {node.type.value} like you're pair-programming.

Code:
```
{code[:1500]}
```

{params_info}

Rules:
- First sentence: what this {node.type.value} does in plain terms. No "This function is responsible for…" — just say what it does.
- Then explain WHY it's written this way. What problem does it solve? What would break without it?
- If there's a non-obvious design choice (e.g. error handling strategy, data transformation, caching, concurrency), call it out. Say "they did X because Y" or "notice how they avoid Z".
- If you spot a potential edge case, gotcha, or performance concern, mention it briefly.
- Keep it to 3-5 sentences. Be technically precise but conversational.
- Never say "Let's look at", "Now we see", or "This code is responsible for"."""
        else:
            return f"""Explain this code component to a product manager:

Component: {node.name} ({node.type.value})

Rules:
- Use plain language. No jargon.
- Explain what this does for the end user or the system, not how it works.
- Keep it to 2 sentences. Be specific — name the feature or capability it enables."""
    
    async def _call_llm(self, prompt: str, use_pro: bool = False) -> str:
        """Call Bedrock Nova model to generate text."""
        import logging
        _logger = logging.getLogger(__name__)
        try:
            if use_pro:
                result = await call_nova_pro(prompt)
            else:
                result = await call_nova_lite(prompt)
            return result
        except Exception as e:
            _logger.warning("Bedrock call failed (%s), attempting fallback", e)
            try:
                # Tier-down fallback: pro→lite, lite→micro
                if use_pro:
                    return await call_nova_lite(prompt)
                else:
                    from app.services.bedrock_client import call_nova_micro
                    return await call_nova_micro(prompt)
            except Exception as e2:
                _logger.warning("Bedrock fallback also failed (%s), using code extraction", e2)
                # Extract useful info from the prompt to build a meaningful fallback
                lines = prompt.split('\n')
                code_start = None
                code_end = None
                for i, line in enumerate(lines):
                    if line.strip() == '```' and code_start is None:
                        code_start = i + 1
                    elif line.strip() == '```' and code_start is not None:
                        code_end = i
                        break
                if code_start and code_end:
                    code_preview = '\n'.join(lines[code_start:min(code_start + 5, code_end)])
                    return f"This section contains the following code: {code_preview.strip()}"
                return "This section contains code logic. Enable AWS Bedrock for detailed AI-generated explanations."
    
    def _estimate_duration(self, text: str) -> float:
        """Estimate speech duration in seconds (average 150 words per minute)"""
        words = len(text.split())
        return (words / 150) * 60

