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
