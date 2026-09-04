from types import SimpleNamespace

from app.founder_ai import api
from app.founder_ai.sino_brain import BrainDecision, GoalAnalysis, SinoBrainResult, TaskPlanItem
from app.intelligence.context import FounderContext, ProjectState


def test_brain_api_prepares_existing_execution_contract(monkeypatch):
    context = FounderContext({}, [], [], [], ProjectState("planning"))
    result = SinoBrainResult(
        GoalAnalysis("development", "继续推进 AI Commerce OS", "planning", ["phase:planning"]),
        BrainDecision("Continue foundation", "Context indicates planning", "gpt", "gpt"),
        [TaskPlanItem("Build intelligence core")],
        "Build intelligence core",
        context,
    )
    monkeypatch.setattr(api, "get_conversation", lambda _: SimpleNamespace(system_id="founder_ai"))
    monkeypatch.setattr(api.brain, "analyze", lambda **_: result)

    response = api.analyze_with_sino_brain("conversation-1", api.SinoBrainIn(user_goal="继续推进 AI Commerce OS"))
    assert response.goal_analysis["objective"] == "继续推进 AI Commerce OS"
    assert response.task_plan[0]["title"] == "Build intelligence core"
    assert response.task_asset_draft.conversation_id == "conversation-1"
    assert response.execution_package.execution_allowed is False
