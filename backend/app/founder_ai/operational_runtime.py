"""Controlled local operational runtime for Sino Founder AI.

V1 intentionally supports only one low-risk vertical slice:
Founder asks Sino to inspect this repository's branch/HEAD/dirty state.
The flow still records TaskAsset and ExecutionSession lineage, but it uses a
bounded local executor instead of invoking Codex or any external provider.
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess
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
    if any(term in lowered for term in high_terms):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": HIGH_RISK,
            "auto_continue": False,
            "reason": "request_crosses_high_risk_operational_boundary",
        }
    if any(term in lowered for term in low_terms) and (
        "检查" in text or "告诉我" in text or "status" in lowered or "branch" in lowered or "head" in lowered
    ):
        return {
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "risk_level": LOW_RISK,
            "auto_continue": True,
            "operation": "repo_inspection",
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
        verification=["Return real branch, HEAD and working tree state."],
        commit_requirement="Read-only local repo inspection; do not modify files.",
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


def _task_scope(*, founder_request: str, conversation_id: str, source_message_id: str, risk: dict) -> dict:
    return {
        "operational_runtime": {
            "schema_version": "sino-operational-runtime-v1",
            "work_type": CONTROLLED_LOCAL_DEVELOPMENT_TASK,
            "operation": "repo_inspection",
            "founder_request": founder_request,
            "conversation_id": conversation_id,
            "source_message_id": source_message_id,
            "repo_path": str(repo_root()),
            "risk_decision": risk,
            "risk_level": risk["risk_level"],
            "allowed_scope": ["git status", "git branch --show-current", "git rev-parse HEAD"],
            "acceptance_criteria": [
                "Return current branch",
                "Return current HEAD",
                "Return whether the working tree has uncommitted files",
            ],
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
    risk = classify_operational_risk(founder_request)
    if risk.get("risk_level") != LOW_RISK or not risk.get("auto_continue"):
        raise ValueError("operational_request_not_low_risk")
    task = create_task_asset(
        title="检查当前 AI-Commerce-OS 工程状态",
        description=founder_request,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        scope=_task_scope(
            founder_request=founder_request,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            risk=risk,
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
        "risk_decision": risk,
        "task_id": task.id,
        "execution_id": execution_id,
        "founder_request": founder_request,
        "message": "这是一个低风险本地开发检查，我会直接执行。正在准备执行…",
    }
    _update_brain(conversation_id, queued_payload)
    _append_assistant_message(
        conversation_id,
        "这是一个低风险本地开发检查，我会直接执行。正在准备执行…",
        message_type="operational_execution",
        grounding={"operational_runtime": queued_payload},
    )
    try:
        running_payload = {**queued_payload, "status": "running", "message": "正在执行…"}
        _update_brain(conversation_id, running_payload)
        result = (runner or run_repo_inspection)()
        completed_at = _now()
        persisted_result = {
            "status": "completed",
            "summary": (
                f"当前 branch：{result['branch']}\n"
                f"当前 HEAD：{result['head']}\n"
                f"工作区：{'clean' if result['working_tree_clean'] else 'dirty'}"
            ),
            "result": result,
            "completed_at": completed_at,
            "real_executor_used": "LOCAL_EXECUTOR",
        }
        with SessionLocal() as session:
            record = session.get(TaskAssetDB, task.id)
            record.result = persisted_result
            record.status = "completed"
            record.execution_status = "completed"
            scope = dict(record.scope or {})
            start = dict(scope.get("execution_start") or {})
            start.update({"status": "completed", "completed_at": completed_at})
            scope["execution_start"] = start
            record.scope = scope
            session.commit()
        registry_record = get_execution_session(execution_id)
        if registry_record:
            execution, package = registry_record
            execution.status = "completed"
            execution.completed_at = completed_at
            execution.result = persisted_result
            save_execution_session(execution, package)
        completed_payload = {
            **queued_payload,
            "status": "completed",
            "result": persisted_result,
            "message": "执行完成。",
        }
        _update_brain(conversation_id, completed_payload)
        _append_assistant_message(
            conversation_id,
            f"执行完成。\n\n{persisted_result['summary']}",
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
            "status": "completed",
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
        return execute_low_risk_repo_inspection(
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
