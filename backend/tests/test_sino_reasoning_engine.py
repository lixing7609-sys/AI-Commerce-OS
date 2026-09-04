from dataclasses import dataclass
from datetime import datetime, timezone

from app.founder_ai.autonomous_planning import Capability, CapabilityMap, Roadmap, StrategicAnalysis
from app.founder_ai.reasoning import ReasoningContext, SinoContextCollector, SinoReasoningEngine
from app.founder_ai.self_management import ProjectState as ManagedProjectState
from app.founder_ai.self_management import StateAnalysis
from app.intelligence.context import FounderContext, ProjectState


def _founder_context() -> FounderContext:
    return FounderContext(
        conversation_memory={"user_goal": "继续推进 AI Commerce OS"},
        decision_memory=[{"title": "Keep Founder approval"}],
        task_memory=[{"title": "Reasoning Engine", "status": "active"}],
        execution_memory=[{"title": "System Builder complete"}],
        project_state=ProjectState("execution", active_tasks=[{"title": "Reasoning Engine"}]),
    )


def _reasoning_context() -> ReasoningContext:
    founder = _founder_context()
    return ReasoningContext(
        project_state={"current_phase": "execution", "active_tasks": [{"title": "Reasoning Engine"}], "blocked_items": []},
        memory=founder.execution_memory,
        decision_history=founder.decision_memory,
        task_assets=founder.task_memory,
        execution_history=[{"id": "exec-1", "status": "completed"}],
        roadmap={"current_phase": "AI System Builder", "future_phases": ["Memory Evolution"]},
        capability_map={"applications": [{"name": "Sino Founder AI", "status": "active"}, {"name": "Operator AI", "status": "blueprint"}]},
        conversation_context=founder.conversation_memory,
        project_context={"repository": "AI-Commerce-OS"},
        founder_context=founder,
    )


class StubContextManager:
    def load(self, conversation_id=None):
        return _founder_context()


class StubStateAnalyzer:
    def analyze(self):
        state = ManagedProjectState("founder_ai", "execution", ["System Builder"], [{"title": "Reasoning Engine"}], [], [], datetime.now(timezone.utc))
        return StateAnalysis("active", {"completed": 1, "total": 2, "percent": 50}, [], [], state)


class StubStrategicAnalyzer:
    def analyze(self, **_kwargs):
        roadmap = Roadmap("Founder-governed AI systems", "AI System Builder", ["Memory Evolution"], [], ["Sino Founder AI"], "active")
        capability_map = CapabilityMap("ai_commerce_os", [Capability("founder_ai", "Sino Founder AI", "active", "Strategic intelligence")])
        return StrategicAnalysis("Foundation active", ["Memory Evolution"], "AI System Builder", roadmap, capability_map, [], "System Builder", "Memory maturity", "Build reasoning")


@dataclass
class StubExecution:
    id: str = "exec-1"
    task_asset_id: str = "task-1"
    status: str = "completed"
    result: dict | None = None
    error_message: str | None = None


class StubCollector:
    def collect(self, **_kwargs):
        return _reasoning_context()


def test_context_collection_includes_all_reasoning_sources():
    collector = SinoContextCollector(
        context_manager=StubContextManager(),
        state_analyzer=StubStateAnalyzer(),
        strategic_analyzer=StubStrategicAnalyzer(),
        execution_reader=lambda: [StubExecution()],
    )

    context = collector.collect(conversation_id="conversation-1")

    assert context.project_state["current_phase"] == "execution"
    assert context.memory and context.decision_history and context.task_assets
    assert context.execution_history[0]["status"] == "completed"
    assert context.roadmap["current_phase"] == "AI System Builder"
    assert context.capability_map["applications"][0]["status"] == "active"


def test_reasoning_output_interprets_goal_instead_of_repeating_it():
    output, _ = SinoReasoningEngine(context_collector=StubCollector()).reason(user_goal="继续推进 AI Commerce OS")

    assert output.analysis.interpretation != "继续推进 AI Commerce OS"
    assert "capability gap" in output.analysis.interpretation
    assert output.analysis.current_state


def test_reasoning_generates_context_backed_evidence():
    output, _ = SinoReasoningEngine(context_collector=StubCollector()).reason(user_goal="继续推进 AI Commerce OS")

    assert {item.source for item in output.evidence} >= {"Project State", "Roadmap", "Decision History", "Capability Map"}
    assert all(item.fact and item.relevance for item in output.evidence)


def test_reasoning_generates_architecture_preserving_solution():
    output, _ = SinoReasoningEngine(context_collector=StubCollector()).reason(user_goal="升级 Founder 推理能力")

    assert len(output.solution.approach) >= 3
    assert "TaskAsset" in output.solution.architecture_impact
    assert output.risk.mitigation


def test_reasoning_generates_prioritized_approval_gated_tasks():
    output, _ = SinoReasoningEngine(context_collector=StubCollector()).reason(user_goal="实现 Reasoning Engine")

    assert [item.priority for item in output.task_plan] == sorted(item.priority for item in output.task_plan)
    assert all(item.approval_required for item in output.task_plan)
    assert output.execution_requirement.executor == "codex"
    assert output.execution_requirement.approval_required is True
