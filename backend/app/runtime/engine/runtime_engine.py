from datetime import datetime, timezone
from typing import Any


class RuntimeEngine:
    """
    AI-Commerce-OS Runtime Engine

    整个系统唯一运行时入口。

    负责：

    - Runtime 生命周期
    - Agent 调度
    - Workflow 调度
    - Event 分发
    - Dashboard 状态通知
    """

    def __init__(self) -> None:
        self.running = False
        self.started_at: datetime | None = None
        self.stopped_at: datetime | None = None

    def start(self) -> dict[str, Any]:
        """
        启动 RuntimeEngine。
        """

        if not self.running:
            self.running = True
            self.started_at = datetime.now(timezone.utc)
            self.stopped_at = None

        return self.status()

    def stop(self) -> dict[str, Any]:
        """
        停止 RuntimeEngine。
        """

        if self.running:
            self.running = False
            self.stopped_at = datetime.now(timezone.utc)

        return self.status()

    def status(self) -> dict[str, Any]:
        """
        返回当前运行状态。
        """

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
        }


runtime_engine = RuntimeEngine()