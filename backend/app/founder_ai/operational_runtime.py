"""Controlled local operational runtime for Sino Founder AI.

V1 intentionally supports only one low-risk vertical slice:
Founder asks Sino to inspect this repository's branch/HEAD/dirty state.
The flow still records TaskAsset and ExecutionSession lineage, but it uses a
bounded local executor instead of invoking Codex or any external provider.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess
import time
from typing import Callable

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_registry import get_execution_session, save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft

CONTROLLED_LOCAL_DEVELOPMENT_TASK = "CONTROLLED_LOCAL_DEVELOPMENT_TASK"
LOW_RISK = "LOW"
MEDIUM_RISK = "MEDIUM"
HIGH_RISK = "HIGH"
OPERATIONAL_QUEUE_TYPE = "HIGH_RISK_OPERATIONAL_TASK"
REPO_INSPECTION = "REPO_INSPECTION"
FOCUSED_TEST = "FOCUSED_TEST"
FRONTEND_BUILD = "FRONTEND_BUILD"


@dataclass(frozen=True, slots=True)
class OperationSpec:
    operation_type: str
    title: str
    argv: tuple[str, ...] | None
    timeout_seconds: int
    risk_level: str = LOW_RISK


OPERATION_REGISTRY: dict[str, OperationSpec] = {
    REPO_INSPECTION: OperationSpec(
        operation_type=REPO_INSPECTION,
        title="检查当前 AI-Commerce-OS 工程状态",
        argv=None,
        timeout_seconds=10,
    ),
    FOCUSED_TEST: OperationSpec(
        operation_type=FOCUSED_TEST,
        title="运行 Sino Operational Runtime focused tests",
        argv=("backend/.venv/bin/pytest", "backend/tests/test_sino_operational_runtime.py", "-q"),
        timeout_seconds=60,
    ),
    FRONTEND_BUILD: OperationSpec(
        operation_type=FRONTEND_BUILD,
        title="检查 frontend build",
        argv=("npm", "--prefix", "frontend", "run", "build"),
        timeout_seconds=90,
    ),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def classify_operational_risk(content: str) -> dict:
    """Classify operational requests deterministically; no model call."""
    text = (content or "").strip()
    lowered = text.lower()
    high_terms = (
        "push", "deploy", "生产库", "production db", "删库", "删除", "rm -rf",
        "force", "强推", "secret", "credential", "密钥", "支付", "publish", "发布到远程",
    )
    low_terms = (
        "git status", "当前 branch", "当前分支", "head", "未提交", "工程状态",
        "repo 状态", "repository status", "working tree", "工作区",
    )
    focused_test_terms = ("测试", "test", "pytest")
    frontend_build_terms = ("前端", "frontend", "构建", "build")
    if any(term in lowered for term in high_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "reason": "request_crosses_high_risk_operational_boundary",
        }
    if any(term in lowered for term in focused_test_terms) and (
        "sino operational runtime" in lowered or "operational runtime" in lowered or "运行" in text
    ):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "focused_test",
            "operation_type": FOCUSED_TEST,
            "reason": "allowlisted_focused_test",
        }
    if any(term in lowered for term in frontend_build_terms) and ("检查" in text or "能不能" in text or "build" in lowered):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "frontend_build",
            "operation_type": FRONTEND_BUILD,
            "reason": "allowlisted_frontend_build",
        }
    if any(term in lowered for term in low_terms) and (
        "检查" in text or "告诉我" in text or "status" in lowered or "branch" in lowered or "head" in lowered
    ):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "repo_inspection",
            "operation_type": REPO_INSPECTION,
            "reason": "bounded_read_only_repo_inspection",
        }
    return {
        "work_type": None,
        "risk_level": MEDIUM_RISK,
        "auto_continue": False,
        "reason": "not_supported_by_operational_runtime_v1",
    }


def _run_git(args: list[str], *, cwd: Path) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        check=True,
        text=True,
        capture_output=True,
        timeout=10,
    )
    return completed.stdout.strip()


def run_repo_inspection(*, cwd: Path | None = None) -> dict:
    """Real local read-only executor for the V1 repo inspection vertical slice."""
    root = cwd or repo_root()
    branch = _run_git(["branch", "--show-current"], cwd=root)
    head = _run_git(["rev-parse", "HEAD"], cwd=root)
    status = _run_git(["status", "--short"], cwd=root)
    return {
        "branch": branch,
        "head": head,
        "working_tree_clean": not bool(status.strip()),
        "status_short": status,
        "repo_path": str(root),
    }


def _excerpt(value: str, limit: int = 2000) -> str:
    text = value or ""
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n…[truncated]"


def _parse_pytest_result(output: str) -> dict:
    import re
    text = output or ""
    passed = failed = errors = skipped = 0
    for count, label in re.findall(r"(\d+)\s+(passed|failed|error|errors|skipped)", text):
        value = int(count)
        if label == "passed":
            passed = value
        elif label == "failed":
            failed = value
        elif label in {"error", "errors"}:
            errors = value
        elif label == "skipped":
            skipped = value
    return {"passed": passed, "failed": failed, "errors": errors, "skipped": skipped}


def run_allowlisted_process(spec: OperationSpec, *, cwd: Path | None = None) -> dict:
    if not spec.argv:
        raise ValueError("operation_has_no_process_argv")
    started = _now()
    monotonic = time.monotonic()
    try:
        completed = subprocess.run(
            list(spec.argv),
            cwd=str(cwd or repo_root()),
            text=True,
            capture_output=True,
            timeout=spec.timeout_seconds,
            shell=False,
        )
        completed_at = _now()
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        combined = f"{stdout}\n{stderr}".strip()
        success = completed.returncode == 0
        details = _parse_pytest_result(combined) if spec.operation_type == FOCUSED_TEST else {}
        check_result = "PASS" if success else "FAIL"
        if spec.operation_type == FOCUSED_TEST:
            summary = (
                f"测试完成：{details.get('passed', 0)} passed，"
                f"{details.get('failed', 0)} failed，{details.get('errors', 0)} errors。"
            )
        else:
            summary = "Frontend build PASS。" if success else "Frontend build FAIL。"
        return {
            "operation_type": spec.operation_type,
            "success": success,
            "check_result": check_result,
            "exit_code": completed.returncode,
            "summary": summary,
            "stdout_excerpt": _excerpt(stdout),
            "stderr_excerpt": _excerpt(stderr),
            "started_at": started,
            "completed_at": completed_at,
            "duration_seconds": round(time.monotonic() - monotonic, 3),
            "argv": list(spec.argv),
            "shell": False,
            **details,
        }
    except subprocess.TimeoutExpired as error:
        completed_at = _now()
        return {
            "operation_type": spec.operation_type,
            "success": False,
            "check_result": "EXECUTOR_FAILURE",
            "exit_code": None,
            "summary": f"{spec.operation_type} timed out after {spec.timeout_seconds}s.",
            "stdout_excerpt": _excerpt(error.stdout or ""),
            "stderr_excerpt": _excerpt(error.stderr or ""),
            "started_at": started,
            "completed_at": completed_at,
            "duration_seconds": round(time.monotonic() - monotonic, 3),
            "timeout": True,
            "retryable": True,
            "argv": list(spec.argv),
            "shell": False,
        }


def _stable_execution_id(task_id: str, source_message_id: str) -> str:
    digest = hashlib.sha256(f"operational-execution:{task_id}:{source_message_id}".encode()).hexdigest()[:20]
    return f"execution-operational-{digest}"


def _execution_package(*, task: TaskAssetDB, execution_id: str, risk: dict) -> ExecutionPackage:
    operational = dict((task.scope or {}).get("operational_runtime") or {})
    context = {
        "founder_request": operational.get("founder_request") or task.description,
        "conversation_id": task.conversation_id,
        "task_id": task.id,
        "execution_id": execution_id,
        "repo_path": operational.get("repo_path") or str(repo_root()),
        "risk_level": risk.get("risk_level", LOW_RISK),
        "operation_type": operational.get("operation_type") or risk.get("operation_type") or REPO_INSPECTION,
        "allowed_scope": operational.get("allowed_scope"),
        "acceptance_criteria": operational.get("acceptance_criteria"),
        "explicit_non_goals": operational.get("explicit_non_goals"),
        "invocation_source": "sino_operational_runtime_v1",
        "executor": "LOCAL_EXECUTOR",
    }
    draft = TaskAssetDraft(
        title=task.title,
        description=task.description or task.title,
        conversation_id=task.conversation_id,
        scope={"goal_type": "development", "context": context},
        constraints=list(operational.get("explicit_non_goals") or []),
        risk="low",
        approval_required=False,
    )
    return ExecutionPackage(
        goal=task.title,
        context=context,
        task_asset=draft,
        constraints=list(draft.constraints),
        verification=list(operational.get("acceptance_criteria") or ["Return controlled local execution result."]),
        commit_requirement="Controlled local operation; do not modify files unless the allowlisted operation explicitly requires it.",
        approval_required=False,
        execution_allowed=True,
    )


def _append_assistant_message(conversation_id: str, content: str, *, message_type: str, grounding: dict | None = None) -> None:
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if conversation is None:
            raise LookupError("Founder AI conversation not found")
        session.add(ConversationMessageDB(
            conversation_id=conversation_id,
            role="assistant",
            content=content,
            message_type=message_type,
            intent="operational_runtime",
            grounding=dict(grounding or {}),
        ))
        conversation.updated_at = datetime.now(timezone.utc)
        session.commit()


def _update_brain(conversation_id: str, payload: dict) -> None:
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        discovery["operational_runtime"] = payload
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _append_high_risk_queue_item(conversation_id: str, founder_request: str, source_message_id: str, risk: dict) -> None:
    now = _now()
    action_id = f"high-risk-operational:{source_message_id}"
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        if not any(item.get("action_id") == action_id and item.get("status") == "pending" for item in queue):
            queue.append({
                "action_id": action_id,
                "action_type": OPERATIONAL_QUEUE_TYPE,
                "type": OPERATIONAL_QUEUE_TYPE,
                "title": "高风险本地操作需要确认",
                "summary": founder_request[:200],
                "risk_level": HIGH_RISK,
                "risk": "high",
                "status": "pending",
                "conversation_id": conversation_id,
                "source_type": "conversation_message",
                "source_id": source_message_id,
                "created_at": now,
                "updated_at": now,
                "decision": None,
                "decided_at": None,
                "reason": risk.get("reason"),
                "metadata": {"queue_schema": "operational-runtime-v1", "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK},
            })
        discovery["founder_action_queue"] = queue
        discovery["founder_action_required"] = True
        discovery["operational_runtime"] = {
            "status": "blocked",
            "risk_decision": risk,
            "founder_request": founder_request,
            "source_message_id": source_message_id,
            "retryable": False,
            "reason": risk.get("reason"),
        }
        state.discovery = discovery
        state.stage = "operational_runtime"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()


def _task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, risk: dict, spec: OperationSpec) -> dict:
    allowed_scope = ["git status", "git branch --show-current", "git rev-parse HEAD"] if spec.operation_type == REPO_INSPECTION else list(spec.argv or [])
    acceptance = {
        REPO_INSPECTION: [
            "Return current branch",
            "Return current HEAD",
            "Return whether the working tree has uncommitted files",
        ],
        FOCUSED_TEST: [
            "Run the allowlisted Sino Operational Runtime focused test target",
            "Return passed/failed/errors and concise failure summary",
        ],
        FRONTEND_BUILD: [
            "Run the canonical frontend build",
            "Return PASS/FAIL and concise output summary",
        ],
    }[spec.operation_type]
    return {
        "operational_runtime": {
            "schema_version": "sino-operational-runtime-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": (risk.get("operation") or spec.operation_type.lower()),
            "operation_type": spec.operation_type,
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "repo_path": str(repo_root()),
            "risk_decision": risk,
            "risk_level": risk["risk_level"],
            "allowed_scope": allowed_scope,
            "timeout_seconds": spec.timeout_seconds,
            "acceptance_criteria": acceptance,
            "explicit_non_goals": [
                "Do not modify code",
                "Do not write production DB",
                "Do not push",
                "Do not invoke Codex or a provider",
            ],
            "auto_continue_policy": "LOW risk controlled local development task",
        }
    }


def execute_low_risk_repo_inspection(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    runner: Callable[[], dict] | None = None,
) -> dict:
    return execute_low_risk_operation(
        conversation_id=conversation_id,
        founder_request=founder_request,
        source_message_id=source_message_id,
        runner=runner,
    )


def _normalize_operation_result(spec: OperationSpec, result: dict) -> dict:
    if spec.operation_type == REPO_INSPECTION:
        return {
            "operation_type": REPO_INSPECTION,
            "success": True,
            "check_result": "PASS",
            "exit_code": 0,
            "summary": (
                f"当前 branch：{result['branch']}\n"
                f"当前 HEAD：{result['head']}\n"
                f"工作区：{'clean' if result['working_tree_clean'] else 'dirty'}"
            ),
            "stdout_excerpt": result.get("status_short") or "",
            "stderr_excerpt": "",
            "started_at": _now(),
            "completed_at": _now(),
            "result": result,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
    payload = dict(result)
    payload.setdefault("operation_type", spec.operation_type)
    payload.setdefault("real_executor_used", "LOCAL_EXECUTOR")
    payload.setdefault("result", {})
    return payload


def execute_low_risk_operation(
    *,
    conversation_id: str,
    founder_request: str,
    source_message_id: str,
    runner: Callable[[], dict] | None = None,
) -> dict:
    risk = classify_operational_risk(founder_request)
    if risk.get("risk_level") != LOW_RISK or not risk.get("auto_continue"):
        raise ValueError("operational_request_not_low_risk")
    operation_type = risk.get("operation_type") or REPO_INSPECTION
    spec = OPERATION_REGISTRY[operation_type]
    task = create_task_asset(
        title=spec.title,
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            risk=risk,
            spec=spec,
        ),
        status="draft",
        approval_status="approved",
        execution_status="not_started",
    )
    with SessionLocal() as session:
        task = session.get(TaskAssetDB, task.id)
        scope = dict(task.scope or {})
        prior_start = dict(scope.get("execution_start") or {})
        if prior_start.get("execution_id") and task.result:
            return {
                "handled": True,
                "risk_decision": risk,
                "task_id": task.id,
                "execution_id": prior_start["execution_id"],
                "created": False,
                "reused": True,
                "status": task.execution_status,
                "result": task.result,
            }
        execution_id = prior_start.get("execution_id") or _stable_execution_id(task.id, source_message_id)
        package = _execution_package(task=task, execution_id=execution_id, risk=risk)
        existing = get_execution_session(execution_id)
        if existing:
            execution, _package = existing
            created = False
        else:
            execution = ExecutionSession(
                id=execution_id,
                task_asset_id=task.id,
                execution_package_id=f"package-{execution_id}",
                executor="LOCAL_EXECUTOR",
                status="queued",
                approved_at=_now(),
                queued_at=_now(),
            )
            save_execution_session(execution, package)
            created = True
        start = {
            "schema_version": "operational-runtime-start-v1",
            "started_from": "sino_operational_auto_continue",
            "execution_id": execution_id,
            "task_asset_id": task.id,
            "task_id": task.id,
            "status": "queued",
            "operation_type": spec.operation_type,
            "queued_at": execution.queued_at or _now(),
            "source_conversation_id": conversation_id,
            "source_message_refs": [source_message_id],
        }
        scope["execution_start"] = start
        task.scope = scope
        task.status = "in_progress"
        task.execution_status = "queued"
        session.commit()

    queued_payload = {
        "status": "queued",
        "operation_type": spec.operation_type,
        "risk_decision": risk,
        "task_id": task.id,
        "execution_id": execution_id,
        "founder_request": founder_request,
        "message": "这是一个低风险本地开发检查工作，我会直接执行。正在准备执行…",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(
        conversation_id,
        "这是一个低风险本地开发检查工作，我会直接执行。正在准备执行…",
        message_type="operational_execution",
        grounding={"operational_runtime": queued_payload},
    )
    try:
        running_payload = {**queued_payload, "status": "running", "message": "正在执行…"}
        _update_brain(conversation_id, running_payload)
        raw_result = (runner or (lambda: run_repo_inspection() if spec.operation_type == REPO_INSPECTION else run_allowlisted_process(spec)))()
        result = _normalize_operation_result(spec, raw_result)
        completed_at = _now()
        execution_failed = result.get("check_result") == "EXECUTOR_FAILURE" or result.get("timeout") is True
        persisted_result = {
            "status": "failed" if execution_failed else "completed",
            "operation_type": spec.operation_type,
            "success": bool(result.get("success")),
            "check_result": result.get("check_result"),
            "summary": result.get("summary"),
            "stdout_excerpt": result.get("stdout_excerpt"),
            "stderr_excerpt": result.get("stderr_excerpt"),
            "exit_code": result.get("exit_code"),
            "duration_seconds": result.get("duration_seconds"),
            "result": result.get("result") or result,
            "completed_at": completed_at,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task.id)
            record.result = persisted_result
            record.status = "failed" if execution_failed else "completed"
            record.execution_status = "failed" if execution_failed else "completed"
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": persisted_result["status"], "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = persisted_result["status"]
            execution.completed_at = completed_at
            execution.result = persisted_result
            save_execution_session(execution, package)
        completed_payload = {
            **queued_payload,
            "status": persisted_result["status"],
            "result": persisted_result,
            "message": "执行完成。" if not execution_failed else "执行失败。",
        }
        _update_brain(conversation_id, completed_payload)
        _append_assistant_message(
            conversation_id,
            f"{'执行失败' if execution_failed else '执行完成'}。\n\n{persisted_result['summary']}",
            message_type="operational_result",
            grounding={"operational_runtime": completed_payload, "task_id": task.id, "execution_id": execution_id},
        )
        return {
            "handled": True,
            "risk_decision": risk,
            "task_id": task.id,
            "execution_id": execution_id,
            "created": created,
            "reused": False,
            "status": persisted_result["status"],
            "result": persisted_result,
        }
    except Exception as error:
        failed_at = _now()
        failure = {
            "status": "failed",
            "error": str(error),
            "failed_at": failed_at,
            "retryable": True,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task.id)
            if record is not None:
                record.result = failure
                record.status = "failed"
                record.execution_status = "failed"
                session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = "failed"
            execution.error_message = str(error)
            execution.completed_at = failed_at
            execution.result = failure
            save_execution_session(execution, package)
        _update_brain(conversation_id, {**queued_payload, **failure, "message": "执行失败。"})
        _append_assistant_message(
            conversation_id,
            f"执行失败：{error}\n\n可重试：是",
            message_type="operational_result",
            grounding={"operational_runtime": failure, "task_id": task.id, "execution_id": execution_id},
        )
        return {
            "handled": True,
            "risk_decision": risk,
            "task_id": task.id,
            "execution_id": execution_id,
            "created": created,
            "reused": False,
            "status": "failed",
            "result": failure,
        }


def handle_operational_conversation_request(
    *, conversation_id: str, founder_request: str, source_message_id: str,
) -> dict:
    risk = classify_operational_risk(founder_request)
    if risk.get("work_type") != CONTROLLED_LOCAL_DEVELOPMENT_TASK:
        return {"handled": False, "risk_decision": risk}
    if risk.get("risk_level") == HIGH_RISK:
        _append_high_risk_queue_item(conversation_id, founder_request, source_message_id, risk)
        _append_assistant_message(
            conversation_id,
            "这个请求属于高风险本地操作，已进入 Founder Action Queue；在明确批准前我不会调用 executor。",
            message_type="operational_blocked",
            grounding={"operational_runtime": {"status": "blocked", "risk_decision": risk}},
        )
        return {"handled": True, "risk_decision": risk, "status": "blocked"}
    if risk.get("risk_level") == LOW_RISK and risk.get("auto_continue"):
        return execute_low_risk_operation(
            conversation_id=conversation_id,
            founder_request=founder_request,
            source_message_id=source_message_id,
        )
    return {"handled": False, "risk_decision": risk}


def serialize_execution_session(execution_id: str) -> dict | None:
    record = get_execution_session(execution_id)
    if not record:
        return None
    session, package = record
    return {"session": asdict(session), "package": asdict(package)}
