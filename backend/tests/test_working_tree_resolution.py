from pathlib import Path

from app.founder_ai import working_tree_resolution as module
from app.founder_ai.brain_runtime import SinoBrainRuntime
from app.core.project.lifecycle_projection import project_lifecycle_projection


def test_current_chain_changes_form_one_read_only_checkpoint(monkeypatch, tmp_path):
    files = {
        "backend/app/founder_ai/brain_runtime.py": "founder_gate_proposal autonomous_resolution runtime_binding preflight",
        "frontend/src/sino-founder/FounderGateProposalReview.jsx": "Decision Contract decision_ready",
        "frontend/src/sino-founder/FounderGateProposalReview.test.jsx": "FounderGateProposalReview decision_ready",
    }
    for name, content in files.items():
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def fake_git(_repo_root: Path, *args: str):
        if args == ("branch", "--show-current"): return "feature/test\n"
        if args == ("rev-parse", "HEAD"): return "abc123\n"
        if args[:2] == ("status", "--porcelain=v1"):
            return " M backend/app/founder_ai/brain_runtime.py\n?? frontend/src/sino-founder/FounderGateProposalReview.jsx\n?? frontend/src/sino-founder/FounderGateProposalReview.test.jsx\n"
        if args[:3] == ("diff", "--no-ext-diff", "--unified=1"):
            return files[args[-1]]
        raise AssertionError(args)

    monkeypatch.setattr(module, "_git", fake_git)
    result = module.analyze_working_tree(tmp_path, verification_evidence=["targeted tests passed", "build passed", "git diff --check passed"])
    assert result["mode"] == "read_only"
    assert result["status"] == "working_tree_resolution_ready"
    assert result["dirty_count"] == 3
    assert result["eligibility_counts"]["SAFE_TO_CHECKPOINT"] == 3
    assert result["checkpoint_proposal"]["commit_strategy"] == "one_checkpoint"
    assert result["checkpoint_proposal"]["founder_decision_required"] is False
    assert result["external_side_effects_performed"] is False


def test_sensitive_or_unknown_change_keeps_resolution_blocked(monkeypatch, tmp_path):
    (tmp_path / "notes.txt").write_text("unrelated notes")
    monkeypatch.setattr(module, "_git", lambda _root, *args: "feature/test\n" if args[0] == "branch" else "abc\n" if args[0] == "rev-parse" else "?? notes.txt\n")
    result = module.analyze_working_tree(tmp_path)
    assert result["status"] == "working_tree_blocked"
    assert result["inventory"][0]["commit_eligibility"] == "UNKNOWN"
    assert result["checkpoint_proposal"]["commit_strategy"] == "separate_or_block"


def test_generated_file_is_excluded_without_reading_it(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "_git", lambda _root, *args: "feature/test\n" if args[0] == "branch" else "abc\n" if args[0] == "rev-parse" else "?? frontend/dist/bundle.js\n")
    result = module.analyze_working_tree(tmp_path)
    assert result["inventory"][0]["commit_eligibility"] == "GENERATED"
    assert result["checkpoint_proposal"]["excluded_files"] == ["frontend/dist/bundle.js"]


def test_resolution_ready_drives_preflight_current_action_without_passing_preflight():
    resolution = {"status": "working_tree_resolution_ready", "checkpoint_proposal": {"checkpoint_name": "checkpoint: current chain"}}
    package = {"preflight_status": "blocked", "preflight": {"blocking_reasons": ["working tree dirty"], "working_tree_resolution": resolution}}
    brain = {"stage": "execution_package", "discovery": {"execution_package": package}}
    action = SinoBrainRuntime._current_action(brain)
    assert action["action_id"] == "working_tree_resolution_ready"
    assert action["status_label"] == "Preflight Resolution Ready"
    assert package["preflight_status"] == "blocked"
    lifecycle = project_lifecycle_projection({"execution_package": package}, conversation_stage="execution_package")
    assert lifecycle["current_action"]["action_id"] == "working_tree_resolution_ready"
