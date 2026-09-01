from dataclasses import asdict, replace
import json
from queue import Empty, Queue
from threading import Thread
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.core.context.service import get_founder_context
from app.core.project.service import get_project_intelligence
from app.core.conversation.service import ensure_conversation_runtime_state, get_conversation, resolve_conversation_id
from app.founder_ai.orchestrator import (
    FOUNDER_SYSTEM_KEY,
    TaskAssetDraft,
    build_execution_package,
    generate_task_asset_draft,
)
from app.founder_ai.execution_registry import approve_execution_session, create_execution_session
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions, list_actually_active_sessions
from app.founder_ai.execution_registry import authorize_codex_request, apply_codex_founder_authorization, save_execution_session
from app.founder_ai.execution_worker import enqueue_execution, execution_queue, resume_execution
from app.founder_ai.standard_task_execution import start_task_asset_execution
from app.founder_ai.sino_brain import SinoBrain
from app.llm.exceptions import LLMGatewayError
from app.founder_ai.self_management import SinoStateAnalyzer
from app.founder_ai.autonomous_planning import SinoStrategicAnalyzer
from app.founder_ai.asset_memory_center import build_asset_memory_center
from app.founder_ai.intelligence_library import (
    IntelligenceLibraryError,
    artifact_detail,
    create_artifact_version,
    create_reference,
    library_context_for_targets,
    memory_detail,
    merge_memories,
    references_for_target,
    revise_memory,
    set_artifact_status,
    set_memory_status,
)
from app.founder_ai.system_builder import ApplicationRegistry, SinoSystemBuilder
from app.founder_ai.secretary import SinoSecretaryService
from app.founder_ai.council import council_service
from app.founder_ai.execution_delta import ExecutionDeltaService
from app.core.conversation_first.model import GoalAssetDB
from app.database.db import SessionLocal
from app.core.task_asset.service import decide_task_asset_execution_approval, get_founder_task_asset
from app.core.dependency_outcome.service import feedback_execution_dependencies
from app.core.founder_object.service import approve_object, archive_object, attach_object_context, create_task_asset_from_object, detach_object_context, get_conversation_context_object, get_object, list_conversation_objects, list_founder_objects
from app.core.founder_intent.service import attach_candidate_context, get_conversation_candidate_context, list_candidates, review_candidate
from app.founder_ai.brain_runtime import brain_runtime
from app.core.asset_lifecycle.service import (
    LifecycleConflict,
    approve_ready,
    complete_development,
    create_asset_execution,
    create_learning,
    get_asset,
    list_domains,
    list_assets,
    list_executions as list_asset_executions,
    list_learnings,
    perform_capability_action,
    reuse_asset,
    run_capability_test,
    start_development,
    suggest_reuse,
)
from app.core.draft.service import get_draft, list_drafts, sync_cognitive_outcome


class FounderAnalyzeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=10000)
    context: dict[str, Any] | None = None


class CapabilityTestIn(BaseModel):
    test_input: dict[str, Any] | None = None


class CapabilityActionIn(BaseModel):
    action: str
    target_asset_id: str
    test_input: dict[str, Any] | None = None
    target_type: str | None = None
    target_id: str | None = None
    note: str | None = None


class DraftSyncIn(BaseModel):
    conversation_id: str
    cognitive_outcome_ref: str


class TaskExecutionApprovalDecisionIn(BaseModel):
    task_id: str
    candidate_id: str
    canonical_fingerprint: str
    decision: str


class TaskAssetExecutionApprovalIn(BaseModel):
    decision: str


def _lifecycle_conflict(error: ValueError) -> HTTPException:
    return HTTPException(status_code=409, detail=error.detail if isinstance(error, LifecycleConflict) else {"code": "capability_lifecycle_conflict", "message": str(error)})


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
    package_version: int = 1
    execution_deltas: list[dict[str, Any]] = Field(default_factory=list)


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
    project_id: str | None = None


class SystemBuildOut(BaseModel):
    system_blueprint: dict[str, Any]


class ExecutionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_asset_id: str = Field(min_length=1, max_length=100)
    execution_package: ExecutionPackageOut
    goal_id: str | None = None


class CodexOperationRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str | None = None
    operation_type: str
    requested_paths: list[str] = Field(default_factory=list)
    resource_scope: str | None = None
    external_effect: str | None = None
    credential_use: bool = False
    incremental_cost: bool = False
    estimated_cost: float = 0
    provider: str | None = None
    production_write: bool = False
    destructive: bool = False
    verification_passed: bool = False
    ownership_resolved: bool = False


class CodexBoundaryDecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str
    approved_scope: dict[str, Any] = Field(default_factory=dict)


class DiscussionMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=10000)
    intent: str | None = None
    interaction_context: dict[str, Any] | None = None
    attachment_ids: list[str] = Field(default_factory=list, max_length=8)
    client_message_id: str | None = Field(default=None, min_length=8, max_length=100)


class CouncilDiscussionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=10000)
    models: list[str] | None = None


class ObjectDiscussionIn(BaseModel):
    conversation_id: str

class CandidateReviewIn(BaseModel):
    action: str

class BrainReviewIn(BaseModel):
    action: str


class ImageModelProbeDecisionIn(BaseModel):
    action: str
    boundary: dict[str, Any] | None = None

class ExternalModelProbeDecisionIn(BaseModel):
    action: str
    boundary: dict[str, Any] | None = None

class ArchitectureProposalDecisionIn(BaseModel):
    action: str
    proposal_version: int = Field(ge=1)
    founder_feedback: str | None = Field(default=None, max_length=10000)

class ClarificationDecisionIn(BaseModel):
    action: str

class ConstitutionWorkItemReviewIn(BaseModel):
    work_item_id: str
    decision: str

class ConstitutionWorkItemSemanticIn(BaseModel):
    work_item_id: str
    refresh: bool = False

class ConstitutionWorkItemRoutingReviewIn(BaseModel):
    work_item_id: str
    decision: str

class FormalObjectProposalConfirmIn(BaseModel):
    work_item_id: str


class DeltaCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conversation_id: str
    goal_id: str
    task_id: str
    content: str = Field(min_length=1, max_length=10000)


class DeltaDecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str


class LibraryRevisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision_reason: str = Field(min_length=1, max_length=1000)
    title: str | None = Field(default=None, max_length=500)
    summary: str | None = None
    content: str | None = None


class LibraryStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str


class LibraryReferenceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    created_by: str = "founder"
    note: str | None = None


class MemoryMergeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    memory_ids: list[str] = Field(min_length=2)
    title: str = Field(min_length=1, max_length=500)
    revision_reason: str = Field(min_length=1, max_length=1000)


class AssetReuseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_type: str
    target_id: str
    note: str | None = None


class ControlledHandoffIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    package_id: str
    readiness_contract_id: str
    checkpoint_commit: str


class ControlledExecutionStartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    package_id: str
    readiness_contract_id: str
    handoff_id: str
    execution_session_id: str
    scope_fingerprint: str
    checkpoint_commit: str
    branch: str


class ExecutionSessionOut(BaseModel):
    id: str
    task_asset_id: str
    execution_package_id: str
    executor: str
    status: str
    execution_allowed: bool
    created_at: str | None = None
    queue: dict[str, Any] | None = None
    timeline: dict[str, str | None] | None = None
    approved_at: str | None = None
    queued_at: str | None = None
    started_at: str | None = None
    testing_at: str | None = None
    completed_at: str | None = None
    events: list[dict[str, Any]] = Field(default_factory=list)
    last_event: dict[str, Any] | None = None
    failure_reason: str | None = None
    pause_reason: str | None = None
    recoverable: bool = False
    current_stage: str | None = None
    package_version: int = 1
    deltas: list[dict[str, Any]] = Field(default_factory=list)
    authorization_envelope: dict[str, Any] | None = None
    authorization_audit: list[dict[str, Any]] = Field(default_factory=list)
    pending_codex_authorization: dict[str, Any] | None = None


class ExecutionResultOut(ExecutionSessionOut):
    result: dict[str, Any] | None = None
    artifact: dict[str, Any] | None = None
    memory: dict[str, Any] | None = None
    error_message: str | None = None
    execution_logs: list[dict[str, str]] = Field(default_factory=list)


class TaskConfirmationDecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str
    action: str


class TaskFocusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_ref: str


router = APIRouter(prefix="/founder-ai", tags=["Founder AI"])
brain = SinoBrain()
state_analyzer = SinoStateAnalyzer()
strategic_analyzer = SinoStrategicAnalyzer(state_analyzer=state_analyzer)
application_registry = ApplicationRegistry()
system_builder = SinoSystemBuilder(registry=application_registry)
secretary = SinoSecretaryService()
delta_service = ExecutionDeltaService(secretary=secretary)

def _candidate_snapshot(snapshot: dict, conversation_id: str) -> dict:
    try:
        snapshot["object_candidates"] = list_candidates(conversation_id)
        snapshot["context_candidate"] = get_conversation_candidate_context(conversation_id)
        snapshot["object_recognition"] = {"status": "available", "error": None}
    except Exception as error:
        # Intent/Candidate enrichment is non-critical. The Conversation reply is
        # already durable and must never become a 5xx because recognition failed.
        snapshot["object_candidates"] = []
        snapshot["context_candidate"] = None
        snapshot["object_recognition"] = {"status": "unavailable", "error": type(error).__name__}
    try:
        snapshot["sino_brain"] = brain_runtime.snapshot(conversation_id)
        from app.founder_ai.conversation_task_collection import build_conversation_tasks
        task_collection = build_conversation_tasks(conversation_id)
        discovery = dict((snapshot["sino_brain"] or {}).get("discovery") or {})
        discovery.update(task_collection)
        snapshot["sino_brain"]["discovery"] = discovery
    except Exception:
        snapshot["sino_brain"] = None
    return snapshot


@router.get("/conversations/{conversation_id}/workspace", response_model=dict[str, Any])
def get_conversation_workspace(conversation_id: str):
    try:
        conversation_id = resolve_conversation_id(conversation_id)
        # A worker callback is not the source of truth for closure. Reconcile a
        # terminal Standard Task from its persisted evidence on every canonical read.
        try:
            from app.founder_ai.standard_task_execution import reconcile_standard_task_execution, refresh_completed_execution_artifacts
            state = brain_runtime.snapshot(conversation_id) or {}
            route = dict((state.get("discovery") or {}).get("task_complexity_route") or {})
            execution = dict(route.get("autonomous_execution") or {})
            execution_id = execution.get("execution_session_id")
            task_id = execution.get("task_id")
            record = get_execution_session(execution_id) if execution_id else None
            if (route.get("classification") == "STANDARD_TASK" and record and record[0].status == "completed"
                    and route.get("current_step") != "complete" and route.get("execution_status") != "failed"):
                refresh_completed_execution_artifacts(execution_id=execution_id)
                reconcile_standard_task_execution(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id)
        except (LookupError, ValueError):
            pass
        # Lazy compatibility reconciliation: older LLM-first conversations may
        # contain a mature semantic decision but predate canonical candidates.
        from app.founder_ai.conversation_task_interaction import reconcile_discussion_task_candidate
        reconcile_discussion_task_candidate(conversation_id)
        from app.founder_ai.conversation_task_collection import resolve_task_navigation
        resolve_task_navigation(conversation_id)
        snapshot = council_service.snapshot(conversation_id)
        from app.founder_ai.conversation_task_interaction import project_execution_events
        if project_execution_events(conversation_id):
            snapshot = council_service.snapshot(conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail={"code": "conversation_not_found", "message": str(error)}) from error
    active = next(iter(reversed(list_actually_active_sessions(queue_getter=execution_queue.get, task_lookup=get_founder_task_asset))), None)
    if active:
        record = get_execution_session(active.id)
        package = record[1] if record else None
        if package and package.task_asset.conversation_id == conversation_id:
            snapshot["active_execution"] = _execution_result(active, package).model_dump()
            snapshot["execution_deltas"] = delta_service.list_for_execution(active.id)
            task = get_founder_task_asset(active.task_asset_id)
            snapshot["task_asset"] = ({"id": task.id, "conversation_id": task.conversation_id, "decision_id": task.decision_id, "title": task.title, "description": task.description, "scope": task.scope, "status": task.status, "approval_status": task.approval_status, "execution_status": task.execution_status, "result": task.result} if task else {"id": active.task_asset_id, "title": package.task_asset.title, "description": package.task_asset.description, "scope": package.task_asset.scope, "status": "draft", "approval_status": "pending", "execution_status": active.status})
    snapshot["founder_objects"] = list_conversation_objects(conversation_id)
    snapshot["context_object"] = get_conversation_context_object(conversation_id)
    snapshot["active_context_object_id"] = snapshot["context_object"]["object_id"] if snapshot["context_object"] else None
    return _candidate_snapshot(snapshot, conversation_id)


@router.get("/drafts", response_model=dict[str, Any])
def founder_drafts(project_id: str | None = None, include_archived: bool = False):
    return {"drafts": list_drafts(project_id=project_id, include_archived=include_archived)}


@router.get("/drafts/{draft_id}", response_model=dict[str, Any])
def founder_draft(draft_id: str):
    try:
        return get_draft(draft_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail={"code": "draft_not_found", "message": str(error)}) from error


@router.post("/drafts/sync-cognitive-outcome", response_model=dict[str, Any])
def sync_founder_draft(payload: DraftSyncIn):
    try:
        return sync_cognitive_outcome(conversation_id=payload.conversation_id, cognitive_outcome_ref=payload.cognitive_outcome_ref)
    except LookupError as error:
        raise HTTPException(status_code=404, detail={"code": "draft_source_not_found", "message": str(error)}) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail={"code": "outcome_not_draft_worthy", "message": str(error)}) from error


@router.get("/conversations/{conversation_id}/objects", response_model=list[dict[str, Any]])
def conversation_objects(conversation_id: str):
    return list_conversation_objects(conversation_id)


@router.get("/objects", response_model=list[dict[str, Any]])
def founder_objects():
    return list_founder_objects()

@router.get("/conversations/{conversation_id}/candidates", response_model=list[dict[str, Any]])
def founder_candidates(conversation_id: str): return list_candidates(conversation_id)

@router.post("/candidates/{candidate_id}/review", response_model=dict[str, Any])
def review_founder_candidate(candidate_id: str, request: CandidateReviewIn):
    try: return review_candidate(candidate_id, request.action)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=409, detail=str(error)) from error

@router.post("/candidates/{candidate_id}/continue-discussion", response_model=dict[str, Any])
def continue_candidate_discussion(candidate_id: str, request: ObjectDiscussionIn):
    try: return attach_candidate_context(candidate_id, request.conversation_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/objects/{object_id}", response_model=dict[str, Any])
def founder_object_detail(object_id: str):
    item = get_object(object_id)
    if item is None: raise HTTPException(status_code=404, detail="Founder Object not found")
    return item


@router.post("/objects/{object_id}/continue-discussion", response_model=dict[str, Any])
def continue_object_discussion(object_id: str, request: ObjectDiscussionIn):
    try: return attach_object_context(object_id, request.conversation_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/conversations/{conversation_id}/context-object", status_code=204)
def clear_conversation_object_context(conversation_id: str):
    detach_object_context(conversation_id)


@router.post("/objects/{object_id}/approve", response_model=dict[str, Any])
def approve_founder_object(object_id: str):
    try: return approve_object(object_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/objects/{object_id}/create-task", response_model=dict[str, Any])
def create_task_from_founder_object(object_id: str):
    try: return create_task_asset_from_object(object_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/task-assets/{task_id}/execution-approval", response_model=dict[str, Any])
def decide_task_asset_execution_approval_endpoint(task_id: str, request: TaskAssetExecutionApprovalIn):
    try:
        task = decide_task_asset_execution_approval(task_id=task_id, decision=request.decision)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {
        "task_id": task.id,
        "status": task.status,
        "approval_status": task.approval_status,
        "execution_status": task.execution_status,
        "decision_applied": task.approval_status,
    }


@router.post("/task-assets/{task_id}/start-execution", response_model=dict[str, Any])
def start_task_asset_execution_endpoint(task_id: str):
    try:
        return start_task_asset_execution(task_id=task_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/objects/{object_id}/archive", response_model=dict[str, Any])
def archive_founder_object(object_id: str):
    try: return archive_object(object_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/messages", response_model=dict[str, Any])
def discuss_with_sino(conversation_id: str, request: DiscussionMessageIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        ensure_conversation_runtime_state(conversation_id)
        completed_exchange = secretary.completed_client_exchange(conversation_id, request.client_message_id)
        if completed_exchange is not None:
            return _candidate_snapshot(completed_exchange, conversation_id)
        founder_message_id = secretary.persist_founder_message(
            conversation_id, request.content, intent=request.intent,
            message_type="discussion", client_message_id=request.client_message_id,
            attachment_ids=request.attachment_ids,
        )
        interaction_context = dict(request.interaction_context or {})
        interaction_context["source_message_id"] = founder_message_id
        if request.client_message_id:
            interaction_context["client_message_id"] = request.client_message_id
        from app.founder_ai.conversation_task_interaction import (
            bind_task_candidate_execution, execution_state_reply, has_explicit_execution_intent,
            persist_task_candidate, persist_task_understanding, record_runtime_intervention,
            route_conversation_message,
        )
        current_brain = brain_runtime.snapshot(conversation_id)
        current_route = dict((current_brain.get("discovery") or {}).get("task_complexity_route") or {})
        current_execution_status = current_route.get("execution_status")
        task_bound = bool((current_route.get("autonomous_execution") or {}).get("execution_session_id") and current_execution_status not in {"completed", "cancelled", "rejected"})
        from app.founder_ai.task_complexity_router import route_task_complexity
        image_context_status = "not_present"
        if request.attachment_ids:
            from app.founder_ai.vision_routing import understand_images
            try:
                interaction_context["image_understanding"] = understand_images(conversation_id, request.content, request.attachment_ids)
                from app.founder_ai.visual_grounding import merge_visual_grounding
                interaction_context["grounded_multimodal_context"] = merge_visual_grounding(request.content, interaction_context["image_understanding"])
                image_context_status = "available"
            except (ValueError, LLMGatewayError):
                image_context_status = "unavailable"
        from app.founder_ai.conversation_core import build_conversation_context, persist_conversation_decision, reason_about_message, task_candidate_is_complete
        control = route_conversation_message(conversation_id, request.content, discovery=current_brain.get("discovery") or {})
        reuse_current_execution = bool(control.get("active_execution") and control["intent"] in {"EXECUTE_CURRENT_TASK", "CONTINUE_CURRENT_TASK"})
        if control["intent"] in {"EXECUTE_CURRENT_TASK", "CONTINUE_CURRENT_TASK"}:
            decision = {
                "response": "", "semantic_intent": "execute_current_task", "conversation_state": "execution_control",
                "task_candidate": control.get("candidate"), "tool_intent": None, "founder_action_intent": None,
                "context_updates": {}, "model_decision": False,
                "context": build_conversation_context(conversation_id, request.content, interaction_context=interaction_context),
            }
        elif control["intent"] == "STOP_CURRENT_TASK":
            decision = {
                "response": "已请求停止当前任务。", "semantic_intent": "stop_current_task", "conversation_state": "execution_control",
                "task_candidate": control.get("candidate"), "tool_intent": None, "founder_action_intent": None,
                "context_updates": {}, "model_decision": False,
                "context": build_conversation_context(conversation_id, request.content, interaction_context=interaction_context),
            }
        elif control.get("control_command"):
            decision = {
                "response": "当前没有待执行任务。你希望我执行哪一项？", "semantic_intent": "conversation",
                "conversation_state": "discussion", "task_candidate": None, "tool_intent": None,
                "founder_action_intent": None, "context_updates": {}, "model_decision": False,
                "context": build_conversation_context(conversation_id, request.content, interaction_context=interaction_context),
            }
        else:
            decision = reason_about_message(conversation_id, request.content, interaction_context=interaction_context)
            if has_explicit_execution_intent(request.content) and task_candidate_is_complete(decision.get("task_candidate")):
                decision["semantic_intent"] = "execute_current_task"
                decision["conversation_state"] = "execution_requested"
        persist_conversation_decision(conversation_id, decision)
        semantic_intent = decision["semantic_intent"]
        explicit_execution = semantic_intent == "execute_current_task"
        task_candidate = decision.get("task_candidate") if isinstance(decision.get("task_candidate"), dict) else {}
        execution_goal = str(task_candidate.get("goal") or "").strip()
        if task_candidate:
            route = route_task_complexity(execution_goal,
                image_understanding=interaction_context.get("grounded_multimodal_context") or interaction_context.get("image_understanding"),
                image_context_status=image_context_status)
            requested_type = task_candidate.get("task_type")
            if requested_type in {"QUICK_FIX", "STANDARD_TASK", "STRATEGIC_TASK"}:
                route["classification"] = requested_type
            route["discussion_context"] = [item.get("content") for item in decision["context"].get("conversation_history") or [] if item.get("content")]
            route["confirmed_decisions"] = list(task_candidate.get("confirmed_decisions") or [])
        else:
            route = dict(current_route)
        candidate_ready = bool(task_candidate and task_candidate_is_complete(task_candidate))
        persisted_candidate = None
        persisted_control_candidate = bool(
            control["intent"] in {"EXECUTE_CURRENT_TASK", "CONTINUE_CURRENT_TASK"}
            and control.get("candidate")
        )
        if candidate_ready and not persisted_control_candidate:
            try:
                persisted_candidate = persist_task_candidate(
                    conversation_id, task_candidate, source_message_id=founder_message_id,
                    confirmation_required=not explicit_execution,
                )
                from app.founder_ai.standard_task_execution import bind_persisted_candidate_authority
                route = bind_persisted_candidate_authority(
                    route=route, candidate=persisted_candidate,
                    conversation_id=conversation_id, source_message_id=founder_message_id,
                )
                if explicit_execution:
                    from app.founder_ai.conversation_task_interaction import should_autonomously_dispatch_candidate
                    authority = dict(persisted_candidate.get("candidate_authority") or {})
                    canonical_continuation = bool(
                        authority.get("canonical_fingerprint")
                        and authority.get("contract")
                        and (should_autonomously_dispatch_candidate(persisted_candidate)
                             or authority.get("approval_required") is True
                             or authority.get("clarification_required") is True)
                    )
                    explicit_execution = canonical_continuation
                    semantic_intent = "execute_current_task" if explicit_execution else "conversation"
            except ValueError:
                decision["response"] = "当前讨论成果还没有可靠固化为待确认任务；讨论内容已经保留，我不会在任务结构完整前开始执行。"
        awaiting_clarification = bool(explicit_execution and decision.get("founder_action_intent") and
                                      (decision.get("founder_action_intent") or {}).get("type") == "CLARIFICATION")
        is_strategic_architecture = route.get("classification") == "STRATEGIC_TASK" and not route.get("clarification_required")
        is_standard_development = (
            route.get("classification") == "STANDARD_TASK"
            and route.get("task_type") != "CAPABILITY_BUILD_TASK"
            and not route.get("clarification_required")
            and (not route.get("founder_gate_required") or route.get("approval_required"))
        )
        if reuse_current_execution:
            route = dict(control.get("route") or current_route)
            brain_turn = {"handled": True, "intent": "execution_control", "message_type": "execution_update",
                          "reply": execution_state_reply(route), "brain": brain_runtime.snapshot(conversation_id)}
        elif awaiting_clarification:
            brain_turn = {"handled": True, "intent": "awaiting_founder_clarification", "message_type": "clarification",
                          "reply": decision["response"],
                          "brain": brain_runtime.snapshot(conversation_id)}
        elif task_bound and semantic_intent == "stop_current_task":
            from app.founder_ai.execution_cancel import request_founder_cancel
            request_founder_cancel((current_route.get("autonomous_execution") or {}).get("execution_session_id"))
            brain_turn = {"handled": True, "intent": "founder_emergency_stop", "message_type": "runtime_intervention", "reply": decision["response"], "brain": brain_runtime.snapshot(conversation_id)}
            route = current_route
        elif task_bound and semantic_intent == "runtime_intervention":
            record_runtime_intervention(conversation_id, request.content, current_route)
            brain_turn = {"handled": True, "intent": "runtime_intervention", "message_type": "runtime_intervention", "reply": decision["response"], "brain": brain_runtime.snapshot(conversation_id)}
            route = current_route
        elif is_strategic_architecture and explicit_execution:
            from app.founder_ai.strategic_task import reconcile_architecture_task
            route = reconcile_architecture_task(conversation_id=conversation_id, goal=execution_goal)
            brain_turn = {"handled": True, "intent": "architecture_task", "message_type": "architecture_proposal",
                          "reply": decision["response"],
                          "brain": brain_runtime.snapshot(conversation_id)}
        elif is_standard_development and explicit_execution:
            from app.founder_ai.standard_task_execution import begin_standard_task, dispatch_standard_task
            route = begin_standard_task(conversation_id=conversation_id, goal=execution_goal, route=route,
                                        source_message_id=founder_message_id)
            from app.founder_ai.reuse_lane import is_reuse_health_check_goal, execute_reuse_health_check
            if is_reuse_health_check_goal(execution_goal):
                route = execute_reuse_health_check(conversation_id=conversation_id, goal=execution_goal, route=route)
            else:
                route = dispatch_standard_task(conversation_id=conversation_id, goal=execution_goal,
                                               source_message_id=founder_message_id)
            execution_exists = bool((route.get("autonomous_execution") or {}).get("execution_session_id"))
            brain_turn = {"handled": True, "intent": "founder_explicit_execution" if execution_exists else "task_prepared",
                          "message_type": "task_started" if execution_exists else "discussion",
                          "reply": execution_state_reply(route), "brain": brain_runtime.snapshot(conversation_id)}
        elif explicit_execution and route.get("classification") == "QUICK_FIX" and not route.get("clarification_required") and not route.get("founder_gate_required"):
            brain_turn = {"handled": True, "intent": "founder_explicit_execution", "message_type": "task_started", "reply": decision["response"], "brain": current_brain}
        elif not explicit_execution:
            if task_candidate:
                persist_task_understanding(conversation_id, execution_goal, route)
            brain_turn = {"handled": True, "intent": "conversation", "message_type": "discussion", "reply": decision["response"], "brain": brain_runtime.snapshot(conversation_id)}
        else:
            brain_turn = {"handled": True, "intent": "conversation", "message_type": "discussion", "reply": decision["response"], "brain": brain_runtime.snapshot(conversation_id)}
        if explicit_execution and not reuse_current_execution and route.get("classification") == "QUICK_FIX" and not route.get("clarification_required") and not route.get("founder_gate_required"):
            from app.founder_ai.quick_fix_execution import dispatch_quick_fix
            route = dispatch_quick_fix(conversation_id=conversation_id, goal=execution_goal,
                                       source_message_id=founder_message_id)
            execution_exists = bool((route.get("autonomous_execution") or {}).get("execution_session_id"))
            brain_turn = {"handled": True, "intent": "founder_explicit_execution" if execution_exists else "task_prepared",
                          "message_type": "task_started" if execution_exists else "discussion",
                          "reply": execution_state_reply(route), "brain": brain_runtime.snapshot(conversation_id)}
        if explicit_execution and not reuse_current_execution and route.get("task_type") == "CAPABILITY_BUILD_TASK" and not route.get("clarification_required") and not route.get("founder_gate_required"):
            from app.founder_ai.capability_build_loop import run_capability_build_loop
            loop = run_capability_build_loop(conversation_id=conversation_id, goal=execution_goal)
            projected = brain_runtime.attach_autonomous_main_loop(conversation_id, route, loop)
            brain_turn = {
                "handled": True, "intent": "capability_build_task", "message_type": "autonomous_main_loop",
                "reply": decision["response"],
                "brain": projected,
            }
        projected_execution = dict((route.get("autonomous_execution") or {}))
        if projected_execution.get("execution_session_id") and explicit_execution and not reuse_current_execution:
            bind_task_candidate_execution(conversation_id, route)
        if not projected_execution.get("execution_session_id"):
            if brain_turn.get("message_type") == "task_started":
                brain_turn["message_type"] = "discussion"
                brain_turn["intent"] = "task_prepared"
            if any(marker in str(brain_turn.get("reply") or "") for marker in ("开始执行", "正在执行", "已经执行", "进入执行阶段")):
                brain_turn["reply"] = "任务已经准备好，等待进入执行。"
        snapshot = secretary.append_message(conversation_id, request.content, intent=brain_turn.get("intent") or request.intent, message_type=brain_turn.get("message_type", "discussion"), reply_override=brain_turn.get("reply") if brain_turn.get("handled") else None, skip_object_recognition=bool(brain_turn.get("handled")), brain_stage=brain_turn.get("brain", {}).get("active_workspace_stage"), attachment_ids=request.attachment_ids, client_message_id=request.client_message_id)
        brain_runtime.sync_message_refs(conversation_id)
        return _candidate_snapshot(snapshot, conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        status = 409 if str(error) == "vision_model_unavailable" else 400
        raise HTTPException(status_code=status, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="Sino 回复失败，可重试") from error


@router.post("/conversations/{conversation_id}/messages/stream")
def stream_discussion_with_sino(conversation_id: str, request: DiscussionMessageIn):
    """Stream one transient response while the normal message pipeline persists one canonical reply."""
    if not request.client_message_id:
        raise HTTPException(status_code=422, detail="client_message_id_required")

    def events():
        from app.founder_ai.conversation_streaming import register_publisher, unregister_publisher
        queue: Queue = Queue()
        client_id = request.client_message_id

        def publish(content: str) -> None:
            queue.put({"type": "chunk", "client_message_id": client_id, "content": content})

        def run() -> None:
            try:
                queue.put({"type": "started", "client_message_id": client_id})
                queue.put({"type": "final", "client_message_id": client_id,
                           "snapshot": discuss_with_sino(conversation_id, request)})
            except Exception as error:
                queue.put({"type": "error", "client_message_id": client_id,
                           "message": str(getattr(error, "detail", None) or "Sino 回复失败")})
            finally:
                unregister_publisher(client_id)

        register_publisher(client_id, publish)
        Thread(target=run, daemon=True).start()
        while True:
            try:
                item = queue.get(timeout=8)
            except Empty:
                yield json.dumps({"type": "heartbeat", "client_message_id": client_id}) + "\n"
                continue
            yield json.dumps(item, ensure_ascii=False) + "\n"
            if item["type"] in {"final", "error"}:
                break

    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/conversations/{conversation_id}/clarification/decision", response_model=dict[str, Any])
def decide_conversation_clarification(conversation_id: str, request: ClarificationDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    from app.founder_ai.conversation_task_interaction import pending_task_understanding, resolve_clarification
    try:
        result = resolve_clarification(conversation_id, request.action)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if request.action == "continue_discussion":
        return {"status": "discussion", "sino_brain": brain_runtime.snapshot(conversation_id)}
    pending = pending_task_understanding(conversation_id) or {}
    route = dict(pending.get("route") or {}); route["clarification_required"] = False
    goal = pending.get("goal") or result["snapshot"].get("goal")
    if route.get("classification") == "STANDARD_TASK":
        from app.founder_ai.standard_task_execution import begin_standard_task, dispatch_standard_task
        begin_standard_task(conversation_id=conversation_id, goal=goal, route=route)
        dispatch_standard_task(conversation_id=conversation_id, goal=goal)
    elif route.get("classification") == "QUICK_FIX":
        from app.founder_ai.quick_fix_execution import dispatch_quick_fix
        dispatch_quick_fix(conversation_id=conversation_id, goal=goal)
    else:
        raise HTTPException(status_code=409, detail="clarification_route_not_executable")
    with SessionLocal() as db:
        from app.core.conversation_first.model import ConversationMessageDB
        db.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="task_started",
                                     intent="founder_explicit_execution", content="收到，任务理解已确认，开始执行。",
                                     grounding={"visibility": "founder", "source_event_id": f"clarification-confirmed:{conversation_id}"}))
        db.commit()
    return {"status": "executing", "sino_brain": brain_runtime.snapshot(conversation_id)}


@router.post("/conversations/{conversation_id}/task-candidate/decision", response_model=dict[str, Any])
def decide_conversation_task_candidate(conversation_id: str, request: TaskConfirmationDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    from app.founder_ai.conversation_task_interaction import decide_task_candidate
    try:
        result = decide_task_candidate(conversation_id, request.candidate_id, request.action)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {**result, "sino_brain": brain_runtime.snapshot(conversation_id)}


@router.post("/conversations/{conversation_id}/execution-approval/decision", response_model=dict[str, Any])
def decide_conversation_execution_approval(conversation_id: str, request: TaskExecutionApprovalDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    from app.founder_ai.standard_task_execution import decide_and_resume_standard_task
    try:
        return decide_and_resume_standard_task(
            conversation_id=conversation_id, task_id=request.task_id,
            candidate_id=request.candidate_id, canonical_fingerprint=request.canonical_fingerprint,
            decision=request.decision,
        )
    except (LookupError, ValueError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/tasks/focus", response_model=dict[str, Any])
def focus_conversation_task(conversation_id: str, request: TaskFocusIn):
    conversation_id = resolve_conversation_id(conversation_id)
    from app.founder_ai.conversation_task_collection import focus_task
    try:
        result = focus_task(conversation_id, request.task_ref)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {**result, "sino_brain": _candidate_snapshot({}, conversation_id).get("sino_brain")}


@router.post("/conversations/{conversation_id}/attachments", response_model=dict[str, Any])
async def upload_founder_image(conversation_id: str, request: Request):
    from app.founder_ai.attachments import save_pending_image
    try: return save_pending_image(resolve_conversation_id(conversation_id), unquote(request.headers.get("x-original-filename", "image")), (request.headers.get("content-type") or "").split(";", 1)[0], await request.body())
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/conversations/{conversation_id}/attachments/{attachment_id}")
def get_founder_image(conversation_id: str, attachment_id: str):
    from app.founder_ai.attachments import attachment_file
    try:
        path, mime_type = attachment_file(resolve_conversation_id(conversation_id), attachment_id)
        return FileResponse(path, media_type=mime_type)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/council", response_model=dict[str, Any])
def discuss_with_council(conversation_id: str, request: CouncilDiscussionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_state = brain_runtime.snapshot(conversation_id)
        if brain_state and brain_state["stage"] == "goal_review" and brain_runtime.review_intent(request.content) == "confirm_goal":
            brain_runtime.confirm_goal(conversation_id)
            prompt = brain_runtime.prepare_strategy_prompt(conversation_id)
            snapshot = council_service.run(conversation_id, prompt, request.models, persist_founder_message=False)
            brain_runtime.finalize_council(conversation_id, snapshot)
            return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
        if not brain_state or brain_state["stage"] not in {"goal_confirmed", "strategy_meeting"}:
            brain_turn = brain_runtime.process_message(conversation_id, request.content)
            snapshot = secretary.append_message(conversation_id, request.content, message_type=brain_turn.get("message_type", "goal_discovery"), reply_override=brain_turn.get("reply"), skip_object_recognition=True, brain_stage=brain_turn.get("brain", {}).get("active_workspace_stage"))
            brain_runtime.sync_message_refs(conversation_id)
            return _candidate_snapshot(snapshot, conversation_id)
        prompt = brain_runtime.prepare_strategy_prompt(conversation_id)
        snapshot = council_service.run(conversation_id, prompt, request.models, persist_founder_message=False)
        brain_runtime.finalize_council(conversation_id, snapshot)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="多模型讨论暂时不可用，可重试") from error


@router.post("/conversations/{conversation_id}/auto-deliberation", response_model=dict[str, Any])
def discuss_with_auto_deliberation(conversation_id: str, request: CouncilDiscussionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_state = brain_runtime.snapshot(conversation_id)
        if brain_state and brain_state["stage"] == "goal_review" and brain_runtime.review_intent(request.content) == "confirm_goal":
            brain_runtime.confirm_goal(conversation_id)
            prompt = brain_runtime.prepare_strategy_prompt(conversation_id)
            snapshot = council_service.run_auto(conversation_id, prompt, request.models, persist_founder_message=False)
            brain_runtime.finalize_council(conversation_id, snapshot)
            return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
        if not brain_state or brain_state["stage"] not in {"goal_confirmed", "strategy_meeting"}:
            brain_turn = brain_runtime.process_message(conversation_id, request.content)
            snapshot = secretary.append_message(conversation_id, request.content, message_type=brain_turn.get("message_type", "goal_discovery"), reply_override=brain_turn.get("reply"), skip_object_recognition=True, brain_stage=brain_turn.get("brain", {}).get("active_workspace_stage"))
            brain_runtime.sync_message_refs(conversation_id)
            return _candidate_snapshot(snapshot, conversation_id)
        prompt = brain_runtime.prepare_strategy_prompt(conversation_id)
        snapshot = council_service.run_auto(conversation_id, prompt, request.models, persist_founder_message=False)
        brain_runtime.finalize_council(conversation_id, snapshot)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="自动多轮讨论暂时不可用，可重试") from error


@router.post("/conversations/{conversation_id}/brain/goal/confirm", response_model=dict[str, Any])
def confirm_brain_goal(conversation_id: str):
    try:
        brain_runtime.confirm_goal(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/review", response_model=dict[str, Any])
def review_brain_constitution(conversation_id: str, request: BrainReviewIn):
    try:
        brain_runtime.review_constitution(conversation_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/project-outcome/review", response_model=dict[str, Any])
def review_project_outcome(conversation_id: str, request: BrainReviewIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.review_project_outcome(conversation_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/implementation-plan/review", response_model=dict[str, Any])
def review_implementation_plan(conversation_id: str, request: BrainReviewIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.review_implementation_plan(conversation_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/execution-package/revalidate", response_model=dict[str, Any])
def revalidate_execution_package(conversation_id: str):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.revalidate_execution_package(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/execution-package/readiness", response_model=dict[str, Any])
def ensure_execution_readiness_contract(conversation_id: str):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.ensure_execution_readiness_contract(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/execution-package/handoff", response_model=dict[str, Any])
def create_controlled_executor_handoff(conversation_id: str, request: ControlledHandoffIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.create_controlled_executor_handoff(
            conversation_id, package_id=request.package_id,
            readiness_contract_id=request.readiness_contract_id, checkpoint_commit=request.checkpoint_commit,
        )
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/execution-package/controlled-start", response_model=dict[str, Any])
def start_controlled_execution(conversation_id: str, request: ControlledExecutionStartIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.start_controlled_execution(conversation_id, expected=request.model_dump())
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/founder-gate-proposal/ensure", response_model=dict[str, Any])
def ensure_founder_gate_proposal(conversation_id: str):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.ensure_founder_gate_proposal(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/founder-gate-proposals/{proposal_id}/review", response_model=dict[str, Any])
def review_founder_gate_proposal(conversation_id: str, proposal_id: str, request: BrainReviewIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.review_founder_gate_proposal(conversation_id, proposal_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/image-model-probe-gate/decision", response_model=dict[str, Any])
def decide_image_model_probe(conversation_id: str, request: ImageModelProbeDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        from app.founder_ai.image_model_probe_gate import decide_image_model_probe_gate
        decide_image_model_probe_gate(conversation_id, action=request.action, boundary=request.boundary)
        from app.founder_ai.conversation_task_interaction import project_founder_decision
        project_founder_decision(conversation_id, source_id="image-model-probe", action=request.action, subject="有限 Image Model Probe")
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/external-model-probe-gate/decision", response_model=dict[str, Any])
def decide_external_model_probe(conversation_id: str, request: ExternalModelProbeDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        from app.founder_ai.standard_task_founder_gate import decide_external_model_probe_gate
        decide_external_model_probe_gate(conversation_id, action=request.action, boundary=request.boundary)
        from app.founder_ai.conversation_task_interaction import project_founder_decision
        project_founder_decision(conversation_id, source_id="external-model-probe", action=request.action, subject="External Model Probe")
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (ValueError, PermissionError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/architecture-proposals/{proposal_id}/decision", response_model=dict[str, Any])
def decide_architecture_proposal_action(conversation_id: str, proposal_id: str, request: ArchitectureProposalDecisionIn):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        from app.founder_ai.strategic_task import decide_architecture_proposal
        decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal_id,
                                     proposal_version=request.proposal_version, action=request.action,
                                     founder_feedback=request.founder_feedback)
        from app.founder_ai.conversation_task_interaction import project_founder_decision
        project_founder_decision(conversation_id, source_id=f"{proposal_id}:v{request.proposal_version}", action=request.action, subject="Architecture Proposal")
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/tasks/current/accept", response_model=dict[str, Any])
def accept_current_task_result(conversation_id: str):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        from app.founder_ai.conversation_task_interaction import accept_task_result
        accept_task_result(conversation_id)
        return get_conversation_workspace(conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/project-planning/continue", response_model=dict[str, Any])
def continue_project_planning_analysis(conversation_id: str):
    conversation_id = resolve_conversation_id(conversation_id)
    try:
        brain_runtime.execute_autonomous_analysis(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/work-items/review", response_model=dict[str, Any])
def review_brain_constitution_work_item(conversation_id: str, request: ConstitutionWorkItemReviewIn):
    try:
        brain_runtime.review_constitution_work_item(conversation_id, request.work_item_id, request.decision)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/work-items/understand", response_model=dict[str, Any])
def understand_brain_constitution_work_item(conversation_id: str, request: ConstitutionWorkItemSemanticIn):
    try:
        brain_runtime.ensure_constitution_work_item_semantics(conversation_id, request.work_item_id, refresh=request.refresh)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/restore-invalid-goal", response_model=dict[str, Any])
def restore_brain_constitution_review(conversation_id: str):
    try:
        brain_runtime.restore_constitution_review_after_invalid_goal(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/execution-result/context-feedback", response_model=dict[str, Any])
def feedback_brain_execution_result(conversation_id: str):
    try:
        feedback = feedback_execution_dependencies(conversation_id)
        return {"feedback": feedback, "brain": brain_runtime.snapshot(conversation_id)}
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/work-items/routing/review", response_model=dict[str, Any])
def review_brain_constitution_work_item_routing(conversation_id: str, request: ConstitutionWorkItemRoutingReviewIn):
    try:
        brain_runtime.review_constitution_work_item_routing(conversation_id, request.work_item_id, request.decision)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/constitution/work-items/formal-object/confirm", response_model=dict[str, Any])
def confirm_brain_formal_object_proposal(conversation_id: str, request: FormalObjectProposalConfirmIn):
    try:
        brain_runtime.confirm_formal_object_proposal(conversation_id, request.work_item_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/goal/force-review", response_model=dict[str, Any])
def force_brain_goal_review(conversation_id: str):
    try:
        brain_runtime.force_goal_review(conversation_id)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/strategy", response_model=dict[str, Any])
def start_brain_strategy(conversation_id: str, request: CouncilDiscussionIn):
    try:
        prompt = brain_runtime.prepare_strategy_prompt(conversation_id)
        snapshot = council_service.run(conversation_id, prompt, request.models, persist_founder_message=False)
        brain_runtime.finalize_council(conversation_id, snapshot)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="Strategy Meeting 暂时不可用，可重试") from error


@router.post("/conversations/{conversation_id}/brain/package/review", response_model=dict[str, Any])
def review_brain_package(conversation_id: str, request: BrainReviewIn):
    try:
        brain_runtime.review_package(conversation_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/brain/stage/advance", response_model=dict[str, Any])
def advance_brain_stage(conversation_id: str, request: BrainReviewIn):
    try:
        brain_runtime.advance_stage(conversation_id, request.action)
        return _candidate_snapshot(council_service.snapshot(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/council/retry", response_model=dict[str, Any])
def retry_council(conversation_id: str):
    try:
        return _candidate_snapshot(council_service.retry(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="多模型讨论暂时不可用，可重试") from error


@router.post("/conversations/{conversation_id}/reply/retry", response_model=dict[str, Any])
def retry_sino_reply(conversation_id: str):
    try:
        return _candidate_snapshot(secretary.retry_reply(conversation_id), conversation_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except LLMGatewayError as error:
        raise HTTPException(status_code=503, detail="Sino 回复失败，可重试") from error


@router.post("/conversations/{conversation_id}/candidate-goals/{candidate_goal_id}/confirm", response_model=dict[str, Any])
def confirm_candidate_goal(conversation_id: str, candidate_goal_id: str):
    try:
        return secretary.confirm_goal(conversation_id, candidate_goal_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/goals/{goal_id}/reason", response_model=SinoBrainOut)
def reason_confirmed_goal(goal_id: str):
    goal = secretary.get_goal(goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal["status"] != "goal_confirmed":
        raise HTTPException(status_code=409, detail="Only confirmed goals can enter reasoning")
    reusable_context = library_context_for_targets([("conversation", goal["conversation_id"]), ("goal", goal_id)])
    response = analyze_with_sino_brain(goal["conversation_id"], SinoBrainIn(user_goal=goal["description"], conversation_context={"goal_id": goal_id, "constraints": goal["constraints"], "acceptance_criteria": goal["acceptance_criteria"], "intelligence_references": reusable_context}))
    with SessionLocal() as session:
        record = session.get(GoalAssetDB, goal_id)
        record.status = "planning"
        session.commit()
    return response


@router.get("/applications", response_model=list[dict[str, str]])
def list_founder_application_registry():
    return [asdict(item) for item in application_registry.list()]


@router.get("/asset-memory-center", response_model=dict[str, Any])
def get_asset_memory_center():
    """Return all durable Founder artifacts and memories with execution links."""
    return build_asset_memory_center()


def _library_call(operation):
    try:
        return operation()
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except IntelligenceLibraryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/library/artifacts/{artifact_id}", response_model=dict[str, Any])
def get_library_artifact(artifact_id: str):
    return _library_call(lambda: artifact_detail(artifact_id))


@router.post("/library/artifacts/{artifact_id}/versions", response_model=dict[str, Any])
def version_library_artifact(artifact_id: str, request: LibraryRevisionIn):
    return _library_call(lambda: create_artifact_version(artifact_id, revision_reason=request.revision_reason, title=request.title, summary=request.summary))


@router.patch("/library/artifacts/{artifact_id}/status", response_model=dict[str, Any])
def change_library_artifact_status(artifact_id: str, request: LibraryStatusIn):
    return _library_call(lambda: set_artifact_status(artifact_id, request.status))


@router.get("/library/memories/{memory_id}", response_model=dict[str, Any])
def get_library_memory(memory_id: str):
    return _library_call(lambda: memory_detail(memory_id))


@router.post("/library/memories/{memory_id}/revisions", response_model=dict[str, Any])
def revise_library_memory(memory_id: str, request: LibraryRevisionIn):
    return _library_call(lambda: revise_memory(memory_id, revision_reason=request.revision_reason, title=request.title, summary=request.summary, content=request.content))


@router.patch("/library/memories/{memory_id}/status", response_model=dict[str, Any])
def change_library_memory_status(memory_id: str, request: LibraryStatusIn):
    return _library_call(lambda: set_memory_status(memory_id, request.status))


@router.post("/library/memories/merge", response_model=dict[str, Any])
def merge_library_memories(request: MemoryMergeIn):
    return _library_call(lambda: merge_memories(request.memory_ids, title=request.title, revision_reason=request.revision_reason))


@router.post("/library/references", response_model=dict[str, Any])
def reference_library_asset(request: LibraryReferenceIn):
    return _library_call(lambda: create_reference(**request.model_dump()))


@router.get("/library/references/{target_type}/{target_id}", response_model=list[dict[str, Any]])
def get_library_references(target_type: str, target_id: str):
    return references_for_target(target_type, target_id)


@router.post("/system-builder/blueprint", response_model=SystemBuildOut)
def build_application_system_blueprint(request: SystemBuildIn):
    if request.conversation_id:
        conversation = get_conversation(request.conversation_id)
        if conversation is None or conversation.system_id != FOUNDER_SYSTEM_KEY:
            raise HTTPException(status_code=404, detail="Founder AI conversation not found")
    try:
        project_intelligence = get_project_intelligence(request.project_id) if request.project_id else None
        plan = system_builder.build(request.system_goal, conversation_id=request.conversation_id, project_intelligence=project_intelligence)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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

    project_context = request.project_context
    conversation_project_id = getattr(conversation, "project_id", None)
    if project_context is None and conversation_project_id:
        project_context = get_project_intelligence(conversation_project_id)
    result = brain.analyze(
        user_goal=request.user_goal,
        conversation_id=conversation_id,
        conversation_context=request.conversation_context,
        project_context=project_context,
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
        "goal_id": (request.conversation_context or {}).get("goal_id"),
        "acceptance_criteria": (request.conversation_context or {}).get("acceptance_criteria", []),
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
    if request.goal_id:
        goal = secretary.get_goal(request.goal_id)
        if goal is None or goal["status"] not in {"goal_confirmed", "planning"}:
            raise HTTPException(status_code=409, detail="A confirmed Goal Asset is required before execution")
    package = request.execution_package
    draft = TaskAssetDraft(**package.task_asset.model_dump())
    execution_package = build_execution_package(
        draft,
        verification=package.verification,
        commit_requirement=package.commit_requirement,
    )
    reusable_context = library_context_for_targets([("goal", request.goal_id), ("task_asset", request.task_asset_id)])
    if reusable_context:
        execution_package = replace(execution_package, context={**execution_package.context, "intelligence_references": reusable_context})
    session = create_execution_session(request.task_asset_id, execution_package)
    return ExecutionSessionOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=session.status,
        execution_allowed=False,
        created_at=session.created_at,
        timeline=_execution_timeline(session),
        approved_at=session.approved_at,
        queued_at=session.queued_at,
        started_at=session.started_at,
        testing_at=session.testing_at,
        completed_at=session.completed_at,
        package_version=execution_package.package_version,
        deltas=list(session.deltas),
        **_execution_observability(session),
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
        created_at=session.created_at,
        queue=queue_item.to_dict(),
        timeline=_execution_timeline(session),
        approved_at=session.approved_at,
        queued_at=session.queued_at,
        started_at=session.started_at,
        testing_at=session.testing_at,
        completed_at=session.completed_at,
        **_execution_observability(session),
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
        created_at=session.created_at,
        queue=queue_item.to_dict() if queue_item else None,
        timeline=_execution_timeline(session),
        approved_at=session.approved_at,
        queued_at=session.queued_at,
        started_at=session.started_at,
        testing_at=session.testing_at,
        completed_at=session.completed_at,
        result=session.result,
        artifact=session.artifact,
        memory=session.memory,
        error_message=session.error_message,
        execution_logs=session.execution_logs,
        package_version=package.package_version,
        deltas=list(session.deltas),
        **_execution_observability(session),
    )


def _execution_observability(session) -> dict[str, Any]:
    last_event = session.events[-1] if session.events else None
    if last_event and last_event.get("event_name") == "failed":
        last_event = last_event.get("metadata", {}).get("last_event") or last_event
    return {
        "events": session.events,
        "last_event": last_event,
        "failure_reason": session.failure_reason or session.error_message,
        "pause_reason": session.pause_reason,
        "recoverable": session.recoverable,
        "current_stage": session.current_stage,
        "authorization_envelope": session.authorization_envelope,
        "authorization_audit": session.authorization_audit,
        "pending_codex_authorization": session.pending_codex_authorization,
    }


def _execution_timeline(session) -> dict[str, str | None]:
    return {
        "approved": session.approved_at,
        "queued": session.queued_at,
        "executing": session.started_at,
        "testing": session.testing_at,
        "completed": session.completed_at if session.status == "completed" else None,
        "failed": session.completed_at if session.status == "failed" else None,
    }


@router.get("/executions/{execution_id}", response_model=ExecutionResultOut)
def get_founder_execution(execution_id: str):
    record = get_execution_session(execution_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Execution session not found")
    return _execution_result(*record)


@router.get("/executions/{execution_id}/status", response_model=ExecutionResultOut)
def get_founder_execution_status(execution_id: str):
    """Canonical polling and refresh-recovery contract for execution runtime state."""
    return get_founder_execution(execution_id)


@router.post("/executions/{execution_id}/codex-authorization/requests", response_model=dict[str, Any])
def evaluate_codex_operation(execution_id: str, request: CodexOperationRequestIn):
    try:
        return authorize_codex_request(execution_id, request.model_dump(exclude_none=True))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/executions/{execution_id}/codex-authorization/decision", response_model=dict[str, Any])
def decide_codex_boundary(execution_id: str, request: CodexBoundaryDecisionIn):
    record = get_execution_session(execution_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Execution session not found")
    session, package = record
    pending = session.pending_codex_authorization
    if not pending:
        raise HTTPException(status_code=409, detail="No pending Codex Founder boundary")
    action = request.action.lower()
    if action == "approve":
        envelope = apply_codex_founder_authorization(execution_id, request.approved_scope)
        return {"decision": "approved", "authorization_envelope": envelope, "auto_resume": True}
    if action == "modify":
        session.pending_codex_authorization = {**pending, "decision": "scope_revision_requested", "requested_scope": request.approved_scope}
        save_execution_session(session, package)
        return {"decision": "scope_revision_requested", "pending": session.pending_codex_authorization}
    if action == "reject":
        session.pending_codex_authorization = None
        session.authorization_audit.append({**pending, "decision": "rejected", "authorized_by": "FOUNDER", "authorized_at": None})
        save_execution_session(session, package)
        return {"decision": "rejected", "auto_resume": False}
    raise HTTPException(status_code=422, detail="action must be approve, modify, or reject")

@router.post("/executions/{execution_id}/cancel", response_model=dict[str, Any])
def cancel_founder_execution(execution_id: str):
    from app.founder_ai.execution_cancel import request_founder_cancel
    try: return request_founder_cancel(execution_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/executions/{execution_id}/resume", response_model=ExecutionSessionOut)
def resume_founder_execution(execution_id: str):
    try:
        queue_item = resume_execution(execution_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    session, package = get_execution_session(execution_id)
    return ExecutionSessionOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=session.status,
        execution_allowed=package.execution_allowed,
        created_at=session.created_at,
        queue=queue_item.to_dict(),
        timeline=_execution_timeline(session),
        approved_at=session.approved_at,
        queued_at=session.queued_at,
        started_at=session.started_at,
        testing_at=session.testing_at,
        completed_at=session.completed_at,
        package_version=package.package_version,
        deltas=list(session.deltas),
        **_execution_observability(session),
    )


@router.post("/executions/{execution_id}/deltas", response_model=dict[str, Any])
def submit_execution_delta(execution_id: str, request: DeltaCreateIn):
    try:
        return delta_service.submit(execution_id=execution_id, conversation_id=request.conversation_id, goal_id=request.goal_id, task_id=request.task_id, content=request.content)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/executions/{execution_id}/deltas/{delta_id}/decision", response_model=dict[str, Any])
def decide_execution_delta(execution_id: str, delta_id: str, request: DeltaDecisionIn):
    try:
        delta = delta_service.decide(delta_id, request.action)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if delta["execution_id"] != execution_id:
        raise HTTPException(status_code=404, detail="Execution delta not found")
    record = get_execution_session(execution_id)
    if record and record[0].status == "paused":
        try:
            resume_execution(execution_id)
        except (PermissionError, RuntimeError, ValueError) as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
    return delta


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


@router.get("/asset-lifecycle/assets")
def get_lifecycle_assets(asset_type: str | None = None, include_legacy: bool = False, domain_id: str | None = None, status: str | None = None):
    return {"assets": list_assets(asset_type, include_legacy=include_legacy, domain_id=domain_id, status=status)}


@router.get("/capability-repository/domains")
def get_capability_repository_domains():
    return {"domains": list_domains()}


@router.get("/capability-repository/assets")
def get_capability_repository_assets(domain_id: str | None = None, asset_type: str | None = None, status: str | None = None):
    return {"assets": list_assets(asset_type, include_legacy=False, domain_id=domain_id, status=status)}


@router.post("/capability-repository/assets/{asset_id}/development")
def develop_capability_asset(asset_id: str):
    try:
        return start_development(asset_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise _lifecycle_conflict(error) from error


@router.post("/capability-repository/assets/{asset_id}/development/complete")
def complete_capability_asset_development(asset_id: str):
    try:
        return complete_development(asset_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise _lifecycle_conflict(error) from error


@router.post("/capability-repository/assets/{asset_id}/tests")
def test_capability_asset(asset_id: str, request: CapabilityTestIn):
    try:
        return run_capability_test(asset_id, request.test_input)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise _lifecycle_conflict(error) from error


@router.post("/capability-repository/assets/{asset_id}/ready-approval")
def approve_capability_asset_ready(asset_id: str):
    try:
        return approve_ready(asset_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise _lifecycle_conflict(error) from error


@router.post("/conversations/{conversation_id}/capability-action")
def conversation_capability_action(conversation_id: str, request: CapabilityActionIn):
    if request.target_type == "conversation" and request.target_id and request.target_id != conversation_id:
        raise HTTPException(status_code=409, detail={"code": "capability_target_mismatch", "message": "Action target Conversation 不匹配"})
    try:
        return perform_capability_action(
            request.target_asset_id, request.action, test_input=request.test_input,
            target_type=request.target_type, target_id=request.target_id, note=request.note,
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail={"code": "capability_not_found", "message": str(error)}) from error
    except ValueError as error:
        raise _lifecycle_conflict(error) from error


@router.get("/asset-lifecycle/assets/{asset_id}")
def get_lifecycle_asset(asset_id: str):
    try:
        return get_asset(asset_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/asset-lifecycle/assets/{asset_id}/execution")
def start_lifecycle_asset_execution(asset_id: str):
    try:
        return create_asset_execution(asset_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get("/asset-lifecycle/executions")
def get_lifecycle_executions():
    return {"executions": list_asset_executions()}


@router.post("/asset-lifecycle/executions/{execution_id}/learning")
def learn_from_lifecycle_execution(execution_id: str):
    try:
        return create_learning(execution_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get("/asset-lifecycle/learnings")
def get_lifecycle_learnings():
    return {"learnings": list_learnings()}


@router.post("/asset-lifecycle/assets/{asset_id}/reuse")
def reuse_lifecycle_asset(asset_id: str, request: AssetReuseIn):
    try:
        return reuse_asset(asset_id, target_type=request.target_type, target_id=request.target_id, note=request.note)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get("/asset-lifecycle/conversations/{conversation_id}/reuse-suggestions")
def get_lifecycle_reuse_suggestions(conversation_id: str):
    try:
        brain = brain_runtime.snapshot(conversation_id)
        if brain and brain.get("message_intent") == "project_context_update":
            return {"assets": []}
        return {"assets": suggest_reuse(conversation_id)}
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
