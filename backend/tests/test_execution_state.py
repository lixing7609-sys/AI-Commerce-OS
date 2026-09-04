from app.founder_ai.execution_state import STAGE_BY_EVENT, STAGE_PROGRESS, canonical_stage


def test_v1_canonical_execution_event_stage_contract():
    expected = {
        "approved": "READY",
        "queued": "QUEUED",
        "worker_started": "DISPATCHING",
        "codex_started": "IMPLEMENTING",
        "scope_verification_started": "SCOPE_VERIFYING",
        "tests_started": "TESTING",
        "build_started": "BUILDING",
        "diff_check_started": "DIFF_CHECKING",
        "browser_verification_started": "UI_VERIFYING",
        "verification_completed": "FINALIZING",
        "completed": "COMPLETED",
        "cancelled_by_founder": "CANCELLED",
    }
    for event_name, stage in expected.items():
        assert STAGE_BY_EVENT[event_name] == stage
        assert canonical_stage(event_name) == stage
    assert canonical_stage("failed", status="blocked") == "BLOCKED"
    assert canonical_stage("failed", status="failed") == "FAILED"


def test_v1_stage_progress_contract_is_frozen():
    assert STAGE_PROGRESS == {
        "CREATED": 5,
        "READY": 10,
        "QUEUED": 15,
        "DISPATCHING": 20,
        "IMPLEMENTING": 40,
        "SCOPE_VERIFYING": 50,
        "TESTING": 60,
        "BUILDING": 70,
        "DIFF_CHECKING": 80,
        "UI_VERIFYING": 90,
        "FINALIZING": 95,
        "COMPLETED": 100,
        "BLOCKED": 100,
        "FAILED": 100,
        "CANCELLED": 100,
    }
