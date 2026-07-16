from dataclasses import dataclass
from typing import Any


@dataclass
class Task:

    task_type: str

    payload: dict[str, Any]

    status: str = "pending"

    assigned_agent: str | None = None