"""
App Studio — Project Persistence (In-Memory + DynamoDB)

Stores and retrieves App Studio builder projects.
Uses in-memory storage as primary (fast, always works),
with optional DynamoDB backup when the table exists.

Table: docusense_builder_projects  (partition key: id)
"""

import json
import logging
from typing import Dict, Optional, List, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# In-memory storage — primary data store
_builder_projects_cache: Dict[str, dict] = {}

# Flag to suppress repeated DynamoDB warnings after first failure
_dynamo_available: Optional[bool] = None


def _try_dynamo():
    """Check if DynamoDB builder table is reachable. Only checks once."""
    global _dynamo_available
    if _dynamo_available is not None:
        return _dynamo_available
    try:
        from app.services.persistence import _get_dynamodb_resource, _table_name
        dynamodb = _get_dynamodb_resource()
        table = dynamodb.Table(_table_name("builder_projects"))
        table.table_status  # Triggers actual check
        _dynamo_available = True
    except Exception:
        _dynamo_available = False
        logger.info("Builder DynamoDB table not found — using in-memory storage only")
    return _dynamo_available


# ---------------------------------------------------------------------------
# Save / Load Builder Projects
# ---------------------------------------------------------------------------

def save_builder_project(project: Dict[str, Any]) -> None:
    """Persist a builder project (in-memory primary, DynamoDB optional)."""
    project_id = project["id"]
    _builder_projects_cache[project_id] = project

    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name("builder_projects"))
            table.put_item(Item={
                "id": project_id,
                "user_id": project["user_id"],
                "data_json": json.dumps(project, default=str),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.debug(f"DynamoDB save skipped: {e}")


def load_builder_project(project_id: str) -> Optional[Dict[str, Any]]:
    """Load a single builder project by ID."""
    if project_id in _builder_projects_cache:
        return _builder_projects_cache[project_id]

    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name("builder_projects"))
            resp = table.get_item(Key={"id": project_id})
            item = resp.get("Item")
            if item:
                data = json.loads(item.get("data_json", "{}"))
                _builder_projects_cache[project_id] = data
                return data
        except Exception as e:
            logger.debug(f"DynamoDB load skipped: {e}")

    return None


def load_user_builder_projects(user_id: str) -> List[Dict[str, Any]]:
    """Load all builder projects for a user."""
    cached = [p for p in _builder_projects_cache.values() if p.get("user_id") == user_id]

    if _try_dynamo() and not cached:
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name("builder_projects"))
            response = table.scan(
                FilterExpression="user_id = :uid",
                ExpressionAttributeValues={":uid": user_id},
            )
            for item in response.get("Items", []):
                data = json.loads(item.get("data_json", "{}"))
                _builder_projects_cache[data["id"]] = data
                cached.append(data)
        except Exception as e:
            logger.debug(f"DynamoDB scan skipped: {e}")

    return sorted(cached, key=lambda p: p.get("updated_at", ""), reverse=True)


def delete_builder_project(project_id: str) -> bool:
    """Delete a builder project."""
    _builder_projects_cache.pop(project_id, None)
    if _try_dynamo():
        try:
            from app.services.persistence import _get_dynamodb_resource, _table_name
            dynamodb = _get_dynamodb_resource()
            table = dynamodb.Table(_table_name("builder_projects"))
            table.delete_item(Key={"id": project_id})
        except Exception as e:
            logger.debug(f"DynamoDB delete skipped: {e}")
    return True


def count_user_builder_projects(user_id: str) -> int:
    """Count builder projects for a user (for tier limit checks)."""
    return len(load_user_builder_projects(user_id))
