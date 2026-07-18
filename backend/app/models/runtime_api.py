from datetime import datetime

from pydantic import BaseModel


class RuntimeAgentInfo(BaseModel):
    """
    单个 Agent 的实时状态（来自 RuntimeEngine 内存）。
    """

    name: str
    role: str
    description: str
    status: str
    current_task: str | None
    last_run_at: str | None
    last_error: str | None


class RuntimeAgentsSummary(BaseModel):
    """
    全部 Agent 的汇总状态。
    """

    total: int
    running: int
    idle: int
    stopped: int
    error: int
    items: list[RuntimeAgentInfo]


class RuntimeStatusResponse(BaseModel):
    """
    GET/POST /api/v1/runtime/* 的统一响应结构。

    running/status/started_at/stopped_at/agents 来自
    RuntimeEngine 的内存状态（与改造前字段保持兼容）；
    其余字段来自 system_runtime_state 持久化状态。
    """

    running: bool
    status: str
    started_at: str | None
    stopped_at: str | None
    agents: RuntimeAgentsSummary

    desired_state: str
    actual_state: str
    auto_resume_enabled: bool
    last_started_at: datetime | None
    last_stopped_at: datetime | None
    last_heartbeat_at: datetime | None
    last_shutdown_type: str
    last_error: str | None
    recovery_failure_count: int
    updated_at: datetime
