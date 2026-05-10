"""
App Studio — Stitch AI MCP Client

Communicates with Google Stitch AI via the MCP (Model Context Protocol)
over Streamable HTTP at https://stitch.googleapis.com/mcp.

Uses JSON-RPC 2.0 to call Stitch tools:
  - create_project
  - generate_screen_from_text
  - edit_screens
  - get_screen
  - list_screens
"""

import json
import logging
import uuid
from typing import Optional, Dict, Any, List

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Official Stitch MCP endpoint
STITCH_MCP_URL = "https://stitch.googleapis.com/mcp"


class StitchMCPClient:
    """
    MCP client for Google Stitch AI.

    Sends JSON-RPC 2.0 requests over HTTP to the Stitch MCP endpoint.
    Authenticates via X-Goog-Api-Key header.
    """

    def __init__(self):
        self.api_key = settings.stitch_api_key
        if not self.api_key:
            logger.warning("STITCH_API_KEY not configured — Stitch calls will fail")
        self.headers = {
            "X-Goog-Api-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def _call_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        timeout: float = 120.0,
    ) -> Any:
        """
        Send a JSON-RPC 2.0 tools/call request to the Stitch MCP endpoint.

        Returns the parsed result content.
        """
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
            "id": self._next_id(),
        }

        logger.info(f"Stitch MCP → {tool_name} (timeout={timeout}s)")

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                STITCH_MCP_URL,
                json=payload,
                headers=self.headers,
            )

            # Handle SSE responses (Stitch may stream)
            content_type = resp.headers.get("content-type", "")

            if "text/event-stream" in content_type:
                # Parse SSE — collect all data events
                return self._parse_sse(resp.text)
            else:
                resp.raise_for_status()
                result = resp.json()

                if "error" in result:
                    error = result["error"]
                    raise Exception(
                        f"Stitch MCP error {error.get('code', 'unknown')}: "
                        f"{error.get('message', 'Unknown error')}"
                    )

                return result.get("result", result)

    def _parse_sse(self, sse_text: str) -> Any:
        """Parse Server-Sent Events response from Stitch."""
        last_data = None
        for line in sse_text.split("\n"):
            line = line.strip()
            if line.startswith("data:"):
                data_str = line[5:].strip()
                if data_str:
                    try:
                        last_data = json.loads(data_str)
                    except json.JSONDecodeError:
                        last_data = data_str

        if last_data and isinstance(last_data, dict):
            if "error" in last_data:
                error = last_data["error"]
                raise Exception(
                    f"Stitch MCP error: {error.get('message', str(error))}"
                )
            return last_data.get("result", last_data)

        return last_data

    # -----------------------------------------------------------------
    # High-level Stitch operations
    # -----------------------------------------------------------------

    async def create_project(self, title: str) -> Dict[str, Any]:
        """Create a new Stitch project."""
        result = await self._call_tool(
            "create_project",
            {"title": title},
            timeout=30.0,
        )
        # Extract project ID from name like "projects/1234567890"
        raw = self._extract_content(result)
        if isinstance(raw, dict):
            project_name = raw.get("name", "")
            project_id = project_name.replace("projects/", "")
            return {"project_id": project_id, "raw": raw}
        return {"project_id": str(raw), "raw": raw}

    async def generate_screen(
        self,
        project_id: str,
        prompt: str,
        device_type: str = "DESKTOP",
    ) -> Dict[str, Any]:
        """
        Generate a screen from a text prompt.

        This can take 30-90 seconds.
        Returns screenshot URL, HTML download URL, and screen metadata.
        """
        result = await self._call_tool(
            "generate_screen_from_text",
            {
                "projectId": project_id,
                "prompt": prompt,
                "deviceType": device_type,
            },
            timeout=180.0,
        )
        return self._parse_generate_result(result, project_id)

    async def edit_screen(
        self,
        project_id: str,
        screen_id: str,
        prompt: str,
        device_type: str = "DESKTOP",
    ) -> Dict[str, Any]:
        """Edit an existing screen using natural language."""
        result = await self._call_tool(
            "edit_screens",
            {
                "projectId": project_id,
                "selectedScreenIds": [screen_id],
                "prompt": prompt,
                "deviceType": device_type,
            },
            timeout=180.0,
        )
        return self._parse_generate_result(result, project_id)

    async def get_screen(
        self,
        project_id: str,
        screen_id: str,
    ) -> Dict[str, Any]:
        """Get details of a specific screen."""
        result = await self._call_tool(
            "get_screen",
            {
                "name": f"projects/{project_id}/screens/{screen_id}",
                "projectId": project_id,
                "screenId": screen_id,
            },
            timeout=30.0,
        )
        return self._extract_content(result)

    async def list_screens(self, project_id: str) -> List[Dict[str, Any]]:
        """List all screens in a project."""
        result = await self._call_tool(
            "list_screens",
            {"projectId": project_id},
            timeout=30.0,
        )
        raw = self._extract_content(result)
        if isinstance(raw, dict):
            return raw.get("screens", [])
        return []

    # -----------------------------------------------------------------
    # Response Parsing
    # -----------------------------------------------------------------

    def _extract_content(self, result: Any) -> Any:
        """Extract the actual content from MCP tool result wrapper."""
        if isinstance(result, dict):
            # MCP result format: {"content": [{"type": "text", "text": "..."}]}
            content = result.get("content", [])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        text = item.get("text", "")
                        try:
                            return json.loads(text)
                        except (json.JSONDecodeError, TypeError):
                            return text
            return result
        return result

    def _parse_generate_result(
        self,
        result: Any,
        project_id: str,
    ) -> Dict[str, Any]:
        """
        Parse the complex Stitch generate/edit response.

        Extracts screens with screenshot URLs, HTML download URLs, etc.
        """
        raw = self._extract_content(result)

        parsed = {
            "project_id": project_id,
            "session_id": None,
            "screens": [],
            "description": "",
            "suggestions": [],
            "design_system_name": None,
        }

        if not isinstance(raw, dict):
            logger.warning(f"Unexpected Stitch response type: {type(raw)}")
            return parsed

        parsed["session_id"] = raw.get("sessionId")

        for component in raw.get("outputComponents", []):
            # Design system
            if "designSystem" in component:
                ds = component["designSystem"]
                parsed["design_system_name"] = ds.get("name")

            # Screens
            if "design" in component:
                for screen in component["design"].get("screens", []):
                    screen_name = screen.get("name", "")
                    screen_id = (
                        screen_name.split("/screens/")[-1]
                        if "/screens/" in screen_name
                        else screen.get("id", "")
                    )

                    screenshot = screen.get("screenshot", {})
                    html_code = screen.get("htmlCode", {})

                    parsed["screens"].append({
                        "screen_id": screen_id,
                        "title": screen.get("title", ""),
                        "screenshot_url": screenshot.get("downloadUrl", ""),
                        "html_url": html_code.get("downloadUrl", ""),
                        "width": screen.get("width", "1920"),
                        "height": screen.get("height", "1080"),
                        "prompt": screen.get("prompt", ""),
                        "status": screen.get("screenMetadata", {}).get(
                            "status", "COMPLETE"
                        ),
                    })

            # Text description
            if "text" in component:
                parsed["description"] = component["text"]

            # Suggestions
            if "suggestion" in component:
                parsed["suggestions"].append(component["suggestion"])

        return parsed


# Singleton
_client: Optional[StitchMCPClient] = None


def get_stitch_client() -> StitchMCPClient:
    """Get or create the Stitch MCP client singleton."""
    global _client
    if _client is None:
        _client = StitchMCPClient()
    return _client
