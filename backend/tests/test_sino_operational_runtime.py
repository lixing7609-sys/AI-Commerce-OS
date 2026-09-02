from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.founder_ai import api
from app.founder_ai import operational_runtime as runtime
from app.founder_ai import execution_registry


LOW_REQUEST = "检查当前 AI-Commerce-OS 工程状态，告诉我当前 branch、HEAD 和是否有未提交文件。"
HIGH_REQUEST = "把当前分支直接 push 到远程"
FOCUSED_TEST_REQUEST = "运行 Sino Operational Runtime 的测试，告诉我结果。"
FRONTEND_BUILD_REQUEST = "检查一下前端现在能不能正常构建。"
BOUNDED_CHANGE_REQUEST = "请把 Sino Operational Runtime 状态卡标题改成 Sino Controlled Runtime，并运行相关前端测试和构建。"


def _runtime(monkeypatch, tmp_path, *, conversation_id="conv-operational"):
    import app.core.task_asset.service as task_service
    import app.founder_ai.secretary.service as secretary_service

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    for module in (runtime, task_service, secretary_service):
        monkeypatch.setattr(module, "SessionLocal", factory)
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(tmp_path / f"{conversation_id}-registry.json"))
    execution_registry._sessions.clear()
    execution_registry._packages.clear()
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda _cid: {"conversation_id": _cid})
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)

    def candidate_snapshot(snapshot, cid):
        with factory() as db:
            state = db.query(SinoBrainSessionDB).filter_by(conversation_id=cid).one()
            snapshot["sino_brain"] = {
                "stage": state.stage,
                "discovery": dict(state.discovery or {}),
            }
        return snapshot

    monkeypatch.setattr(api, "_candidate_snapshot", candidate_snapshot)
    with factory() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Operational E2E"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={}))
        db.commit()
    return factory


def _runner_result():
    return {
        "branch": "feature/sino-operational-runtime-v1",
        "head": "head-test",
        "working_tree_clean": True,
        "status_short": "",
        "repo_path": "/Users/liwu/AI-Commerce-OS",
    }


def test_low_risk_repo_inspection_request_is_classified_low():
    decision = runtime.classify_operational_risk(LOW_REQUEST)
    assert decision["risk_level"] == "LOW"
    assert decision["auto_continue"] is True
    assert decision["work_type"] == "CONTROLLED_LOCAL_DEVELOPMENT_TASK"
    assert decision["operation_type"] == "REPO_INSPECTION"


def test_focused_test_request_is_low_auto_continue_and_allowlisted():
    decision = runtime.classify_operational_risk(FOCUSED_TEST_REQUEST)
    spec = runtime.OPERATION_REGISTRY[decision["operation_type"]]
    assert decision["operation_type"] == "FOCUSED_TEST"
    assert decision["risk_level"] == "LOW"
    assert decision["auto_continue"] is True
    assert spec.argv == ("backend/.venv/bin/pytest", "backend/tests/test_sino_operational_runtime.py", "-q")


def test_frontend_build_request_is_low_auto_continue_and_allowlisted():
    decision = runtime.classify_operational_risk(FRONTEND_BUILD_REQUEST)
    spec = runtime.OPERATION_REGISTRY[decision["operation_type"]]
    assert decision["operation_type"] == "FRONTEND_BUILD"
    assert decision["risk_level"] == "LOW"
    assert decision["auto_continue"] is True
    assert spec.argv == ("npm", "--prefix", "frontend", "run", "build")


def test_arbitrary_shell_request_is_not_executed():
    decision = runtime.classify_operational_risk("运行 ls -la && cat ~/.ssh/id_rsa")
    assert decision["work_type"] is None
    assert decision["auto_continue"] is False


def test_low_request_auto_continues_to_task_execution_and_same_conversation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path)
    calls = {"runner": 0}

    def runner():
        calls["runner"] += 1
        return _runner_result()

    result = runtime.execute_low_risk_repo_inspection(
        conversation_id="conv-operational",
        founder_request=LOW_REQUEST,
        source_message_id="message-low",
        runner=runner,
    )
    assert result["risk_decision"]["auto_continue"] is True
    assert result["status"] == "completed"
    assert calls["runner"] == 1
    with factory() as db:
        tasks = db.query(TaskAssetDB).all()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-operational").all()
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-operational").one()
    assert len(tasks) == 1
    assert tasks[0].approval_status == "approved"
    assert tasks[0].execution_status == "completed"
    assert tasks[0].result["result"]["head"] == "head-test"
    assert tasks[0].conversation_id == "conv-operational"
    assert result["execution_id"] in execution_registry._sessions
    assert any("执行完成" in item.content for item in messages)
    assert state.discovery["operational_runtime"]["status"] == "completed"


def test_focused_test_uses_shell_false_and_persists_result(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-focused-test")
    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["shell"] = kwargs.get("shell")
        return SimpleNamespace(returncode=0, stdout="7 passed in 0.12s", stderr="")

    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    result = runtime.execute_low_risk_operation(
        conversation_id="conv-focused-test",
        founder_request=FOCUSED_TEST_REQUEST,
        source_message_id="message-focused",
    )
    assert captured["argv"] == ["backend/.venv/bin/pytest", "backend/tests/test_sino_operational_runtime.py", "-q"]
    assert captured["shell"] is False
    assert result["status"] == "completed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-focused-test").all()
    assert task.result["operation_type"] == "FOCUSED_TEST"
    assert task.result["check_result"] == "PASS"
    assert task.result["result"]["passed"] == 7
    assert any("测试完成：7 passed" in item.content for item in messages)


def test_frontend_build_uses_shell_false_and_persists_result(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-build")
    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["shell"] = kwargs.get("shell")
        return SimpleNamespace(returncode=0, stdout="✓ built in 622ms", stderr="")

    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    result = runtime.execute_low_risk_operation(
        conversation_id="conv-build",
        founder_request=FRONTEND_BUILD_REQUEST,
        source_message_id="message-build",
    )
    assert captured["argv"] == ["npm", "--prefix", "frontend", "run", "build"]
    assert captured["shell"] is False
    assert result["status"] == "completed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
    assert task.result["operation_type"] == "FRONTEND_BUILD"
    assert task.result["check_result"] == "PASS"


def test_timeout_produces_failed_execution_result(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-timeout")

    def timeout(*_args, **_kwargs):
        raise runtime.subprocess.TimeoutExpired(cmd=["backend/.venv/bin/pytest"], timeout=1, output="partial", stderr="timeout")

    monkeypatch.setattr(runtime.subprocess, "run", timeout)
    result = runtime.execute_low_risk_operation(
        conversation_id="conv-timeout",
        founder_request=FOCUSED_TEST_REQUEST,
        source_message_id="message-timeout",
    )
    assert result["status"] == "failed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-timeout").all()
    assert task.execution_status == "failed"
    assert task.result["check_result"] == "EXECUTOR_FAILURE"
    assert any("timed out" in item.content for item in messages)


def test_non_zero_pytest_result_is_check_failure_not_executor_failure(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-check-fail")
    monkeypatch.setattr(
        runtime.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout="5 passed, 2 failed in 0.34s", stderr=""),
    )
    result = runtime.execute_low_risk_operation(
        conversation_id="conv-check-fail",
        founder_request=FOCUSED_TEST_REQUEST,
        source_message_id="message-check-fail",
    )
    assert result["status"] == "completed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
    assert task.execution_status == "completed"
    assert task.result["check_result"] == "FAIL"
    assert task.result["result"]["failed"] == 2


def test_same_source_message_retry_reuses_task_and_execution(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path)
    first = runtime.execute_low_risk_repo_inspection(
        conversation_id="conv-operational",
        founder_request=LOW_REQUEST,
        source_message_id="message-retry",
        runner=_runner_result,
    )
    second = runtime.execute_low_risk_repo_inspection(
        conversation_id="conv-operational",
        founder_request=LOW_REQUEST,
        source_message_id="message-retry",
        runner=lambda: (_ for _ in ()).throw(AssertionError("completed retry must not execute again")),
    )
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
    assert first["execution_id"] == second["execution_id"]
    assert len(execution_registry._sessions) == 1


def test_failure_is_persisted_to_same_conversation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-failure")
    result = runtime.execute_low_risk_repo_inspection(
        conversation_id="conv-failure",
        founder_request=LOW_REQUEST,
        source_message_id="message-failure",
        runner=lambda: (_ for _ in ()).throw(RuntimeError("git unavailable")),
    )
    assert result["status"] == "failed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-failure").all()
    assert task.execution_status == "failed"
    assert task.result["retryable"] is True
    assert any("执行失败" in item.content and "可重试" in item.content for item in messages)


def test_cross_conversation_isolation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-a")
    with factory() as db:
        db.add(ConversationDB(id="conv-b", system_id="founder_ai", title="B"))
        db.add(SinoBrainSessionDB(conversation_id="conv-b", discovery={}))
        db.commit()
    runtime.execute_low_risk_repo_inspection(
        conversation_id="conv-a",
        founder_request=LOW_REQUEST,
        source_message_id="message-a",
        runner=_runner_result,
    )
    with factory() as db:
        assert db.query(TaskAssetDB).filter_by(conversation_id="conv-a").count() == 1
        assert db.query(TaskAssetDB).filter_by(conversation_id="conv-b").count() == 0
        assert db.query(ConversationMessageDB).filter_by(conversation_id="conv-b").count() == 0


def test_high_risk_request_enters_action_queue_and_blocks_executor(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-high")
    monkeypatch.setattr(runtime, "run_repo_inspection", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("executor must not run")))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-high",
        founder_request=HIGH_REQUEST,
        source_message_id="message-high",
    )
    assert result["handled"] is True
    assert result["status"] == "blocked"
    with factory() as db:
        tasks = db.query(TaskAssetDB).all()
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-high").one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-high").all()
    assert tasks == []
    queue = state.discovery["founder_action_queue"]
    assert len([item for item in queue if item["action_type"] == "HIGH_RISK_OPERATIONAL_TASK" and item["status"] == "pending"]) == 1
    assert any("不会调用 executor" in item.content for item in messages)
    assert len(execution_registry._sessions) == 0


def test_bounded_code_change_request_is_medium_and_requires_queue():
    decision = runtime.classify_operational_risk(BOUNDED_CHANGE_REQUEST)
    assert decision["operation_type"] == "BOUNDED_CODE_CHANGE"
    assert decision["risk_level"] == "MEDIUM"
    assert decision["auto_continue"] is False
    assert decision["approval_required"] is True
    assert decision["plan"]["allowed_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]


def test_bounded_code_change_before_approval_creates_queue_and_does_not_execute(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded")
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("executor must not run before approval")))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded",
    )
    assert result["status"] == "approval_required"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-bounded").one()
        assert db.query(TaskAssetDB).count() == 0
    queue = state.discovery["founder_action_queue"]
    items = [item for item in queue if item["action_type"] == "BOUNDED_CODE_CHANGE_APPROVAL" and item["status"] == "pending"]
    assert len(items) == 1
    assert items[0]["metadata"]["planned_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]
    assert len(execution_registry._sessions) == 0


def test_bounded_code_change_reject_and_continue_do_not_execute(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded-reject")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded-reject",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded-reject",
    )
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("executor must not run")))
    continued = runtime.decide_bounded_code_change_action(result["action_id"], "continue_discussion")
    assert continued["status"] == "pending"
    rejected = runtime.decide_bounded_code_change_action(result["action_id"], "reject")
    assert rejected["executed"] is False
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-bounded-reject").one()
        assert db.query(TaskAssetDB).count() == 0
    item = next(item for item in state.discovery["founder_action_queue"] if item["action_id"] == result["action_id"])
    assert item["status"] == "rejected"
    assert len(execution_registry._sessions) == 0


def test_bounded_code_change_approval_auto_continues_and_persists_result(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded-approve")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded-approve",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded-approve",
    )
    calls = {"code": 0, "verify": 0}

    def code_runner(plan):
        calls["code"] += 1
        assert plan["allowed_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]
        return {"changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"], "diff_summary": "changed title"}

    def verifier(commands):
        calls["verify"] += 1
        assert commands[0] == ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"]
        return [{"argv": commands[0], "shell": False, "success": True, "check_result": "PASS", "passed": 3, "failed": 0, "errors": 0}]

    monkeypatch.setattr(runtime, "run_bounded_code_change", code_runner)
    monkeypatch.setattr(runtime, "run_verification_commands", verifier)
    monkeypatch.setattr(runtime, "safe_checkpoint_commit", lambda **kwargs: {
        "operation_type": "SAFE_CHECKPOINT_COMMIT",
        "success": True,
        "commit_created": True,
        "commit_message": "fix(sino-runtime): align controlled runtime status label",
        "commit_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
        "commit_file_count": 1,
        "new_head": "head-checkpoint",
        "working_tree_clean_after": True,
    })
    approved = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    assert approved["status"] == "completed"
    assert calls == {"code": 1, "verify": 1}
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-bounded-approve").one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-bounded-approve").all()
    assert task.approval_status == "approved"
    assert task.execution_status == "completed"
    assert task.scope["operational_runtime"]["allowed_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]
    assert task.result["operation_type"] == "BOUNDED_CODE_CHANGE"
    assert task.result["boundary_check"] == "PASS"
    assert task.result["checkpoint"]["commit_created"] is True
    assert task.result["checkpoint"]["commit_file_count"] == 1
    assert task.result["changed_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]
    assert state.discovery["operational_runtime"]["result"]["changed_files"] == ["frontend/src/sino-founder/ConversationThread.jsx"]
    assert any("受控代码修改完成" in item.content for item in messages)
    assert len(execution_registry._sessions) == 1


def test_bounded_code_change_retry_reuses_completed_execution(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded-retry")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded-retry",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded-retry",
    )
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: {"changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"], "diff_summary": "changed title"})
    monkeypatch.setattr(runtime, "run_verification_commands", lambda _commands: [{"argv": ["test"], "shell": False, "success": True, "check_result": "PASS"}])
    monkeypatch.setattr(runtime, "safe_checkpoint_commit", lambda **_kwargs: {"operation_type": "SAFE_CHECKPOINT_COMMIT", "success": True, "commit_created": True, "new_head": "head-once", "commit_files": ["frontend/src/sino-founder/ConversationThread.jsx"], "commit_file_count": 1})
    first = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: (_ for _ in ()).throw(AssertionError("retry must not run code executor")))
    second = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
    assert first["execution_id"] == second["execution_id"]
    assert len(execution_registry._sessions) == 1


def test_bounded_code_change_boundary_violation_is_persisted(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded-boundary")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded-boundary",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded-boundary",
    )
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: {"changed_files": ["backend/app/secret.py"], "diff_summary": "bad"})
    monkeypatch.setattr(runtime, "run_verification_commands", lambda _commands: (_ for _ in ()).throw(AssertionError("verification must not run after boundary violation")))
    approved = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    assert approved["result"]["boundary_check"] == "FAILED_BOUNDARY"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-bounded-boundary").all()
    assert task.execution_status == "failed"
    assert task.result["check_result"] == "FAILED_BOUNDARY"
    assert any("超出授权范围" in item.content for item in messages)


def test_bounded_code_change_verification_failure_persists_check_failure(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-bounded-verify-fail")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-bounded-verify-fail",
        founder_request=BOUNDED_CHANGE_REQUEST,
        source_message_id="message-bounded-verify-fail",
    )
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: {"changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"], "diff_summary": "changed"})
    monkeypatch.setattr(runtime, "run_verification_commands", lambda _commands: [{"argv": ["test"], "shell": False, "success": False, "check_result": "FAIL", "passed": 1, "failed": 1, "errors": 0}])
    approved = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    assert approved["result"]["check_result"] == "FAIL"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
    assert task.result["tests_failed"] == 1
    assert task.execution_status == "completed"


def _checkpoint_execution_result(**overrides):
    value = {
        "operation_type": "BOUNDED_CODE_CHANGE",
        "status": "completed",
        "success": True,
        "check_result": "PASS",
        "boundary_check": "PASS",
        "unexpected_files": [],
        "changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
        "verification_steps": [
            {"argv": ["npm", "--prefix", "frontend", "test", "--", "--run", "src/sino-founder/ConversationThread.test.jsx"], "success": True, "check_result": "PASS"},
            {"argv": ["npm", "--prefix", "frontend", "run", "build"], "success": True, "check_result": "PASS"},
        ],
    }
    value.update(overrides)
    return value


def test_safe_checkpoint_stages_only_explicit_allowed_files(monkeypatch, tmp_path):
    calls = []
    plan = dict(runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_STATUS_CARD_TITLE_CHANGE])
    monkeypatch.setattr(runtime, "_git_state_blocker", lambda _root: None)
    monkeypatch.setattr(runtime, "_git_diff_check", lambda **_kwargs: {"success": True})
    statuses = [
        [" M frontend/src/sino-founder/ConversationThread.jsx"],
        [],
    ]
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: statuses.pop(0))

    def fake_git(args, **_kwargs):
        calls.append(args)
        if args == ["rev-parse", "HEAD"]:
            return SimpleNamespace(stdout="head-before\n", stderr="", returncode=0)
        if args == ["diff", "--cached", "--name-only"]:
            return SimpleNamespace(stdout="frontend/src/sino-founder/ConversationThread.jsx\n", stderr="", returncode=0)
        if args[:1] == ["commit"]:
            return SimpleNamespace(stdout="[branch head-after] ok", stderr="", returncode=0)
        if args == ["show", "--stat", "--oneline", "HEAD"]:
            return SimpleNamespace(stdout="head-after commit", stderr="", returncode=0)
        if args[:1] == ["add"]:
            return SimpleNamespace(stdout="", stderr="", returncode=0)
        return SimpleNamespace(stdout="head-after\n", stderr="", returncode=0)

    monkeypatch.setattr(runtime, "_git_output", fake_git)
    result = runtime.safe_checkpoint_commit(
        plan=plan,
        execution_result=_checkpoint_execution_result(),
        task_id="task-1",
        execution_id="execution-1",
        action_id="bounded-code-change:message-1",
        cwd=tmp_path,
    )
    assert result["success"] is True
    assert ["add", "frontend/src/sino-founder/ConversationThread.jsx"] in calls
    assert ["add", "."] not in calls
    assert ["add", "-A"] not in calls
    assert not any(call and call[0] in {"push", "merge", "rebase"} for call in calls)


def test_safe_checkpoint_blocks_preexisting_staged_file(monkeypatch, tmp_path):
    plan = dict(runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_STATUS_CARD_TITLE_CHANGE])
    monkeypatch.setattr(runtime, "_git_state_blocker", lambda _root: None)
    monkeypatch.setattr(runtime, "_git_diff_check", lambda **_kwargs: {"success": True})
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: ["M  backend/app/founder_ai/api.py", " M frontend/src/sino-founder/ConversationThread.jsx"])
    result = runtime.safe_checkpoint_commit(
        plan=plan,
        execution_result=_checkpoint_execution_result(),
        task_id="task-1",
        execution_id="execution-1",
        action_id="bounded-code-change:message-1",
        cwd=tmp_path,
    )
    assert result["success"] is False
    assert result["failure_type"] == "STAGED_BOUNDARY_MISMATCH"


def test_safe_checkpoint_blocks_unexpected_dirty_file(monkeypatch, tmp_path):
    plan = dict(runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_STATUS_CARD_TITLE_CHANGE])
    monkeypatch.setattr(runtime, "_git_state_blocker", lambda _root: None)
    monkeypatch.setattr(runtime, "_git_diff_check", lambda **_kwargs: {"success": True})
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [" M frontend/src/sino-founder/ConversationThread.jsx", " M backend/app/founder_ai/api.py"])
    result = runtime.safe_checkpoint_commit(
        plan=plan,
        execution_result=_checkpoint_execution_result(),
        task_id="task-1",
        execution_id="execution-1",
        action_id="bounded-code-change:message-1",
        cwd=tmp_path,
    )
    assert result["success"] is False
    assert result["failure_type"] == "UNEXPECTED_DIRTY_FILE"


def test_safe_checkpoint_requires_verification_and_build_pass(monkeypatch, tmp_path):
    plan = dict(runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_STATUS_CARD_TITLE_CHANGE])
    result = runtime.safe_checkpoint_commit(
        plan=plan,
        execution_result=_checkpoint_execution_result(check_result="FAIL"),
        task_id="task-1",
        execution_id="execution-1",
        action_id="bounded-code-change:message-1",
        cwd=tmp_path,
    )
    assert result["success"] is False
    assert result["failure_type"] == "VERIFICATION_NOT_PASSED"
    result = runtime.safe_checkpoint_commit(
        plan=plan,
        execution_result=_checkpoint_execution_result(verification_steps=[{"argv": ["npm", "--prefix", "frontend", "run", "build"], "success": False, "check_result": "FAIL"}]),
        task_id="task-1",
        execution_id="execution-1",
        action_id="bounded-code-change:message-1",
        cwd=tmp_path,
    )
    assert result["success"] is False
    assert result["failure_type"] == "BUILD_NOT_PASSED"


def test_git_output_uses_shell_false_and_rejects_push(monkeypatch, tmp_path):
    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["shell"] = kwargs.get("shell")
        return SimpleNamespace(stdout="", stderr="", returncode=0)

    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    runtime._git_output(["status", "--short"], cwd=tmp_path)
    assert captured["argv"] == ["git", "status", "--short"]
    assert captured["shell"] is False
    with pytest.raises(ValueError):
        runtime._git_output(["push"], cwd=tmp_path)


def test_conversation_api_short_circuits_low_operational_request_before_provider(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-api")
    monkeypatch.setattr(runtime, "run_repo_inspection", lambda **_kwargs: _runner_result())
    monkeypatch.setattr(api.secretary, "_reply_generator", lambda *_args: (_ for _ in ()).throw(AssertionError("provider must not be called")))
    response = api.discuss_with_sino("conv-api", api.DiscussionMessageIn(content=LOW_REQUEST, client_message_id="client-low"))
    assert response["sino_brain"]["discovery"]["operational_runtime"]["status"] == "completed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-api").all()
    assert task.approval_status == "approved"
    assert task.execution_status == "completed"
    assert any("当前 branch" in item.content for item in messages)
