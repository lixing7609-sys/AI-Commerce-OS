from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

from app.founder_ai.orchestrator import classify_goal
from app.intelligence.context import FounderContext, SinoContextManager
from app.founder_ai.reasoning import ReasoningOutput, SinoContextCollector, SinoReasoningEngine
from app.intelligence.router import ModelRouter


@dataclass(frozen=True, slots=True)
class GoalAnalysis:
    goal_type: str
    objective: str
    current_phase: str
    context_signals: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class BrainDecision:
    summary: str
    rationale: str
    provider: str
    model: str


@dataclass(frozen=True, slots=True)
class TaskPlanItem:
    title: str
    status: str = "proposed"
    approval_required: bool = True


@dataclass(frozen=True, slots=True)
class SinoBrainResult:
    goal_analysis: GoalAnalysis
    decision: BrainDecision
    task_plan: list[TaskPlanItem]
    recommended_action: str
    founder_context: FounderContext
    reasoning: ReasoningOutput | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SinoBrain:
    """Founder intelligence orchestrator. It plans; it never executes."""

    def __init__(self, *, context_manager: SinoContextManager | None = None, model_router: ModelRouter | None = None, reasoning_engine: SinoReasoningEngine | None = None):
        self.context_manager = context_manager or SinoContextManager()
        self.model_router = model_router or ModelRouter()
        self.reasoning_engine = reasoning_engine or SinoReasoningEngine(
            context_collector=SinoContextCollector(context_manager=self.context_manager),
            model_router=self.model_router,
        )

    def analyze(self, *, user_goal: str, conversation_id: str | None = None, conversation_context: Mapping[str, Any] | None = None, project_context: Mapping[str, Any] | None = None) -> SinoBrainResult:
        goal = classify_goal(user_goal)
        supplied_constraints = (conversation_context or {}).get("constraints", [])
        constraints = [str(item) for item in supplied_constraints] if isinstance(supplied_constraints, list) else []
        reasoning, context = self.reasoning_engine.reason(
            user_goal=user_goal,
            conversation_id=conversation_id,
            conversation_context=conversation_context,
            project_context=project_context,
            constraints=constraints,
        )
        founder_context = context.founder_context
        signals = self._signals(founder_context, conversation_context, project_context)
        plan = [TaskPlanItem(item.title, approval_required=item.approval_required) for item in reasoning.task_plan]
        recommendation = founder_context.project_state.next_recommended_action or reasoning.execution_requirement.recommendation
        rationale = " ".join(item.fact for item in reasoning.evidence)

        return SinoBrainResult(
            goal_analysis=GoalAnalysis(goal.goal_type, goal.text, founder_context.project_state.current_phase, signals),
            decision=BrainDecision(reasoning.solution.summary, rationale, reasoning.provider, reasoning.model),
            task_plan=plan,
            recommended_action=recommendation,
            founder_context=founder_context,
            reasoning=reasoning,
        )

    @staticmethod
    def _signals(context: FounderContext, conversation_context, project_context) -> list[str]:
        signals = [f"phase:{context.project_state.current_phase}", f"completed:{len(context.project_state.completed_tasks)}", f"active:{len(context.project_state.active_tasks)}", f"blocked:{len(context.project_state.blocked_items)}"]
        if conversation_context:
            signals.append("conversation_context")
        if project_context:
            signals.append("project_context")
        return signals
