from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RuntimeStateResponse(BaseModel):
    """
    system_runtime_state 的只读响应结构。

    本阶段未接入任何路由，仅作为后续阶段的可复用类型定义。
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
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
