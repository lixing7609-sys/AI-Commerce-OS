"""Codex CLI boundary. This module is only invoked after approval checks."""

from dataclasses import dataclass
import hashlib
import logging
import os
from pathlib import Path
import signal
import subprocess
import time

from .orchestrator import ExecutionPackage
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


class SubprocessCodexAdapter:
    def __init__(self, command: str = "codex", timeout_seconds: float | None = None, task_package_builder=None):
        self.command = command
        self.task_package_builder = task_package_builder or TaskPackageBuilder()
        # Founder execution packages commonly include the full backend/frontend
        # verification suite. Ten minutes is too short for that bounded workflow,
        # especially on the first run when tool caches are cold.
        configured_timeout = os.getenv("FOUNDER_CODEX_TIMEOUT_SECONDS", str(DEFAULT_CODEX_TIMEOUT_SECONDS))
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else float(configured_timeout)
        if self.timeout_seconds <= 0:
            raise ValueError("Codex timeout must be greater than zero")

    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        instruction_path = self.task_package_builder.write(package, cwd / ".founder-execution")
        instruction = instruction_path.read_text(encoding="utf-8")
        before = self._working_tree_snapshot(cwd)
        before_head = self._git_head(cwd)
        started = time.monotonic()
        logger.info("Codex started instruction=%s timeout_seconds=%s", instruction_path.name, self.timeout_seconds)
        process = subprocess.Popen(
            [self.command, "exec", "-"],
            cwd=str(cwd),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
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
        after = self._working_tree_snapshot(cwd)
        after_head = self._git_head(cwd)
        working_tree_changes = {path for path, fingerprint in after.items() if before.get(path) != fingerprint}
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
        )

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
