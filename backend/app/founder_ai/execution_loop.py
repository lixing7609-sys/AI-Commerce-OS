"""Approved Founder AI execution loop with an injectable Codex adapter."""

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from .codex_adapter import CodexExecutionResult, SubprocessCodexAdapter
from .execution_events import append_event
from .orchestrator import ExecutionPackage, MemoryAssetDraft, build_memory_asset_draft


EXECUTION_STATES = {"created", "draft", "approved", "queued", "executing", "testing", "paused", "blocked", "completed", "failed"}


@dataclass
class ExecutionSession:
    id: str
    task_asset_id: str
    execution_package_id: str
    executor: str = "codex"
    status: str = "draft"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_at: str | None = None
    queued_at: str | None = None
    started_at: str | None = None
    testing_at: str | None = None
    completed_at: str | None = None
    result: dict[str, Any] | None = None
    commit_hash: str | None = None
    error_message: str | None = None
    artifact: dict[str, Any] | None = None
    memory: dict[str, Any] | None = None
    execution_logs: list[dict[str, str]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    current_stage: str | None = None
    failure_reason: str | None = None
    pause_reason: str | None = None
    recoverable: bool = False
    deltas: list[dict[str, Any]] = field(default_factory=list)
    handoff_id: str | None = None
    readiness_contract_id: str | None = None
    scope_fingerprint: str | None = None
    execution_started_at: str | None = None
    session_version: int = 1
    action_contract_id: str | None = None
    action_contract_fingerprint: str | None = None
    lifecycle_migration_version: int | None = None
    restart_recovery_migrated_at: str | None = None
    source_status: str | None = None
    source_error_message: str | None = None
    worker_id: str | None = None
    worker_heartbeat_at: str | None = None
    meaningful_progress_at: str | None = None
    subprocess_pid: int | None = None
    subprocess_exit_status: int | None = None
    subprocess_activity_at: str | None = None
    expected_long_running_operation: str | None = None
    expected_operation_started_at: str | None = None
    expected_operation_timeout_seconds: int | None = None
    technical_resolution: dict[str, Any] | None = None
    authorization_envelope: dict[str, Any] | None = None
    authorization_audit: list[dict[str, Any]] = field(default_factory=list)
    pending_codex_authorization: dict[str, Any] | None = None

    def log(self, stage: str, message: str, *, timestamp: str | None = None) -> None:
        self.execution_logs.append({"timestamp": timestamp or datetime.now(timezone.utc).isoformat(), "stage": stage, "message": message})


@dataclass(frozen=True)
class ArtifactAssetDraft:
    execution_id: str
    commit_hash: str | None
    changed_files: list[str]
    result_summary: str
    system_id: str = "founder_ai"


@dataclass(frozen=True)
class CodexAdapter(Protocol):
    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        ...


class ExecutionApprovalError(PermissionError):
    """Raised whenever execution is attempted without Founder approval."""


class ExecutionPausedForDelta(RuntimeError):
    """Raised at a safe stage boundary when a Founder delta requested replanning."""


class ExecutionScopeBlocked(RuntimeError):
    """Raised after bounded scope correction cannot produce an in-scope patch."""


class FounderExecutionLoop:
    def __init__(self, adapter: CodexAdapter, on_status=None):
        self.adapter = adapter
        self.on_status = on_status or (lambda _status: None)

    def approve(self, session: ExecutionSession) -> ExecutionSession:
        if session.status != "draft":
            raise ValueError("only draft sessions can be approved")
        session.status = "approved"
        session.approved_at = datetime.now(timezone.utc).isoformat()
        append_event(session, "approved", status="approved", message="Founder approval granted", timestamp=session.approved_at)
        return session

    def run(
        self,
        session: ExecutionSession,
        package: ExecutionPackage,
        *,
        cwd: Path,
        defer_completion: bool = False,
    ) -> tuple[ExecutionSession, ArtifactAssetDraft, MemoryAssetDraft]:
        if session.status not in {"approved", "queued"} or not package.execution_allowed:
            raise ExecutionApprovalError("Founder approval is required before Codex execution")
        session.status = "executing"
        session.started_at = session.started_at or datetime.now(timezone.utc).isoformat()
        append_event(session, "codex_started", status="executing", message="Codex subprocess started", timestamp=session.started_at)
        self.on_status("executing")
        try:
            result = self.adapter.execute(package, cwd=cwd)
            append_event(session, "codex_finished", status="executing",
                         message=f"Codex subprocess finished with exit code {result.exit_code}",
                         metadata={"exit_code": result.exit_code, "codex_run_id": result.codex_run_id,
                                   "stderr_summary": (result.stderr or "")[-2000:]})
            if result.exit_code != 0:
                session.result = {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.exit_code,
                                  "changed_files": result.changed_files, "execution_baseline": result.execution_baseline,
                                  "execution_attribution": result.execution_attribution, "codex_run_id": result.codex_run_id}
                session.subprocess_exit_status = result.exit_code
                raise RuntimeError(result.stderr or "Codex execution failed")
            from .execution_scope import SCOPE_PASS, rollback_execution_owned_patch, verify_execution_scope
            contract = dict(package.context.get("standard_task_contract") or {})
            scope_result = verify_execution_scope(contract=contract, attribution=dict(result.execution_attribution or {}))
            append_event(session, "scope_verification_started", status="scope_verifying", message="Task-owned patch scope verification started")
            append_event(session, "scope_verification_finished", status="scope_passed" if scope_result["status"] == SCOPE_PASS else "scope_mismatch",
                         message=f"Task scope verification: {scope_result['status']}", metadata={"scope_verification": scope_result})
            correction_attempts = []
            if scope_result["status"] != SCOPE_PASS:
                patch = str((result.execution_attribution or {}).get("execution_owned_patch") or "")
                append_event(session, "scope_correction_started", status="correcting_scope",
                             message="检测到本次代码改动超出了任务范围，正在撤销本次错误改动并重新执行；不会影响任务开始前已有的工作区修改。",
                             metadata={"scope_verification": scope_result, "attempt": 1})
                head_changed = bool((result.execution_attribution or {}).get("head_changed"))
                rolled_back = False if head_changed else rollback_execution_owned_patch(cwd, patch)
                correction_attempts.append({"attempt": 1, "rollback_succeeded": rolled_back, "scope_verification": scope_result})
                if not rolled_back:
                    session.result = {"scope_verification": scope_result, "scope_correction_attempts": correction_attempts}
                    session.status = "blocked"
                    reason = "scope mismatch after execution-owned commit; automatic history rewrite is forbidden" if head_changed else "scope mismatch; execution-owned patch could not be safely reversed"
                    raise ExecutionScopeBlocked(reason)
                corrected_context = {**dict(package.context), "scope_correction": {
                    "attempt": 1, "previous_out_of_scope_files": scope_result["out_of_scope_files"],
                    "instruction": "Start from the original task goal. Modify only the semantic target and bounded implementation scope; do not resume any previous task goal.",
                    "task_id": session.task_asset_id, "execution_id": session.id,
                }}
                append_event(session, "codex_started", status="correcting_scope", message="Isolated Codex scope-correction run started",
                             metadata={"scope_correction_attempt": 1})
                result = self.adapter.execute(replace(package, context=corrected_context), cwd=cwd)
                append_event(session, "codex_finished", status="correcting_scope",
                             message=f"Scope-correction Codex run finished with exit code {result.exit_code}",
                             metadata={"exit_code": result.exit_code, "codex_run_id": result.codex_run_id,
                                       "scope_correction_attempt": 1, "stderr_summary": (result.stderr or "")[-2000:]})
                if result.exit_code != 0:
                    session.result = {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.exit_code,
                                      "scope_correction_attempts": correction_attempts, "codex_run_id": result.codex_run_id}
                    session.subprocess_exit_status = result.exit_code
                    raise RuntimeError(result.stderr or "Codex scope correction failed")
                scope_result = verify_execution_scope(contract=contract, attribution=dict(result.execution_attribution or {}))
                correction_attempts[-1]["corrected_scope_verification"] = scope_result
                append_event(session, "scope_correction_finished", status="scope_passed" if scope_result["status"] == SCOPE_PASS else "scope_mismatch",
                             message="已重新按正确范围完成修改，正在验证。" if scope_result["status"] == SCOPE_PASS else "范围纠偏后仍发生错位，执行已停止。",
                             metadata={"scope_verification": scope_result, "attempt": 1})
                if scope_result["status"] != SCOPE_PASS:
                    rollback_execution_owned_patch(cwd, str((result.execution_attribution or {}).get("execution_owned_patch") or ""))
                    session.result = {"scope_verification": scope_result, "scope_correction_attempts": correction_attempts}
                    session.status = "blocked"
                    raise ExecutionScopeBlocked("scope mismatch after one automatic correction")
            from .verification_fallback import codex_command_evidence
            command_evidence = codex_command_evidence(result.stdout, exit_code=result.exit_code, required=list(package.verification or []))
            session.result = {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
                "changed_files": result.changed_files,
                "tests": result.tests,
                "browser_verification": result.browser_verification,
                "command_verification_evidence": command_evidence,
                "execution_baseline": result.execution_baseline,
                "execution_attribution": result.execution_attribution,
                "scope_verification": scope_result,
                "scope_correction_attempts": correction_attempts,
                "task_id": session.task_asset_id,
                "execution_id": session.id,
                "execution_package_id": session.execution_package_id,
                "codex_run_id": result.codex_run_id,
            }
            session.subprocess_exit_status = result.exit_code
            session.subprocess_activity_at = datetime.now(timezone.utc).isoformat()
            session.expected_long_running_operation = None
            self.on_status("executing")
            if session.status == "paused":
                raise ExecutionPausedForDelta(session.pause_reason or "Execution paused for Founder delta")
            session.status = "testing"
            session.testing_at = datetime.now(timezone.utc).isoformat()
            append_event(session, "testing_started", status="testing", message="Execution verification started", timestamp=session.testing_at)
            self.on_status("testing")
            append_event(
                session,
                "testing_finished",
                status="testing",
                message="Execution verification finished",
                metadata={"tests": list(result.tests or [])},
            )
            self.on_status("testing")
            session.commit_hash = result.commit_hash
            artifact = ArtifactAssetDraft(
                execution_id=session.id,
                commit_hash=result.commit_hash,
                changed_files=list(result.changed_files or []),
                result_summary=result.stdout[-2000:] or "Execution completed",
            )
            memory = build_memory_asset_draft(
                decision="Founder approved execution",
                artifact=", ".join(result.changed_files) or None,
                commit=result.commit_hash,
                learning="Execution completed through the approved Codex adapter",
            )
            if not defer_completion:
                session.status = "completed"
                session.completed_at = datetime.now(timezone.utc).isoformat()
                append_event(session, "completed", status="completed", message="Execution completed", timestamp=session.completed_at)
                self.on_status("completed")
            return session, artifact, memory
        except (ExecutionPausedForDelta, ExecutionScopeBlocked):
            raise
        except Exception as error:
            session.status = "failed"
            session.error_message = str(error)
            session.failure_reason = str(error)
            session.completed_at = datetime.now(timezone.utc).isoformat()
            raise
