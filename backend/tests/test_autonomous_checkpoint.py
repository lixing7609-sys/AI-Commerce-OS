from pathlib import Path

import pytest

from app.founder_ai import autonomous_checkpoint as module


def resolution():
    return {
        "status": "working_tree_resolution_ready", "founder_decision_required": False,
        "checkpoint_proposal": {"included_files": ["a.py", "b.py"]},
    }


def test_exact_checkpoint_revalidates_live_set_and_records_local_side_effect(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "analyze_working_tree", lambda *_args, **_kwargs: {
        **resolution(), "inventory": [{"file": "a.py"}, {"file": "b.py"}],
        "eligibility_counts": {"SAFE_TO_CHECKPOINT": 2, "UNKNOWN": 0, "SENSITIVE": 0, "UNRELATED": 0, "NEEDS_SEPARATION": 0, "GENERATED": 0},
    })
    calls = []
    def run(command, **kwargs):
        calls.append(command)
        output = "a.py\nb.py\n" if command[1:4] == ["diff", "--cached", "--name-only"] else "abc123\n" if command[1:3] == ["rev-parse", "HEAD"] else ""
        return type("Result", (), {"stdout": output, "returncode": 0})()
    monkeypatch.setattr(module.subprocess, "run", run)
    result = module.execute_autonomous_checkpoint(repo_root=tmp_path, resolution=resolution(), commit_message="checkpoint: safe", verification_evidence=["tests passed"])
    assert calls[0] == ["git", "add", "--", "a.py", "b.py"]
    assert result["commit_hash"] == "abc123"
    assert result["working_tree_clean"] is True
    assert result["external_side_effects"] == {"local_repository_commit": True, "external_cloud_runtime": False}


def test_checkpoint_stops_when_live_files_change(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "analyze_working_tree", lambda *_args, **_kwargs: {
        **resolution(), "inventory": [{"file": "a.py"}], "eligibility_counts": {"SAFE_TO_CHECKPOINT": 1},
    })
    with pytest.raises(ValueError, match="working_tree_changed_since_resolution"):
        module.execute_autonomous_checkpoint(repo_root=tmp_path, resolution=resolution(), commit_message="checkpoint: safe", verification_evidence=["tests passed"])


def test_checkpoint_requires_verification_evidence(tmp_path):
    with pytest.raises(ValueError, match="checkpoint_verification_evidence_required"):
        module.execute_autonomous_checkpoint(repo_root=tmp_path, resolution=resolution(), commit_message="checkpoint: safe", verification_evidence=[])
