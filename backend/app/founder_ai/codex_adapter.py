"""Codex CLI boundary. This module is only invoked after approval checks."""

from dataclasses import dataclass
from pathlib import Path
import subprocess

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
    instruction_path = workspace / "codex_instruction.md"
    instruction_path.write_text(
        "# Founder AI Codex Execution\n\n"
        f"## Goal\n{package.goal}\n\n"
        f"## Context\n{package.context}\n\n"
        f"## Constraints\n{package.constraints}\n\n"
        f"## Verification\n{package.verification}\n\n"
        f"## Commit Requirement\n{package.commit_requirement}\n",
        encoding="utf-8",
    )
    return instruction_path


class SubprocessCodexAdapter:
    def __init__(self, command: str = "codex", timeout_seconds: int = 1800):
        self.command = command
        self.timeout_seconds = timeout_seconds

    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        instruction_path = write_codex_instruction(package, cwd)
        before = self._git_lines(cwd)
        completed = subprocess.run(
            [self.command, "exec", instruction_path.read_text(encoding="utf-8")],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            check=False,
        )
        after = self._git_lines(cwd)
        changed = sorted(set(after) - set(before))
        commit_hash = self._git_head(cwd)
        return CodexExecutionResult(
            stdout=completed.stdout,
            stderr=completed.stderr,
            exit_code=completed.returncode,
            changed_files=changed,
            tests=list(package.verification),
            commit_hash=commit_hash,
        )

    @staticmethod
    def _git_lines(cwd: Path) -> list[str]:
        result = subprocess.run(
            ["git", "status", "--short"], cwd=str(cwd), capture_output=True, text=True, check=False
        )
        return [line for line in result.stdout.splitlines() if line]

    @staticmethod
    def _git_head(cwd: Path) -> str | None:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=str(cwd), capture_output=True, text=True, check=False
        )
        return result.stdout.strip() or None
