from datetime import datetime

from pydantic import BaseModel, Field


class AutoResumeUpdateRequest(BaseModel):
    """
    PUT /api/v1/runtime/auto-resume 的请求体。
    """

    enabled: bool = Field(
        ...,
        description="是否在下一次 backend startup 时尝试自动恢复 Runtime",
    )


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


class TaskConsumerStatusResponse(BaseModel):
    """
    TaskConsumerService.get_status() 的只读安全视图。

    只暴露安全字段：不包含 task payload、Agent result、
    task.error 原文、数据库连接信息、traceback 或 Token/API Key
    ——只有安全的 error_type、task_id、outcome 分类、计数和时间。
    """

    running: bool = Field(
        description=(
            "后台 asyncio 消费者循环当前是否仍在执行。这与 Runtime "
            "是否允许领取任务是两个独立概念：Runtime 手动 stop 后，"
            "消费者循环通常仍然存活（running=true），只是不再领取"
            "新的 pending 任务，直到 Runtime 再次 start。"
        )
    )
    healthy: bool = Field(
        description=(
            "等价于 running：消费者循环是否仍在正常执行、未意外"
            "退出。TaskConsumerService 当前不区分'临时可恢复错误'"
            "与'致命错误'——单次 iteration 级别的可恢复异常只会"
            "记录到 last_error_type 后继续循环（healthy 仍为 "
            "true）；只有循环体本身发生不可恢复异常导致协程退出"
            "时，running/healthy 才会变为 false。因此 healthy=true "
            "但 last_error_type 非空是正常组合，代表'消费者仍在"
            "正常工作，只是最近发生过一次已恢复的错误'。"
        )
    )
    stop_requested: bool = Field(
        description=(
            "是否已经发出停止请求。仅用于 backend 进程 shutdown"
            "（lifespan 内部调用），业务层面的 Runtime 手动 "
            "start/stop 不会设置此字段。"
        )
    )
    current_task_id: str | None = Field(
        description=(
            "最近一次处理或正在处理的任务 ID。当前实现在每次 "
            "process_next_pending_task() 调用返回后才更新该字段，"
            "不保证严格实时反映真正的 in-flight 任务——一次调用"
            "内部的领取、执行、写回是不可拆分观察的整体，调用"
            "尚未返回期间该字段不会变化。"
        )
    )
    processed_count: int = Field(
        description="已产生终结结果（completed/failed/state_conflict）的任务累计数量"
    )
    completed_count: int = Field(description="累计成功完成的任务数量")
    failed_count: int = Field(description="累计失败的任务数量")
    conflict_count: int = Field(
        description="累计因写回时状态已被人工/其它流程修改而放弃覆盖（state_conflict）的次数"
    )
    last_outcome: str | None = Field(
        description="最近一次 process_next_pending_task() 调用的结果分类"
    )
    last_error_type: str | None = Field(
        description=(
            "最近一次错误的安全异常类型名或固定安全分类标签，"
            "不包含原始异常文本（str(error)）"
        )
    )
    started_at: datetime | None = Field(
        description="消费者循环本次启动时间"
    )
    stopped_at: datetime | None = Field(
        description="消费者循环最近一次停止时间（仍在运行时为 None）"
    )


class RuntimeStatusResponse(BaseModel):
    """
    GET/POST /api/v1/runtime/* 的统一响应结构。

    running/status/started_at/stopped_at/agents 来自
    RuntimeEngine 的内存状态（与改造前字段保持兼容）；
    desired_state 到 updated_at 来自 system_runtime_state 持久化
    状态；consumer 来自 TaskConsumerService.get_status()。
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

    consumer: TaskConsumerStatusResponse
