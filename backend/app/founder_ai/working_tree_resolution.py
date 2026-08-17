"""Read-only working-tree evidence and checkpoint recommendations for Preflight."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess


ELIGIBILITY = {"SAFE_TO_CHECKPOINT", "NEEDS_SEPARATION", "UNRELATED", "GENERATED", "SENSITIVE", "UNKNOWN"}
GENERATED_PARTS = {"dist", "build", "coverage", "node_modules", "__pycache__", ".pytest_cache", ".vite"}
SENSITIVE_NAMES = {".env", ".env.local", ".env.production", "id_rsa", "id_ed25519"}
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\b(?:sk|key|token)-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?:postgres(?:ql)?|mysql|mongodb)://[^\s:@]+:[^\s@]+@", re.I),
)


def _git(repo_root: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=repo_root, text=True, capture_output=True, check=True).stdout


def _content(repo_root: Path, path: str, change_type: str) -> str:
    if change_type == "untracked":
        target = (repo_root / path).resolve()
        if repo_root.resolve() not in target.parents or not target.is_file():
            return ""
        return target.read_text(errors="replace")[:500_000]
    return _git(repo_root, "diff", "--no-ext-diff", "--unified=1", "--", path)[:500_000]


def _classify(path: str, content: str) -> tuple[list[str], str, bool]:
    text = f"{path}\n{content}".casefold()
    capabilities = []
    markers = (
        ("runtime_environment_binding", ("runtime_binding", "runtime environment", "permission_integrity")),
        ("founder_gate_proposal", ("founder_gate_proposal", "founder gate proposal")),
        ("autonomous_resolution", ("autonomous_resolution", "decision_ready", "blocking_unknown")),
        ("decision_contract_ui", ("decision contract", "decision_contract", "foundergateproposalreview")),
        ("founder_gate_review_ui", ("sino-founder-gate", "founder-gate-proposal", "founder gate proposal")),
        ("project_lifecycle_projection", ("project_lifecycle", "lifecycle_projection", "active_founder_gate_proposal")),
        ("preflight_projection", ("preflight", "executionpackagecard", "current action")),
        ("execution_readiness", ("execution_readiness", "execution readiness", "readiness_contract")),
        ("autonomous_checkpoint", ("autonomous_checkpoint", "self_healing", "working tree resolution")),
        ("controlled_execution", ("controlled_execution", "scope_guard", "execution_started_at", "controlled executor")),
        ("machine_action_contract", ("action_contract", "machine action contract", "action_compilation")),
        ("autonomous_evidence_resolution", ("evidence_resolution", "autonomous evidence", "evidence-bound")),
        ("autonomous_task_closure", ("task_closure", "closure contract", "closure_ready")),
    )
    for capability, terms in markers:
        if any(term in text for term in terms):
            capabilities.append(capability)
    if path.endswith("app/founder_ai/execution_loop.py") and "execution_states" in text and '"blocked"' in text:
        capabilities.append("controlled_execution")
    is_test = "/test" in path.casefold() or path.casefold().endswith((".test.jsx", ".test.js", "_test.py")) or "/tests/" in path.casefold()
    if is_test and capabilities:
        capabilities.append("targeted_tests")
    origin = "founder_gate_runtime_resolution" if capabilities else "unattributed_working_tree_change"
    return capabilities, origin, is_test


def analyze_working_tree(repo_root: Path, *, verification_evidence: list[str] | None = None) -> dict:
    """Inspect Git state without changing index, worktree, history, or external systems."""
    branch = _git(repo_root, "branch", "--show-current").strip()
    head = _git(repo_root, "rev-parse", "HEAD").strip()
    lines = [line for line in _git(repo_root, "status", "--porcelain=v1", "--untracked-files=all").splitlines() if line]
    inventory = []
    for line in lines:
        code, path = line[:2], line[3:]
        change_type = "untracked" if code == "??" else "deleted" if "D" in code else "added" if "A" in code else "modified"
        parts = set(Path(path).parts)
        filename = Path(path).name
        generated = bool(parts & GENERATED_PARTS)
        sensitive_path = filename in SENSITIVE_NAMES or filename.startswith(".env.") or filename.endswith((".pem", ".key"))
        content = "" if sensitive_path or generated or change_type == "deleted" else _content(repo_root, path, change_type)
        sensitive_content = any(pattern.search(content) for pattern in SECRET_PATTERNS)
        capabilities, task_origin, is_test = _classify(path, content)
        if sensitive_path or sensitive_content:
            eligibility, risk, reason = "SENSITIVE", "high", "路径或新增内容疑似包含 credential/secret；未读取或输出其值。"
        elif generated:
            eligibility, risk, reason = "GENERATED", "low", "生成物或缓存不应进入 checkpoint。"
        elif not capabilities:
            eligibility, risk, reason = "UNKNOWN", "medium", "未找到与当前 Founder Gate / Preflight 主链一致的代码证据。"
        else:
            eligibility, risk = "SAFE_TO_CHECKPOINT", "low" if is_test else "medium"
            reason = "Diff 内容直接实现或验证当前 Founder Gate、Runtime Binding、Autonomous Resolution、Decision Contract 或 lifecycle projection。"
        inventory.append({
            "file": path, "change_type": change_type, "capability": capabilities,
            "task_origin": task_origin, "current_main_chain_relevance": "direct" if capabilities else "unknown",
            "verification_status": "verified" if verification_evidence else "targeted_regression_required",
            "commit_eligibility": eligibility, "risk": risk, "reason": reason,
        })
    counts = {key: sum(item["commit_eligibility"] == key for item in inventory) for key in ELIGIBILITY}
    unsafe = counts["UNKNOWN"] + counts["SENSITIVE"] + counts["GENERATED"] + counts["UNRELATED"]
    separations = counts["NEEDS_SEPARATION"]
    safe = bool(inventory) and not unsafe and not separations
    if not inventory:
        status = "clean"
    elif safe:
        status = "working_tree_resolution_ready"
    elif counts["SENSITIVE"] or counts["UNKNOWN"]:
        status = "working_tree_blocked"
    else:
        status = "working_tree_analysis_required"
    included = [item["file"] for item in inventory if item["commit_eligibility"] == "SAFE_TO_CHECKPOINT"]
    excluded = [item["file"] for item in inventory if item["commit_eligibility"] != "SAFE_TO_CHECKPOINT"]
    proposal = None if not inventory else {
        "checkpoint_name": "checkpoint: founder gate autonomous resolution lifecycle",
        "scope": "Founder Gate runtime binding、reviewable proposal、autonomous resolution、decision readiness/contract 与 Preflight/UI projection。",
        "included_capabilities": sorted({cap for item in inventory for cap in item["capability"]}),
        "included_files": included,
        "excluded_files": excluded,
        "verification_evidence": list(verification_evidence or []),
        "risk": "low" if safe else "review_required",
        "rollback": "以 checkpoint commit 为原子回滚点；不触碰已批准 Runtime Binding、Package identity 或业务数据。",
        "commit_strategy": "one_checkpoint" if safe else "separate_or_block",
        "founder_decision_required": False if safe else bool(counts["SENSITIVE"]),
    }
    return {
        "resolution_type": "autonomous_working_tree_resolution", "mode": "read_only",
        "status": status, "branch": branch, "head": head, "dirty_count": len(inventory),
        "inventory": inventory, "eligibility_counts": counts, "checkpoint_proposal": proposal,
        "founder_decision_required": bool(proposal and proposal["founder_decision_required"]),
        "external_side_effects_performed": False,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
