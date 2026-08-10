from dataclasses import asdict, dataclass
from typing import Any, Mapping

from app.founder_ai.autonomous_planning import SinoStrategicAnalyzer
from app.founder_ai.execution_registry import list_execution_sessions
from app.founder_ai.self_management import SinoStateAnalyzer
from app.intelligence.context import FounderContext, SinoContextManager


@dataclass(frozen=True, slots=True)
class ReasoningContext:
    project_state: dict[str, Any]
    memory: list[dict[str, Any]]
    decision_history: list[dict[str, Any]]
    task_assets: list[dict[str, Any]]
    execution_history: list[dict[str, Any]]
    roadmap: dict[str, Any]
    capability_map: dict[str, Any]
    conversation_context: dict[str, Any]
    project_context: dict[str, Any]
    founder_context: FounderContext

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("founder_context", None)
        return data


class SinoContextCollector:
    """Collects bounded evidence before any reasoning occurs."""

    def __init__(self, *, context_manager: SinoContextManager | None = None, state_analyzer: SinoStateAnalyzer | None = None, strategic_analyzer: SinoStrategicAnalyzer | None = None, execution_reader=None):
        self.context_manager = context_manager or SinoContextManager()
        self.state_analyzer = state_analyzer or SinoStateAnalyzer(context_manager=self.context_manager)
        self.strategic_analyzer = strategic_analyzer or SinoStrategicAnalyzer(state_analyzer=self.state_analyzer, context_manager=self.context_manager)
        self.execution_reader = execution_reader or list_execution_sessions

    def collect(self, *, conversation_id: str | None = None, conversation_context: Mapping[str, Any] | None = None, project_context: Mapping[str, Any] | None = None) -> ReasoningContext:
        founder = self.context_manager.load(conversation_id)
        state = self.state_analyzer.analyze()
        strategy = self.strategic_analyzer.analyze(state_analysis=state, founder_context=founder)
        executions = [
            {"id": item.id, "task_asset_id": item.task_asset_id, "status": item.status, "result": item.result, "error_message": item.error_message}
            for item in self.execution_reader()
        ]
        return ReasoningContext(
            project_state=asdict(state.project_state),
            memory=list(founder.execution_memory),
            decision_history=list(founder.decision_memory),
            task_assets=list(founder.task_memory),
            execution_history=executions,
            roadmap=asdict(strategy.roadmap),
            capability_map=asdict(strategy.capability_map),
            conversation_context=dict(conversation_context or founder.conversation_memory),
            project_context=dict(project_context or {}),
            founder_context=founder,
        )
