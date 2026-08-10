from app.founder_ai.sino_brain import SinoBrain
from app.intelligence.context import FounderContext, ProjectState, SinoContextManager
from app.intelligence.provider import GPTProvider, IntelligenceRequest
from app.intelligence.router import IntelligenceTask, ModelRouter


class StubContextManager:
    def __init__(self, context):
        self.context = context

    def load(self, conversation_id=None):
        return self.context


def founder_context(*, active=None, blocked=None, next_action="Define the next Founder goal"):
    return FounderContext(
        conversation_memory={"user_goal": "Build AI Commerce OS"},
        decision_memory=[],
        task_memory=list(active or []) + list(blocked or []),
        execution_memory=[],
        project_state=ProjectState("execution", [], list(active or []), list(blocked or []), next_action),
    )


def test_goal_becomes_analysis():
    brain = SinoBrain(context_manager=StubContextManager(founder_context()))
    result = brain.analyze(user_goal="继续推进 AI Commerce OS")
    assert result.goal_analysis.objective == "继续推进 AI Commerce OS"
    assert result.goal_analysis.goal_type == "development"
    assert result.task_plan[0].approval_required is True


def test_context_drives_recommendation():
    active = {"id": "task-1", "title": "Integrate Brain API", "status": "active", "execution_status": "not_started"}
    brain = SinoBrain(context_manager=StubContextManager(founder_context(active=[active], next_action=active["title"])))
    result = brain.analyze(user_goal="继续推进")
    assert result.recommended_action == "Integrate Brain API"
    assert "active:1" in result.goal_analysis.context_signals


def test_memory_is_formed_into_project_state():
    completed = [{"title": "Foundation", "status": "completed"}]
    blocked = [{"title": "Provider credential", "status": "blocked"}]
    assert SinoContextManager._phase(completed, [], blocked) == "blocked"
    context = founder_context(blocked=blocked, next_action=blocked[0]["title"])
    assert context.project_state.blocked_items == blocked
    assert context.project_state.next_recommended_action == "Provider credential"


def test_provider_router_is_replaceable_and_routes_capabilities():
    gpt = GPTProvider(model="gpt-test", transport=lambda request: {"decision": request.instruction})
    router = ModelRouter({"gpt": gpt})
    assert router.route(IntelligenceTask.ARCHITECTURE).provider == "gpt"
    assert router.route(IntelligenceTask.LONG_CODING).provider == "claude"
    assert router.route(IntelligenceTask.EXECUTION).executor == "codex"
    assert router.route(IntelligenceTask.COST_OPTIMIZED).provider == "deepseek"
    response = router.provider_for(IntelligenceTask.STRATEGY).reason(IntelligenceRequest("choose"))
    assert response.content["decision"] == "choose"
    assert response.model == "gpt-test"
