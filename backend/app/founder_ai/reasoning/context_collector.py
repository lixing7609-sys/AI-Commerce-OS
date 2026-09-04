from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

from app.founder_ai.autonomous_planning import SinoStrategicAnalyzer
from app.founder_ai.execution_registry import list_execution_sessions
from app.founder_ai.repository import ChangeImpactAnalyzer, CodeSearch, ComponentGraphBuilder, RepositoryIndexer
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
    repository_context: dict[str, Any] = field(default_factory=dict)
    code_context: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("founder_context", None)
        return data


class SinoContextCollector:
    """Collects bounded evidence before any reasoning occurs."""

    def __init__(self, *, context_manager: SinoContextManager | None = None, state_analyzer: SinoStateAnalyzer | None = None, strategic_analyzer: SinoStrategicAnalyzer | None = None, execution_reader=None, repository_indexer: RepositoryIndexer | None = None, code_search: CodeSearch | None = None, graph_builder: ComponentGraphBuilder | None = None, impact_analyzer: ChangeImpactAnalyzer | None = None):
        self.context_manager = context_manager or SinoContextManager()
        self.state_analyzer = state_analyzer or SinoStateAnalyzer(context_manager=self.context_manager)
        self.strategic_analyzer = strategic_analyzer or SinoStrategicAnalyzer(state_analyzer=self.state_analyzer, context_manager=self.context_manager)
        self.execution_reader = execution_reader or list_execution_sessions
        self.repository_indexer = repository_indexer or RepositoryIndexer()
        self.code_search = code_search or CodeSearch(self.repository_indexer.root)
        self.graph_builder = graph_builder or ComponentGraphBuilder(self.repository_indexer.root)
        self.impact_analyzer = impact_analyzer or ChangeImpactAnalyzer()

    def collect(self, *, user_goal: str = "", conversation_id: str | None = None, conversation_context: Mapping[str, Any] | None = None, project_context: Mapping[str, Any] | None = None) -> ReasoningContext:
        founder = self.context_manager.load(conversation_id)
        state = self.state_analyzer.analyze()
        strategy = self.strategic_analyzer.analyze(state_analysis=state, founder_context=founder)
        executions = [
            {"id": item.id, "task_asset_id": item.task_asset_id, "status": item.status, "result": item.result, "error_message": item.error_message}
            for item in self.execution_reader()
        ]
        repository_index = self.repository_indexer.index(refresh=True)
        search_goal = user_goal or str((conversation_context or {}).get("user_goal", ""))
        relevant_files = self.code_search.search(search_goal, repository_index)
        component_graph = self.graph_builder.build(repository_index)
        impact = self.impact_analyzer.analyze(search_goal, relevant_files, component_graph)
        relevant_paths = {item.path for item in relevant_files}
        graph_nodes = [asdict(item) for item in component_graph.nodes if item.path in relevant_paths or any(path in relevant_paths for path in item.relations)][:50]
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
            repository_context={**repository_index.summary(), "directories": repository_index.directories[:100]},
            code_context={"relevant_files": [item.to_dict() for item in relevant_files], "component_graph": graph_nodes, "impact": impact.to_dict()},
        )
