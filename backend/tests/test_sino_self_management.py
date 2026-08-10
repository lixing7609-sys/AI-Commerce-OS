from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.founder_ai import api
from app.founder_ai.self_management import NextActionEngine, PriorityAction, ProjectState, SinoStateAnalyzer, StateAnalysis
from app.intelligence.context import FounderContext
from app.intelligence.context import ProjectState as ContextProjectState
from app.main import app


class StubContextManager:
    def __init__(self, context):
        self.context = context

    def load(self):
        return self.context


class StubGitHistory:
    def recent_commits(self, limit=20):
        return [{"hash": "abc", "title": "feat: add intelligence core", "committed_at": "2026-08-10T00:00:00Z"}]


def make_context(*, completed=None, active=None, blocked=None):
    completed, active, blocked = completed or [], active or [], blocked or []
    phase = "blocked" if blocked else "execution" if active else "iteration" if completed else "planning"
    return FounderContext({}, [{"decision": "Keep approval boundary"}], completed + active + blocked, [], ContextProjectState(phase, completed, active, blocked, "next"))


def test_project_state_generation_includes_git_and_task_capabilities():
    context = make_context(completed=[{"id": "t1", "title": "Sino Brain", "status": "completed"}])
    analyzer = SinoStateAnalyzer(context_manager=StubContextManager(context), git_history=StubGitHistory(), execution_reader=lambda: [])
    result = analyzer.analyze()
    assert result.project_state.system_id == "founder_ai"
    assert result.project_state.current_phase == "iteration"
    assert result.project_state.completed_capabilities == ["Sino Brain", "feat: add intelligence core"]
    assert result.project_state.updated_at.tzinfo is not None


def test_current_status_analysis_reports_progress_and_risks():
    completed = [{"id": "t1", "title": "Done", "status": "completed"}]
    blocked = [{"id": "t2", "title": "Provider setup", "status": "blocked"}]
    analyzer = SinoStateAnalyzer(context_manager=StubContextManager(make_context(completed=completed, blocked=blocked)), git_history=StubGitHistory(), execution_reader=lambda: [])
    result = analyzer.analyze()
    assert result.status == "blocked"
    assert result.progress == {"completed": 1, "total": 2, "percent": 50}
    assert result.risks == ["阻塞：Provider setup"]


def test_next_action_engine_prioritizes_blockers_and_requires_approval():
    blocked = [{"id": "t2", "title": "Database migration", "status": "blocked"}]
    actions = NextActionEngine().recommend(context=make_context(blocked=blocked), executions=[])
    assert actions[0].title == "解除阻塞：Database migration"
    assert actions[0].priority == "high"
    assert actions[0].requires_approval is True


def test_founder_briefing_api_contract(monkeypatch):
    state = ProjectState("founder_ai", "execution", ["Sino Brain"], [{"title": "Runtime"}], [], [{"title": "Continue"}], datetime.now(timezone.utc))
    analysis = StateAnalysis("active", {"completed": 1, "total": 2, "percent": 50}, [], [PriorityAction("Continue", "Active task", "medium")], state)
    monkeypatch.setattr(api.state_analyzer, "analyze", lambda: analysis)
    with TestClient(app) as client:
        response = client.get("/api/v1/founder-ai/briefing")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["completed"] == ["Sino Brain"]
    assert body["active"] == [{"title": "Runtime"}]
    assert body["recommendations"][0]["requires_approval"] is True
