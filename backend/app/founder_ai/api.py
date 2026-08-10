from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.context.service import get_founder_context
from app.core.conversation.service import get_conversation
from app.founder_ai.orchestrator import (
    FOUNDER_SYSTEM_KEY,
    TaskAssetDraft,
    build_execution_package,
    generate_task_asset_draft,
)
from app.founder_ai.execution_registry import approve_execution_session, create_execution_session
from app.founder_ai.execution_registry import get_execution_session
from app.founder_ai.execution_worker import enqueue_execution, execution_queue
from app.founder_ai.sino_brain import SinoBrain
from app.founder_ai.self_management import SinoStateAnalyzer
from app.founder_ai.autonomous_planning import SinoStrategicAnalyzer
from app.founder_ai.system_builder import ApplicationRegistry, SinoSystemBuilder


class FounderAnalyzeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=10000)
    context: dict[str, Any] | None = None


class GoalClassificationOut(BaseModel):
    goal_type: str
    text: str
    system_id: str


class TaskAssetDraftOut(BaseModel):
    title: str
    description: str
    scope: dict[str, Any]
    constraints: list[str]
    risk: str
    approval_required: bool
    system_id: str
    conversation_id: str | None
    goal_type: str


class ExecutionPackageOut(BaseModel):
    goal: str
    context: dict[str, Any]
    task_asset: TaskAssetDraftOut
    constraints: list[str]
    verification: list[str]
    commit_requirement: str
    approval_required: bool
    execution_allowed: bool


class FounderAnalyzeOut(BaseModel):
    goal_classification: GoalClassificationOut
    task_asset_draft: TaskAssetDraftOut
    execution_package: ExecutionPackageOut


class SinoBrainIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_goal: str = Field(min_length=1, max_length=10000)
    conversation_context: dict[str, Any] | None = None
    project_context: dict[str, Any] | None = None


class SinoBrainOut(BaseModel):
    analysis: dict[str, Any]
    evidence: list[dict[str, Any]]
    solution: dict[str, Any]
    risk: dict[str, Any]
    execution_requirement: dict[str, Any]
    goal_analysis: dict[str, Any]
    decision: dict[str, Any]
    task_plan: list[dict[str, Any]]
    recommended_action: str
    project_state: dict[str, Any]
    task_asset_draft: TaskAssetDraftOut
    execution_package: ExecutionPackageOut


class FounderBriefingOut(BaseModel):
    status: str
    completed: list[str]
    active: list[dict[str, Any]]
    blocked: list[dict[str, Any]]
    recommendations: list[dict[str, Any]]
    progress: dict[str, Any]
    risks: list[str]
    project_state: dict[str, Any]
    current_strategic_phase: str
    major_achievement: str
    strategic_risk: str
    recommended_decision: str


class FounderStrategyOut(BaseModel):
    current_phase: str
    roadmap: dict[str, Any]
    capability_status: dict[str, Any]
    recommendations: list[dict[str, Any]]
    current_strategic_position: str
    missing_capabilities: list[str]
    recommended_next_phase: str


class SystemBuildIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_goal: str = Field(min_length=1, max_length=10000)
    conversation_id: str | None = None


class SystemBuildOut(BaseModel):
    system_blueprint: dict[str, Any]
    generated_capabilities: dict[str, Any]
    agent_architecture: dict[str, Any]
    task_asset_draft: TaskAssetDraftOut
    execution_package: ExecutionPackageOut


class ExecutionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_asset_id: str = Field(min_length=1, max_length=100)
    execution_package: ExecutionPackageOut


class ExecutionSessionOut(BaseModel):
    id: str
    task_asset_id: str
    execution_package_id: str
    executor: str
    status: str
    execution_allowed: bool
    queue: dict[str, Any] | None = None


class ExecutionResultOut(ExecutionSessionOut):
    result: dict[str, Any] | None = None
    artifact: dict[str, Any] | None = None
    memory: dict[str, Any] | None = None


router = APIRouter(prefix="/founder-ai", tags=["Founder AI"])
brain = SinoBrain()
state_analyzer = SinoStateAnalyzer()
strategic_analyzer = SinoStrategicAnalyzer(state_analyzer=state_analyzer)
application_registry = ApplicationRegistry()
system_builder = SinoSystemBuilder(registry=application_registry)


@router.get("/applications", response_model=list[dict[str, str]])
def list_founder_application_registry():
    return [asdict(item) for item in application_registry.list()]


@router.post("/system-builder/blueprint", response_model=SystemBuildOut)
def build_application_system_blueprint(request: SystemBuildIn):
    if request.conversation_id:
        conversation = get_conversation(request.conversation_id)
        if conversation is None or conversation.system_id != FOUNDER_SYSTEM_KEY:
            raise HTTPException(status_code=404, detail="Founder AI conversation not found")
    try:
        plan = system_builder.build(request.system_goal, conversation_id=request.conversation_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return SystemBuildOut(**plan.to_dict())


@router.get("/strategy", response_model=FounderStrategyOut)
def get_founder_strategy():
    analysis = strategic_analyzer.analyze()
    data = analysis.to_dict()
    return FounderStrategyOut(
        current_phase=analysis.roadmap.current_phase,
        roadmap=data["roadmap"],
        capability_status=data["capability_map"],
        recommendations=data["recommendations"],
        current_strategic_position=analysis.current_strategic_position,
        missing_capabilities=analysis.missing_capabilities,
        recommended_next_phase=analysis.recommended_next_phase,
    )


@router.get("/briefing", response_model=FounderBriefingOut)
def get_founder_briefing():
    analysis = state_analyzer.analyze()
    strategy = strategic_analyzer.analyze(state_analysis=analysis)
    data = analysis.to_dict()
    state = data["project_state"]
    return FounderBriefingOut(
        status=analysis.status,
        completed=state["completed_capabilities"],
        active=state["active_tasks"],
        blocked=state["blocked_items"],
        recommendations=strategy.to_dict()["recommendations"],
        progress=data["progress"],
        risks=data["risks"],
        project_state=state,
        current_strategic_phase=strategy.roadmap.current_phase,
        major_achievement=strategy.major_achievement,
        strategic_risk=strategy.strategic_risk,
        recommended_decision=strategy.recommended_decision,
    )


@router.post("/brain/conversations/{conversation_id}/analyze", response_model=SinoBrainOut)
def analyze_with_sino_brain(conversation_id: str, request: SinoBrainIn):
    conversation = get_conversation(conversation_id)
    if conversation is None or conversation.system_id != FOUNDER_SYSTEM_KEY:
        raise HTTPException(status_code=404, detail="Founder AI conversation not found")

    result = brain.analyze(
        user_goal=request.user_goal,
        conversation_id=conversation_id,
        conversation_context=request.conversation_context,
        project_context=request.project_context,
    )
    brain_data = result.to_dict()
    reasoning = brain_data.get("reasoning")
    if reasoning is None:
        reasoning = {
            "analysis": {"interpretation": brain_data["goal_analysis"]["objective"], "current_state": brain_data["goal_analysis"]["current_phase"], "desired_outcome": brain_data["decision"]["summary"], "gap": "Reasoning details unavailable"},
            "evidence": [],
            "solution": {"summary": brain_data["decision"]["summary"], "approach": [item["title"] for item in brain_data["task_plan"]], "architecture_impact": "Preserve existing Founder AI boundaries"},
            "risk": {"level": "medium", "items": [], "mitigation": []},
            "task_plan": brain_data["task_plan"],
            "execution_requirement": {"executor": "codex", "approval_required": True, "constraints": ["Founder approval is required before execution"], "verification": ["Run required tests"], "recommendation": result.recommended_action},
        }
    context = {
        "system_id": FOUNDER_SYSTEM_KEY,
        "founder_context": brain_data["founder_context"],
        "decision": brain_data["decision"],
        "recommended_action": result.recommended_action,
        "reasoning": reasoning,
    }
    draft = generate_task_asset_draft(
        request.user_goal,
        conversation_id=conversation_id,
        context=context,
        constraints=reasoning["execution_requirement"]["constraints"],
        risk=reasoning["risk"]["level"],
    )
    package = build_execution_package(draft, verification=reasoning["execution_requirement"]["verification"])
    return SinoBrainOut(
        analysis=reasoning["analysis"],
        evidence=reasoning["evidence"],
        solution=reasoning["solution"],
        risk=reasoning["risk"],
        execution_requirement=reasoning["execution_requirement"],
        goal_analysis=brain_data["goal_analysis"],
        decision=brain_data["decision"],
        task_plan=reasoning["task_plan"],
        recommended_action=result.recommended_action,
        project_state=brain_data["founder_context"]["project_state"],
        task_asset_draft=asdict(draft),
        execution_package=asdict(package),
    )


@router.post("/executions", response_model=ExecutionSessionOut)
def create_founder_execution(request: ExecutionCreateIn):
    package = request.execution_package
    draft = TaskAssetDraft(**package.task_asset.model_dump())
    execution_package = build_execution_package(
        draft,
        verification=package.verification,
        commit_requirement=package.commit_requirement,
    )
    session = create_execution_session(request.task_asset_id, execution_package)
    return ExecutionSessionOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=session.status,
        execution_allowed=False,
    )


@router.post("/executions/{execution_id}/approve", response_model=ExecutionSessionOut)
def approve_founder_execution(execution_id: str):
    try:
        approved = approve_execution_session(execution_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if approved is None:
        raise HTTPException(status_code=404, detail="Execution session not found")
    session, package = approved
    queue_item = enqueue_execution(execution_id)
    return ExecutionSessionOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=queue_item.status,
        execution_allowed=package.execution_allowed,
        queue=queue_item.to_dict(),
    )


@router.post("/executions/{execution_id}/execute", response_model=ExecutionResultOut)
def execute_founder_execution(execution_id: str):
    """Compatibility endpoint: enqueue approved work and return observable state."""
    record = get_execution_session(execution_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Execution session not found")
    session, package = record
    if session.status in {"approved", "queued"} and package.execution_allowed:
        enqueue_execution(execution_id)
    elif session.status not in {"executing", "testing", "completed", "failed"}:
        raise HTTPException(status_code=403, detail="Founder approval is required before execution")
    return _execution_result(session, package)


def _execution_result(session, package) -> ExecutionResultOut:
    queue_item = execution_queue.get(session.id)
    return ExecutionResultOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=session.status,
        execution_allowed=package.execution_allowed,
        queue=queue_item.to_dict() if queue_item else None,
        result=session.result,
        artifact=session.artifact,
        memory=session.memory,
    )


@router.get("/executions/{execution_id}", response_model=ExecutionResultOut)
def get_founder_execution(execution_id: str):
    record = get_execution_session(execution_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Execution session not found")
    return _execution_result(*record)


@router.post("/conversations/{conversation_id}/analyze", response_model=FounderAnalyzeOut)
def analyze_founder_conversation(conversation_id: str, request: FounderAnalyzeIn):
    conversation = get_conversation(conversation_id)
    if conversation is None or conversation.system_id != FOUNDER_SYSTEM_KEY:
        raise HTTPException(status_code=404, detail="Founder AI conversation not found")

    stored_context = get_founder_context(conversation_id)
    context = dict(request.context or {})
    if stored_context is not None:
        context = {
            "system_id": stored_context.system_id,
            "user_goal": stored_context.user_goal,
            "constraints": stored_context.constraints,
            "decisions_summary": stored_context.decisions_summary,
            "knowledge_refs": stored_context.knowledge_refs,
            "task_refs": stored_context.task_refs,
            **context,
        }

    draft = generate_task_asset_draft(
        request.message,
        conversation_id=conversation_id,
        context=context,
    )
    package = build_execution_package(draft)
    return FounderAnalyzeOut(
        goal_classification={
            "goal_type": draft.goal_type,
            "text": request.message.strip(),
            "system_id": FOUNDER_SYSTEM_KEY,
        },
        task_asset_draft=asdict(draft),
        execution_package=asdict(package),
    )
