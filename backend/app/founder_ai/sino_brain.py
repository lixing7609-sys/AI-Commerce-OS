from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

from app.founder_ai.orchestrator import classify_goal
from app.intelligence.context import FounderContext, SinoContextManager
from app.intelligence.provider import IntelligenceRequest
from app.intelligence.router import IntelligenceTask, ModelRouter


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

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SinoBrain:
    """Founder intelligence orchestrator. It plans; it never executes."""

    def __init__(self, *, context_manager: SinoContextManager | None = None, model_router: ModelRouter | None = None):
        self.context_manager = context_manager or SinoContextManager()
        self.model_router = model_router or ModelRouter()

    def analyze(self, *, user_goal: str, conversation_id: str | None = None, conversation_context: Mapping[str, Any] | None = None, project_context: Mapping[str, Any] | None = None) -> SinoBrainResult:
        goal = classify_goal(user_goal)
        founder_context = self.context_manager.load(conversation_id)
        route_task = self._route_task(goal.goal_type, user_goal)
        route = self.model_router.route(route_task)
        signals = self._signals(founder_context, conversation_context, project_context)
        plan = self._default_plan(goal.text, founder_context)
        recommendation = founder_context.project_state.next_recommended_action
        decision_summary = f"Advance {goal.goal_type} goal through an approval-gated task plan"
        rationale = "Built from Founder conversation, decision, task, execution, and project-state memory."

        try:
            provider = self.model_router.provider_for(route_task)
        except LookupError:
            provider = None
        if provider is not None:
            response = provider.reason(IntelligenceRequest(
                instruction=user_goal,
                context={"founder_context": founder_context.to_dict(), "conversation_context": dict(conversation_context or {}), "project_context": dict(project_context or {})},
                response_schema={"decision": "string", "rationale": "string", "task_plan": "list", "recommended_action": "string"},
            ))
            content = response.content
            decision_summary = str(content.get("decision", decision_summary))
            rationale = str(content.get("rationale", rationale))
            recommendation = str(content.get("recommended_action", recommendation))
            if isinstance(content.get("task_plan"), list):
                plan = [TaskPlanItem(title=str(item.get("title", item)) if isinstance(item, dict) else str(item)) for item in content["task_plan"]]
            route = type(route)(response.provider, response.model, route.executor)

        return SinoBrainResult(
            goal_analysis=GoalAnalysis(goal.goal_type, goal.text, founder_context.project_state.current_phase, signals),
            decision=BrainDecision(decision_summary, rationale, route.provider, route.model),
            task_plan=plan,
            recommended_action=recommendation,
            founder_context=founder_context,
        )

    @staticmethod
    def _route_task(goal_type: str, text: str) -> IntelligenceTask:
        lowered = text.lower()
        if any(token in lowered for token in ("成本", "cost", "cheap")):
            return IntelligenceTask.COST_OPTIMIZED
        if any(token in lowered for token in ("代码", "coding", "实现", "开发")):
            return IntelligenceTask.LONG_CODING
        return IntelligenceTask.STRATEGY if goal_type == "decision" else IntelligenceTask.ARCHITECTURE

    @staticmethod
    def _signals(context: FounderContext, conversation_context, project_context) -> list[str]:
        signals = [f"phase:{context.project_state.current_phase}", f"completed:{len(context.project_state.completed_tasks)}", f"active:{len(context.project_state.active_tasks)}", f"blocked:{len(context.project_state.blocked_items)}"]
        if conversation_context:
            signals.append("conversation_context")
        if project_context:
            signals.append("project_context")
        return signals

    @staticmethod
    def _default_plan(goal: str, context: FounderContext) -> list[TaskPlanItem]:
        plan = []
        if context.project_state.blocked_items:
            plan.append(TaskPlanItem(f"Resolve blocker: {context.project_state.blocked_items[0]['title']}"))
        plan.extend((TaskPlanItem(f"Confirm scope for: {goal}"), TaskPlanItem(f"Prepare execution package for: {goal}"), TaskPlanItem("Verify results and persist learning")))
        return plan
