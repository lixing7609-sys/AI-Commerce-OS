import json
from collections.abc import Callable
from threading import RLock


_lock = RLock()
_publishers: dict[str, Callable[[str], None]] = {}


def register_publisher(client_message_id: str, publisher: Callable[[str], None]) -> None:
    with _lock:
        _publishers[client_message_id] = publisher


def unregister_publisher(client_message_id: str) -> None:
    with _lock:
        _publishers.pop(client_message_id, None)


def publisher_for(client_message_id: str | None) -> Callable[[str], None] | None:
    if not client_message_id:
        return None
    with _lock:
        return _publishers.get(client_message_id)


def partial_json_string(payload: str, field: str = "response") -> str:
    """Return the valid prefix of a JSON string field while its object is streaming."""
    marker = f'"{field}"'
    start = payload.find(marker)
    if start < 0:
        return ""
    start = payload.find(":", start + len(marker))
    if start < 0:
        return ""
    start = payload.find('"', start + 1)
    if start < 0:
        return ""
    chars: list[str] = []
    escaped = False
    for char in payload[start + 1:]:
        if escaped:
            chars.extend(("\\", char)); escaped = False; continue
        if char == "\\":
            escaped = True; continue
        if char == '"':
            break
        chars.append(char)
    if escaped:
        chars.append("\\")
    raw = "".join(chars)
    while raw:
        try:
            return json.loads(f'"{raw}"')
        except json.JSONDecodeError:
            raw = raw[:-1]
    return ""
