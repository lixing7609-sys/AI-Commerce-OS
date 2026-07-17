from datetime import datetime, timezone
from typing import Any

from app.agents.agent_registry import AgentRegistry
from app.agents.default_agents import register_default_agents


class RuntimeEngine:
    """
    AI-Commerce-OS Runtime Engine。

    整个系统唯一运行时入口，负责：

    - Runtime 生命周期
    - AI Agent 注册与状态管理
    - Workflow 调度
    - Event 分发
    - Dashboard 状态通知
    """

    def __init__(self) -> None:
        self.running = False
        self.started_at: datetime | None = None
        self.stopped_at: datetime | None = None

        self._ensure_agents_registered()

    def _ensure_agents_registered(self) -> None:
        """
        确保系统默认 AI 员工已经注册。
        """

        if AgentRegistry.count() == 0:
            register_default_agents()

    def start(self) -> dict[str, Any]:
        """
        启动 RuntimeEngine 和全部 AI 员工。
        """

        self._ensure_agents_registered()

        if not self.running:
            self.running = True
            self.started_at = datetime.now(timezone.utc)
            self.stopped_at = None

        AgentRegistry.start_all()

        return self.status()

    def stop(self) -> dict[str, Any]:
        """
        停止 RuntimeEngine 和全部 AI 员工。
        """

        self._ensure_agents_registered()

        if self.running:
            self.running = False
            self.stopped_at = datetime.now(timezone.utc)

        AgentRegistry.stop_all()

        return self.status()

    def status(self) -> dict[str, Any]:
        """
        返回 RuntimeEngine 和 AI 员工的实时状态。
        """

        self._ensure_agents_registered()

        agents = AgentRegistry.list_status()

        running_agents = sum(
            1
            for agent in agents
            if agent["status"] == "running"
        )

        idle_agents = sum(
            1
            for agent in agents
            if agent["status"] == "idle"
        )

        stopped_agents = sum(
            1
            for agent in agents
            if agent["status"] == "stopped"
        )

        error_agents = sum(
            1
            for agent in agents
            if agent["status"] == "error"
        )

        return {
            "running": self.running,
            "status": "running" if self.running else "stopped",
            "started_at": (
                self.started_at.isoformat()
                if self.started_at
                else None
            ),
            "stopped_at": (
                self.stopped_at.isoformat()
                if self.stopped_at
                else None
            ),
            "agents": {
                "total": len(agents),
                "running": running_agents,
                "idle": idle_agents,
                "stopped": stopped_agents,
                "error": error_agents,
                "items": agents,
            },
        }


runtime_engine = RuntimeEngine()