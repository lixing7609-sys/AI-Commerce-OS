"""Task-owned working-tree attribution and semantic scope verification."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess
from typing import Any


SCOPE_PASS = "PASS"
SCOPE_MISMATCH = "SCOPE_MISMATCH"


def _run(repo_root: Path, *args: str, input_text: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=repo_root, input=input_text, capture_output=True, text=True, check=False,
    )


def _status(repo_root: Path) -> dict[str, str]:
    result = _run(repo_root, "status", "--short")
    return {line[3:].split(" -> ")[-1]: line[:2] for line in result.stdout.splitlines() if len(line) > 3}


def _content(repo_root: Path, path: str, *, head: str | None, dirty: bool) -> bytes:
    target = repo_root / path
    if dirty:
        return target.read_bytes() if target.is_file() else b""
    if head:
        result = _run(repo_root, "show", f"{head}:{path}")
        if result.returncode == 0:
            return result.stdout.encode()
    return target.read_bytes() if target.is_file() else b""


def capture_execution_baseline(repo_root: Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    """Capture durable metadata plus the exact pre-task contents of already-dirty files."""
    head_result = _run(repo_root, "rev-parse", "HEAD")
    head = head_result.stdout.strip() or None
    status = _status(repo_root)
    dirty_contents = {path: _content(repo_root, path, head=head, dirty=True) for path in status}
    diff = _run(repo_root, "diff", "--binary", "HEAD").stdout
    metadata = {
        "head_sha": head,
        "dirty_files_before": sorted(status),
        "status_before": status,
        "diff_fingerprint_before": hashlib.sha256(diff.encode()).hexdigest(),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    return metadata, dirty_contents


def attribute_execution_changes(
    repo_root: Path, *, baseline: dict[str, Any], dirty_contents_before: dict[str, bytes],
) -> dict[str, Any]:
    """Return only file/content deltas introduced after the task baseline."""
    after_status = _status(repo_root)
    after_head_result = _run(repo_root, "rev-parse", "HEAD")
    after_head = after_head_result.stdout.strip() or None
    committed = set()
    if baseline.get("head_sha") and after_head and baseline["head_sha"] != after_head:
        committed = set(_run(repo_root, "diff", "--name-only", f"{baseline['head_sha']}..{after_head}").stdout.splitlines())
    candidates = set(after_status) | set(baseline.get("dirty_files_before") or []) | committed
    changed_files: list[str] = []
    patches: list[str] = []
    head = baseline.get("head_sha")
    for path in sorted(candidates):
        before = dirty_contents_before.get(path)
        if before is None:
            before = _content(repo_root, path, head=head, dirty=False)
        target = repo_root / path
        after = target.read_bytes() if target.is_file() else b""
        if before == after:
            continue
        changed_files.append(path)
        before_text = before.decode("utf-8", errors="surrogateescape")
        after_text = after.decode("utf-8", errors="surrogateescape")
        import difflib
        patches.extend(difflib.unified_diff(
            before_text.splitlines(keepends=True), after_text.splitlines(keepends=True),
            fromfile=f"a/{path}", tofile=f"b/{path}", n=3,
        ))
    patch = "".join(patches)
    return {
        "task_changed_files": changed_files,
        "execution_owned_patch": patch,
        "execution_owned_patch_fingerprint": hashlib.sha256(patch.encode()).hexdigest(),
        "dirty_files_after": sorted(after_status),
        "head_sha_after": after_head,
        "head_changed": bool(after_head and after_head != baseline.get("head_sha")),
    }


def verify_execution_scope(*, contract: dict[str, Any], attribution: dict[str, Any]) -> dict[str, Any]:
    changed = set(attribution.get("task_changed_files") or [])
    allowed = set(contract.get("implementation_scope") or [])
    module_boundaries = tuple(str(item).rstrip("/") + "/" for item in contract.get("module_boundary") or [])
    unexpected = sorted(path for path in changed if path not in allowed and not any(path.startswith(prefix) for prefix in module_boundaries))
    status = SCOPE_PASS if not unexpected else SCOPE_MISMATCH
    return {
        "status": status,
        "goal": contract.get("objective") or contract.get("source_goal"),
        "expected_scope": sorted(allowed),
        "module_boundary": list(contract.get("module_boundary") or []),
        "do_not_change": list(contract.get("prohibited_scope") or []),
        "actual_changed_files": sorted(changed),
        "out_of_scope_files": unexpected,
        "patch_fingerprint": attribution.get("execution_owned_patch_fingerprint"),
    }


def rollback_execution_owned_patch(repo_root: Path, patch: str) -> bool:
    """Reverse only the before/after patch owned by this execution."""
    if not patch:
        return True
    result = _run(repo_root, "apply", "--reverse", "--whitespace=nowarn", "-", input_text=patch)
    return result.returncode == 0


def codex_run_id(stderr: str) -> str | None:
    match = re.search(r"^session id:\s*(\S+)", stderr or "", flags=re.MULTILINE | re.IGNORECASE)
    return match.group(1) if match else None
