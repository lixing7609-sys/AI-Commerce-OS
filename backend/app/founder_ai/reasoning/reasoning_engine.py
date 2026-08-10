from typing import Any, Mapping

from app.founder_ai.reasoning.context_collector import ReasoningContext, SinoContextCollector
from app.founder_ai.reasoning.output_schema import Analysis, Evidence, ExecutionRequirement, ReasoningOutput, ReasoningTask, Risk, Solution
from app.intelligence.provider import IntelligenceRequest
from app.intelligence.router import IntelligenceTask, ModelRouter


class SinoReasoningEngine:
    """Evidence-led Founder reasoning. It produces plans but never executes them."""

    def __init__(self, *, context_collector: SinoContextCollector | None = None, model_router: ModelRouter | None = None):
        self.context_collector = context_collector or SinoContextCollector()
        self.model_router = model_router or ModelRouter()

    def reason(self, *, user_goal: str, conversation_id: str | None = None, conversation_context: Mapping[str, Any] | None = None, project_context: Mapping[str, Any] | None = None, constraints: list[str] | None = None) -> tuple[ReasoningOutput, ReasoningContext]:
        goal = (user_goal or "").strip()
        if not goal:
            raise ValueError("user_goal must not be empty")
        context = self.context_collector.collect(conversation_id=conversation_id, conversation_context=conversation_context, project_context=project_context)
        route_task = self._route(goal)
        route = self.model_router.route(route_task)
        fallback = self._synthesize(goal, context, list(constraints or []), route.provider, route.model)
        try:
            provider = self.model_router.provider_for(route_task)
        except LookupError:
            return fallback, context
        response = provider.reason(IntelligenceRequest(
            instruction=f"Reason about this Founder goal and return evidence-led structured output: {goal}",
            context={**context.to_dict(), "constraints": constraints},
            response_schema={
                "analysis": {"interpretation": "string", "current_state": "string", "desired_outcome": "string", "gap": "string"},
                "evidence": [{"source": "string", "fact": "string", "relevance": "string"}],
                "solution": {"summary": "string", "approach": ["string"], "architecture_impact": "string"},
                "risk": {"level": "string", "items": ["string"], "mitigation": ["string"]},
                "task_plan": [{"title": "string", "reason": "string", "priority": "integer", "dependencies": ["string"], "approval_required": "boolean"}],
                "execution_requirement": {"executor": "string", "approval_required": "boolean", "constraints": ["string"], "verification": ["string"], "recommendation": "string"},
            },
        ))
        return self._from_provider(response.content, fallback, response.provider, response.model), context

    @staticmethod
    def _route(goal: str) -> IntelligenceTask:
        lowered = goal.lower()
        if any(item in lowered for item in ("成本", "cost", "budget")):
            return IntelligenceTask.COST_OPTIMIZED
        if any(item in lowered for item in ("代码", "开发", "实现", "coding", "refactor")):
            return IntelligenceTask.LONG_CODING
        if any(item in lowered for item in ("策略", "战略", "decision", "roadmap")):
            return IntelligenceTask.STRATEGY
        return IntelligenceTask.ARCHITECTURE

    def _synthesize(self, goal: str, context: ReasoningContext, constraints: list[str], provider: str, model: str) -> ReasoningOutput:
        state = context.project_state
        phase = str(state.get("current_phase", "planning"))
        active = list(state.get("active_tasks", []))
        blocked = list(state.get("blocked_items", []))
        roadmap_phase = str(context.roadmap.get("current_phase", phase))
        evidence = [
            Evidence("Project State", f"Current phase is {phase}; {len(active)} active and {len(blocked)} blocked tasks are recorded.", "Determines delivery capacity and immediate constraints."),
            Evidence("Roadmap", f"Strategic phase is {roadmap_phase} with {len(context.roadmap.get('future_phases', []))} future phases.", "Prevents a local task from diverging from long-term direction."),
            Evidence("Decision History", f"{len(context.decision_history)} prior decisions and {len(context.memory)} execution memories are available.", "Provides precedent and learning signals."),
            Evidence("Capability Map", f"{sum(1 for item in context.capability_map.get('applications', []) if item.get('status') == 'active')} application system is active; remaining systems are blueprints.", "Defines the current application boundary."),
        ]
        gap = f"The requested outcome is not yet represented by a verified completed capability in phase {phase}."
        approach = ["Confirm the goal against roadmap and application boundaries", "Resolve recorded blockers before implementation" if blocked else "Translate the capability gap into bounded TaskAssets", "Prepare an approval-gated Codex execution package", "Verify results and persist decision and execution learning"]
        tasks = []
        if blocked:
            tasks.append(ReasoningTask(f"Resolve blocker: {blocked[0].get('title', 'project blocker')}", "Execution cannot be considered safe while a recorded blocker remains.", 1))
        base = len(tasks)
        tasks.extend((
            ReasoningTask("Define target architecture and acceptance evidence", "A verifiable boundary is required before implementation.", base + 1),
            ReasoningTask("Implement the smallest complete capability slice", "Incremental delivery limits architectural and execution risk.", base + 2, ["Define target architecture and acceptance evidence"]),
            ReasoningTask("Run verification and persist learning", "Project state and future reasoning require durable evidence.", base + 3, ["Implement the smallest complete capability slice"]),
        ))
        risk_items = [f"Recorded blocker: {item.get('title', 'unknown')}" for item in blocked] or ["Scope expansion beyond the current roadmap phase", "Execution without sufficient acceptance evidence"]
        merged_constraints = ["Founder approval is required before execution", "Preserve existing application boundaries", *constraints]
        return ReasoningOutput(
            Analysis(f"This goal requires closing a capability gap in {roadmap_phase}, not merely classifying intent.", f"AI Commerce OS is in {phase} with {len(active)} active tasks.", "A verified capability integrated with Project State, Memory and the approval boundary.", gap),
            evidence,
            Solution(f"Deliver the goal as an evidence-backed, approval-gated capability increment aligned to {roadmap_phase}.", approach, "Extends Founder intelligence while preserving TaskAsset, Memory and Execution Loop boundaries."),
            Risk("high" if blocked else "medium", risk_items, ["Resolve blockers first", "Require Founder approval", "Run verification before persisting completion"]),
            tasks,
            ExecutionRequirement("codex", True, merged_constraints, ["Review architecture boundary", "Run backend and frontend tests", "Verify build and persist result"], "Prepare execution after Founder reviews evidence, solution and task plan."),
            provider,
            model,
        )

    @staticmethod
    def _from_provider(content: Mapping[str, Any], fallback: ReasoningOutput, provider: str, model: str) -> ReasoningOutput:
        def value(name): return content.get(name) if isinstance(content.get(name), dict) else {}
        analysis, solution, risk, execution = value("analysis"), value("solution"), value("risk"), value("execution_requirement")
        evidence = content.get("evidence") if isinstance(content.get("evidence"), list) else []
        tasks = content.get("task_plan") if isinstance(content.get("task_plan"), list) else []
        return ReasoningOutput(
            Analysis(str(analysis.get("interpretation", fallback.analysis.interpretation)), str(analysis.get("current_state", fallback.analysis.current_state)), str(analysis.get("desired_outcome", fallback.analysis.desired_outcome)), str(analysis.get("gap", fallback.analysis.gap))),
            [Evidence(str(item.get("source", "Provider")), str(item.get("fact", "")), str(item.get("relevance", ""))) for item in evidence if isinstance(item, dict)] or fallback.evidence,
            Solution(str(solution.get("summary", fallback.solution.summary)), list(solution.get("approach", fallback.solution.approach)), str(solution.get("architecture_impact", fallback.solution.architecture_impact))),
            Risk(str(risk.get("level", fallback.risk.level)), list(risk.get("items", fallback.risk.items)), list(risk.get("mitigation", fallback.risk.mitigation))),
            [ReasoningTask(str(item.get("title", "Task")), str(item.get("reason", "Provider recommendation")), int(item.get("priority", index + 1)), list(item.get("dependencies", [])), bool(item.get("approval_required", True))) for index, item in enumerate(tasks) if isinstance(item, dict)] or fallback.task_plan,
            ExecutionRequirement(str(execution.get("executor", "codex")), True, list(execution.get("constraints", fallback.execution_requirement.constraints)), list(execution.get("verification", fallback.execution_requirement.verification)), str(execution.get("recommendation", fallback.execution_requirement.recommendation))),
            provider,
            model,
        )
