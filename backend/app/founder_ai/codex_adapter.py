"""Codex CLI boundary. This module is only invoked after approval checks."""

from dataclasses import dataclass
import json
import hashlib
import logging
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

from .orchestrator import ExecutionPackage
from .codex_permission_adapter import PERMISSION_AUTO_HANDLED, decide_codex_permission
from .task_package import TaskPackageBuilder

logger = logging.getLogger(__name__)

DEFAULT_CODEX_TIMEOUT_SECONDS = 3600


class CodexExecutionTimeout(TimeoutError):
    """Raised after a timed-out Codex process and its process group are stopped."""

    def __init__(self, timeout_seconds: float, stdout: str = "", stderr: str = ""):
        super().__init__(f"Codex execution timed out after {timeout_seconds:g} seconds")
        self.stdout = stdout
        self.stderr = stderr
        self.timeout_seconds = timeout_seconds


@dataclass(frozen=True)
class CodexExecutionResult:
    stdout: str
    stderr: str
    exit_code: int = 0
    changed_files: list[str] | None = None
    tests: list[str] | None = None
    commit_hash: str | None = None
    browser_verification: dict | None = None
    execution_baseline: dict | None = None
    execution_attribution: dict | None = None
    codex_run_id: str | None = None
    permission_decision: dict | None = None


class SubprocessCodexAdapter:
    def __init__(self, command: str = "codex", timeout_seconds: float | None = None, task_package_builder=None, on_process_started=None):
        self.command = self._resolve_command(command)
        self.task_package_builder = task_package_builder or TaskPackageBuilder()
        self.on_process_started = on_process_started
        # Founder execution packages commonly include the full backend/frontend
        # verification suite. Ten minutes is too short for that bounded workflow,
        # especially on the first run when tool caches are cold.
        configured_timeout = os.getenv("FOUNDER_CODEX_TIMEOUT_SECONDS", str(DEFAULT_CODEX_TIMEOUT_SECONDS))
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else float(configured_timeout)
        if self.timeout_seconds <= 0:
            raise ValueError("Codex timeout must be greater than zero")

    @staticmethod
    def _resolve_command(command: str) -> str:
        """Resolve Codex once so launchd's reduced PATH cannot break dispatch."""
        if Path(command).is_absolute():
            return command
        configured = os.getenv("FOUNDER_CODEX_EXECUTABLE")
        resolved = shutil.which(configured or command)
        if resolved:
            return resolved
        user_install = Path.home() / ".npm-global" / "bin" / command
        return str(user_install) if user_install.is_file() else command

    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        permission_decision = decide_codex_permission(package)
        if permission_decision.get("decision") != PERMISSION_AUTO_HANDLED:
            raise PermissionError(
                f"codex_permission_not_auto_handled:{permission_decision.get('reason') or 'founder_approval_required'}"
            )
        instruction_path = self.task_package_builder.write(package, cwd / ".founder-execution")
        instruction = instruction_path.read_text(encoding="utf-8")
        contract = dict(package.context.get("standard_task_contract") or {})
        evidence_path = cwd / ".founder-execution" / f"visible-artifact-{contract.get('task_id')}.json"
        if contract.get("visible_artifact_contract", {}).get("required") and evidence_path.is_file():
            evidence_path.unlink()
        from .execution_scope import attribute_execution_changes, capture_execution_baseline, codex_run_id
        legacy_before = None
        try:
            baseline, dirty_contents_before = capture_execution_baseline(cwd)
        except (OSError, TypeError, subprocess.SubprocessError):
            # Test adapters and non-Git temporary workspaces still receive a bounded
            # path-level fallback; production Git workspaces always use the full baseline.
            legacy_before = self._working_tree_snapshot(cwd)
            baseline, dirty_contents_before = {"head_sha": self._git_head(cwd), "dirty_files_before": sorted(legacy_before), "capture_mode": "path_fingerprint_fallback"}, {}
        before_head = self._git_head(cwd)
        started = time.monotonic()
        logger.info("Codex started instruction=%s timeout_seconds=%s", instruction_path.name, self.timeout_seconds)
        process = subprocess.Popen(
            [self.command, "exec", "-s", "workspace-write", "-c", f'approval_policy="{permission_decision["codex_approval_policy"]}"', "-"],
            cwd=str(cwd),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        if self.on_process_started: self.on_process_started(process.pid)
        try:
            stdout, stderr = process.communicate(input=instruction, timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired as error:
            stdout, stderr = self._stop_process_group(process, error)
            logger.error("Codex timed out after %.2fs instruction=%s", time.monotonic() - started, instruction_path.name)
            raise CodexExecutionTimeout(self.timeout_seconds, stdout, stderr) from error
        logger.info(
            "Codex finished instruction=%s exit_code=%s duration_seconds=%.2f",
            instruction_path.name,
            process.returncode,
            time.monotonic() - started,
        )
        after_head = self._git_head(cwd)
        try:
            attribution = attribute_execution_changes(cwd, baseline=baseline, dirty_contents_before=dirty_contents_before)
        except (OSError, TypeError, subprocess.SubprocessError):
            legacy_after = self._working_tree_snapshot(cwd)
            legacy_changed = sorted(path for path, fingerprint in legacy_after.items() if (legacy_before or {}).get(path) != fingerprint)
            attribution = {"task_changed_files": legacy_changed, "execution_owned_patch": "", "execution_owned_patch_fingerprint": None,
                           "dirty_files_after": sorted(legacy_after), "head_sha_after": after_head, "head_changed": after_head != baseline.get("head_sha")}
        working_tree_changes = set(attribution["task_changed_files"])
        committed_changes = self._git_diff_names(cwd, before_head, after_head)
        changed = sorted(working_tree_changes | committed_changes)
        commit_hash = after_head if after_head != before_head else None
        return CodexExecutionResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=process.returncode,
            changed_files=changed,
            tests=list(package.verification),
            commit_hash=commit_hash,
            browser_verification=self._browser_verification(cwd, package),
            execution_baseline=baseline,
            execution_attribution=attribution,
            codex_run_id=codex_run_id(stderr),
            permission_decision=permission_decision,
        )

    @staticmethod
    def _browser_verification(cwd: Path, package: ExecutionPackage) -> dict | None:
        contract = dict(package.context.get("standard_task_contract") or {})
        task_id = contract.get("task_id")
        if not task_id or not contract.get("visible_artifact_contract", {}).get("required"):
            return None
        evidence_path = cwd / ".founder-execution" / f"visible-artifact-{task_id}.json"
        if not evidence_path.is_file():
            return {"status": "MISSING", "evidence_path": str(evidence_path.relative_to(cwd))}
        try:
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            return {"status": "INVALID", "error": str(error), "evidence_path": str(evidence_path.relative_to(cwd))}
        evidence["evidence_path"] = str(evidence_path.relative_to(cwd))
        return evidence

    @staticmethod
    def _stop_process_group(process: subprocess.Popen, error: subprocess.TimeoutExpired) -> tuple[str, str]:
        """Terminate Codex and descendants, escalating to SIGKILL after a short grace period."""
        stdout = error.stdout or ""
        stderr = error.stderr or ""
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            final_stdout, final_stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            final_stdout, final_stderr = process.communicate()
        return final_stdout or stdout, final_stderr or stderr

    @staticmethod
    def _git_status(cwd: Path) -> dict[str, str]:
        result = subprocess.run(
            ["git", "status", "--short"], cwd=str(cwd), capture_output=True, text=True, check=False
        )
        return {line[3:]: line[:2] for line in result.stdout.splitlines() if len(line) > 3}

    @classmethod
    def _working_tree_snapshot(cls, cwd: Path) -> dict[str, str]:
        snapshot = {}
        for path, status in cls._git_status(cwd).items():
            target = cwd / path.split(" -> ")[-1]
            digest = hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else "missing"
            snapshot[path] = f"{status}:{digest}"
        return snapshot

    @staticmethod
    def _git_diff_names(cwd: Path, before: str | None, after: str | None) -> set[str]:
        if not before or not after or before == after:
            return set()
        result = subprocess.run(
            ["git", "diff", "--name-only", f"{before}..{after}"], cwd=str(cwd), capture_output=True, text=True, check=False
        )
        return set(result.stdout.splitlines())

    @staticmethod
    def _git_head(cwd: Path) -> str | None:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=str(cwd), capture_output=True, text=True, check=False
        )
        return result.stdout.strip() or None
