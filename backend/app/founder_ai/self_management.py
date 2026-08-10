from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from typing import Any, Protocol

from app.founder_ai.execution_registry import list_execution_sessions
from app.intelligence.context import FounderContext, SinoContextManager

FOUNDER_SYSTEM_KEY = "founder_ai"


@dataclass(frozen=True, slots=True)
class ProjectState:
    system_id: str
    current_phase: str
    completed_capabilities: list[str]
    active_tasks: list[dict[str, Any]]
    blocked_items: list[dict[str, Any]]
    next_actions: list[dict[str, Any]]
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class PriorityAction:
    title: str
    reason: str
    priority: str
    requires_approval: bool = True


@dataclass(frozen=True, slots=True)
class StateAnalysis:
    status: str
    progress: dict[str, Any]
    risks: list[str]
    recommendations: list[PriorityAction]
    project_state: ProjectState

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class GitHistory(Protocol):
    def recent_commits(self, limit: int = 20) -> list[dict[str, str]]: ...


class GitHistoryReader:
    """Reads local project history without changing repository state."""

    def __init__(self, root: Path | None = None):
        configured = os.environ.get("AI_COMMERCE_PROJECT_ROOT")
        self.root = (root or (Path(configured) if configured else Path(__file__).resolve().parents[3])).resolve()

    def recent_commits(self, limit: int = 20) -> list[dict[str, str]]:
        result = subprocess.run(
            ["git", "-C", str(self.root), "log", f"-{limit}", "--pretty=format:%H%x1f%s%x1f%cI"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if result.returncode != 0:
            return []
        commits = []
        for line in result.stdout.splitlines():
            parts = line.split("\x1f", 2)
            if len(parts) == 3:
                commits.append({"hash": parts[0], "title": parts[1], "committed_at": parts[2]})
        return commits


class NextActionEngine:
    def recommend(self, *, context: FounderContext, executions: list[Any]) -> list[PriorityAction]:
        actions: list[PriorityAction] = []
        for item in context.project_state.blocked_items[:3]:
            actions.append(PriorityAction(f"解除阻塞：{item['title']}", "阻塞项会中断当前项目推进", "high"))
        for item in context.project_state.active_tasks[:3]:
            actions.append(PriorityAction(f"继续任务：{item['title']}", "该 TaskAsset 正处于活动状态", "medium"))
        failed = [item for item in executions if item.status == "failed"]
        for item in failed[:2]:
            actions.append(PriorityAction(f"复盘失败执行：{item.task_asset_id}", item.error_message or "Codex execution failed", "high"))
        if not actions:
            actions.append(PriorityAction("定义下一项 Founder 目标", "当前没有活动或阻塞任务", "medium"))
        order = {"high": 0, "medium": 1, "low": 2}
        return sorted(actions, key=lambda action: order[action.priority])[:5]


class SinoStateAnalyzer:
    """Combines Git, canonical assets, execution history, memory and decisions."""

    def __init__(self, *, context_manager: SinoContextManager | None = None, git_history: GitHistory | None = None, action_engine: NextActionEngine | None = None, execution_reader=None):
        self.context_manager = context_manager or SinoContextManager()
        self.git_history = git_history or GitHistoryReader()
        self.action_engine = action_engine or NextActionEngine()
        self.execution_reader = execution_reader or list_execution_sessions

    def analyze(self) -> StateAnalysis:
        context = self.context_manager.load()
        commits = self.git_history.recent_commits()
        executions = self.execution_reader()
        recommendations = self.action_engine.recommend(context=context, executions=executions)
        capabilities = self._capabilities(context, commits)
        completed = len(context.project_state.completed_tasks)
        total = completed + len(context.project_state.active_tasks) + len(context.project_state.blocked_items)
        risks = [f"阻塞：{item['title']}" for item in context.project_state.blocked_items]
        risks.extend(f"执行失败：{item.task_asset_id}" for item in executions if item.status == "failed")
        state = ProjectState(
            system_id=FOUNDER_SYSTEM_KEY,
            current_phase=context.project_state.current_phase,
            completed_capabilities=capabilities,
            active_tasks=context.project_state.active_tasks,
            blocked_items=context.project_state.blocked_items,
            next_actions=[asdict(item) for item in recommendations],
            updated_at=datetime.now(timezone.utc),
        )
        status = "blocked" if state.blocked_items else "active" if state.active_tasks else "ready"
        return StateAnalysis(
            status=status,
            progress={"completed": completed, "total": total, "percent": round(completed / total * 100) if total else 0},
            risks=risks,
            recommendations=recommendations,
            project_state=state,
        )

    @staticmethod
    def _capabilities(context: FounderContext, commits: list[dict[str, str]]) -> list[str]:
        values = [item["title"] for item in context.project_state.completed_tasks]
        values.extend(commit["title"] for commit in commits if commit["title"].lower().startswith(("feat:", "fix:")))
        return list(dict.fromkeys(values))[:20]
