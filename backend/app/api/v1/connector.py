import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.models.connector_api import (
    BrainCompleteRequest,
    BrainCompleteResponse,
    ConnectorHealthResponse,
    ExecutionInputRequest,
    ExecutionStartRequest,
    ExecutionStartResponse,
    ExecutionStatusResponse,
    TaskPackagePreviewRequest,
    TaskPackagePreviewResponse,
)
from app.services.connector.claude_code_executor import (
    ClaudeCodeExecutor,
    ExecutionAlreadyRunningError,
    ExecutorNotAvailableError,
)
from app.services.connector.connector_run_service import ConnectorRunService
from app.services.connector.credential_service import CredentialService
from app.services.connector.sino_orchestrator import SinoOrchestrator

logger = logging.getLogger("app.connector_api")

router = APIRouter(prefix="/connector", tags=["Connector"])


@router.get("/health", response_model=ConnectorHealthResponse)
def get_connector_health():
    return ConnectorHealthResponse(
        brain=CredentialService.check_brain_health(),
        executor=CredentialService.check_executor_health(),
    )


@router.post("/brain/complete", response_model=BrainCompleteResponse)
def brain_complete(request: BrainCompleteRequest):
    result = SinoOrchestrator.process_message(
        conversation_id=request.conversation_id,
        message=request.message,
        sino_state=request.sino_state.model_dump(),
        recent_messages=[m.model_dump() for m in request.recent_messages],
        knowledge=request.knowledge,
    )
    return BrainCompleteResponse(**result)


@router.get("/conversations/{conversation_id}/runs")
def list_conversation_runs(conversation_id: str, kind: str | None = None, limit: int = 50):
    runs = ConnectorRunService.list_runs_for_conversation(conversation_id, kind=kind, limit=limit)
    return {
        "items": [
            {
                "id": run.id,
                "kind": run.kind,
                "status": run.status,
                "decision_id": run.decision_id,
                "task_package_id": run.task_package_id,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "duration_ms": run.duration_ms,
            }
            for run in runs
        ]
    }


@router.post("/task-packages/preview", response_model=TaskPackagePreviewResponse)
def preview_task_package(request: TaskPackagePreviewRequest):
    task_package_id = f"tp-{uuid.uuid4().hex[:20]}"
    run = ConnectorRunService.start_run(
        kind="task_package",
        conversation_id=request.conversation_id,
        decision_id=request.decision_id,
        task_package_id=task_package_id,
        input_summary=f"task={request.task_package.get('name')}",
        detail={"task_package": request.task_package},
        status="completed",
    )
    ConnectorRunService.complete_run(run.id, status="completed", output_summary="任务包已生成，等待批准分配")
    return TaskPackagePreviewResponse(task_package_id=task_package_id, connector_run_id=run.id)


@router.post("/execution/start", response_model=ExecutionStartResponse)
async def start_execution(request: ExecutionStartRequest):
    try:
        run_id = await ClaudeCodeExecutor.start_execution(
            conversation_id=request.conversation_id,
            decision_id=request.decision_id,
            task_package_id=request.task_package_id,
            task_package=request.task_package,
        )
    except ExecutionAlreadyRunningError as error:
        raise HTTPException(
            status_code=409,
            detail={"message": "该任务包已有一个正在执行的任务", "existing_run_id": error.existing_run_id},
        ) from error
    except ExecutorNotAvailableError as error:
        health = CredentialService.check_executor_health()
        raise HTTPException(
            status_code=503,
            detail={"message": "Claude Code Executor 当前不可用", "reason": str(error), "health": health},
        ) from error

    return ExecutionStartResponse(run_id=run_id, status="running")


def _run_to_status_response(run) -> ExecutionStatusResponse:
    detail = run.detail or {}
    return ExecutionStatusResponse(
        run_id=run.id,
        kind=run.kind,
        status=run.status,
        conversation_id=run.conversation_id,
        decision_id=run.decision_id,
        task_package_id=run.task_package_id,
        current_step=detail.get("current_step"),
        awaiting_input_question=detail.get("awaiting_input_question"),
        awaiting_input_kind=detail.get("awaiting_input_kind"),
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        error=run.error,
        detail=detail,
    )


@router.get("/execution/{run_id}/status", response_model=ExecutionStatusResponse)
def get_execution_status(run_id: str):
    run = ConnectorRunService.get_run(run_id)
    if run is None or run.kind != "executor":
        raise HTTPException(status_code=404, detail=f"未找到执行记录：{run_id}")
    return _run_to_status_response(run)


@router.get("/execution/{run_id}/result", response_model=ExecutionStatusResponse)
def get_execution_result(run_id: str):
    return get_execution_status(run_id)


@router.post("/execution/{run_id}/input", response_model=ExecutionStatusResponse)
async def provide_execution_input(run_id: str, request: ExecutionInputRequest):
    try:
        await ClaudeCodeExecutor.provide_input(run_id, request.answer)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    run = ConnectorRunService.get_run(run_id)
    return _run_to_status_response(run)


@router.post("/execution/{run_id}/cancel", response_model=ExecutionStatusResponse)
async def cancel_execution(run_id: str):
    run = ConnectorRunService.get_run(run_id)
    if run is None or run.kind != "executor":
        raise HTTPException(status_code=404, detail=f"未找到执行记录：{run_id}")
    if run.status not in ("running", "waiting_for_input"):
        raise HTTPException(status_code=409, detail=f"该执行当前状态为 {run.status}，无法取消")

    await ClaudeCodeExecutor.cancel(run_id)
    run = ConnectorRunService.get_run(run_id)
    return _run_to_status_response(run)
