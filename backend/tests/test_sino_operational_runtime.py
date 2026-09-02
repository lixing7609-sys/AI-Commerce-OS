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
HIGH_REQUEST = "部署到生产环境并写 production db"
FOCUSED_TEST_REQUEST = "运行 Sino Operational Runtime 的测试，告诉我结果。"
FRONTEND_BUILD_REQUEST = "检查一下前端现在能不能正常构建。"
BOUNDED_CHANGE_REQUEST = "请把 Sino Operational Runtime 状态卡标题改成 Sino Controlled Runtime，并运行相关前端测试和构建。"
SAFE_MERGE_REQUEST = "请把当前 feature 分支本地 --no-ff 合并到 integration branch。"
SAFE_INTEGRATION_PUSH_REQUEST = "请推送 integration branch 到远程。"


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


def _safe_push_request(**overrides):
    value = {
        "local_branch": "feature/sino-safe-push-v1",
        "local_head": "head-approved",
        "checkpoint_head": "head-approved",
        "remote_name": "origin",
        "remote_branch": "feature/sino-safe-push-v1",
        "remote_url": "/tmp/origin.git",
        "remote_branch_head": "head-remote",
        "remote_exists": True,
        "remote_allowed": True,
        "ahead_count": 1,
        "behind_count": 0,
        "working_tree_clean": True,
        "staged_files": [],
        "untracked_files": [],
        "status_short": [],
        "detached_head": False,
        "protected_branch": False,
        "state_blocker": None,
        "force_allowed": False,
        "tags_allowed": False,
        "delete_allowed": False,
        "deployment_allowed": False,
    }
    value.update(overrides)
    return value


def test_safe_push_request_is_high_and_specific():
    decision = runtime.classify_operational_risk("请把当前 checkpoint push 到 origin 同名远程分支。")
    assert decision["operation_type"] == "SAFE_PUSH"
    assert decision["risk_level"] == "HIGH"
    assert decision["approval_required"] is True
    assert decision["auto_continue"] is False


def test_safe_push_enters_action_queue_and_push_unreachable_before_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-push")
    monkeypatch.setattr(runtime, "_safe_push_preflight", lambda **_kwargs: _safe_push_request())
    monkeypatch.setattr(runtime, "_git_safe_push", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("push must not run before approval")))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-push",
        founder_request="请安全 push 当前 checkpoint。",
        source_message_id="message-safe-push",
    )
    assert result["status"] == "approval_required"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-push").one()
        assert db.query(TaskAssetDB).count() == 0
    queue = state.discovery["founder_action_queue"]
    items = [item for item in queue if item["action_type"] == "SAFE_PUSH_APPROVAL" and item["status"] == "pending"]
    assert len(items) == 1
    assert items[0]["metadata"]["checkpoint_head"] == "head-approved"
    assert items[0]["metadata"]["remote_name"] == "origin"
    assert len(execution_registry._sessions) == 0


def test_safe_push_reject_and_continue_do_not_push(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-push-reject")
    monkeypatch.setattr(runtime, "_safe_push_preflight", lambda **_kwargs: _safe_push_request())
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-push-reject",
        founder_request="请安全 push 当前 checkpoint。",
        source_message_id="message-safe-push-reject",
    )
    monkeypatch.setattr(runtime, "_git_safe_push", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("push must not run")))
    continued = runtime.decide_operational_action_by_type(result["action_id"], "continue_discussion")
    assert continued["status"] == "pending"
    rejected = runtime.decide_operational_action_by_type(result["action_id"], "reject")
    assert rejected["push_performed"] is False
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-push-reject").one()
        assert db.query(TaskAssetDB).count() == 0
    item = next(item for item in state.discovery["founder_action_queue"] if item["action_id"] == result["action_id"])
    assert item["status"] == "rejected"
    assert len(execution_registry._sessions) == 0


def test_safe_push_approval_creates_task_execution_and_pushes_once(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-push-approve")
    preflights = [
        _safe_push_request(),
        _safe_push_request(),
        _safe_push_request(remote_branch_head="head-approved", ahead_count=0),
    ]
    monkeypatch.setattr(runtime, "_safe_push_preflight", lambda **_kwargs: preflights.pop(0))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-push-approve",
        founder_request="请安全 push 当前 checkpoint。",
        source_message_id="message-safe-push-approve",
    )
    calls = []

    def fake_push(remote, branch, root):
        calls.append((remote, branch, root))
        return SimpleNamespace(returncode=0, stdout="", stderr="pushed")

    approved = runtime.execute_safe_push(
        conversation_id="conv-safe-push-approve",
        founder_request="请安全 push 当前 checkpoint。",
        source_message_id="message-safe-push-approve",
        action_id=result["action_id"],
        push_request=_safe_push_request(),
        cwd=tmp_path,
        push_runner=fake_push,
    )
    assert approved["status"] == "completed"
    assert approved["result"]["push_performed"] is True
    assert approved["result"]["force_used"] is False
    assert approved["result"]["tags_pushed"] is False
    assert calls == [("origin", "feature/sino-safe-push-v1", tmp_path)]
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-safe-push-approve").all()
    assert task.scope["operational_runtime"]["checkpoint_head"] == "head-approved"
    assert task.execution_status == "completed"
    assert task.result["operation_type"] == "SAFE_PUSH"
    assert any("安全推送完成" in item.content for item in messages)
    assert len(execution_registry._sessions) == 1


def test_safe_push_blocks_dirty_staged_untracked_and_remote_ahead(monkeypatch, tmp_path):
    base = _safe_push_request()
    dirty = runtime._validate_safe_push_preconditions(base, _safe_push_request(working_tree_clean=False, status_short=[" M a.txt"]), started_at="now", action_id="safe-push:1")
    staged = runtime._validate_safe_push_preconditions(base, _safe_push_request(working_tree_clean=False, staged_files=["a.txt"]), started_at="now", action_id="safe-push:1")
    untracked = runtime._validate_safe_push_preconditions(base, _safe_push_request(working_tree_clean=False, untracked_files=["a.txt"]), started_at="now", action_id="safe-push:1")
    remote_ahead = runtime._validate_safe_push_preconditions(base, _safe_push_request(behind_count=1), started_at="now", action_id="safe-push:1")
    assert dirty["failure_type"] == "WORKING_TREE_NOT_CLEAN"
    assert staged["failure_type"] == "STAGED_FILES_PRESENT"
    assert untracked["failure_type"] == "UNTRACKED_FILES_PRESENT"
    assert remote_ahead["failure_type"] == "REMOTE_AHEAD_BLOCKED"


def test_safe_push_blocks_changed_head_branch_remote_and_protected_branch():
    base = _safe_push_request()
    assert runtime._validate_safe_push_preconditions(base, _safe_push_request(local_head="head-new", checkpoint_head="head-new"), started_at="now", action_id="safe-push:1")["failure_type"] == "HEAD_CHANGED_AFTER_APPROVAL"
    assert runtime._validate_safe_push_preconditions(base, _safe_push_request(local_branch="feature/other", remote_branch="feature/other"), started_at="now", action_id="safe-push:1")["failure_type"] == "BRANCH_CHANGED_AFTER_APPROVAL"
    assert runtime._validate_safe_push_preconditions(base, _safe_push_request(remote_name="upstream"), started_at="now", action_id="safe-push:1")["failure_type"] == "REMOTE_STATE_CHANGED"
    assert runtime._validate_safe_push_preconditions(base, _safe_push_request(local_branch="main", remote_branch="main", protected_branch=True), started_at="now", action_id="safe-push:1")["failure_type"] == "PROTECTED_BRANCH_BLOCKED"
    assert runtime._validate_safe_push_preconditions(base, _safe_push_request(local_branch="feature/foundation-reset-integration", remote_branch="feature/foundation-reset-integration", protected_branch=True), started_at="now", action_id="safe-push:1")["failure_type"] == "PROTECTED_BRANCH_BLOCKED"


def test_safe_push_argv_uses_shell_false_and_rejects_unsafe_ref(monkeypatch, tmp_path):
    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = argv
        captured["shell"] = kwargs.get("shell")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    runtime._git_safe_push("origin", "feature/sino-safe-push-v1", cwd=tmp_path)
    assert captured["argv"] == ["git", "push", "origin", "feature/sino-safe-push-v1"]
    assert captured["shell"] is False
    assert "--force" not in captured["argv"]
    assert "--tags" not in captured["argv"]
    assert "--delete" not in captured["argv"]
    with pytest.raises(ValueError):
        runtime._git_safe_push("origin", "HEAD:main", cwd=tmp_path)


def test_safe_push_already_up_to_date_is_idempotent_without_push(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-push-up-to-date")
    preflights = [_safe_push_request(ahead_count=0, remote_branch_head="head-approved"), _safe_push_request(ahead_count=0, remote_branch_head="head-approved")]
    monkeypatch.setattr(runtime, "_safe_push_preflight", lambda **_kwargs: preflights.pop(0))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-push-up-to-date",
        founder_request="请安全 push 当前 checkpoint。",
        source_message_id="message-safe-push-up-to-date",
    )
    monkeypatch.setattr(runtime, "_git_safe_push", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("already up to date must not push")))
    approved = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    repeated = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    assert approved["result"]["already_up_to_date"] is True
    assert repeated["result"]["already_up_to_date"] is True
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
    assert len(execution_registry._sessions) == 1


def _safe_merge_request(**overrides):
    value = {
        "current_branch": "feature/sino-safe-merge-v1",
        "source_branch": "feature/sino-safe-merge-v1",
        "source_head": "source-head",
        "source_remote": "origin",
        "source_remote_head": "source-head",
        "source_exists": True,
        "source_allowed": True,
        "source_ahead_remote": 0,
        "source_behind_remote": 0,
        "target_branch": "feature/foundation-reset-integration",
        "target_head": "target-head",
        "target_head_before": "target-head",
        "target_remote": "origin",
        "target_remote_head": "target-head",
        "target_remote_head_before": "target-head",
        "target_exists": True,
        "target_allowed": True,
        "target_ahead_remote": 0,
        "target_behind_remote": 0,
        "remote_exists": True,
        "remote_name": "origin",
        "working_tree_clean": True,
        "staged_files": [],
        "untracked_files": [],
        "status_short": [],
        "detached_head": False,
        "state_blocker": None,
        "merge_strategy": "no_ff",
        "push_after_merge": False,
        "auto_conflict_resolution": False,
        "source_verification_status": "PASS",
        "source_safe_push_status": "PASS",
        "checkpoint_head": "source-head",
        "pushed_remote_head": "source-head",
        "source_verified": True,
        "source_pushed": True,
        "conflict_prediction": {"checked": True, "conflict_predicted": False, "conflict_files": []},
    }
    value.update(overrides)
    return value


def test_safe_merge_request_is_high_and_specific():
    decision = runtime.classify_operational_risk(SAFE_MERGE_REQUEST)
    assert decision["operation_type"] == "SAFE_MERGE"
    assert decision["risk_level"] == "HIGH"
    assert decision["approval_required"] is True
    assert decision["auto_continue"] is False


def test_safe_merge_enters_action_queue_and_merge_unreachable_before_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge")
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request())
    monkeypatch.setattr(runtime, "_git_safe_merge_no_ff", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("merge must not run before approval")))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-merge",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge",
    )
    assert result["status"] == "approval_required"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-merge").one()
        assert db.query(TaskAssetDB).count() == 0
    items = [item for item in state.discovery["founder_action_queue"] if item["action_type"] == "SAFE_MERGE_APPROVAL" and item["status"] == "pending"]
    assert len(items) == 1
    assert items[0]["metadata"]["source_head"] == "source-head"
    assert items[0]["metadata"]["target_head_before"] == "target-head"
    assert len(execution_registry._sessions) == 0


def test_safe_merge_reject_and_continue_do_not_switch_or_merge(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-reject")
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request())
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-merge-reject",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-reject",
    )
    monkeypatch.setattr(runtime, "_git_safe_switch", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("switch must not run")))
    monkeypatch.setattr(runtime, "_git_safe_merge_no_ff", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("merge must not run")))
    continued = runtime.decide_operational_action_by_type(result["action_id"], "continue_discussion")
    assert continued["status"] == "pending"
    rejected = runtime.decide_operational_action_by_type(result["action_id"], "reject")
    assert rejected["merge_performed"] is False
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-merge-reject").one()
        assert db.query(TaskAssetDB).count() == 0
    item = next(item for item in state.discovery["founder_action_queue"] if item["action_id"] == result["action_id"])
    assert item["status"] == "rejected"


def test_safe_merge_preconditions_block_policy_sync_evidence_and_conflict():
    base = _safe_merge_request()
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_allowed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_branch="main", source_allowed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(target_branch="main", target_allowed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "TARGET_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(target_branch="master", target_allowed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "TARGET_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(target_branch="develop", target_allowed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "TARGET_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_head="changed"), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_HEAD_CHANGED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(target_head="changed", target_head_before="changed"), started_at="now", action_id="safe-merge:1")["failure_type"] == "TARGET_HEAD_CHANGED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_remote_head="other"), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_REMOTE_NOT_SYNCED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(target_remote_head="other", target_remote_head_before="other"), started_at="now", action_id="safe-merge:1")["failure_type"] == "TARGET_REMOTE_NOT_SYNCED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_verified=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_NOT_VERIFIED"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(source_pushed=False), started_at="now", action_id="safe-merge:1")["failure_type"] == "SOURCE_NOT_PUSHED"
    conflict = runtime._validate_safe_merge_preconditions(base, _safe_merge_request(conflict_prediction={"checked": True, "conflict_predicted": True, "conflict_files": ["app.py"]}), started_at="now", action_id="safe-merge:1")
    assert conflict["failure_type"] == "MERGE_CONFLICT_PREDICTED"
    assert conflict["conflict_files"] == ["app.py"]


def test_safe_merge_blocks_dirty_staged_untracked_and_repo_state():
    base = _safe_merge_request()
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, status_short=[" M a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "WORKING_TREE_NOT_CLEAN"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, staged_files=["a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "STAGED_FILES_PRESENT"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, untracked_files=["a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "UNTRACKED_FILES_PRESENT"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(state_blocker="repository_in_merge_state"), started_at="now", action_id="safe-merge:1")["failure_type"] == "REPO_OPERATION_IN_PROGRESS"


def test_safe_merge_argv_uses_shell_false_and_no_squash_rebase_or_push(monkeypatch, tmp_path):
    calls = []

    def fake_run(argv, **kwargs):
        calls.append((argv, kwargs.get("shell")))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    runtime._git_safe_switch("feature/foundation-reset-integration", cwd=tmp_path)
    runtime._git_safe_merge_no_ff("feature/sino-safe-merge-v1", cwd=tmp_path)
    runtime._git_safe_merge_abort(cwd=tmp_path)
    assert (["git", "switch", "feature/foundation-reset-integration"], False) in calls
    assert (["git", "merge", "--no-ff", "feature/sino-safe-merge-v1"], False) in calls
    assert (["git", "merge", "--abort"], False) in calls
    flat = [token for argv, _shell in calls for token in argv]
    assert "push" not in flat
    assert "--squash" not in flat
    assert "--rebase" not in flat
    assert "-X" not in flat
    with pytest.raises(ValueError):
        runtime._git_safe_merge_no_ff("feature/a:main", cwd=tmp_path)


def test_safe_merge_approval_executes_switch_and_no_ff_merge(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-approve")
    preflight = _safe_merge_request()
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: preflight)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-merge-approve",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-approve",
    )
    calls = []
    monkeypatch.setattr(runtime, "_git_is_ancestor", lambda ancestor, descendant, **_kwargs: False if descendant == "target-head" else ancestor in {"source-head", "target-head"} and descendant == "merge-head")
    monkeypatch.setattr(runtime, "_merge_parent_count", lambda _head, **_kwargs: 2)
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [])

    def fake_git(args, **_kwargs):
        if args == ["rev-parse", "HEAD"]:
            return SimpleNamespace(returncode=0, stdout="target-head\n" if len(calls) == 1 else "merge-head\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime, "_git_output", fake_git)

    def switcher(branch, root):
        calls.append(("switch", branch, root))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    def merger(branch, root):
        calls.append(("merge", branch, root))
        return SimpleNamespace(returncode=0, stdout="Merge made by ort", stderr="")

    approved = runtime.execute_safe_merge(
        conversation_id="conv-safe-merge-approve",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-approve",
        action_id=result["action_id"],
        merge_request=preflight,
        cwd=tmp_path,
        switcher=switcher,
        merger=merger,
    )
    assert approved["status"] == "completed"
    assert approved["result"]["merge_commit_created"] is True
    assert approved["result"]["merge_parent_count"] == 2
    assert approved["result"]["source_ancestor_verified"] is True
    assert approved["result"]["target_ancestor_verified"] is True
    assert approved["result"]["push_performed"] is False
    assert calls == [("switch", "feature/foundation-reset-integration", tmp_path), ("merge", "feature/sino-safe-merge-v1", tmp_path)]
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-safe-merge-approve").all()
    assert task.result["operation_type"] == "SAFE_MERGE"
    assert task.result["merge_commit_head"] == "merge-head"
    assert any("本地安全合并完成" in item.content for item in messages)


def test_safe_merge_conflict_aborts_and_persists_failure(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-conflict")
    preflight = _safe_merge_request()
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: preflight)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-merge-conflict",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-conflict",
    )
    monkeypatch.setattr(runtime, "_git_is_ancestor", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [])

    def fake_git(args, **_kwargs):
        if args == ["rev-parse", "HEAD"]:
            return SimpleNamespace(returncode=0, stdout="target-head\n", stderr="")
        if args == ["diff", "--name-only", "--diff-filter=U"]:
            return SimpleNamespace(returncode=0, stdout="app.py\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime, "_git_output", fake_git)
    approved = runtime.execute_safe_merge(
        conversation_id="conv-safe-merge-conflict",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-conflict",
        action_id=result["action_id"],
        merge_request=preflight,
        cwd=tmp_path,
        switcher=lambda _branch, _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
        merger=lambda _branch, _root: SimpleNamespace(returncode=1, stdout="", stderr="CONFLICT"),
        aborter=lambda _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )
    assert approved["result"]["failure_type"] == "MERGE_CONFLICT"
    assert approved["result"]["conflict_files"] == ["app.py"]
    assert approved["result"]["merge_abort_success"] is True
    with factory() as db:
        assert db.query(TaskAssetDB).one().execution_status == "failed"


def test_safe_merge_duplicate_callback_returns_existing_merge(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-duplicate")
    preflight = _safe_merge_request()
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: preflight)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-merge-duplicate",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-duplicate",
    )
    monkeypatch.setattr(runtime, "_git_is_ancestor", lambda ancestor, descendant, **_kwargs: False if descendant == "target-head" else True)
    monkeypatch.setattr(runtime, "_merge_parent_count", lambda _head, **_kwargs: 2)
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [])
    revs = ["target-head\n", "merge-head\n"]
    monkeypatch.setattr(runtime, "_git_output", lambda args, **_kwargs: SimpleNamespace(returncode=0, stdout=revs.pop(0) if args == ["rev-parse", "HEAD"] else "", stderr=""))
    first = runtime.execute_safe_merge(
        conversation_id="conv-safe-merge-duplicate",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-duplicate",
        action_id=result["action_id"],
        merge_request=preflight,
        cwd=tmp_path,
        switcher=lambda _branch, _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
        merger=lambda _branch, _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )
    second = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    assert first["execution_id"] == second["execution_id"]
    assert second["result"]["already_merged"] is True
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def _safe_integration_push_request(**overrides):
    base = {
        "local_branch": "feature/foundation-reset-integration",
        "local_head": "merge-head",
        "checkpoint_head": "merge-head",
        "integration_branch": "feature/foundation-reset-integration",
        "integration_head": "merge-head",
        "remote_name": "origin",
        "remote_branch": "feature/foundation-reset-integration",
        "remote_branch_head": "old-remote",
        "remote_head_at_approval": "old-remote",
        "remote_exists": True,
        "remote_allowed": True,
        "ahead_count": 1,
        "behind_count": 0,
        "working_tree_clean": True,
        "staged_files": [],
        "untracked_files": [],
        "status_short": [],
        "detached_head": False,
        "state_blocker": None,
        "integration_branch_allowed": True,
        "safe_merge_verified": True,
        "safe_merge_action_id": "safe-merge:1",
        "merge_commit_head": "merge-head",
    }
    base.update(overrides)
    return base


def test_safe_integration_push_request_is_high_and_enters_queue(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-integration-push")
    decision = runtime.classify_operational_risk(SAFE_INTEGRATION_PUSH_REQUEST)
    assert decision["operation_type"] == "SAFE_INTEGRATION_PUSH"
    assert decision["risk_level"] == "HIGH"
    assert decision["auto_continue"] is False
    monkeypatch.setattr(runtime, "_safe_integration_push_preflight", lambda **_kwargs: _safe_integration_push_request())
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-integration-push",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push",
    )
    assert result["status"] == "approval_required"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-integration-push").one()
    items = [item for item in state.discovery["founder_action_queue"] if item["action_type"] == "SAFE_INTEGRATION_PUSH_APPROVAL"]
    assert len(items) == 1
    assert items[0]["metadata"]["integration_head"] == "merge-head"


def test_safe_integration_push_reject_and_continue_do_not_push(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path, conversation_id="conv-integration-push-decisions")
    monkeypatch.setattr(runtime, "_safe_integration_push_preflight", lambda **_kwargs: _safe_integration_push_request())
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-integration-push-decisions",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push-decisions",
    )
    calls = []
    monkeypatch.setattr(runtime, "_git_safe_push", lambda *_args, **_kwargs: calls.append(_args))
    continued = runtime.decide_operational_action_by_type(result["action_id"], "continue_discussion")
    rejected = runtime.decide_operational_action_by_type(result["action_id"], "reject")
    assert continued["push_performed"] is False
    assert rejected["push_performed"] is False
    assert calls == []


def test_safe_integration_push_preconditions_block_policy_dirty_remote_and_evidence():
    base = _safe_integration_push_request()
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(integration_branch="main", integration_branch_allowed=False), started_at="now", action_id="a")["failure_type"] == "INTEGRATION_BRANCH_NOT_ALLOWED"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(staged_files=["x.py"]), started_at="now", action_id="a")["failure_type"] == "STAGED_FILES_PRESENT"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(untracked_files=["x.py"]), started_at="now", action_id="a")["failure_type"] == "UNTRACKED_FILES_PRESENT"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(working_tree_clean=False), started_at="now", action_id="a")["failure_type"] == "WORKING_TREE_NOT_CLEAN"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(integration_head="new-head"), started_at="now", action_id="a")["failure_type"] == "HEAD_CHANGED_AFTER_APPROVAL"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(remote_branch_head="new-remote"), started_at="now", action_id="a")["failure_type"] == "REMOTE_STATE_CHANGED"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(behind_count=1), started_at="now", action_id="a")["failure_type"] == "REMOTE_AHEAD_BLOCKED"
    assert runtime._validate_safe_integration_push_preconditions(base, _safe_integration_push_request(safe_merge_verified=False), started_at="now", action_id="a")["failure_type"] == "SAFE_MERGE_EVIDENCE_MISSING"


def test_safe_integration_push_reuses_safe_push_argv_and_blocks_unsafe_refs(monkeypatch, tmp_path):
    calls = []
    def fake_run(argv, **kwargs):
        calls.append((argv, kwargs.get("shell")))
        return SimpleNamespace(returncode=0, stdout="", stderr="")
    monkeypatch.setattr(runtime.subprocess, "run", fake_run)
    runtime._git_safe_push("origin", "feature/foundation-reset-integration", cwd=tmp_path)
    assert calls == [(["git", "push", "origin", "feature/foundation-reset-integration"], False)]
    with pytest.raises(ValueError):
        runtime._git_safe_push("origin", "feature/foundation-reset-integration:main", cwd=tmp_path)


def test_safe_integration_push_approval_pushes_once_and_persists(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-integration-push-approve")
    preflight = _safe_integration_push_request()
    states = [preflight, preflight, _safe_integration_push_request(remote_branch_head="merge-head", ahead_count=0)]
    monkeypatch.setattr(runtime, "_safe_integration_push_preflight", lambda **_kwargs: states.pop(0))
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-integration-push-approve",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push-approve",
    )
    calls = []
    approved = runtime.execute_safe_integration_push(
        conversation_id="conv-integration-push-approve",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push-approve",
        action_id=result["action_id"],
        push_request=preflight,
        cwd=tmp_path,
        push_runner=lambda remote, branch, root: calls.append((remote, branch, root)) or SimpleNamespace(returncode=0, stdout="pushed", stderr=""),
    )
    assert approved["result"]["operation_type"] == "SAFE_INTEGRATION_PUSH"
    assert approved["result"]["push_performed"] is True
    assert approved["result"]["remote_head_after"] == "merge-head"
    assert calls == [("origin", "feature/foundation-reset-integration", tmp_path)]
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-integration-push-approve").all()
    assert task.result["operation_type"] == "SAFE_INTEGRATION_PUSH"
    assert any("Integration 安全推送完成" in item.content for item in messages)


def test_safe_integration_push_already_up_to_date_and_duplicate_are_idempotent(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-integration-push-idempotent")
    preflight = _safe_integration_push_request(remote_branch_head="merge-head", remote_head_at_approval="merge-head", ahead_count=0)
    monkeypatch.setattr(runtime, "_safe_integration_push_preflight", lambda **_kwargs: preflight)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-integration-push-idempotent",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push-idempotent",
    )
    calls = []
    first = runtime.execute_safe_integration_push(
        conversation_id="conv-integration-push-idempotent",
        founder_request=SAFE_INTEGRATION_PUSH_REQUEST,
        source_message_id="message-integration-push-idempotent",
        action_id=result["action_id"],
        push_request=preflight,
        cwd=tmp_path,
        push_runner=lambda *_args: calls.append(_args),
    )
    second = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    assert first["result"]["already_up_to_date"] is True
    assert second["result"]["already_up_to_date"] is True
    assert calls == []
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
