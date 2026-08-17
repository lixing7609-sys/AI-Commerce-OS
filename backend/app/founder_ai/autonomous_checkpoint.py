"""Exact-file autonomous checkpoint executor for a verified working-tree resolution."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import subprocess

from app.founder_ai.working_tree_resolution import analyze_working_tree


def execute_autonomous_checkpoint(*, repo_root: Path, resolution: dict, commit_message: str, verification_evidence: list[str]) -> dict:
    proposal = dict(resolution.get("checkpoint_proposal") or {})
    expected = set(proposal.get("included_files") or [])
    if resolution.get("status") != "working_tree_resolution_ready" or resolution.get("founder_decision_required") or not expected:
        raise ValueError("working_tree_resolution_not_checkpointable")
    if not verification_evidence:
        raise ValueError("checkpoint_verification_evidence_required")
    live = analyze_working_tree(repo_root, verification_evidence=verification_evidence)
    live_files = {item["file"] for item in live.get("inventory") or []}
    unsafe = {key: value for key, value in (live.get("eligibility_counts") or {}).items() if key != "SAFE_TO_CHECKPOINT" and value}
    if live_files != expected or unsafe or live.get("status") != "working_tree_resolution_ready":
        raise ValueError("working_tree_changed_since_resolution")

    subprocess.run(["git", "add", "--", *sorted(expected)], cwd=repo_root, check=True)
    staged = set(subprocess.run(["git", "diff", "--cached", "--name-only"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.splitlines())
    if staged != expected:
        raise RuntimeError("staged_file_set_mismatch")
    subprocess.run(["git", "diff", "--cached", "--check"], cwd=repo_root, check=True)
    subprocess.run(["git", "commit", "-m", commit_message], cwd=repo_root, check=True)
    commit_hash = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.splitlines()
    if dirty:
        raise RuntimeError("working_tree_not_clean_after_checkpoint")
    return {
        "checkpoint_status": "completed", "checkpoint_name": commit_message, "commit_hash": commit_hash,
        "included_files": sorted(expected), "verification": list(verification_evidence), "working_tree_clean": True,
        "external_side_effects": {"local_repository_commit": True, "external_cloud_runtime": False},
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
