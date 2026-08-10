from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.context.service import get_founder_context
from app.core.conversation.service import get_conversation
from app.founder_ai.orchestrator import (
    FOUNDER_SYSTEM_KEY,
    build_execution_package,
    generate_task_asset_draft,
)
from app.founder_ai.execution_registry import approve_execution_session, create_execution_session


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


router = APIRouter(prefix="/founder-ai", tags=["Founder AI"])


@router.post("/executions", response_model=ExecutionSessionOut)
def create_founder_execution(request: ExecutionCreateIn):
    package = request.execution_package
    draft = generate_task_asset_draft(package.goal)
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
    return ExecutionSessionOut(
        id=session.id,
        task_asset_id=session.task_asset_id,
        execution_package_id=session.execution_package_id,
        executor=session.executor,
        status=session.status,
        execution_allowed=package.execution_allowed,
    )


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
