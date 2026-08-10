"""Codex CLI boundary. This module is only invoked after approval checks."""

from dataclasses import dataclass
import hashlib
from pathlib import Path
import subprocess
from uuid import uuid4

from .orchestrator import ExecutionPackage


@dataclass(frozen=True)
class CodexExecutionResult:
    stdout: str
    stderr: str
    exit_code: int = 0
    changed_files: list[str] | None = None
    tests: list[str] | None = None
    commit_hash: str | None = None


def write_codex_instruction(package: ExecutionPackage, workspace: Path) -> Path:
    workspace.mkdir(parents=True, exist_ok=True)
    instruction_path = workspace / f"codex_instruction-{uuid4().hex}.md"
    instruction_path.write_text(
        "# Founder AI Codex Execution\n\n"
        f"## Goal\n{package.goal}\n\n"
        f"## Context\n{package.context}\n\n"
        f"## Constraints\n{package.constraints}\n\n"
        f"## Verification\n{package.verification}\n\n"
        "## Approval\nFounder approval is granted. Execute the work, run the required verification, and create the required commit.\n\n"
        f"## Commit Requirement\n{package.commit_requirement}\n",
        encoding="utf-8",
    )
    return instruction_path


class SubprocessCodexAdapter:
    def __init__(self, command: str = "codex", timeout_seconds: int = 1800):
        self.command = command
        self.timeout_seconds = timeout_seconds

    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        instruction_path = write_codex_instruction(package, cwd / ".founder-execution")
        before = self._working_tree_snapshot(cwd)
        before_head = self._git_head(cwd)
        completed = subprocess.run(
            [self.command, "exec", instruction_path.read_text(encoding="utf-8")],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            check=False,
        )
        after = self._working_tree_snapshot(cwd)
        after_head = self._git_head(cwd)
        working_tree_changes = {path for path, fingerprint in after.items() if before.get(path) != fingerprint}
        committed_changes = self._git_diff_names(cwd, before_head, after_head)
        changed = sorted(working_tree_changes | committed_changes)
        commit_hash = after_head if after_head != before_head else None
        return CodexExecutionResult(
            stdout=completed.stdout,
            stderr=completed.stderr,
            exit_code=completed.returncode,
            changed_files=changed,
            tests=list(package.verification),
            commit_hash=commit_hash,
        )

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
