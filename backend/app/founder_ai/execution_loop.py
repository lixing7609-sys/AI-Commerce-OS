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
    execution_stage: str = "CREATED"
    stage_started_at: str | None = None
    last_heartbeat_at: str | None = None
    last_meaningful_event_at: str | None = None
    runtime_revision: str | None = None
    execution_created_revision: str | None = None
    worker_revision: str | None = None
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


def _production_changed_files(attribution: dict[str, Any]) -> list[str]:
    production = []
    for path in list(attribution.get("task_changed_files") or []):
        lowered = path.lower()
        name = Path(lowered).name
        if lowered.startswith("docs/") or lowered.endswith((".md", ".rst")):
            continue
        if any(marker in name for marker in (".test.", ".spec.", "_test.")) or lowered.startswith("backend/tests/"):
            continue
        production.append(path)
    return production


def _result_attribution(result: CodexExecutionResult) -> dict[str, Any]:
    attribution = dict(result.execution_attribution or {})
    attribution.setdefault("task_changed_files", list(result.changed_files or []))
    return attribution


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
            session.subprocess_exit_status = result.exit_code
            session.expected_long_running_operation = None
            session.expected_operation_started_at = None
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
            from .execution_scope import SCOPE_PASS, rollback_scope_mismatch_patch, verify_execution_scope
            contract = dict(package.context.get("standard_task_contract") or {})
            scope_result = verify_execution_scope(contract=contract, attribution=dict(result.execution_attribution or {}))
            append_event(session, "scope_verification_started", status="scope_verifying", message="Task-owned patch scope verification started")
            append_event(session, "scope_verification_finished", status="scope_passed" if scope_result["status"] == SCOPE_PASS else "scope_mismatch",
                         message=f"Task scope verification: {scope_result['status']}", metadata={"scope_verification": scope_result})
            correction_attempts = []
            if scope_result["status"] != SCOPE_PASS:
                append_event(session, "scope_correction_started", status="correcting_scope",
                             message="检测到本次代码改动超出了任务范围，正在撤销本次错误改动并重新执行；不会影响任务开始前已有的工作区修改。",
                             metadata={"scope_verification": scope_result, "attempt": 1})
                attribution = dict(result.execution_attribution or {})
                head_changed = bool(attribution.get("head_changed"))
                rolled_back = rollback_scope_mismatch_patch(
                    cwd, scope_verification=scope_result, attribution=attribution,
                )
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
                    corrected_attribution = dict(result.execution_attribution or {})
                    corrected_rollback = rollback_scope_mismatch_patch(
                        cwd, scope_verification=scope_result, attribution=corrected_attribution,
                    )
                    correction_attempts[-1]["corrected_rollback_succeeded"] = corrected_rollback
                    session.result = {
                        "scope_verification": scope_result,
                        "scope_correction_attempts": correction_attempts,
                        "task_owned_patch_persisted": not corrected_rollback,
                    }
                    session.status = "blocked"
                    if corrected_attribution.get("head_changed"):
                        raise ExecutionScopeBlocked("scope mismatch after correction-owned commit; automatic history rewrite is forbidden")
                    if not corrected_rollback:
                        raise ExecutionScopeBlocked("scope mismatch after correction; execution-owned patch could not be safely reversed")
                    raise ExecutionScopeBlocked("scope mismatch after one automatic correction")
            implementation_required = bool(contract.get("implementation_required", True))
            normalized_attribution = _result_attribution(result)
            production_files = _production_changed_files(normalized_attribution)
            if implementation_required and not production_files:
                session.result = {
                    "scope_verification": scope_result,
                    "scope_correction_attempts": correction_attempts,
                    "task_owned_patch_persisted": False,
                    "production_changed_files": [],
                    "implementation_required": True,
                }
                session.status = "blocked"
                raise ExecutionScopeBlocked("NO_IMPLEMENTATION_EVIDENCE: implementation task produced no production patch")
            if contract:
                from .post_implementation import run_post_implementation_pipeline

                def project_post_event(event_name: str, status: str, message: str, metadata: dict) -> None:
                    append_event(session, event_name, status=status, message=message, metadata=metadata)
                    self.on_status(status)

                post_verification = run_post_implementation_pipeline(
                    package=package, attribution=normalized_attribution, repo_root=cwd,
                    preferred_browser=result.browser_verification, on_event=project_post_event,
                )
            else:
                from .verification_fallback import codex_command_evidence
                post_verification = {
                    "status": "VERIFIED", "stage": "legacy_adapter",
                    "evidence": codex_command_evidence(
                        result.stdout, exit_code=result.exit_code, required=list(package.verification or []),
                    ),
                }
            command_evidence = [
                item for item in post_verification.get("evidence") or []
                if item.get("verifier") in {"targeted_tests", "build", "git_diff_check"}
            ]
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
                "task_owned_patch_persisted": scope_result["status"] == SCOPE_PASS and bool(production_files),
                "production_changed_files": production_files,
                "implementation_required": implementation_required,
                "scope_correction_attempts": correction_attempts,
                "post_implementation_verification": post_verification,
                "task_id": session.task_asset_id,
                "execution_id": session.id,
                "execution_package_id": session.execution_package_id,
                "codex_run_id": result.codex_run_id,
            }
            if post_verification.get("status") != "VERIFIED":
                raise RuntimeError(
                    post_verification.get("failure_reason")
                    or f"post-implementation verification failed at {post_verification.get('stage')}"
                )
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
