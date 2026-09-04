"""Auditable task identity and conservative conversation-task idempotency."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata


def normalize_task_goal(goal: str) -> str:
    value = unicodedata.normalize("NFKC", str(goal or "")).casefold().strip()
    return re.sub(r"\s+", " ", value)


def build_task_identity(*, source_message_id: str, conversation_id: str, goal: str,
                        project_id: str | None = None, target_module: str | None = None,
                        target_object: str | None = None) -> dict:
    normalized_goal = normalize_task_goal(goal)
    payload = {
        "source_message_id": str(source_message_id or "").strip(),
        "conversation_id": conversation_id,
        "project_id": project_id,
        "normalized_goal": normalized_goal,
        "target_module": str(target_module or "").strip() or None,
        "target_object": str(target_object or "").strip() or None,
    }
    payload["task_fingerprint"] = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return payload


def task_identity_from_scope(scope: dict | None) -> dict:
    return dict((scope or {}).get("task_identity") or {})


def duplicate_reason(existing_scope: dict | None, identity: dict) -> str | None:
    existing = task_identity_from_scope(existing_scope)
    if identity.get("source_message_id") and existing.get("source_message_id") == identity["source_message_id"]:
        return "same_source_message_id"
    return None
