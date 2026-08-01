from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SinoStateInput(BaseModel):
    topic: str | None = None
    stage: str | None = None
    consensus: list[Any] = Field(default_factory=list)
    pendingConfirmations: list[Any] = Field(default_factory=list)
    rejected: list[Any] = Field(default_factory=list)
    constraints: list[Any] = Field(default_factory=list)


class RecentMessageInput(BaseModel):
    role: str
    text: str


class BrainCompleteRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=64)
    message: str = Field(..., min_length=1, max_length=4000)
    sino_state: SinoStateInput
    recent_messages: list[RecentMessageInput] = Field(default_factory=list)
    knowledge: list[str] = Field(default_factory=list)


class BrainCompleteResponse(BaseModel):
    mock: bool
    connector_run_id: str | None = None
    reply: str | None = None
    topic_update: str | None = None
    stage_suggestion: str | None = None
    consensus_add: list[str] = Field(default_factory=list)
    pending_add: list[str] = Field(default_factory=list)
    rejected_add: list[str] = Field(default_factory=list)
    constraint_add: list[str] = Field(default_factory=list)
    suggest_invite_other_models: bool = False
    ready_for_decision: bool = False
    parse_error: bool = False
    recoverable: bool = True
    error_type: str | None = None
    error_message: str | None = None


class TaskPackagePreviewRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=64)
    decision_id: str | None = None
    task_package: dict[str, Any]


class TaskPackagePreviewResponse(BaseModel):
    task_package_id: str
    connector_run_id: str


class ExecutionStartRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1, max_length=64)
    decision_id: str | None = None
    task_package_id: str = Field(..., min_length=1, max_length=64)
    task_package: dict[str, Any]


class ExecutionStartResponse(BaseModel):
    run_id: str
    status: str
    mock: bool = False


class ExecutionInputRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=4000)


class ExecutionStatusResponse(BaseModel):
    run_id: str
    kind: str
    status: str
    conversation_id: str
    decision_id: str | None = None
    task_package_id: str | None = None
    current_step: str | None = None
    awaiting_input_question: str | None = None
    awaiting_input_kind: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    duration_ms: float | None = None
    error: str | None = None
    detail: dict[str, Any] = Field(default_factory=dict)


class ConnectorHealthResponse(BaseModel):
    brain: dict[str, Any]
    executor: dict[str, Any]
