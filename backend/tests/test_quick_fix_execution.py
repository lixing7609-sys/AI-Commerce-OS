from app.founder_ai.codex_adapter import CodexExecutionResult
from app.founder_ai.execution_loop import ExecutionSession, FounderExecutionLoop
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.task_package import TaskPackageBuilder


class FixtureAdapter:
    def execute(self, package, *, cwd):
        return CodexExecutionResult(stdout="fixture fixed and verified", stderr="", changed_files=["frontend/src/fixture.jsx"], tests=list(package.verification), commit_hash="fixture-checkpoint")


def fixture_package():
    draft = TaskAssetDraft(title="fixture quick fix", description="fixture", scope={"context": {}}, constraints=[], risk="low", approval_required=False)
    return ExecutionPackage(goal="fixture quick fix", context={}, task_asset=draft, constraints=[], verification=["targeted test", "frontend build", "git diff --check"], commit_requirement="Autonomous Checkpoint", approval_required=False, execution_allowed=True)


def test_bounded_quick_fix_dispatches_existing_codex_execution_without_founder_approval(tmp_path):
    package = fixture_package()
    session = ExecutionSession(id="quick-fixture-session", task_asset_id="quick-fixture-task", execution_package_id="quick-fixture-package", status="queued")
    completed, artifact, _memory = FounderExecutionLoop(FixtureAdapter()).run(session, package, cwd=tmp_path)
    assert completed.status == "completed"
    assert completed.result["exit_code"] == 0
    assert artifact.commit_hash == "fixture-checkpoint"


def test_quick_fix_task_package_marks_technical_lane_not_founder_approval():
    rendered = TaskPackageBuilder().build(fixture_package()).render()
    assert "does not require a Founder decision" in rendered
    assert "Founder approval is granted" not in rendered
    assert "Autonomous Checkpoint" in rendered
