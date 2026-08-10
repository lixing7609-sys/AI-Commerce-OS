from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.founder_ai import api
from app.founder_ai.autonomous_planning import CapabilityMapEngine, SinoRoadmapEngine, SinoStrategicAnalyzer
from app.founder_ai.self_management import ProjectState, StateAnalysis
from app.intelligence.context import FounderContext
from app.intelligence.context import ProjectState as ContextProjectState
from app.main import app


class StubStateAnalyzer:
    def __init__(self, analysis): self.analysis = analysis
    def analyze(self): return self.analysis


class StubContextManager:
    def load(self): return FounderContext({}, [], [], [], ContextProjectState("iteration"))


def state_analysis(capabilities=None):
    state = ProjectState("founder_ai", "iteration", capabilities or [], [], [], [], datetime.now(timezone.utc))
    return StateAnalysis("ready", {"completed": 1, "total": 1, "percent": 100}, [], [], state)


def test_roadmap_generation_advances_from_founder_intelligence():
    roadmap = SinoRoadmapEngine().generate(["feat: add sino founder ai intelligence core"])
    assert roadmap.current_phase == "AI System Builder"
    assert roadmap.future_phases[-1] == "Multi-System Orchestration"
    assert next(item for item in roadmap.milestones if item["phase"] == "AI System Builder")["status"] == "current"


def test_capability_map_keeps_future_applications_as_blueprints():
    capability_map = CapabilityMapEngine().generate()
    statuses = {item.name: item.status for item in capability_map.applications}
    assert statuses["Sino Founder AI"] == "active"
    assert statuses["Operator AI"] == "blueprint"
    assert statuses["Studio AI"] == "blueprint"
    assert statuses["Industrial AI"] == "blueprint"
    assert statuses["Quant AI"] == "blueprint"


def test_strategic_recommendation_prioritizes_system_builder():
    analyzer = SinoStrategicAnalyzer(state_analyzer=StubStateAnalyzer(state_analysis(["Sino Founder AI Intelligence Core"])), context_manager=StubContextManager())
    result = analyzer.analyze()
    assert result.current_strategic_position.startswith("AI System Builder")
    assert result.missing_capabilities[0] == "AI System Builder"
    assert result.recommendations[0].title == "Build AI System Builder"
    assert result.recommendations[0].requires_approval is True


def test_strategy_api_returns_roadmap_capabilities_and_recommendations(monkeypatch):
    analyzer = SinoStrategicAnalyzer(state_analyzer=StubStateAnalyzer(state_analysis(["Sino Founder AI"])), context_manager=StubContextManager())
    monkeypatch.setattr(api.strategic_analyzer, "analyze", analyzer.analyze)
    with TestClient(app) as client:
        response = client.get("/api/v1/founder-ai/strategy")
    assert response.status_code == 200
    body = response.json()
    assert body["current_phase"] == "AI System Builder"
    assert len(body["capability_status"]["applications"]) == 5
    assert body["recommendations"][0]["priority"] == 1
