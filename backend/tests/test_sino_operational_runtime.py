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
from app.founder_ai.codex_adapter import CodexExecutionResult
from app.founder_ai.task_package import TaskPackageBuilder
from app.founder_ai import api
from app.founder_ai import action_queue
from app.founder_ai import autonomous_execution_policy
from app.founder_ai import execution_worker
from app.founder_ai import operational_runtime as runtime
from app.founder_ai import execution_registry


LOW_REQUEST = "检查当前 AI-Commerce-OS 工程状态，告诉我当前 branch、HEAD 和是否有未提交文件。"
HIGH_REQUEST = "部署到生产环境并写 production db"
FOCUSED_TEST_REQUEST = "运行 Sino Operational Runtime 的测试，告诉我结果。"
FRONTEND_BUILD_REQUEST = "检查一下前端现在能不能正常构建。"
BOUNDED_CHANGE_REQUEST = "请把 Sino Operational Runtime 状态卡标题改成 Sino Controlled Runtime，并运行相关前端测试和构建。"
SAFE_MERGE_REQUEST = "请把当前 feature 分支本地 --no-ff 合并到 integration branch。"
SAFE_INTEGRATION_PUSH_REQUEST = "请推送 integration branch 到远程。"
MISSION_REQUEST = "请执行一个完整开发任务：把 Sino Operational Runtime 状态卡文案改得更清楚一点，并验证。"
READ_ONLY_BASELINE_REQUEST = "检查当前 Sino Founder AI 的开发基线状态。只做只读检查，不修改代码。告诉我当前 integration branch、HEAD、working tree 状态，以及现在最值得优先改进的一个真实产品问题。"
ANALYTICAL_READ_ONLY_REQUEST = "检查当前 Sino Founder AI 的真实产品界面和现有能力，找出一个对 Founder 日常使用影响最大的具体问题。不要给我泛泛的 routing、架构或测试建议，要指出一个我在实际使用中能直接看到或感受到的问题，并说明你建议怎么改。先只检查和讨论，不修改代码。"


def _runtime(monkeypatch, tmp_path, *, conversation_id="conv-operational"):
    import app.core.task_asset.service as task_service
    import app.founder_ai.secretary.service as secretary_service

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    for module in (runtime, task_service, secretary_service, action_queue):
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


@pytest.mark.parametrize(("risk_decision", "context", "reason"), [
    ({"operation_type": runtime.REPO_INSPECTION, "risk_level": runtime.LOW_RISK}, {"read_only": True}, "low_risk_read_only_operation"),
    ({"operation_type": runtime.FOCUSED_TEST, "risk_level": runtime.LOW_RISK}, {}, "low_risk_allowlisted_test"),
    ({"operation_type": runtime.FRONTEND_BUILD, "risk_level": runtime.LOW_RISK}, {}, "low_risk_local_build"),
    (
        {
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "risk_level": runtime.MEDIUM_RISK,
            "approval_action_id": "bounded-code-change:1",
        },
        {"founder_approved": True, "allowed_files": ["frontend/src/sino-founder/ConversationThread.jsx"]},
        "founder_approved_bounded_local_development",
    ),
])
def test_autonomous_execution_policy_allows_only_low_or_approved_bounded_work(risk_decision, context, reason):
    decision = autonomous_execution_policy.decide_from_risk(risk_decision, context=context)
    assert decision["decision"] == autonomous_execution_policy.AUTO_CONTINUE
    assert decision["auto_continue"] is True
    assert decision["approval_required"] is False
    assert decision["reason"] == reason


@pytest.mark.parametrize(("risk_decision", "context", "reason"), [
    ({"operation_type": runtime.SAFE_PUSH, "risk_level": runtime.HIGH_RISK}, {}, "high_risk_requires_founder_approval"),
    ({"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK}, {}, "high_risk_requires_founder_approval"),
    ({"operation_type": "RESET_HARD", "risk_level": runtime.HIGH_RISK, "destructive": True}, {}, "high_risk_requires_founder_approval"),
    ({"operation_type": "DEPLOY_PRODUCTION", "risk_level": runtime.HIGH_RISK, "production": True}, {}, "high_risk_requires_founder_approval"),
    ({"operation_type": "CREDENTIAL_CHANGE", "risk_level": runtime.HIGH_RISK, "credential": True}, {}, "high_risk_requires_founder_approval"),
    ({"operation_type": None, "risk_level": None}, {}, "unknown_operation_or_risk"),
    ({"operation_type": runtime.REPO_INSPECTION, "risk_level": runtime.LOW_RISK, "remote_write": True}, {}, "remote_write_requires_founder_approval"),
    ({"operation_type": runtime.BOUNDED_CODE_CHANGE, "risk_level": runtime.LOW_RISK}, {"founder_approved": True}, "bounded_local_development_requires_scope_and_approval"),
])
def test_autonomous_execution_policy_requires_founder_approval_for_risky_or_unproven_work(risk_decision, context, reason):
    decision = autonomous_execution_policy.decide_from_risk(risk_decision, context=context)
    assert decision["decision"] == autonomous_execution_policy.FOUNDER_APPROVAL_REQUIRED
    assert decision["auto_continue"] is False
    assert decision["approval_required"] is True
    assert decision["reason"] == reason


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
    assert state.discovery.get("founder_action_queue", []) == []
    policy = state.discovery["operational_runtime"]["risk_decision"]["autonomous_execution_policy"]
    assert policy["decision"] == autonomous_execution_policy.AUTO_CONTINUE
    assert policy["reason"] == "low_risk_read_only_operation"
    trace = tasks[0].result["autonomous_execution_trace"]
    assert trace["task_id"] == tasks[0].id
    assert trace["execution_id"] == result["execution_id"]
    assert trace["operation_type"] == runtime.REPO_INSPECTION
    assert trace["policy_decision"] == autonomous_execution_policy.AUTO_CONTINUE
    assert trace["permission_decision"] == "NOT_APPLICABLE_LOCAL_EXECUTOR"
    assert trace["executor"] == "LOCAL_EXECUTOR"
    assert trace["result"] == "completed"
    assert trace["approval_boundary"] == "AUTO_CONTINUE_NO_FOUNDER_QUEUE"
    assert tasks[0].scope["autonomous_execution_trace"]["execution_id"] == result["execution_id"]


def test_remote_write_approval_required_creates_founder_action_queue(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-push-policy")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-safe-push-policy",
        founder_request="把当前 branch push 到远端 origin。",
        source_message_id="message-safe-push-policy",
    )
    assert result["status"] == "approval_required"
    assert result["risk_decision"]["autonomous_execution_policy"]["decision"] == autonomous_execution_policy.FOUNDER_APPROVAL_REQUIRED
    trace = result["risk_decision"]["autonomous_execution_trace"]
    assert trace["policy_decision"] == autonomous_execution_policy.FOUNDER_APPROVAL_REQUIRED
    assert trace["approval_boundary"] == "FOUNDER_APPROVAL_REQUIRED"
    assert trace["result"] == "blocked"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-push-policy").one()
    queue = state.discovery["founder_action_queue"]
    assert len(queue) == 1
    assert queue[0]["action_type"] == runtime.SAFE_PUSH_QUEUE_TYPE


def test_unknown_operational_request_trace_fails_closed():
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-unknown-trace",
        founder_request="do something somewhere maybe",
        source_message_id="message-unknown-trace",
    )
    trace = result["risk_decision"]["autonomous_execution_trace"]
    assert result["handled"] is False
    assert trace["policy_decision"] == autonomous_execution_policy.FOUNDER_APPROVAL_REQUIRED
    assert trace["approval_boundary"] == "UNKNOWN_FAIL_CLOSED"
    assert trace["result"] == "blocked"


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


def test_explicit_read_only_baseline_request_routes_repo_inspection_without_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-read-only-baseline")
    monkeypatch.setattr(runtime, "run_repo_inspection", lambda **_kwargs: {
        "branch": "feature/foundation-reset-integration",
        "head": "head-read-only",
        "working_tree_clean": True,
        "status_short": "",
        "repo_path": "/Users/liwu/AI-Commerce-OS",
        "recommended_product_improvement": "优先修复 read-only routing。",
    })
    decision = runtime.classify_operational_risk(READ_ONLY_BASELINE_REQUEST)
    assert decision["operation_type"] == runtime.REPO_INSPECTION
    assert decision["risk_level"] == runtime.LOW_RISK
    assert decision["approval_required"] is False

    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-read-only-baseline",
        founder_request=READ_ONLY_BASELINE_REQUEST,
        source_message_id="message-read-only-baseline",
    )
    assert result["status"] == "completed"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-read-only-baseline").one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-read-only-baseline").all()
    discovery = dict(state.discovery or {})
    assert discovery["operational_runtime"]["operation_type"] == runtime.REPO_INSPECTION
    assert discovery.get("founder_action_queue", []) == []
    assert "autonomous_development_mission" not in discovery
    assert any("建议优先改进：优先修复 read-only routing。" in item.content for item in messages)


def _analytical_result():
    return {
        "operation_type": runtime.ANALYTICAL_INSPECTION,
        "success": True,
        "check_result": "PASS",
        "summary": (
            "检查完成。当前最值得优先解决的一个具体产品问题是：\n\n"
            "1. 具体问题\nExecution Center 会把准备态当成终态展示。\n\n"
            "2. Founder 真实使用中会看到/感受到什么\nFounder 会看到任务卡停在等待进入执行，却没有最终结论。\n\n"
            "3. 为什么这是当前影响最大的一个问题\n它直接阻断只读分析任务闭环。\n\n"
            "4. 建议具体修改什么\n修改分析型只读任务的自动执行和任务卡状态。\n\n"
            "5. 修改后应该是什么体验\nFounder 一次请求后即可看到检查完成和最终建议。"
        ),
        "stdout_excerpt": "",
        "stderr_excerpt": "",
        "result": {
            "analysis": {
                "observed_problem": "Execution Center 会把准备态当成终态展示。",
                "founder_impact": "Founder 会看到任务卡停在等待进入执行，却没有最终结论。",
                "why_priority": "它直接阻断只读分析任务闭环。",
                "specific_change": "修改分析型只读任务的自动执行和任务卡状态。",
                "expected_experience": "Founder 一次请求后即可看到检查完成和最终建议。",
                "model_invoked": True,
            },
            "evidence": {"read_only": True},
        },
        "real_executor_used": "SINO_ANALYTICAL_INSPECTION_ORCHESTRATOR",
        "model_reasoning_required": True,
        "model_invoked": True,
    }


def test_analytical_read_only_request_routes_low_no_approval_and_model_required():
    decision = runtime.classify_operational_risk(ANALYTICAL_READ_ONLY_REQUEST)
    assert decision["operation_type"] == runtime.ANALYTICAL_INSPECTION
    assert decision["risk_level"] == runtime.LOW_RISK
    assert decision["auto_continue"] is True
    assert decision["approval_required"] is False
    assert decision["read_only"] is True
    assert decision["code_change"] is False
    assert decision["model_reasoning_required"] is True


def test_analytical_read_only_auto_advances_and_persists_final_answer(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-analytical")
    calls = {"runner": 0}

    def runner():
        calls["runner"] += 1
        return _analytical_result()

    result = runtime.execute_low_risk_operation(
        conversation_id="conv-analytical",
        founder_request=ANALYTICAL_READ_ONLY_REQUEST,
        source_message_id="message-analytical",
        runner=runner,
    )

    assert result["status"] == "completed"
    assert result["risk_decision"]["operation_type"] == runtime.ANALYTICAL_INSPECTION
    assert calls["runner"] == 1
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-analytical").all()
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-analytical").one()
    assert task.status == "completed"
    assert task.execution_status == "completed"
    assert task.approval_status == "approved"
    assert task.result["operation_type"] == runtime.ANALYTICAL_INSPECTION
    assert task.result["result"]["analysis"]["model_invoked"] is True
    assert any("检查完成。当前最值得优先解决的一个具体产品问题是" in item.content for item in messages)
    assert not any("任务已经准备好，等待进入执行" in item.content for item in messages)
    assert state.discovery["operational_runtime"]["status"] == "completed"
    assert state.discovery["operational_runtime"]["operation_type"] == runtime.ANALYTICAL_INSPECTION


def test_analytical_acknowledgement_does_not_stop_before_final_answer(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-analytical-api")
    monkeypatch.setattr(runtime, "run_analytical_inspection", lambda **_kwargs: _analytical_result())
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-analytical-api",
        founder_request=ANALYTICAL_READ_ONLY_REQUEST,
        source_message_id="message-analytical-api",
    )
    assert result["handled"] is True
    assert result["status"] == "completed"
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-analytical-api").all()
    assert any("检查完成。" in item.content for item in messages)
    assert not any("我会直接做一次只读产品检查" == item.content for item in messages)


def test_analytical_continuation_reuses_completed_task_and_does_not_duplicate(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-analytical-retry")
    first = runtime.execute_low_risk_operation(
        conversation_id="conv-analytical-retry",
        founder_request=ANALYTICAL_READ_ONLY_REQUEST,
        source_message_id="message-analytical-retry",
        runner=_analytical_result,
    )
    second = runtime.execute_low_risk_operation(
        conversation_id="conv-analytical-retry",
        founder_request="继续完成刚才的只读产品检查。不要只告诉我准备检查。",
        source_message_id="message-analytical-retry",
        runner=lambda: (_ for _ in ()).throw(AssertionError("continuation must reuse existing analytical task")),
    )
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
    assert first["execution_id"] == second["execution_id"]
    assert second["reused"] is True


def test_analytical_model_failure_does_not_leave_ready_to_execute(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-analytical-failure")
    result = runtime.execute_low_risk_operation(
        conversation_id="conv-analytical-failure",
        founder_request=ANALYTICAL_READ_ONLY_REQUEST,
        source_message_id="message-analytical-failure",
        runner=lambda: (_ for _ in ()).throw(RuntimeError("model unavailable")),
    )
    assert result["status"] == "failed"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-analytical-failure").all()
    assert task.execution_status == "failed"
    assert task.status == "failed"
    assert task.status != "ready_to_execute"
    assert any("执行失败" in item.content and "model unavailable" in item.content for item in messages)


def test_deterministic_repo_development_and_high_risk_routing_regressions():
    assert runtime.classify_operational_risk(READ_ONLY_BASELINE_REQUEST)["operation_type"] == runtime.REPO_INSPECTION
    status_query = runtime.classify_operational_risk("检查当前项目分支和工作树状态，并告诉我有没有未提交修改。")
    assert status_query["operation_type"] == runtime.REPO_INSPECTION
    assert status_query["risk_level"] == runtime.LOW_RISK
    assert status_query["approval_required"] is False
    development = runtime.classify_operational_risk("把按钮 A 改成 B，并验证。")
    assert development["operation_type"] == runtime.AUTONOMOUS_DEVELOPMENT_MISSION
    assert development["risk_level"] == runtime.MEDIUM_RISK
    high = runtime.classify_operational_risk("部署到生产环境。")
    assert high["operation_type"] == "HIGH_RISK_OPERATION"
    assert high["risk_level"] == runtime.HIGH_RISK


@pytest.mark.parametrize("request_text", [
    "只做只读检查，告诉我当前 integration branch。",
    "仅检查 HEAD 和 working tree 状态。",
    "查看当前 integration branch、HEAD、working tree。",
])
def test_integration_head_and_working_tree_keywords_do_not_trigger_safe_merge(request_text):
    decision = runtime.classify_operational_risk(request_text)
    assert decision["operation_type"] == runtime.REPO_INSPECTION
    assert decision["risk_level"] == runtime.LOW_RISK
    assert decision["approval_required"] is False


def test_explicit_merge_still_routes_safe_merge():
    decision = runtime.classify_operational_risk("把 feature/test 分支安全合并到 integration branch。")
    assert decision["operation_type"] == runtime.SAFE_MERGE
    assert decision["risk_level"] == runtime.HIGH_RISK
    assert decision["approval_required"] is True


def test_new_conversation_does_not_inherit_stale_safe_merge_action(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-stale-safe-merge-a")
    with factory() as db:
        db.add(ConversationDB(id="conv-stale-safe-merge-b", system_id="founder_ai", title="B"))
        db.add(SinoBrainSessionDB(conversation_id="conv-stale-safe-merge-b", discovery={}))
        db.commit()
    runtime.handle_operational_conversation_request(
        conversation_id="conv-stale-safe-merge-a",
        founder_request="把 feature/test 分支安全合并到 integration branch。",
        source_message_id="message-stale-merge-a",
    )
    runtime.handle_operational_conversation_request(
        conversation_id="conv-stale-safe-merge-b",
        founder_request="只做只读检查，告诉我当前 integration branch、HEAD、working tree。",
        source_message_id="message-read-only-b",
    )
    with factory() as db:
        a = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-stale-safe-merge-a").one()
        b = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-stale-safe-merge-b").one()
    assert any(item["action_type"] == runtime.SAFE_MERGE_QUEUE_TYPE for item in a.discovery["founder_action_queue"])
    assert b.discovery.get("founder_action_queue", []) == []
    assert b.discovery["operational_runtime"]["operation_type"] == runtime.REPO_INSPECTION


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
    trace = task.result["autonomous_execution_trace"]
    assert trace["task_id"] == task.id
    assert trace["execution_id"] == approved["execution_id"]
    assert trace["operation_type"] == runtime.BOUNDED_CODE_CHANGE
    assert trace["policy_decision"] == autonomous_execution_policy.AUTO_CONTINUE
    assert trace["executor"] == "CODEX"
    assert trace["approval_boundary"] == "AUTO_CONTINUE_NO_FOUNDER_QUEUE"
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
        task = db.query(TaskAssetDB).one()
    assert first["execution_id"] == second["execution_id"]
    assert task.result["autonomous_execution_trace"]["execution_id"] == first["execution_id"]
    assert isinstance(task.scope["autonomous_execution_trace"], dict)
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


def test_bounded_code_change_routes_to_codex_and_local_operations_stay_local():
    assert runtime.executor_for_operation(runtime.BOUNDED_CODE_CHANGE) == runtime.CODEX_EXECUTOR
    for operation in (
        runtime.REPO_INSPECTION,
        runtime.FOCUSED_TEST,
        runtime.FRONTEND_BUILD,
        runtime.SAFE_CHECKPOINT_COMMIT,
        runtime.SAFE_PUSH,
        runtime.SAFE_MERGE,
        runtime.SAFE_INTEGRATION_PUSH,
    ):
        assert runtime.executor_for_operation(operation) == runtime.LOCAL_EXECUTOR


def test_codex_package_contains_lineage_boundary_and_prohibitions(tmp_path):
    fixture = tmp_path / "frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("CODEX_BRIDGE_PENDING\n", encoding="utf-8")
    plan = {
        **runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE],
        "founder_request": "把 Codex Bridge E2E fixture 改成 CODEX_BRIDGE_OK",
        "conversation_id": "conv-codex",
        "mission_id": "mission-codex",
        "task_id": "task-codex",
        "execution_id": "execution-codex",
        "working_branch": "feature/sino-native-codex-bridge-v1",
        "baseline_head": "head-before",
        "approval_action_id": "bounded-code-change:codex",
    }
    package = runtime._codex_execution_package_for_bounded_change(plan, cwd=tmp_path)
    assert package.context["operation_type"] == runtime.BOUNDED_CODE_CHANGE
    assert package.context["task_mode"] == "IMPLEMENTATION"
    assert package.context["conversation_id"] == "conv-codex"
    assert package.context["mission_id"] == "mission-codex"
    assert package.context["task_id"] == "task-codex"
    assert package.context["execution_id"] == "execution-codex"
    assert package.context["repo_path"] == str(tmp_path)
    assert package.context["allowed_files"] == ["frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"]
    assert package.context["standard_task_contract"]["implementation_scope"] == ["frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"]
    assert package.context["standard_task_contract"]["module_boundary"] == []
    assert package.context["standard_task_contract"]["scope_source"] == "bounded_code_change_allowed_boundary"
    assert package.context["expected_mutations"] == [{
        "file": "frontend/src/sino-founder/codex-bridge-e2e-fixture.txt",
        "before": "CODEX_BRIDGE_PENDING",
        "after": "CODEX_BRIDGE_OK",
        "instruction": "Change frontend/src/sino-founder/codex-bridge-e2e-fixture.txt content to CODEX_BRIDGE_OK.",
        "reason": "Real Codex bridge E2E must produce an observable single-file implementation patch.",
    }]
    assert package.context["acceptance_criteria"][0] == "Codex Bridge E2E fixture contains CODEX_BRIDGE_OK"
    assert package.context["verification_plan"]
    assert package.context["codex_executor_policy"]["git_commit_allowed"] is False
    assert package.context["codex_executor_policy"]["git_push_allowed"] is False
    assert package.context["codex_executor_policy"]["git_merge_allowed"] is False
    assert package.context["codex_executor_policy"]["deployment_allowed"] is False
    assert "TASK MODE: IMPLEMENTATION" in package.goal
    assert "Do not only explain" in package.goal
    assert any("TASK MODE: IMPLEMENTATION" in item for item in package.constraints)
    assert any("You must perform the requested code/file change directly" in item for item in package.constraints)
    assert any("Do not only explain" in item for item in package.constraints)
    assert any("Do not run git add" in item for item in package.constraints)


def test_task_package_render_tells_codex_to_implement_expected_mutation(tmp_path):
    fixture = tmp_path / "frontend/src/sino-founder/live-founder-acceptance-fixture.txt"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("SINO_LIVE_ACCEPTANCE_PENDING\n", encoding="utf-8")
    plan = {
        **runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE],
        "founder_request": "把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。",
        "conversation_id": "conv-live",
        "mission_id": "mission-live",
        "task_id": "task-live",
        "execution_id": "execution-live",
    }
    package = runtime._codex_execution_package_for_bounded_change(plan, cwd=tmp_path)
    rendered = TaskPackageBuilder().build(package).render()
    assert "## Execution Mode\nIMPLEMENTATION" in rendered
    assert "SINO_LIVE_ACCEPTANCE_PENDING" in rendered
    assert "SINO_LIVE_ACCEPTANCE_OK" in rendered
    assert "You must perform the requested code/file change directly" in rendered
    assert "Do not only explain what should be changed" in rendered


def test_worker_execution_package_uses_implementation_contract_for_bounded_change(monkeypatch, tmp_path):
    fixture = tmp_path / "frontend/src/sino-founder/live-founder-acceptance-fixture.txt"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("SINO_LIVE_ACCEPTANCE_PENDING\n", encoding="utf-8")
    monkeypatch.setattr(runtime, "repo_root", lambda: tmp_path)
    task = TaskAssetDB(
        id="task-live",
        conversation_id="conv-live",
        title="更新 Live Founder Acceptance fixture",
        description="把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。",
        status="approved",
        scope={
            "operational_runtime": {
                **runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.LIVE_FOUNDER_ACCEPTANCE_FIXTURE_CHANGE],
                "operation_type": runtime.BOUNDED_CODE_CHANGE,
                "mission_id": "mission-live",
                "working_branch": "feature/sino-mission-live-founder-acceptance-fixture",
            }
        },
    )
    package = runtime._execution_package(task=task, execution_id="execution-live", risk={"risk_level": runtime.MEDIUM_RISK, "operation_type": runtime.BOUNDED_CODE_CHANGE})
    assert package.context["executor"] == runtime.CODEX_EXECUTOR
    assert package.context["task_mode"] == "IMPLEMENTATION"
    assert package.context["standard_task_contract"]["implementation_scope"] == ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]
    assert package.context["standard_task_contract"]["module_boundary"] == []
    assert package.context["expected_mutations"][0]["before"] == "SINO_LIVE_ACCEPTANCE_PENDING"
    assert package.context["expected_mutations"][0]["after"] == "SINO_LIVE_ACCEPTANCE_OK"
    assert any("Do not only explain" in item for item in package.constraints)
    assert package.commit_requirement.startswith("Controlled local operation")


def test_bounded_code_change_projects_allowed_directories_into_scope_contract(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "repo_root", lambda: tmp_path)
    task = TaskAssetDB(
        id="task-dir",
        conversation_id="conv-dir",
        title="Update bounded directory",
        description="Update bounded directory",
        status="approved",
        scope={
            "operational_runtime": {
                "operation_type": runtime.BOUNDED_CODE_CHANGE,
                "allowed_files": [],
                "allowed_directories": ["frontend/src/sino-founder/fixtures"],
                "acceptance_criteria": ["fixture updated"],
                "explicit_non_goals": ["no push"],
            }
        },
    )
    package = runtime._execution_package(task=task, execution_id="execution-dir", risk={"operation_type": runtime.BOUNDED_CODE_CHANGE})
    assert package.context["allowed_directories"] == ["frontend/src/sino-founder/fixtures"]
    assert package.context["standard_task_contract"]["module_boundary"] == ["frontend/src/sino-founder/fixtures"]


def test_run_bounded_code_change_uses_existing_codex_adapter_and_isolates_sessions(tmp_path):
    calls = []

    class FakeCodexAdapter:
        def execute(self, package, *, cwd):
            calls.append((package, cwd))
            return CodexExecutionResult(
                stdout="updated fixture",
                stderr="",
                exit_code=0,
                changed_files=list(package.context["allowed_files"]),
                codex_run_id=f"codex-{package.context['execution_id']}",
                permission_decision={"decision": "PERMISSION_AUTO_HANDLED", "reason": "low_risk_bounded_local_development"},
            )

    for suffix in ("a", "b"):
        plan = {
            **runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE],
            "founder_request": "把 Codex Bridge E2E fixture 改成 CODEX_BRIDGE_OK",
            "conversation_id": f"conv-{suffix}",
            "mission_id": f"mission-{suffix}",
            "task_id": f"task-{suffix}",
            "execution_id": f"execution-{suffix}",
            "autonomous_execution_policy": {
                "decision": "AUTO_CONTINUE",
                "reason": "founder_approved_bounded_local_development",
            },
        }
        result = runtime.run_bounded_code_change(plan, cwd=tmp_path, adapter=FakeCodexAdapter())
        assert result["real_executor_used"] == runtime.CODEX_EXECUTOR
        assert result["executor"] == "CODEX"
        assert result["codex_session_id"] == f"codex-execution-{suffix}"
        assert result["codex_invocation"]["conversation_id"] == f"conv-{suffix}"
        assert result["codex_invocation"]["mission_id"] == f"mission-{suffix}"
        assert result["codex_permission_decision"]["decision"] == "PERMISSION_AUTO_HANDLED"
        assert result["autonomous_execution_trace"]["permission_decision"] == "PERMISSION_AUTO_HANDLED"
        assert result["autonomous_execution_trace"]["policy_decision"] == "AUTO_CONTINUE"
        assert result["autonomous_execution_trace"]["approval_boundary"] == "AUTO_CONTINUE_NO_FOUNDER_QUEUE"
    assert calls[0][0].context["conversation_id"] == "conv-a"
    assert calls[1][0].context["conversation_id"] == "conv-b"


def test_codex_timeout_and_adapter_error_return_failures(tmp_path):
    class TimeoutAdapter:
        def execute(self, package, *, cwd):
            raise runtime.CodexExecutionTimeout(1, stdout="partial", stderr="timed out")

    class ErrorAdapter:
        def execute(self, package, *, cwd):
            raise RuntimeError("adapter unavailable")

    plan = {
        **runtime.BOUNDED_CODE_CHANGE_PLANS[runtime.BOUNDED_CODEX_BRIDGE_FIXTURE_CHANGE],
        "conversation_id": "conv-fail",
        "execution_id": "execution-fail",
    }
    timeout = runtime.run_bounded_code_change(plan, cwd=tmp_path, adapter=TimeoutAdapter())
    assert timeout["failure_type"] == "TIMEOUT"
    assert timeout["real_executor_used"] == runtime.CODEX_EXECUTOR
    failed = runtime.run_bounded_code_change(plan, cwd=tmp_path, adapter=ErrorAdapter())
    assert failed["failure_type"] == "CODEX_EXECUTION_FAILED"
    assert failed["real_executor_used"] == runtime.CODEX_EXECUTOR


def test_codex_boundary_violation_blocks_verification_after_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-codex-boundary")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-codex-boundary",
        founder_request="把 Codex Bridge E2E fixture 改成 CODEX_BRIDGE_OK，并验证。",
        source_message_id="message-codex-boundary",
    )
    assert result["status"] == "approval_required"
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: {
        "executor": "CODEX",
        "real_executor_used": runtime.CODEX_EXECUTOR,
        "success": True,
        "changed_files": ["backend/app/secret.py"],
        "changed_files_claimed": ["backend/app/secret.py"],
        "diff_summary": "unexpected file",
    })
    monkeypatch.setattr(runtime, "run_verification_commands", lambda _commands: (_ for _ in ()).throw(AssertionError("verification must not run after Codex boundary violation")))
    approved = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    assert approved["result"]["boundary_check"] == "FAILED_BOUNDARY"
    assert approved["result"]["real_executor_used"] == runtime.CODEX_EXECUTOR
    with factory() as db:
        task = db.query(TaskAssetDB).one()
    assert task.result["check_result"] == "FAILED_BOUNDARY"


def test_valid_codex_modification_proceeds_to_local_verification_and_checkpoint(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-codex-valid")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-codex-valid",
        founder_request="把 Codex Bridge E2E fixture 改成 CODEX_BRIDGE_OK，并验证。",
        source_message_id="message-codex-valid",
    )
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda _plan: {
        "executor": "CODEX",
        "real_executor_used": runtime.CODEX_EXECUTOR,
        "success": True,
        "changed_files": ["frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"],
        "changed_files_claimed": ["frontend/src/sino-founder/codex-bridge-e2e-fixture.txt"],
        "diff_summary": "fixture updated",
    })
    monkeypatch.setattr(runtime, "run_verification_commands", lambda commands: [{"argv": commands[0], "shell": False, "success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}])
    monkeypatch.setattr(runtime, "safe_checkpoint_commit", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("codex bridge e2e plan disables checkpoint")))
    approved = runtime.decide_bounded_code_change_action(result["action_id"], "approve")
    assert approved["status"] == "completed"
    assert approved["result"]["real_executor_used"] == runtime.CODEX_EXECUTOR
    assert approved["result"]["check_result"] == "PASS"
    with factory() as db:
        task = db.query(TaskAssetDB).one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-codex-valid").all()
    assert task.result["verification_steps"][0]["shell"] is False
    assert any("受控代码修改完成" in item.content for item in messages)


def test_bounded_code_change_switches_to_mission_branch_before_codex(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-codex-branch")
    product_branch = "feature/sino-live-development-loop-v1"
    mission_branch = "feature/sino-mission-live-founder-acceptance-fixture-c3446262"
    state = {"branch": product_branch, "diff_calls": 0}
    switched = []

    def git_output(args, **_kwargs):
        if args == ["branch", "--show-current"]:
            return SimpleNamespace(stdout=f"{state['branch']}\n", stderr="", returncode=0)
        if args == ["rev-parse", "HEAD"]:
            return SimpleNamespace(stdout="baseline-head\n", stderr="", returncode=0)
        return SimpleNamespace(stdout="", stderr="", returncode=0)

    def switch_branch(branch, **_kwargs):
        switched.append(branch)
        state["branch"] = branch
        return SimpleNamespace(stdout="", stderr="", returncode=0)

    def changed_files(**_kwargs):
        state["diff_calls"] += 1
        return set() if state["diff_calls"] == 1 else {"frontend/src/sino-founder/live-founder-acceptance-fixture.txt"}

    def code_runner(plan):
        assert state["branch"] == mission_branch
        assert plan["preexisting_dirty_files"] == []
        return {
            "executor": "CODEX",
            "real_executor_used": runtime.CODEX_EXECUTOR,
            "success": True,
            "changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "changed_files_claimed": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "diff_summary": "fixture updated",
        }

    monkeypatch.setattr(runtime, "_git_output", git_output)
    monkeypatch.setattr(runtime, "_git_safe_switch_branch", switch_branch)
    monkeypatch.setattr(runtime, "_git_changed_or_untracked_names", changed_files)
    monkeypatch.setattr(runtime, "run_verification_commands", lambda commands: [{"argv": commands[0], "shell": False, "success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}])

    result = runtime.execute_bounded_code_change(
        conversation_id="conv-codex-branch",
        founder_request="把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。",
        source_message_id="message-codex-branch",
        action_id="bounded-code-change:message-codex-branch",
        plan={
            "title": "更新 Live Founder Acceptance fixture",
            "working_branch": mission_branch,
            "allowed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "acceptance_criteria": ["fixture content becomes SINO_LIVE_ACCEPTANCE_OK"],
            "explicit_non_goals": ["push", "merge", "deploy"],
            "verification_commands": [["fixture-check"]],
            "auto_checkpoint": False,
            "live_acceptance_mode": True,
        },
        code_runner=code_runner,
    )

    assert switched == [mission_branch]
    assert result["status"] == "completed"
    assert result["result"]["real_executor_used"] == runtime.CODEX_EXECUTOR
    assert result["result"]["changed_files"] == ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]
    with factory() as db:
        task = db.query(TaskAssetDB).one()
    assert task.scope["execution_start"]["status"] == "completed"


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


def test_safe_merge_target_drift_is_explicit_for_checkpointed_mission_source():
    approved = _safe_merge_request(
        source_head="checkpoint-head",
        target_head="baseline-a",
        target_head_before="baseline-a",
        checkpoint_head="checkpoint-head",
        source_checkpoint_head="checkpoint-head",
        source_verification_status="PASS",
        allow_unpushed_source_after_checkpoint=True,
    )
    current = _safe_merge_request(source_head="checkpoint-head", target_head="baseline-b", target_head_before="baseline-b")
    failure = runtime._validate_safe_merge_preconditions(approved, current, started_at="now", action_id="safe-merge:mission")
    assert failure["failure_type"] == "TARGET_BASELINE_DRIFT"
    assert "candidate merge revalidation" in failure["summary"]


def test_safe_merge_blocks_dirty_staged_untracked_and_repo_state():
    base = _safe_merge_request()
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, status_short=[" M a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "WORKING_TREE_NOT_CLEAN"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, staged_files=["a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "STAGED_FILES_PRESENT"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(working_tree_clean=False, untracked_files=["a.txt"]), started_at="now", action_id="safe-merge:1")["failure_type"] == "UNTRACKED_FILES_PRESENT"
    assert runtime._validate_safe_merge_preconditions(base, _safe_merge_request(state_blocker="repository_in_merge_state"), started_at="now", action_id="safe-merge:1")["failure_type"] == "REPO_OPERATION_IN_PROGRESS"


def test_safe_merge_allows_local_checkpointed_mission_source_without_remote_push():
    approved = _safe_merge_request(
        source_head="checkpoint-head",
        source_remote_head=None,
        source_ahead_remote=0,
        source_behind_remote=0,
        source_safe_push_status="NOT_REQUIRED_FOR_LOCAL_MISSION_MERGE",
        pushed_remote_head=None,
        source_pushed=False,
        source_verified=False,
        checkpoint_head="checkpoint-head",
        source_checkpoint_head="checkpoint-head",
        source_verification_status="PASS",
        allow_unpushed_source_after_checkpoint=True,
    )
    current = _safe_merge_request(
        source_head="checkpoint-head",
        source_remote_head=None,
        source_ahead_remote=0,
        source_behind_remote=0,
        source_safe_push_status="MISSING",
        pushed_remote_head=None,
        source_pushed=False,
        source_verified=False,
        checkpoint_head=None,
    )
    assert runtime._validate_safe_merge_preconditions(approved, current, started_at="now", action_id="safe-merge:mission") is None


def test_safe_merge_still_requires_remote_sync_without_mission_checkpoint_evidence():
    approved = _safe_merge_request(source_head="checkpoint-head", source_remote_head=None, source_pushed=False, source_verified=False)
    current = _safe_merge_request(source_head="checkpoint-head", source_remote_head=None, source_pushed=False, source_verified=False)
    failure = runtime._validate_safe_merge_preconditions(approved, current, started_at="now", action_id="safe-merge:plain")
    assert failure["failure_type"] == "SOURCE_REMOTE_NOT_SYNCED"


def test_historical_safe_merge_refresh_supersedes_old_approval_and_creates_unique_reapproval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-refresh-merge")
    mission_id = "mission-refresh"
    old_action_id = "safe-merge:mission-refresh:safe-merge"
    old_execution_id = "execution-old-safe-merge"
    mission = {
        "mission_id": mission_id,
        "conversation_id": "conv-refresh-merge",
        "status": "WAITING_MERGE_APPROVAL",
        "current_stage": "WAITING_MERGE_APPROVAL",
        "working_branch": "feature/sino-mission-refresh",
        "baseline_branch": runtime.SAFE_MERGE_TARGET_BRANCH,
        "baseline_head": "baseline-a",
        "checkpoint_head": "checkpoint-head",
        "verification_plan": [["npm", "--prefix", "frontend", "test"]],
        "change_result": {"checkpoint": {"new_head": "checkpoint-head", "execution_id": "execution-change"}},
    }
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-refresh-merge").one()
        state.discovery = {
            "autonomous_development_missions": {mission_id: mission},
            "autonomous_development_mission": mission,
            "founder_action_queue": [{
                "action_id": old_action_id,
                "action_type": runtime.SAFE_MERGE_QUEUE_TYPE,
                "type": runtime.SAFE_MERGE_QUEUE_TYPE,
                "status": "approved",
                "decision": "approved",
                "mission_id": mission_id,
                "execution_id": old_execution_id,
                "metadata": {"merge_request": {"source_head": "checkpoint-head", "target_head_before": "baseline-a"}},
            }],
        }
        db.commit()
    package = runtime.ExecutionPackage(
        goal="old merge",
        context={"operation_type": runtime.SAFE_MERGE},
        task_asset=runtime.TaskAssetDraft(title="old", description="old", scope={}, constraints=[], risk="high", approval_required=False, conversation_id="conv-refresh-merge"),
        constraints=[],
        verification=[],
        commit_requirement="none",
        execution_allowed=False,
    )
    execution_registry.save_execution_session(runtime.ExecutionSession(id=old_execution_id, task_asset_id="task-old", execution_package_id="package-old", executor="LOCAL_EXECUTOR", status="blocked"), package)
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda ref, **_kwargs: "checkpoint-head" if ref == "feature/sino-mission-refresh" else "baseline-b")
    monkeypatch.setattr(runtime, "_candidate_merge_validation", lambda **_kwargs: {
        "status": "PASS",
        "source_head": "checkpoint-head",
        "target_head": "baseline-b",
        "merge_base": "baseline-a",
        "verification": [{"argv": ["npm", "--prefix", "frontend", "test"], "status": "PASS", "success": True}],
    })
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request(
        source_branch="feature/sino-mission-refresh",
        source_head="checkpoint-head",
        target_head="baseline-b",
        target_head_before="baseline-b",
        checkpoint_head="checkpoint-head",
        source_checkpoint_head="checkpoint-head",
        source_verification_status="PASS",
        allow_unpushed_source_after_checkpoint=True,
    ))

    result = runtime.refresh_historical_safe_merge(
        conversation_id="conv-refresh-merge",
        mission_id=mission_id,
        action_id=old_action_id,
        cwd=tmp_path,
    )

    assert result["status"] == "READY_FOR_FOUNDER_SAFE_MERGE"
    assert result["approval_decision"] == "REAPPROVAL_REQUIRED"
    assert result["replacement_target_head"] == "baseline-b"
    old_execution, _ = execution_registry.get_execution_session(old_execution_id)
    assert old_execution.status == "blocked"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-refresh-merge").one()
    queue = state.discovery["founder_action_queue"]
    old = next(item for item in queue if item["action_id"] == old_action_id)
    replacement = next(item for item in queue if item["action_id"] == result["replacement_action_id"])
    assert old["status"] == "superseded"
    assert replacement["status"] == "pending"
    assert replacement["metadata"]["target_head"] == "baseline-b"
    assert replacement["metadata"]["refreshed_validation_status"] == "PASS"
    assert state.discovery["autonomous_development_mission"]["current_stage"] == "WAITING_MERGE_APPROVAL"


def test_historical_safe_merge_refresh_does_not_duplicate_replacement_action(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-refresh-merge-duplicate")
    mission_id = "mission-refresh-dup"
    old_action_id = "safe-merge:mission-refresh-dup:safe-merge"
    mission = {"mission_id": mission_id, "conversation_id": "conv-refresh-merge-duplicate", "status": "WAITING_MERGE_APPROVAL", "current_stage": "WAITING_MERGE_APPROVAL", "working_branch": "feature/sino-mission-refresh-dup", "baseline_branch": runtime.SAFE_MERGE_TARGET_BRANCH, "baseline_head": "baseline-a", "checkpoint_head": "checkpoint-head", "verification_plan": []}
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-refresh-merge-duplicate").one()
        state.discovery = {"autonomous_development_missions": {mission_id: mission}, "autonomous_development_mission": mission, "founder_action_queue": [{"action_id": old_action_id, "action_type": runtime.SAFE_MERGE_QUEUE_TYPE, "type": runtime.SAFE_MERGE_QUEUE_TYPE, "status": "approved", "mission_id": mission_id}]}
        db.commit()
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda ref, **_kwargs: "checkpoint-head" if ref == "feature/sino-mission-refresh-dup" else "baseline-b")
    monkeypatch.setattr(runtime, "_candidate_merge_validation", lambda **_kwargs: {"status": "PASS", "source_head": "checkpoint-head", "target_head": "baseline-b", "merge_base": "baseline-a", "verification": []})
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request(source_branch="feature/sino-mission-refresh-dup", source_head="checkpoint-head", target_head="baseline-b", target_head_before="baseline-b", checkpoint_head="checkpoint-head", source_checkpoint_head="checkpoint-head", source_verification_status="PASS", allow_unpushed_source_after_checkpoint=True))

    first = runtime.refresh_historical_safe_merge(conversation_id="conv-refresh-merge-duplicate", mission_id=mission_id, action_id=old_action_id, cwd=tmp_path)
    second = runtime.refresh_historical_safe_merge(conversation_id="conv-refresh-merge-duplicate", mission_id=mission_id, action_id=old_action_id, cwd=tmp_path)

    assert second["replacement_action_id"] == first["replacement_action_id"]
    with factory() as db:
        queue = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-refresh-merge-duplicate").one().discovery["founder_action_queue"]
    assert sum(1 for item in queue if item["action_id"] == first["replacement_action_id"]) == 1


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
    execution_record = execution_registry.get_execution_session(approved["execution_id"])
    assert execution_record is not None
    execution, package = execution_record
    assert execution.executor == "LOCAL_EXECUTOR"
    assert package.context["operation_type"] == runtime.SAFE_MERGE
    assert package.execution_allowed is False
    assert execution_worker._is_worker_managed_execution(package) is False
    assert any("本地安全合并完成" in item.content for item in messages)


def test_queued_safe_merge_dispatches_canonical_handler_and_reuses_execution(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-dispatch")
    action_id = "safe-merge-refresh:dispatch"
    source_message_id = "message-safe-merge-dispatch"
    preflight = _safe_merge_request(source_branch="feature/sino-dispatch", source_head="source-head")
    task = runtime.create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=SAFE_MERGE_REQUEST,
        conversation_id="conv-safe-merge-dispatch",
        source_message_id=source_message_id,
        scope=runtime._safe_merge_task_scope(
            founder_request=SAFE_MERGE_REQUEST,
            conversation_id="conv-safe-merge-dispatch",
            source_message_id=source_message_id,
            action_id=action_id,
            merge_request=preflight,
        ),
        status="in_progress",
        approval_status="approved",
        execution_status="queued",
    )
    execution_id = runtime._stable_execution_id(task.id, source_message_id)
    package = runtime._execution_package(task=task, execution_id=execution_id, risk={"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK})
    package.context.update({
        "operation_type": runtime.SAFE_MERGE,
        "approval_action_id": action_id,
        "merge_request": preflight,
        "source_branch": preflight["source_branch"],
        "source_head": preflight["source_head"],
        "target_branch": preflight["target_branch"],
        "target_head_before": preflight["target_head_before"],
    })
    execution_registry.save_execution_session(runtime.ExecutionSession(
        id=execution_id,
        task_asset_id=task.id,
        execution_package_id=f"package-{execution_id}",
        executor="LOCAL_EXECUTOR",
        status="queued",
    ), package)
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [])
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: preflight)
    monkeypatch.setattr(runtime, "_git_is_ancestor", lambda ancestor, descendant, **_kwargs: False if descendant == "target-head" else descendant == "merge-head")
    monkeypatch.setattr(runtime, "_merge_parent_count", lambda _head, **_kwargs: 2)
    revs = ["target-head\n", "merge-head\n"]
    monkeypatch.setattr(runtime, "_git_output", lambda args, **_kwargs: SimpleNamespace(returncode=0, stdout=revs.pop(0) if args == ["rev-parse", "HEAD"] else "", stderr=""))

    result = runtime.dispatch_canonical_safe_merge_execution(
        execution_id,
        cwd=tmp_path,
        switcher=lambda _branch, _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
        merger=lambda _branch, _root: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )

    assert result["execution_id"] == execution_id
    assert result["status"] == "completed"
    assert result["result"]["merge_commit_created"] is True
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1
        assert db.query(TaskAssetDB).one().execution_status == "completed"
    execution, package = execution_registry.get_execution_session(execution_id)
    assert execution.status == "completed"
    assert any((event.get("metadata") or {}).get("safe_merge_handler_started") for event in execution.events)
    assert package.execution_allowed is False
    assert execution_worker._is_worker_managed_execution(package) is False


def test_safe_merge_approval_reuses_active_execution_for_same_action_source_target(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-active-reuse")
    action_id = "safe-merge-refresh:active-reuse"
    source_message_id = "message-safe-merge-active-reuse"
    preflight = _safe_merge_request(source_branch="feature/sino-reuse", source_head="source-head", target_head="target-head", target_head_before="target-head")
    task = runtime.create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=SAFE_MERGE_REQUEST,
        conversation_id="conv-safe-merge-active-reuse",
        source_message_id=source_message_id,
        scope=runtime._safe_merge_task_scope(
            founder_request=SAFE_MERGE_REQUEST,
            conversation_id="conv-safe-merge-active-reuse",
            source_message_id=source_message_id,
            action_id=action_id,
            merge_request=preflight,
        ),
        status="in_progress",
        approval_status="approved",
        execution_status="queued",
    )
    execution_id = runtime._stable_execution_id(task.id, source_message_id)
    package = runtime._execution_package(task=task, execution_id=execution_id, risk={"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK})
    package.context.update({"operation_type": runtime.SAFE_MERGE, "approval_action_id": action_id, "merge_request": preflight})
    execution_registry.save_execution_session(runtime.ExecutionSession(
        id=execution_id,
        task_asset_id=task.id,
        execution_package_id=f"package-{execution_id}",
        executor="LOCAL_EXECUTOR",
        status="queued",
    ), package)
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("duplicate approval must not start preflight")))

    result = runtime.execute_safe_merge(
        conversation_id="conv-safe-merge-active-reuse",
        founder_request=SAFE_MERGE_REQUEST,
        source_message_id="message-safe-merge-active-retry",
        action_id=action_id,
        merge_request=preflight,
        cwd=tmp_path,
    )

    assert result["reused"] is True
    assert result["execution_id"] == execution_id
    assert result["status"] == "queued"
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def test_safe_merge_dispatcher_ignores_superseded_and_stale_queued_execution(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-stale")
    mission_id = "mission-safe-merge-stale"
    current_action_id = "safe-merge-refresh:current"
    stale_action_id = "safe-merge-refresh:stale"
    with runtime.SessionLocal() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-safe-merge-stale").one()
        mission = {
            "mission_id": mission_id,
            "conversation_id": "conv-safe-merge-stale",
            "status": "WAITING_MERGE_APPROVAL",
            "current_stage": "WAITING_MERGE_APPROVAL",
            "merge_action_id": current_action_id,
        }
        state.discovery = {
            "autonomous_development_missions": {mission_id: mission},
            "founder_action_queue": [
                {"action_id": stale_action_id, "action_type": runtime.SAFE_MERGE_QUEUE_TYPE, "type": runtime.SAFE_MERGE_QUEUE_TYPE, "status": "superseded", "mission_id": mission_id, "metadata": {"target_head": "old-target"}},
                {"action_id": current_action_id, "action_type": runtime.SAFE_MERGE_QUEUE_TYPE, "type": runtime.SAFE_MERGE_QUEUE_TYPE, "status": "approved", "mission_id": mission_id, "metadata": {"target_head": "new-target"}},
            ],
        }
        db.commit()
    task = runtime.create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=SAFE_MERGE_REQUEST,
        conversation_id="conv-safe-merge-stale",
        source_message_id="message-safe-merge-stale",
        scope=runtime._safe_merge_task_scope(
            founder_request=SAFE_MERGE_REQUEST,
            conversation_id="conv-safe-merge-stale",
            source_message_id="message-safe-merge-stale",
            action_id=stale_action_id,
            merge_request={"mission_id": mission_id, "source_head": "source-head", "target_head_before": "old-target"},
        ),
        status="in_progress",
        approval_status="approved",
        execution_status="queued",
    )
    execution_id = runtime._stable_execution_id(task.id, "message-safe-merge-stale")
    package = runtime._execution_package(task=task, execution_id=execution_id, risk={"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK})
    package.context.update({"operation_type": runtime.SAFE_MERGE, "approval_action_id": stale_action_id, "merge_request": {"mission_id": mission_id, "source_head": "source-head", "target_head_before": "old-target"}})
    execution_registry.save_execution_session(runtime.ExecutionSession(id=execution_id, task_asset_id=task.id, execution_package_id=f"package-{execution_id}", executor="LOCAL_EXECUTOR", status="queued"), package)
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("stale queued execution must not start preflight")))

    result = runtime.dispatch_canonical_safe_merge_execution(execution_id, cwd=tmp_path)

    assert result["handled"] is False
    assert result["queue_block_gate"] == "SUPERSEDED_SAFE_MERGE_ACTION"
    execution, _package = execution_registry.get_execution_session(execution_id)
    assert execution.status == "queued"


def test_temp_repo_queued_safe_merge_dispatch_runs_canonical_no_ff_merge(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-dispatch-real")
    repo = tmp_path / "safe-merge-dispatch-repo"
    repo.mkdir()

    def git(*args):
        return runtime.subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, check=True)

    git("init")
    git("config", "user.email", "sino@example.test")
    git("config", "user.name", "Sino Test")
    (repo / "fixture.txt").write_text("PENDING\n")
    git("add", "fixture.txt")
    git("commit", "-m", "baseline")
    git("branch", "-M", runtime.SAFE_MERGE_TARGET_BRANCH)

    mission_branch = "feature/sino-safe-merge-dispatch-real"
    assert runtime._git_safe_create_branch(mission_branch, cwd=repo, start_point=runtime.SAFE_MERGE_TARGET_BRANCH).returncode == 0
    (repo / "fixture.txt").write_text("OK\n")
    git("add", "fixture.txt")
    git("commit", "-m", "fix fixture")
    source_head = runtime._git_rev_parse(mission_branch, cwd=repo)
    target_head = runtime._git_rev_parse(runtime.SAFE_MERGE_TARGET_BRANCH, cwd=repo)
    merge_request = {
        "source_branch": mission_branch,
        "source_head": source_head,
        "source_remote": "origin",
        "source_remote_head": None,
        "target_branch": runtime.SAFE_MERGE_TARGET_BRANCH,
        "target_head_before": target_head,
        "target_remote": "origin",
        "target_remote_head_before": None,
        "merge_strategy": "no_ff",
        "push_after_merge": False,
        "auto_conflict_resolution": False,
        "allow_unpushed_source_after_checkpoint": True,
        "source_checkpoint_head": source_head,
        "source_verification_status": "PASS",
    }
    action_id = "safe-merge-refresh:dispatch-real"
    source_message_id = "message-safe-merge-dispatch-real"
    task = runtime.create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=SAFE_MERGE_REQUEST,
        conversation_id="conv-safe-merge-dispatch-real",
        source_message_id=source_message_id,
        scope=runtime._safe_merge_task_scope(
            founder_request=SAFE_MERGE_REQUEST,
            conversation_id="conv-safe-merge-dispatch-real",
            source_message_id=source_message_id,
            action_id=action_id,
            merge_request=merge_request,
        ),
        status="in_progress",
        approval_status="approved",
        execution_status="queued",
    )
    execution_id = runtime._stable_execution_id(task.id, source_message_id)
    package = runtime._execution_package(task=task, execution_id=execution_id, risk={"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK})
    package.context.update({"operation_type": runtime.SAFE_MERGE, "approval_action_id": action_id, "merge_request": merge_request})
    execution_registry.save_execution_session(runtime.ExecutionSession(id=execution_id, task_asset_id=task.id, execution_package_id=f"package-{execution_id}", executor="LOCAL_EXECUTOR", status="queued"), package)

    result = runtime.dispatch_canonical_safe_merge_execution(execution_id, cwd=repo)

    assert result["execution_id"] == execution_id
    assert result["status"] == "completed"
    assert result["result"]["merge_commit_created"] is True
    assert runtime._git_output(["branch", "--show-current"], cwd=repo).stdout.strip() == runtime.SAFE_MERGE_TARGET_BRANCH
    merge_head = runtime._git_rev_parse(runtime.SAFE_MERGE_TARGET_BRANCH, cwd=repo)
    assert runtime._git_is_ancestor(source_head, merge_head, cwd=repo)
    assert runtime._git_is_ancestor(target_head, merge_head, cwd=repo)
    assert runtime._merge_parent_count(merge_head, cwd=repo) == 2
    assert runtime._git_status_short(cwd=repo) == []
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def test_queued_safe_merge_dispatch_defers_when_product_tree_dirty(monkeypatch, tmp_path):
    _runtime(monkeypatch, tmp_path, conversation_id="conv-safe-merge-dirty-dispatch")
    action_id = "safe-merge-refresh:dirty"
    source_message_id = "message-safe-merge-dirty"
    preflight = _safe_merge_request()
    task = runtime.create_task_asset(
        title="本地安全合并 feature 到 integration",
        description=SAFE_MERGE_REQUEST,
        conversation_id="conv-safe-merge-dirty-dispatch",
        source_message_id=source_message_id,
        scope=runtime._safe_merge_task_scope(
            founder_request=SAFE_MERGE_REQUEST,
            conversation_id="conv-safe-merge-dirty-dispatch",
            source_message_id=source_message_id,
            action_id=action_id,
            merge_request=preflight,
        ),
        status="in_progress",
        approval_status="approved",
        execution_status="queued",
    )
    execution_id = runtime._stable_execution_id(task.id, source_message_id)
    package = runtime._execution_package(task=task, execution_id=execution_id, risk={"operation_type": runtime.SAFE_MERGE, "risk_level": runtime.HIGH_RISK})
    package.context.update({"operation_type": runtime.SAFE_MERGE, "approval_action_id": action_id, "merge_request": preflight})
    execution_registry.save_execution_session(runtime.ExecutionSession(id=execution_id, task_asset_id=task.id, execution_package_id=f"package-{execution_id}", executor="LOCAL_EXECUTOR", status="queued"), package)
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [" M backend/app/founder_ai/operational_runtime.py"])
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("preflight must not run while product fix is dirty")))

    result = runtime.dispatch_canonical_safe_merge_execution(execution_id, cwd=tmp_path)

    assert result["handled"] is False
    assert result["queue_block_gate"] == "WORKING_TREE_NOT_CLEAN"
    execution, _package = execution_registry.get_execution_session(execution_id)
    assert execution.status == "queued"


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


def _prepare_mission_start(monkeypatch, *, branch_created=None, baseline_branch="feature/foundation-reset-integration"):
    branch_created = branch_created if branch_created is not None else []
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [])
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch == runtime.SAFE_MERGE_TARGET_BRANCH)

    def git_output(args, **_kwargs):
        if args == ["branch", "--show-current"]:
            return SimpleNamespace(returncode=0, stdout=f"{baseline_branch}\n", stderr="")
        if args == ["rev-parse", runtime.SAFE_MERGE_TARGET_BRANCH]:
            return SimpleNamespace(returncode=0, stdout="baseline-head\n", stderr="")
        if args == ["rev-parse", "HEAD"]:
            return SimpleNamespace(returncode=0, stdout="baseline-head\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime, "_git_output", git_output)

    def create_branch(branch, *, cwd, start_point=None, timeout=30):
        branch_created.append((branch, cwd, start_point, timeout))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime, "_git_safe_create_branch", create_branch)
    return branch_created


def _latest_mission(factory, conversation_id):
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).one()
        discovery = dict(state.discovery or {})
        return discovery["autonomous_development_mission"], discovery


def _pending_action(discovery, action_type):
    return next(
        item for item in discovery.get("founder_action_queue", [])
        if item.get("action_type") == action_type and item.get("status") == "pending"
    )


@pytest.mark.parametrize(
    ("stage", "label"),
    [
        ("PLANNING", "正在规划"),
        ("WAITING_CHANGE_APPROVAL", "等待你批准代码修改"),
        ("CHANGING", "正在修改代码"),
        ("VERIFYING", "正在验证"),
        ("CHECKPOINTING", "正在创建本地 checkpoint"),
        ("WAITING_FEATURE_PUSH_APPROVAL", "等待你批准推送 feature branch"),
        ("PUSHING_FEATURE", "正在推送 feature branch"),
        ("WAITING_MERGE_APPROVAL", "等待你批准合并到 integration"),
        ("MERGING", "正在本地合并"),
        ("WAITING_INTEGRATION_PUSH_APPROVAL", "等待你批准推送 integration branch"),
        ("PUSHING_INTEGRATION", "正在推送 integration"),
        ("COMPLETED", "已完成"),
        ("FAILED", "失败"),
        ("BLOCKED", "已阻塞"),
    ],
)
def test_mission_projection_returns_founder_friendly_stage_labels(stage, label):
    view = runtime.build_mission_view({"mission_id": "mission-view", "founder_request": "Goal", "status": stage, "current_stage": stage})
    assert view["stage_label"] == label
    assert view["stage"] == stage
    assert view["timeline"]


def test_mission_projection_timeline_progress_and_pending_approval_reference():
    mission = {
        "mission_id": "mission-view",
        "founder_request": "Goal",
        "status": "WAITING_FEATURE_PUSH_APPROVAL",
        "current_stage": "WAITING_FEATURE_PUSH_APPROVAL",
        "working_branch": "feature/sino-mission-goal",
        "baseline_branch": "feature/foundation-reset-integration",
        "baseline_head": "baseline-head",
        "checkpoint_head": "checkpoint-head",
        "risk_level": "MEDIUM",
    }
    queue = [{
        "action_id": "safe-push:mission-view",
        "action_type": runtime.SAFE_PUSH_QUEUE_TYPE,
        "status": "pending",
        "risk_level": "HIGH",
        "title": "批准推送",
        "metadata": {"mission_id": "mission-view", "local_branch": "feature/sino-mission-goal"},
    }]
    view = runtime.build_mission_view(mission, queue)
    assert view["stage_label"] == "等待你批准推送 feature branch"
    assert view["progress"]["completed"] == 4
    assert view["progress"]["total"] == 7
    assert view["timeline"][4]["status"] == "waiting_approval"
    assert view["pending_approval"]["action_id"] == "safe-push:mission-view"
    assert view["pending_approval"]["label"] == "批准推送 feature branch"
    assert "不会 force" in view["pending_approval"]["will_not_do"]
    assert view["current_work_summary"][0] == "目标：Goal"


def test_mission_projection_summaries_completion_failure_and_blocked():
    mission = {
        "mission_id": "mission-summary",
        "founder_request": "Improve mission card",
        "status": "COMPLETED",
        "current_stage": "COMPLETED",
        "working_branch": "feature/sino-mission-card",
        "baseline_head": "baseline-head",
        "last_completed_step": "PUSHING_INTEGRATION",
        "change_result": {
            "changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
            "check_result": "PASS",
            "verification_steps": [
                {"argv": ["npm", "test"], "success": True, "check_result": "PASS", "passed": 36, "failed": 0, "errors": 0},
                {"argv": ["npm", "run", "build"], "success": True, "check_result": "PASS"},
            ],
            "checkpoint": {"commit_message": "fix: copy", "new_head": "checkpoint-head", "commit_file_count": 1, "working_tree_clean_after": True},
        },
        "feature_push_result": {"local_branch": "feature/sino-mission-card", "remote_name": "origin", "remote_branch": "feature/sino-mission-card", "new_remote_head": "checkpoint-head", "ahead_before": 1, "force_used": False},
        "merge_result": {"source_branch": "feature/sino-mission-card", "target_branch": "feature/foundation-reset-integration", "merge_commit_head": "merge-head", "conflict": False, "push_performed": False},
        "integration_push_result": {"integration_branch": "feature/foundation-reset-integration", "remote_name": "origin", "remote_head_after": "merge-head", "success": True},
        "final_integration_head": "merge-head",
    }
    view = runtime.build_mission_view(mission)
    assert view["changed_files"]["items"][0]["boundary"] == "approved"
    assert view["verification_summary"]["passed"] == 36
    assert view["verification_summary"]["build_status"] == "PASS"
    assert view["checkpoint_summary"]["commit_head"] == "checkpoint-head"
    assert view["feature_push_summary"]["force"] == "NO"
    assert view["merge_summary"]["strategy"] == "--no-ff"
    assert view["integration_push_summary"]["remote_updated"] == "YES"
    assert view["completion_summary"]["final_integration_head"] == "merge-head"

    failed = runtime.build_mission_view({**mission, "status": "FAILED", "current_stage": "FAILED", "failed_stage": "VERIFYING", "failure_type": "VERIFICATION_FAILED", "failure_summary": "2 tests failed"})
    assert failed["failure_summary"]["failed_stage"] == "正在验证"
    assert failed["failure_summary"]["failure_type"] == "VERIFICATION_FAILED"
    blocked = runtime.build_mission_view({**mission, "status": "BLOCKED", "current_stage": "BLOCKED", "failed_stage": "PUSHING_INTEGRATION", "failure_type": "REMOTE_STATE_CHANGED", "failure_summary": "remote changed"})
    assert blocked["stage_label"] == "已阻塞"
    assert blocked["failure_summary"]["failure_type"] == "REMOTE_STATE_CHANGED"


def test_autonomous_development_mission_creates_branch_and_waits_for_change_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission")
    branch_created = _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(runtime, "run_bounded_code_change", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("code executor must wait for approval")))
    decision = runtime.classify_operational_risk(MISSION_REQUEST)
    assert decision["operation_type"] == runtime.AUTONOMOUS_DEVELOPMENT_MISSION
    assert decision["risk_level"] == "MEDIUM"
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission",
    )
    mission, discovery = _latest_mission(factory, "conv-mission")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert result["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert mission["status"] == "WAITING_CHANGE_APPROVAL"
    assert mission["mission_type"] == "CONTROLLED_DEVELOPMENT"
    assert mission["source_message_id"] == "message-mission"
    assert mission["acknowledgement_message_id"]
    assert mission["baseline_head"] == "baseline-head"
    assert mission["baseline_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert mission["working_branch"].startswith("feature/sino-mission-")
    assert branch_created[0][0] == mission["working_branch"]
    assert branch_created[0][2] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert action["metadata"]["mission_id"] == mission["mission_id"]
    assert action["metadata"]["working_branch"] == mission["working_branch"]
    assert action["metadata"]["plan"]["auto_checkpoint"] is True
    assert discovery["autonomous_development_mission_view"]["stage_label"] == "等待你批准代码修改"
    assert discovery["autonomous_development_mission_view"]["source_message_id"] == "message-mission"
    assert discovery["autonomous_development_mission_view"]["acknowledgement_message_id"] == mission["acknowledgement_message_id"]
    assert discovery["autonomous_development_mission_view"]["pending_approval"]["action_id"] == action["action_id"]
    sidebar_actions = action_queue.list_founder_action_queue("conv-mission")
    assert [item["action_id"] for item in sidebar_actions] == [action["action_id"]]
    assert sidebar_actions[0]["metadata"]["mission_id"] == mission["mission_id"]
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-mission").order_by(ConversationMessageDB.created_at.asc()).all()
    assert [message.id for message in messages][-1] == mission["acknowledgement_message_id"]
    assert messages[-1].role == "assistant"
    assert messages[-1].message_type == "operational_approval_required"
    assert len(execution_registry._sessions) == 0


def test_new_mission_baseline_uses_configured_integration_not_current_shell_branch(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-baseline")
    branch_created = _prepare_mission_start(monkeypatch, baseline_branch="feature/sino-old-mission")
    result = runtime.start_autonomous_development_mission("conv-mission-baseline", MISSION_REQUEST, "message-mission-baseline")
    mission, _discovery = _latest_mission(factory, "conv-mission-baseline")
    assert result["status"] == "approval_required"
    assert mission["baseline_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert mission["baseline_head"] == "baseline-head"
    assert mission["working_branch"] != "feature/sino-old-mission"
    assert branch_created[0][2] == runtime.SAFE_MERGE_TARGET_BRANCH


def test_previous_unintegrated_mission_defers_new_development_and_surfaces_merge_guidance(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-next")
    with factory() as db:
        db.add(ConversationDB(id="conv-previous-unintegrated", system_id="founder_ai", title="Previous"))
        db.add(SinoBrainSessionDB(conversation_id="conv-previous-unintegrated", discovery={
            "autonomous_development_missions": {
                "mission-prev": {
                    "mission_id": "mission-prev",
                    "conversation_id": "conv-previous-unintegrated",
                    "status": "WAITING_MERGE_APPROVAL",
                    "current_stage": "WAITING_MERGE_APPROVAL",
                    "working_branch": "feature/sino-mission-prev",
                    "baseline_branch": runtime.SAFE_MERGE_TARGET_BRANCH,
                    "merge_action_id": "safe-merge:mission-prev:safe-merge",
                    "updated_at": "2026-09-03T00:00:00+00:00",
                }
            }
        }))
        db.commit()
    monkeypatch.setattr(runtime, "_git_status_short", lambda **_kwargs: [" M frontend/src/sino-founder/ConversationThread.jsx"])
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch == runtime.SAFE_MERGE_TARGET_BRANCH)
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda branch, **_kwargs: "baseline-head" if branch == runtime.SAFE_MERGE_TARGET_BRANCH else None)

    def git_output(args, **_kwargs):
        if args == ["branch", "--show-current"]:
            return SimpleNamespace(returncode=0, stdout="feature/sino-mission-prev\n", stderr="")
        if args == ["rev-parse", runtime.SAFE_MERGE_TARGET_BRANCH]:
            return SimpleNamespace(returncode=0, stdout="baseline-head\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(runtime, "_git_output", git_output)
    monkeypatch.setattr(runtime, "_git_safe_create_branch", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("new branch must not be created before previous mission is integrated")))
    result = runtime.start_autonomous_development_mission("conv-mission-next", MISSION_REQUEST, "message-mission-next")
    mission, _discovery = _latest_mission(factory, "conv-mission-next")
    assert result["status"] == "blocked"
    assert mission["failure_type"] == "PREVIOUS_MISSION_NOT_INTEGRATED"
    assert mission["baseline_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert mission["previous_mission_id"] == "mission-prev"
    assert mission["previous_merge_action_id"] == "safe-merge:mission-prev:safe-merge"


@pytest.mark.parametrize(
    "request_text",
    [
        "把按钮A改成B并验证。",
        "修复右侧状态不同步并验证。",
        "修改这个文件里的状态文案。",
        "把这个状态卡标题改成更清楚的标题。",
    ],
)
def test_clear_bounded_development_defaults_to_autonomous_mission(monkeypatch, tmp_path, request_text):
    factory = _runtime(monkeypatch, tmp_path, conversation_id=f"conv-default-{abs(hash(request_text))}")
    _prepare_mission_start(monkeypatch)
    decision = runtime.classify_operational_risk(request_text)
    assert decision["operation_type"] == runtime.AUTONOMOUS_DEVELOPMENT_MISSION
    assert decision["reason"] == "clear_bounded_development_request"
    assert decision["approval_required"] is True

    result = runtime.handle_operational_conversation_request(
        conversation_id=f"conv-default-{abs(hash(request_text))}",
        founder_request=request_text,
        source_message_id=f"message-default-{abs(hash(request_text))}",
    )
    mission, discovery = _latest_mission(factory, f"conv-default-{abs(hash(request_text))}")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert result["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert action["metadata"]["mission_id"] == mission["mission_id"]
    assert discovery["autonomous_development_mission_view"]["pending_approval"]["action_id"] == action["action_id"]
    assert len(execution_registry._sessions) == 0


def test_clear_development_bypasses_legacy_readiness_and_task_confirmation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-default-api")
    _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(api.secretary, "_reply_generator", lambda *_args: (_ for _ in ()).throw(AssertionError("provider must not be called")))

    response = api.discuss_with_sino(
        "conv-default-api",
        api.DiscussionMessageIn(content="把按钮A改成B并验证。", client_message_id="client-default-api"),
    )

    discovery = response["sino_brain"]["discovery"]
    assert discovery["autonomous_development_mission"]["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert "task_candidate" not in discovery
    assert not discovery.get("task_confirmation")
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-default-api").order_by(ConversationMessageDB.created_at.asc()).all()
    assert messages[0].role == "founder"
    assert messages[-1].message_type == "operational_approval_required"


def test_clear_development_requires_approval_and_auto_resume_preserves_codex_scope_verification_and_checkpoint(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-default-auto-resume")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-default-auto-resume",
        founder_request="修复右侧状态不同步并验证。",
        source_message_id="message-default-auto-resume",
    )
    captured = {}

    def execute_change(**kwargs):
        captured["approval_action_id"] = kwargs["action_id"]
        captured["operation_type"] = runtime.BOUNDED_CODE_CHANGE
        return {
            "handled": True,
            "status": "completed",
            "result": {
                "operation_type": runtime.BOUNDED_CODE_CHANGE,
                "executor": runtime.CODEX_EXECUTOR,
                "success": True,
                "changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
                "changed_files_observed": ["frontend/src/sino-founder/ConversationThread.jsx"],
                "boundary_check": "PASS",
                "scope_check": {"expected_scope": ["frontend/src/sino-founder"]},
                "check_result": "PASS",
                "verification_steps": [{"success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}],
                "checkpoint": {"success": True, "new_head": "checkpoint-head", "commit_message": "fix: default path", "commit_file_count": 1, "working_tree_clean_after": True},
            },
        }

    monkeypatch.setattr(runtime, "execute_bounded_code_change", execute_change)
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request(
        source_branch="feature/sino-mission-status-sync",
        source_head="checkpoint-head",
        checkpoint_head="checkpoint-head",
    ))
    approved = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-default-auto-resume")
    assert approved["status"] == "completed"
    assert captured["operation_type"] == runtime.BOUNDED_CODE_CHANGE
    assert mission["current_stage"] == "WAITING_MERGE_APPROVAL"
    assert mission["checkpoint_head"] == "checkpoint-head"
    merge_action = _pending_action(discovery, runtime.SAFE_MERGE_QUEUE_TYPE)
    assert merge_action["metadata"]["mission_id"] == mission["mission_id"]
    assert merge_action["metadata"]["merge_request"]["allow_unpushed_source_after_checkpoint"] is True


@pytest.mark.parametrize(
    ("request_text", "expected_reason"),
    [
        ("我们讨论一下设置页面应该怎么优化。", "discussion_or_inspection_request_not_development_default"),
        ("这段代码是什么意思？", "discussion_or_inspection_request_not_development_default"),
    ],
)
def test_non_development_requests_do_not_enter_default_mission(request_text, expected_reason):
    decision = runtime.classify_operational_risk(request_text)
    assert decision.get("operation_type") != runtime.AUTONOMOUS_DEVELOPMENT_MISSION
    assert decision["reason"] == expected_reason


def test_ambiguous_development_request_requires_clarification(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-ambiguous-default")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-ambiguous-default",
        founder_request="改一下。",
        source_message_id="message-ambiguous-default",
    )
    assert result["status"] == "clarification_required"
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-ambiguous-default").one()
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-ambiguous-default").all()
    assert "autonomous_development_mission" not in dict(state.discovery or {})
    assert any("修改哪个具体目标" in item.content for item in messages)


def test_production_and_force_push_do_not_enter_development_default_path():
    for request_text in ("部署到生产环境。", "force push main。"):
        decision = runtime.classify_operational_risk(request_text)
        assert decision.get("operation_type") != runtime.AUTONOMOUS_DEVELOPMENT_MISSION
        assert decision["risk_level"] == runtime.HIGH_RISK


def test_discussion_development_and_failure_repair_requests_transition_to_mission(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-transition-default")
    _prepare_mission_start(monkeypatch)
    discussion = runtime.handle_operational_conversation_request(
        conversation_id="conv-transition-default",
        founder_request="我们讨论一下右侧栏怎么优化。",
        source_message_id="message-discussion-default",
    )
    assert discussion["status"] == "discussion"

    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-transition-default",
        founder_request="就按刚才方案修改，并验证。",
        source_message_id="message-transition-default",
    )
    mission, discovery = _latest_mission(factory, "conv-transition-default")
    assert result["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)

    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-failure-repair-default")
    _prepare_mission_start(monkeypatch)
    repair = runtime.handle_operational_conversation_request(
        conversation_id="conv-failure-repair-default",
        founder_request="修复刚才这个问题。",
        source_message_id="message-failure-repair-default",
    )
    mission, _discovery = _latest_mission(factory, "conv-failure-repair-default")
    assert repair["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"


def test_inspection_like_development_request_auto_reaches_mission_without_manual_continue(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-inspection-transition-default")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-inspection-transition-default",
        founder_request="修复这个页面审批状态不同步的问题。",
        source_message_id="message-inspection-transition-default",
    )
    mission, discovery = _latest_mission(factory, "conv-inspection-transition-default")
    assert result["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert mission["working_branch"].startswith("feature/sino-mission-")
    assert _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)


def test_routing_acceptance_fixture_can_start_from_default_path_product_branch(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-routing-acceptance-default")
    _prepare_mission_start(monkeypatch, baseline_branch="feature/sino-live-development-default-path-v1")
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-routing-acceptance-default",
        founder_request="把 Live Routing fixture 的内容改成 ROUTING_OK，并验证。",
        source_message_id="message-routing-acceptance-default",
    )
    mission, discovery = _latest_mission(factory, "conv-routing-acceptance-default")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert result["status"] == "approval_required"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert mission["allowed_files"] == ["frontend/src/sino-founder/live-routing-fixture.txt"]
    assert mission["routing_acceptance_mode"] is True
    assert action["risk_level"] == "MEDIUM"
    assert len(execution_registry._sessions) == 0


def test_mission_waiting_change_approval_queue_exists_before_natural_language_approval(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-queue-now")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-queue-now",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-queue-now",
    )
    mission, discovery = _latest_mission(factory, "conv-mission-queue-now")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    sidebar_actions = action_queue.list_founder_action_queue("conv-mission-queue-now")
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert action["action_id"] == result["action_id"]
    assert sidebar_actions[0]["action_id"] == action["action_id"]
    assert discovery["autonomous_development_mission_view"]["pending_approval"]["action_id"] == action["action_id"]


def test_same_mission_retry_reuses_existing_working_branch_without_duplicate_creation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-retry")
    mission_id = runtime._mission_id("message-mission-retry")
    base_branch = runtime._mission_branch_name(MISSION_REQUEST, mission_id)
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-mission-retry").one()
        state.discovery = {"autonomous_development_missions": {mission_id: {
            "mission_id": mission_id,
            "conversation_id": "conv-mission-retry",
            "founder_request": MISSION_REQUEST,
            "status": "WAITING_CHANGE_APPROVAL",
            "current_stage": "WAITING_CHANGE_APPROVAL",
            "working_branch": base_branch,
        }}}
        db.commit()
    branch_created = _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH})
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda branch, **_kwargs: "baseline-head" if branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH} else None)
    monkeypatch.setattr(runtime, "_branch_unique_commit_count", lambda branch, baseline_head, **_kwargs: 0)
    result = runtime.start_autonomous_development_mission("conv-mission-retry", MISSION_REQUEST, "message-mission-retry")
    mission, discovery = _latest_mission(factory, "conv-mission-retry")
    assert result["status"] == "approval_required"
    assert mission["working_branch"] == base_branch
    assert mission["branch_resolution"]["strategy"] == "same_mission_retry_reuse"
    assert branch_created == []
    assert len([item for item in discovery.get("founder_action_queue", []) if item.get("action_type") == runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE]) == 1


def test_new_mission_same_request_gets_unique_branch_and_queue_when_previous_branch_exists(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-collision")
    mission_id = runtime._mission_id("message-mission-collision")
    base_branch = runtime._mission_branch_name(MISSION_REQUEST, mission_id)
    branch_created = _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH})
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda branch, **_kwargs: "baseline-head" if branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH} else None)
    monkeypatch.setattr(runtime, "_branch_unique_commit_count", lambda branch, baseline_head, **_kwargs: 0)
    result = runtime.start_autonomous_development_mission("conv-mission-collision", MISSION_REQUEST, "message-mission-collision")
    mission, discovery = _latest_mission(factory, "conv-mission-collision")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert result["status"] == "approval_required"
    assert mission["working_branch"].startswith(f"{base_branch}-")
    assert mission["branch_resolution"]["strategy"] == "stale_empty_branch_unique_successor"
    assert branch_created[0][0] == mission["working_branch"]
    assert action["metadata"]["mission_id"] == mission["mission_id"]
    assert [item["action_id"] for item in action_queue.list_founder_action_queue("conv-mission-collision")] == [action["action_id"]]


def test_active_mission_branch_collision_gets_unique_branch_without_deleting_active_branch(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-active-collision")
    with factory() as db:
        db.add(ConversationDB(id="conv-active-branch-owner", system_id="founder_ai", title="Active"))
        db.add(SinoBrainSessionDB(conversation_id="conv-active-branch-owner", discovery={}))
        db.commit()
    mission_id = runtime._mission_id("message-mission-active-collision")
    base_branch = runtime._mission_branch_name(MISSION_REQUEST, mission_id)
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-active-branch-owner").one()
        state.discovery = {"autonomous_development_missions": {"mission-active-owner": {
            "mission_id": "mission-active-owner",
            "conversation_id": "conv-active-branch-owner",
            "status": "WAITING_CHANGE_APPROVAL",
            "current_stage": "WAITING_CHANGE_APPROVAL",
            "working_branch": base_branch,
        }}}
        db.commit()
    branch_created = _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH})
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda branch, **_kwargs: "baseline-head" if branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH} else None)
    monkeypatch.setattr(runtime, "_branch_unique_commit_count", lambda branch, baseline_head, **_kwargs: 0)
    runtime.start_autonomous_development_mission("conv-mission-active-collision", MISSION_REQUEST, "message-mission-active-collision")
    mission, _discovery = _latest_mission(factory, "conv-mission-active-collision")
    assert mission["working_branch"].startswith(f"{base_branch}-")
    assert mission["branch_resolution"]["strategy"] == "unique_successor"
    assert mission["branch_resolution"]["active_mission"]["mission_id"] == "mission-active-owner"
    assert branch_created[0][0] == mission["working_branch"]


@pytest.mark.parametrize(
    ("branch_head", "unique_commits"),
    [("baseline-head", 2), ("different-head", 0)],
)
def test_existing_branch_with_history_or_mismatched_head_gets_unique_successor(monkeypatch, tmp_path, branch_head, unique_commits):
    _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-history-collision")
    mission_id = runtime._mission_id("message-mission-history-collision")
    base_branch = runtime._mission_branch_name(MISSION_REQUEST, mission_id)
    _prepare_mission_start(monkeypatch)
    monkeypatch.setattr(runtime, "_git_branch_exists", lambda branch, **_kwargs: branch in {base_branch, runtime.SAFE_MERGE_TARGET_BRANCH})
    monkeypatch.setattr(runtime, "_git_rev_parse", lambda branch, **_kwargs: branch_head if branch == base_branch else ("baseline-head" if branch == runtime.SAFE_MERGE_TARGET_BRANCH else None))
    monkeypatch.setattr(runtime, "_branch_unique_commit_count", lambda branch, baseline_head, **_kwargs: unique_commits)
    resolution = runtime._resolve_mission_working_branch(MISSION_REQUEST, mission_id, "baseline-head", cwd=runtime.repo_root())
    assert resolution["working_branch"].startswith(f"{base_branch}-")
    assert resolution["strategy"] == "unique_successor"
    assert resolution["existing_branch_head"] == branch_head
    assert resolution["existing_branch_unique_commits"] == unique_commits


def test_mission_natural_language_approval_resolves_existing_action_without_duplicate(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-existing-approval")
    _prepare_mission_start(monkeypatch)
    request = "把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。"
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-existing-approval",
        founder_request=request,
        source_message_id="message-mission-existing-approval",
    )
    assert len(action_queue.list_founder_action_queue("conv-mission-existing-approval")) == 1
    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "handled": True,
        "status": "completed",
        "result": {
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "success": True,
            "live_acceptance_mode": True,
            "changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "boundary_check": "PASS",
            "check_result": "PASS",
            "verification_steps": [{"success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}],
        },
    })
    approved = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    with factory() as db:
        discovery = dict(db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-mission-existing-approval").one().discovery or {})
    matching = [item for item in discovery.get("founder_action_queue", []) if item.get("action_id") == result["action_id"]]
    assert approved["status"] == "completed"
    assert len(matching) == 1
    assert matching[0]["status"] == "approved"
    assert action_queue.list_founder_action_queue("conv-mission-existing-approval") == []


def test_conversation_approval_shortcut_resolves_existing_action_instead_of_creating_task(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-shortcut")
    _prepare_mission_start(monkeypatch)
    mission_request = "把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。"
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-shortcut",
        founder_request=mission_request,
        source_message_id="message-mission-shortcut",
    )
    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "handled": True,
        "status": "completed",
        "result": {
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "success": True,
            "live_acceptance_mode": True,
            "changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "boundary_check": "PASS",
            "check_result": "PASS",
            "verification_steps": [{"success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}],
        },
    })
    snapshot = api.discuss_with_sino(
        "conv-mission-shortcut",
        api.DiscussionMessageIn(content="批准", client_message_id="client-shortcut-approval"),
    )
    mission, discovery = _latest_mission(factory, "conv-mission-shortcut")
    matching = [item for item in discovery.get("founder_action_queue", []) if item.get("action_id") == result["action_id"]]
    assert mission["current_stage"] == "COMPLETED"
    assert len(matching) == 1
    assert matching[0]["status"] == "approved"
    assert action_queue.list_founder_action_queue("conv-mission-shortcut") == []
    assert snapshot["sino_brain"]["discovery"]["autonomous_development_mission"]["current_stage"] == "COMPLETED"


def test_mission_continue_discussion_keeps_waiting(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-discuss")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-discuss",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-discuss",
    )
    continued = runtime.decide_operational_action_by_type(result["action_id"], "continue_discussion")
    mission, discovery = _latest_mission(factory, "conv-mission-discuss")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert continued["status"] == "pending"
    assert mission["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert action["status"] == "pending"


def test_live_founder_acceptance_request_creates_mission_and_stops_after_verification(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-live-acceptance")
    _prepare_mission_start(monkeypatch)
    request = "把 Live Founder Acceptance fixture 的内容改成 SINO_LIVE_ACCEPTANCE_OK，并验证。"
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-live-acceptance",
        founder_request=request,
        source_message_id="message-live-acceptance",
    )
    mission, discovery = _latest_mission(factory, "conv-live-acceptance")
    action = _pending_action(discovery, runtime.BOUNDED_CODE_CHANGE_QUEUE_TYPE)
    assert result["status"] == "approval_required"
    assert result["mission_id"] == mission["mission_id"]
    assert mission["live_acceptance_mode"] is True
    assert action["metadata"]["plan"]["allowed_files"] == ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]
    assert action["metadata"]["plan"]["auto_checkpoint"] is False

    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "handled": True,
        "status": "completed",
        "result": {
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "success": True,
            "live_acceptance_mode": True,
            "changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            "boundary_check": "PASS",
            "check_result": "PASS",
            "verification_steps": [{"success": True, "check_result": "PASS", "passed": 1, "failed": 0, "errors": 0}],
        },
    })
    approved = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-live-acceptance")
    assert approved["status"] == "completed"
    assert mission["current_stage"] == "COMPLETED"
    assert mission["last_completed_step"] == "VERIFYING"
    assert mission["live_acceptance_result"]["checkpoint_intentionally_not_requested"] is True
    assert not [item for item in discovery.get("founder_action_queue", []) if item.get("action_type") == runtime.SAFE_PUSH_QUEUE_TYPE]


def test_mission_change_approval_auto_generates_safe_merge_without_manual_next(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-chain")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-chain",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-chain",
    )
    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "handled": True,
        "status": "completed",
        "result": {
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "success": True,
            "checkpoint": {"success": True, "new_head": "checkpoint-head"},
            "changed_files": ["frontend/src/sino-founder/ConversationThread.jsx"],
            "verification_steps": [{"success": True, "check_result": "PASS"}],
        },
    })
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request(
        source_branch="feature/sino-mission-test",
        source_head="checkpoint-head",
        checkpoint_head="checkpoint-head",
    ))
    approved = runtime.decide_operational_action_by_type(result["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-mission-chain")
    merge_action = _pending_action(discovery, runtime.SAFE_MERGE_QUEUE_TYPE)
    assert approved["status"] == "completed"
    assert mission["current_stage"] == "WAITING_MERGE_APPROVAL"
    assert mission["checkpoint_head"] == "checkpoint-head"
    assert mission["next_required_action"] == "SAFE_MERGE_APPROVAL"
    assert merge_action["metadata"]["mission_id"] == mission["mission_id"]
    assert merge_action["metadata"]["mission_stage"] == "WAITING_MERGE_APPROVAL"
    assert merge_action["metadata"]["merge_request"]["source_branch"] == mission["working_branch"]
    assert merge_action["metadata"]["merge_request"]["target_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert merge_action["metadata"]["merge_request"]["allow_unpushed_source_after_checkpoint"] is True
    assert [item["action_id"] for item in action_queue.list_founder_action_queue("conv-mission-chain")] == [merge_action["action_id"]]


def test_mission_approval_chain_reaches_completed_without_manual_next(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-complete")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-complete",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-complete",
    )
    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "status": "completed",
        "result": {"operation_type": runtime.BOUNDED_CODE_CHANGE, "success": True, "checkpoint": {"success": True, "new_head": "checkpoint-head"}},
    })
    monkeypatch.setattr(runtime, "_safe_merge_preflight", lambda **_kwargs: _safe_merge_request(source_branch="feature/sino-mission-complete", source_head="checkpoint-head", checkpoint_head="checkpoint-head"))
    runtime.decide_operational_action_by_type(result["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-mission-complete")
    merge_action = _pending_action(discovery, runtime.SAFE_MERGE_QUEUE_TYPE)
    assert [item["action_id"] for item in action_queue.list_founder_action_queue("conv-mission-complete")] == [merge_action["action_id"]]

    monkeypatch.setattr(runtime, "execute_safe_merge", lambda **_kwargs: {
        "status": "completed",
        "result": {"operation_type": runtime.SAFE_MERGE, "success": True, "source_branch": mission["working_branch"], "source_head": "checkpoint-head", "merge_commit_head": "merge-head", "merge_parent_count": 2, "push_performed": False},
    })
    runtime.decide_operational_action_by_type(merge_action["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-mission-complete")
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-mission-complete").all()
    assert mission["status"] == "COMPLETED"
    assert mission["current_stage"] == "COMPLETED"
    assert mission["final_integration_head"] == "merge-head"
    assert mission["remote_integration_push_required"] is True
    assert any("开发任务已完成并合并回本地 integration baseline" in item.content for item in messages)


def test_isolated_lifecycle_regression_returns_next_mission_to_integration_baseline(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-lifecycle-merge")
    repo = tmp_path / "repo"
    repo.mkdir()

    def git(*args):
        return runtime.subprocess.run(["git", *args], cwd=repo, text=True, capture_output=True, check=True)

    git("init")
    git("config", "user.email", "sino@example.test")
    git("config", "user.name", "Sino Test")
    (repo / "fixture.txt").write_text("PENDING\n")
    git("add", "fixture.txt")
    git("commit", "-m", "baseline")
    git("branch", "-M", runtime.SAFE_MERGE_TARGET_BRANCH)
    baseline_head = runtime._git_rev_parse(runtime.SAFE_MERGE_TARGET_BRANCH, cwd=repo)

    mission_branch = "feature/sino-mission-isolated-lifecycle"
    created = runtime._git_safe_create_branch(mission_branch, cwd=repo, start_point=runtime.SAFE_MERGE_TARGET_BRANCH)
    assert created.returncode == 0
    (repo / "fixture.txt").write_text("OK\n")
    checkpoint = runtime.safe_checkpoint_commit(
        plan={"allowed_files": ["fixture.txt"], "allowed_directories": [], "commit_message": "fix(sino-runtime): apply bounded code change"},
        execution_result={
            "status": "completed",
            "operation_type": runtime.BOUNDED_CODE_CHANGE,
            "success": True,
            "boundary_check": "PASS",
            "check_result": "PASS",
            "unexpected_files": [],
            "changed_files": ["fixture.txt"],
            "verification_steps": [{"argv": ["test"], "success": True, "check_result": "PASS"}],
        },
        task_id="task-lifecycle",
        execution_id="execution-lifecycle",
        action_id="bounded-code-change:lifecycle",
        cwd=repo,
    )
    assert checkpoint["success"] is True

    mission = {"mission_id": "mission-lifecycle", "working_branch": mission_branch, "baseline_branch": runtime.SAFE_MERGE_TARGET_BRANCH}
    merge_request = runtime._mission_safe_merge_request(mission, checkpoint, cwd=repo)
    assert merge_request["target_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert merge_request["source_branch"] == mission_branch
    assert merge_request["allow_unpushed_source_after_checkpoint"] is True
    assert merge_request["source_checkpoint_head"] == checkpoint["new_head"]

    result = runtime.execute_safe_merge(
        conversation_id="conv-lifecycle-merge",
        founder_request="合并 lifecycle fixture",
        source_message_id="message-lifecycle-merge",
        action_id="safe-merge:lifecycle",
        merge_request=merge_request,
        cwd=repo,
    )
    assert result["status"] == "completed"
    assert runtime._git_output(["branch", "--show-current"], cwd=repo).stdout.strip() == runtime.SAFE_MERGE_TARGET_BRANCH
    assert runtime._git_status_short(cwd=repo) == []
    assert runtime._git_is_ancestor(checkpoint["new_head"], runtime._git_rev_parse(runtime.SAFE_MERGE_TARGET_BRANCH, cwd=repo), cwd=repo)

    with factory() as db:
        db.add(ConversationDB(id="conv-lifecycle-next", system_id="founder_ai", title="Next"))
        db.add(SinoBrainSessionDB(conversation_id="conv-lifecycle-next", discovery={}))
        db.commit()
    monkeypatch.setattr(runtime, "repo_root", lambda: repo)
    next_result = runtime.start_autonomous_development_mission("conv-lifecycle-next", MISSION_REQUEST, "message-lifecycle-next")
    next_mission, _discovery = _latest_mission(factory, "conv-lifecycle-next")
    assert next_result["status"] == "approval_required"
    assert next_mission["baseline_branch"] == runtime.SAFE_MERGE_TARGET_BRANCH
    assert next_mission["baseline_head"] == runtime._git_rev_parse(runtime.SAFE_MERGE_TARGET_BRANCH, cwd=repo)
    assert next_mission["working_branch"] != mission_branch


def test_mission_failure_stops_before_push_and_is_persisted(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-fail")
    _prepare_mission_start(monkeypatch)
    result = runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-fail",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-fail",
    )
    monkeypatch.setattr(runtime, "execute_bounded_code_change", lambda **_kwargs: {
        "status": "failed",
        "result": {"operation_type": runtime.BOUNDED_CODE_CHANGE, "success": False, "failure_type": "VERIFICATION_FAILED", "summary": "2 tests failed"},
    })
    runtime.decide_operational_action_by_type(result["action_id"], "approve")
    mission, discovery = _latest_mission(factory, "conv-mission-fail")
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-mission-fail").all()
    assert mission["status"] == "FAILED"
    assert mission["failed_stage"] == "WAITING_CHANGE_APPROVAL"
    assert mission["failure_type"] == "VERIFICATION_FAILED"
    assert not [item for item in discovery.get("founder_action_queue", []) if item.get("action_type") == runtime.SAFE_PUSH_QUEUE_TYPE]
    assert any("Mission 在 WAITING_CHANGE_APPROVAL 阶段停止" in item.content for item in messages)


def test_mission_reload_and_cross_conversation_isolation(monkeypatch, tmp_path):
    factory = _runtime(monkeypatch, tmp_path, conversation_id="conv-mission-a")
    with factory() as db:
        db.add(ConversationDB(id="conv-mission-b", system_id="founder_ai", title="B"))
        db.add(SinoBrainSessionDB(conversation_id="conv-mission-b", discovery={}))
        db.commit()
    _prepare_mission_start(monkeypatch)
    runtime.handle_operational_conversation_request(
        conversation_id="conv-mission-a",
        founder_request=MISSION_REQUEST,
        source_message_id="message-mission-a",
    )
    with factory() as db:
        a = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-mission-a").one()
        b = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-mission-b").one()
    assert a.discovery["autonomous_development_mission"]["current_stage"] == "WAITING_CHANGE_APPROVAL"
    assert "autonomous_development_mission" not in (b.discovery or {})
    assert not (b.discovery or {}).get("founder_action_queue")
