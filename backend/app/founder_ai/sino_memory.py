from dataclasses import dataclass
from enum import StrEnum
import json
from typing import Any, Mapping

from app.core.memory.model import MemoryAssetDB
from app.core.memory.service import create_memory


class SinoMemoryType(StrEnum):
    DECISION = "decision"
    LEARNING = "learning"
    PROJECT_STATE = "project_state"
    EXECUTION_RESULT = "execution_result"


@dataclass(frozen=True, slots=True)
class SinoMemory:
    memory_type: SinoMemoryType
    title: str
    content: Mapping[str, Any]
    summary: str | None = None
    conversation_id: str | None = None
    decision_id: str | None = None
    task_asset_id: str | None = None
    artifact_id: str | None = None


class SinoMemoryRepository:
    """Persistence contract over canonical Founder MemoryAsset storage."""

    def save(self, memory: SinoMemory) -> MemoryAssetDB:
        return create_memory(
            memory_type=memory.memory_type.value,
            title=memory.title,
            content=json.dumps(dict(memory.content), ensure_ascii=False),
            summary=memory.summary,
            conversation_id=memory.conversation_id,
            decision_id=memory.decision_id,
            task_asset_id=memory.task_asset_id,
            artifact_id=memory.artifact_id,
        )

    def save_decision(self, *, title: str, decision: Mapping[str, Any], conversation_id: str | None = None) -> MemoryAssetDB:
        return self.save(SinoMemory(SinoMemoryType.DECISION, title, decision, conversation_id=conversation_id))

    def save_learning(self, *, title: str, learning: Mapping[str, Any], task_asset_id: str | None = None) -> MemoryAssetDB:
        return self.save(SinoMemory(SinoMemoryType.LEARNING, title, learning, task_asset_id=task_asset_id))

    def save_project_state(self, *, title: str, project_state: Mapping[str, Any], conversation_id: str | None = None) -> MemoryAssetDB:
        return self.save(SinoMemory(SinoMemoryType.PROJECT_STATE, title, project_state, conversation_id=conversation_id))

    def save_execution_result(self, *, title: str, result: Mapping[str, Any], task_asset_id: str | None = None, artifact_id: str | None = None) -> MemoryAssetDB:
        return self.save(SinoMemory(SinoMemoryType.EXECUTION_RESULT, title, result, task_asset_id=task_asset_id, artifact_id=artifact_id))
