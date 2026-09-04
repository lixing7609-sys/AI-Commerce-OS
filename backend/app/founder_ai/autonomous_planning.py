from dataclasses import asdict, dataclass
from typing import Any

from app.founder_ai.self_management import SinoStateAnalyzer, StateAnalysis
from app.intelligence.context import FounderContext, SinoContextManager


@dataclass(frozen=True, slots=True)
class Roadmap:
    vision: str
    current_phase: str
    future_phases: list[str]
    milestones: list[dict[str, str]]
    capabilities: list[str]
    status: str


@dataclass(frozen=True, slots=True)
class Capability:
    key: str
    name: str
    status: str
    role: str


@dataclass(frozen=True, slots=True)
class CapabilityMap:
    system_id: str
    applications: list[Capability]


@dataclass(frozen=True, slots=True)
class StrategicAction:
    title: str
    reason: str
    priority: int
    requires_approval: bool = True


@dataclass(frozen=True, slots=True)
class StrategicAnalysis:
    current_strategic_position: str
    missing_capabilities: list[str]
    recommended_next_phase: str
    roadmap: Roadmap
    capability_map: CapabilityMap
    recommendations: list[StrategicAction]
    major_achievement: str
    strategic_risk: str
    recommended_decision: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SinoRoadmapEngine:
    """Maintains the long-term AI Commerce OS roadmap as planning data."""

    PHASES = ["Founder Intelligence Foundation", "AI System Builder", "Memory Evolution", "Application Blueprints", "Multi-System Orchestration"]

    def generate(self, completed_capabilities: list[str]) -> Roadmap:
        completed_text = " ".join(completed_capabilities).lower()
        if "ai system builder" in completed_text:
            index = 2 if "memory evolution" not in completed_text else 3
        else:
            index = 1 if any("sino founder" in item.lower() or "intelligence" in item.lower() for item in completed_capabilities) else 0
        current = self.PHASES[index]
        return Roadmap(
            vision="Build AI Commerce OS as a Founder-governed family of specialized AI application systems.",
            current_phase=current,
            future_phases=self.PHASES[index + 1 :],
            milestones=[{"phase": phase, "status": "current" if phase == current else "completed" if position < index else "planned"} for position, phase in enumerate(self.PHASES)],
            capabilities=["Sino Founder AI", "AI System Builder", "Memory Evolution", "Application Blueprint Governance", "Cross-System Orchestration"],
            status="active",
        )


class CapabilityMapEngine:
    """Defines application-system capabilities; non-Founder systems remain blueprints."""

    def generate(self) -> CapabilityMap:
        return CapabilityMap(
            system_id="ai_commerce_os",
            applications=[
                Capability("founder_ai", "Sino Founder AI", "active", "Strategic intelligence and Founder governance"),
                Capability("operator_ai", "Operator AI", "blueprint", "Commerce operations"),
                Capability("studio_ai", "Studio AI", "blueprint", "Creative production"),
                Capability("industrial_ai", "Industrial AI", "blueprint", "Industrial workflows"),
                Capability("quant_ai", "Quant AI", "blueprint", "Quantitative intelligence"),
            ],
        )


class SinoStrategicAnalyzer:
    def __init__(self, *, state_analyzer: SinoStateAnalyzer | None = None, context_manager: SinoContextManager | None = None, roadmap_engine: SinoRoadmapEngine | None = None, capability_engine: CapabilityMapEngine | None = None):
        self.state_analyzer = state_analyzer or SinoStateAnalyzer()
        self.context_manager = context_manager or SinoContextManager()
        self.roadmap_engine = roadmap_engine or SinoRoadmapEngine()
        self.capability_engine = capability_engine or CapabilityMapEngine()

    def analyze(self, *, state_analysis: StateAnalysis | None = None, founder_context: FounderContext | None = None) -> StrategicAnalysis:
        state_analysis = state_analysis or self.state_analyzer.analyze()
        founder_context = founder_context or self.context_manager.load()
        completed = state_analysis.project_state.completed_capabilities
        roadmap = self.roadmap_engine.generate(completed)
        capability_map = self.capability_engine.generate()
        completed_text = " ".join(completed).lower()
        missing = [name for name in ("AI System Builder", "Memory Evolution", "Application Blueprint Governance") if name.lower() not in completed_text]
        actions = self._actions(missing)
        achievement = completed[0] if completed else "Sino Founder AI strategic foundation established"
        risk = state_analysis.risks[0] if state_analysis.risks else ("Memory learning loop is not yet mature" if founder_context.execution_memory else "Strategic capabilities remain incomplete")
        position = f"{roadmap.current_phase}: Founder intelligence is active; four future application systems remain blueprint-only."
        return StrategicAnalysis(
            current_strategic_position=position,
            missing_capabilities=missing,
            recommended_next_phase=roadmap.current_phase,
            roadmap=roadmap,
            capability_map=capability_map,
            recommendations=actions,
            major_achievement=achievement,
            strategic_risk=risk,
            recommended_decision=actions[0].title,
        )

    @staticmethod
    def _actions(missing: list[str]) -> list[StrategicAction]:
        candidates = [
            StrategicAction("Build AI System Builder", "Sino Founder AI 已具备创建和治理其他 AI Application 的基础。", 1),
            StrategicAction("Complete Memory Evolution", "长期战略需要持续学习和决策复用能力。", 2),
            StrategicAction("Prepare Operator AI Blueprint", "先完成边界、能力与授权规划，不进入实现。", 3),
        ]
        if "AI System Builder" not in missing:
            candidates = candidates[1:]
        if "Memory Evolution" not in missing:
            candidates = [item for item in candidates if item.title != "Complete Memory Evolution"]
        return candidates
