from dataclasses import replace

import pytest

import app.founder_ai.technical_resolution as recovery
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


def _package():
    draft = replace(
        generate_task_asset_draft("为左侧栏顶部新建讨论入口增加操作选择"),
        conversation_id="conv-recovery",
    )
    package = replace(build_execution_package(draft), execution_allowed=True)
    contract = {
        "task_id": "task-recovery", "implementation_required": True,
        "scope_source": "semantic_module", "scope_confidence": "HIGH",
        "implementation_scope": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"],
        "visible_artifact_contract": {"required": True, "artifact_type": "founder_new_discussion_interaction"},
    }
    return replace(package, context={**dict(package.context), "standard_task_contract": contract})


def _completed(result):
    session = ExecutionSession("execution-recovery", "task-recovery", "package-recovery", status="completed")
    session.execution_stage = "COMPLETED"
    session.completed_at = "2026-08-27T10:00:00+00:00"
    session.result = result
    append_event(session, "completed", status="completed", message="historical completion",
                 timestamp=session.completed_at)
    return session


def _evidence(verifier, command):
    return {"verifier": verifier, "status": "PASS", "evidence": {"command": command, "exit_code": 0}}


def _valid_result():
    return {
        "production_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"],
        "task_owned_patch_persisted": True,
        "scope_verification": {"status": "PASS"},
        "tests": ["targeted frontend tests", "frontend build"],
        "command_verification_evidence": [
            _evidence("targeted_tests", ["npm", "test"]),
            _evidence("build", ["npm", "run", "build"]),
            _evidence("git_diff_check", ["git", "diff", "--check"]),
        ],
        "browser_verification": {"status": "PASS", "evidence": [{"status": "PASS"}]},
    }


@pytest.mark.parametrize(("mutate", "expected"), [
    (lambda result: result.update(production_changed_files=[], task_owned_patch_persisted=False), "IMPLEMENTING"),
    (lambda result: result.update(scope_verification={"status": "SCOPE_MISMATCH"}), "SCOPE_VERIFYING"),
    (lambda result: result.update(command_verification_evidence=result["command_verification_evidence"][1:]), "TESTING"),
    (lambda result: result.update(command_verification_evidence=[result["command_verification_evidence"][0], result["command_verification_evidence"][2]]), "BUILDING"),
    (lambda result: result.update(browser_verification=None), "UI_VERIFYING"),
])
def test_resume_stage_is_derived_from_earliest_missing_durable_evidence(mutate, expected):
    result = _valid_result()
    mutate(result)
    assert recovery.resolve_reopen_stage(result=result, contract=_package().context["standard_task_contract"]) == expected


def test_valid_completed_execution_is_rejected(monkeypatch):
    session = _completed(_valid_result())
    monkeypatch.setattr(recovery, "get_execution_session", lambda _execution_id: (session, _package()))
    assert recovery.recover_false_completion(execution_id=session.id)["status"] == "REJECTED"
    assert session.status == "completed"


def test_non_completed_execution_is_not_applicable(monkeypatch):
    session = _completed(_valid_result())
    session.status = "blocked"
    monkeypatch.setattr(recovery, "get_execution_session", lambda _execution_id: (session, _package()))
    assert recovery.recover_false_completion(execution_id=session.id)["status"] == "NOT_APPLICABLE"


def test_false_completion_reopens_same_execution_and_preserves_history(monkeypatch):
    result = _valid_result()
    result.update(production_changed_files=[], task_owned_patch_persisted=False)
    session = _completed(result)
    package = _package()
    saved = []
    projected = []
    queued = []
    monkeypatch.setattr(recovery, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(recovery, "save_execution_session", lambda current, current_package: saved.append((current.id, current_package)))
    monkeypatch.setattr(recovery, "_project_false_completion_reopen", lambda **kwargs: projected.append(kwargs))
    monkeypatch.setattr("app.founder_ai.standard_task_execution.build_standard_task_contract",
                        lambda **_kwargs: package.context["standard_task_contract"])

    reopened = recovery.recover_false_completion(
        execution_id=session.id, enqueue=lambda execution_id: queued.append(execution_id) or {"execution_id": execution_id},
    )

    assert reopened["status"] == "REOPENED"
    assert reopened["task_id"] == "task-recovery"
    assert reopened["execution_id"] == "execution-recovery"
    assert reopened["resume_stage"] == "IMPLEMENTING"
    assert [event["event_name"] for event in session.events] == [
        "completed", "completion_invalidated", "execution_reopened",
    ]
    invalidation = session.events[1]
    assert invalidation["metadata"]["reason"] == recovery.FALSE_COMPLETION_EVIDENCE_INVALID
    assert invalidation["metadata"]["previous_status"] == "completed"
    assert invalidation["metadata"]["previous_stage"] == "COMPLETED"
    assert invalidation["metadata"]["previous_progress"] == 100
    assert invalidation["metadata"]["invalidated_by"] == "evidence_audit"
    assert invalidation["metadata"]["audit_fingerprint"] == reopened["audit_fingerprint"]
    assert invalidation["metadata"]["runtime_revision"]
    assert invalidation["timestamp"]
    assert session.events[2]["metadata"]["reopened_at"]
    assert session.status == "queued"
    assert session.execution_stage == "IMPLEMENTING"
    assert queued == [session.id]
    assert saved[-1][0] == session.id
    assert projected[-1]["session"].id == session.id

    repeat_queue = []
    repeated = recovery.recover_false_completion(
        execution_id=session.id,
        enqueue=lambda execution_id: repeat_queue.append(execution_id) or {"execution_id": execution_id},
    )
    assert repeated["status"] == "ALREADY_REOPENED"
    assert len(session.events) == 3
    assert repeat_queue == [session.id]


def test_explicit_verified_preexisting_implementation_is_a_legal_noop():
    result = _valid_result()
    result.update(production_changed_files=[], task_owned_patch_persisted=False,
                  preexisting_acceptance_verified=True)
    assert recovery.resolve_reopen_stage(
        result=result, contract=_package().context["standard_task_contract"],
    ) is None


def test_recovery_cannot_be_triggered_by_untrusted_context(monkeypatch):
    session = _completed({})
    monkeypatch.setattr(recovery, "get_execution_session", lambda _execution_id: (session, _package()))
    for invalidator in ("llm", "decision_context", "reuse_context"):
        with pytest.raises(PermissionError):
            recovery.recover_false_completion(execution_id=session.id, invalidated_by=invalidator)
