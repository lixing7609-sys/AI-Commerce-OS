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


def _task_owned_jsx_class_tokens(patch: str) -> set[str]:
    """Extract class tokens introduced by this execution's production JSX patch."""
    tokens: set[str] = set()
    current_path = ""
    for line in patch.splitlines():
        if line.startswith("+++ b/"):
            current_path = line[6:]
            continue
        if not current_path.endswith((".jsx", ".tsx")) or not line.startswith("+") or line.startswith("+++"):
            continue
        for value in re.findall(r"className\s*=\s*[\"'`]([^\"'`]+)[\"'`]", line[1:]):
            tokens.update(token for token in re.findall(r"[A-Za-z_][\w-]{3,}", value) if "${" not in token)
    return tokens


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
    from app.founder_ai.semantic_scope import semantic_css_hunk_allowed, semantic_scope_file_allowed
    changed = set(attribution.get("task_changed_files") or [])
    bounded_change = contract.get("operation_type") == "BOUNDED_CODE_CHANGE" or contract.get("task_type") == "BOUNDED_CODE_CHANGE"
    implementation_scope = list(contract.get("implementation_scope") or [])
    module_boundary = list(contract.get("module_boundary") or [])
    if bounded_change:
        # BOUNDED_CODE_CHANGE has exactly one canonical scope authority:
        # allowed_files / allowed_directories. The verifier contract projection is
        # derived from that boundary, and this fallback is intentionally restricted
        # to bounded code changes so ordinary tasks do not silently broaden scope.
        implementation_scope = implementation_scope or list(contract.get("allowed_files") or [])
        module_boundary = module_boundary or list(contract.get("allowed_directories") or [])
    allowed = set(implementation_scope)
    module_boundaries = tuple(str(item).rstrip("/") + "/" for item in module_boundary)
    semantic_scope = dict(contract.get("semantic_scope") or {})
    semantic = contract.get("scope_source") == "semantic_module"
    unexpected = sorted(path for path in changed if not (
        (semantic and semantic_scope_file_allowed(semantic_scope, path))
        or path in allowed or any(path.startswith(prefix) for prefix in module_boundaries)
    ))
    allowed_css_selectors = [str(item) for item in contract.get("allowed_css_selectors") or []]
    patch = str(attribution.get("execution_owned_patch") or "")
    task_owned_class_tokens = _task_owned_jsx_class_tokens(patch)
    out_of_scope_hunks: list[str] = []
    if allowed_css_selectors:
        for path in sorted(changed & allowed):
            if not path.endswith(".css"):
                continue
            file_marker = f"+++ b/{path}"
            file_start = patch.find(file_marker)
            file_patch = patch[file_start:] if file_start >= 0 else ""
            next_file = file_patch.find("\n--- a/", len(file_marker))
            if next_file >= 0:
                file_patch = file_patch[:next_file]
            hunks = [f"@@{item}" for item in file_patch.split("\n@@")[1:]]
            for index, hunk in enumerate(hunks, start=1):
                if not any(selector in hunk for selector in allowed_css_selectors):
                    out_of_scope_hunks.append(f"{path}#hunk-{index}")
    elif semantic:
        for path in sorted(changed - set(unexpected)):
            if not path.endswith(".css"):
                continue
            file_marker = f"+++ b/{path}"
            file_start = patch.find(file_marker)
            file_patch = patch[file_start:] if file_start >= 0 else ""
            next_file = file_patch.find("\n--- a/", len(file_marker))
            if next_file >= 0:
                file_patch = file_patch[:next_file]
            hunks = [f"@@{item}" for item in file_patch.split("\n@@")[1:]]
            for index, hunk in enumerate(hunks, start=1):
                if not semantic_css_hunk_allowed(
                    semantic_scope, hunk, task_owned_class_tokens=task_owned_class_tokens,
                ):
                    out_of_scope_hunks.append(f"{path}#hunk-{index}")
    status = SCOPE_PASS if not unexpected and not out_of_scope_hunks else SCOPE_MISMATCH
    return {
        "status": status,
        "goal": contract.get("objective") or contract.get("source_goal"),
        "expected_scope": sorted(allowed),
        "module_boundary": list(module_boundary),
        "scope_source": contract.get("scope_source") or "explicit_contract",
        "scope_confidence": contract.get("scope_confidence"),
        "do_not_change": list(contract.get("prohibited_scope") or []),
        "actual_changed_files": sorted(changed),
        "out_of_scope_files": unexpected,
        "out_of_scope_hunks": out_of_scope_hunks,
        "patch_fingerprint": attribution.get("execution_owned_patch_fingerprint"),
    }


def rollback_scope_mismatch_patch(
    repo_root: Path, *, scope_verification: dict[str, Any], attribution: dict[str, Any],
) -> bool:
    """Reverse an execution-owned patch only when scope verification explicitly failed.

    Verification failures never authorize a rollback. A patch that passed scope is a
    durable task artifact even when later tests, builds, or UI acceptance are blocked.
    """
    if scope_verification.get("status") != SCOPE_MISMATCH:
        return False
    if attribution.get("head_changed"):
        return False
    return rollback_execution_owned_patch(repo_root, str(attribution.get("execution_owned_patch") or ""))


def rollback_execution_owned_patch(repo_root: Path, patch: str) -> bool:
    """Low-level reverse-patch primitive; callers must establish scope mismatch first."""
    if not patch:
        return True
    result = _run(repo_root, "apply", "--reverse", "--whitespace=nowarn", "-", input_text=patch)
    return result.returncode == 0


def codex_run_id(stderr: str) -> str | None:
    match = re.search(r"^session id:\s*(\S+)", stderr or "", flags=re.MULTILINE | re.IGNORECASE)
    return match.group(1) if match else None
