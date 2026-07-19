from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TaskStatus = Literal["pending", "running", "completed", "failed"]


class TaskItemResponse(BaseModel):
    """
    单个任务的 API 响应结构。
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    task_type: str
    payload: dict[str, Any]
    assigned_agent: str | None
    priority: str
    status: str
    created_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    result: dict[str, Any] | None
    error: str | None


class TaskStatsResponse(BaseModel):
    """
    全库任务状态统计，不受筛选和分页影响。
    """

    total: int
    pending: int
    running: int
    completed: int
    failed: int
    queued: int


class TaskPaginationResponse(BaseModel):
    """
    当前查询的分页信息。
    """

    limit: int
    offset: int
    returned: int
    filtered_total: int


class TaskListResponse(BaseModel):
    """
    GET /api/v1/tasks 的完整响应结构。
    """

    stats: TaskStatsResponse
    items: list[TaskItemResponse]
    pagination: TaskPaginationResponse


class TaskSubmitRequest(BaseModel):
    """
    POST /api/v1/tasks/submit 的请求体。

    只负责把一条 pending 任务写入队列，不在请求中执行 Agent。
    assigned_agent 只做"是否已在 AgentRegistry 注册"的存在性
    校验，不检查该 Agent 当前的运行状态——Runtime stopped 时
    Agent 本来就可能处于 stopped，必须仍然允许提前排队。
    """

    assigned_agent: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="目标 AI 员工名称，必须已在 AgentRegistry 注册",
    )

    task: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description=(
            "任务描述文本；同时写入 TaskDB.task_type 与 "
            "payload['task']（受 TaskDB.task_type 列宽 "
            "VARCHAR(64) 限制，因此上限为 64 个字符）"
        ),
    )

    context: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "附加业务上下文，必须是 JSON object；不接受数组、"
            "字符串或 null。若其中包含 'task' 键，会被顶层 task "
            "字段覆盖，不会影响 Agent 实际执行时使用的任务描述。"
        ),
    )

    priority: Literal["high", "normal", "low"] = Field(
        default="normal",
        description="任务优先级，只允许 high/normal/low",
    )

    @field_validator("assigned_agent", "task", mode="before")
    @classmethod
    def _strip_string_fields(cls, value):
        if isinstance(value, str):
            return value.strip()

        return value


class TaskSubmitResponse(BaseModel):
    """
    POST /api/v1/tasks/submit 的响应结构（202 Accepted）。

    只返回安全的任务接收信息：不包含 payload、context、result、
    error 或任何内部 ORM 细节。status 恒为 "pending"（本接口只
    入队，不执行）。
    """

    id: str
    status: str
    assigned_agent: str | None
    task_type: str
    priority: str
    created_at: datetime
    message: str


class ExternalTaskSubmitRequest(BaseModel):
    """
    POST /api/v1/integrations/tasks/submit 的请求体（阶段 6A）。

    供 n8n 等外部系统在 API Key 鉴权通过后提交任务；按
    (source, request_id) 联合唯一做幂等去重——相同组合重复提交
    返回同一个已有任务，不创建第二条、不重新执行。
    """

    request_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="外部系统提供的幂等键，与 source 联合唯一",
    )

    source: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="外部系统标识，例如 n8n",
    )

    assigned_agent: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="目标 AI 员工名称，必须已在 AgentRegistry 注册",
    )

    task: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description=(
            "任务描述文本；同时写入 TaskDB.task_type 与 "
            "payload['task']（受 TaskDB.task_type 列宽 "
            "VARCHAR(64) 限制，因此上限为 64 个字符）"
        ),
    )

    context: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "附加业务上下文，必须是 JSON object；不接受数组、"
            "字符串或 null。若其中包含 'task' 键，会被顶层 task "
            "字段覆盖，不会影响 Agent 实际执行时使用的任务描述。"
        ),
    )

    priority: Literal["high", "normal", "low"] = Field(
        default="normal",
        description="任务优先级，只允许 high/normal/low",
    )

    @field_validator(
        "request_id", "source", "assigned_agent", "task", mode="before"
    )
    @classmethod
    def _strip_string_fields(cls, value):
        if isinstance(value, str):
            return value.strip()

        return value


class ExternalTaskSubmitResponse(BaseModel):
    """
    POST /api/v1/integrations/tasks/submit 的响应结构。

    首次提交返回 202、duplicate=false；相同 (source, request_id)
    重复提交返回 200、duplicate=true，且 id 与首次提交完全相同。
    只返回安全的任务接收信息：不包含 payload、context、result、
    error、API Key 或任何内部 ORM 细节。
    """

    id: str
    request_id: str
    source: str
    status: str
    assigned_agent: str | None
    task_type: str
    priority: str
    created_at: datetime
    duplicate: bool
    message: str


class TaskSafeQueryResponse(BaseModel):
    """
    GET /api/v1/integrations/tasks/{task_id} 的响应结构（阶段 7B）。

    供 n8n / 企业微信等外部调用方安全查询任务状态；只返回安全的
    展示字段，不包含 payload、context、原始 result/error、
    traceback、数据库异常或任何 ORM 内部字段。result/error 已经
    在后端完成脱敏和长度截断（见
    app.services.task_result_sanitizer），调用方拿到的
    safe_result/safe_error 可以直接展示，不需要再次过滤。
    """

    id: str
    status: str
    assigned_agent: str | None
    task_type: str
    priority: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    safe_result: str
    safe_error: str
