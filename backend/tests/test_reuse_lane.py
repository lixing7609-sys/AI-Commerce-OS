from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_progress import build_execution_progress
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.reuse_lane import is_reuse_health_check_goal, lookup_reuse_candidate
from app.founder_ai.standard_task_execution import build_standard_task_contract

GOAL = "再次执行一次 Sino Founder AI 本地开发环境健康检查，复用上一次已经验证通过的检查路径、运行环境和 Technical Resolution 经验；不要重新做 Runtime Discovery。Backend Database Worker Git。"
REFERENTIAL_GOAL = "再次执行一次 Sino Founder AI 本地开发环境健康检查，复用上一次已经验证通过的检查路径、运行环境和 Technical Resolution 经验。"

def source():
    session = ExecutionSession("execution-source", "task-source", "package-source", status="completed", completed_at="2026-08-18T12:36:48+00:00", memory={"memory_id": "learning-source"}, technical_resolution={"resolution_status": "resolved", "last_attempt": {"evidence": {"status": "PASS", "method": "application_owned_low_privilege_evidence"}}})
    package = ExecutionPackage(goal="执行本地开发环境健康检查 Backend Database Worker Git", context={}, task_asset=TaskAssetDraft(title="health", description="health", scope={}, constraints=[], risk="read_only", approval_required=False), constraints=[], verification=[], commit_requirement="none")
    return session, package

def test_reuse_lookup_selects_verified_health_source_and_skips_discovery(monkeypatch, tmp_path):
    (tmp_path / "scripts").mkdir(); (tmp_path / "scripts" / "dev-status").touch(); (tmp_path / ".git").mkdir()
    session, package = source()
    monkeypatch.setattr("app.founder_ai.reuse_lane.list_execution_sessions", lambda: [session])
    monkeypatch.setattr("app.founder_ai.reuse_lane.get_execution_session", lambda _: (session, package))
    result = lookup_reuse_candidate(conversation_id="conv-current", task_id="task-current", goal=GOAL, repo_root=tmp_path)
    assert result["reuse_lookup_performed"] is True
    assert result["source_task_id"] == "task-source" and result["source_execution_id"] == "execution-source"
    assert result["registry_hits"] == result["runtime_pattern_hits"] == result["technical_resolution_hits"] == 1
    assert result["learning_hits"] >= 1 and result["binding_valid"] is True
    assert result["full_runtime_discovery_count"] == 0 and result["new_plan_created"] is False and result["reuse_ratio"] == 1.0

def test_reuse_binding_invalidation_falls_back_without_fake_binding(monkeypatch, tmp_path):
    session, package = source()
    monkeypatch.setattr("app.founder_ai.reuse_lane.list_execution_sessions", lambda: [session])
    monkeypatch.setattr("app.founder_ai.reuse_lane.get_execution_session", lambda _: (session, package))
    result = lookup_reuse_candidate(conversation_id="conv-current", task_id="task-current", goal=GOAL, repo_root=tmp_path)
    assert result["binding_valid"] is False and result["invalidation_reason"] == "required_runtime_binding_missing"

def test_current_health_contract_is_not_polluted_by_previous_business_surface():
    assert is_reuse_health_check_goal(GOAL)
    assert is_reuse_health_check_goal(REFERENTIAL_GOAL)
    contract = build_standard_task_contract(conversation_id="conv-current", task_id="task-current", goal=GOAL)
    assert contract["target_surface"] == "Local Development Environment"
    assert contract["implementation_scope"] == [] and contract["implementation_plan"] == []

def test_reuse_progress_is_lane_specific_and_not_generic_execution():
    progress = build_execution_progress({"classification": "STANDARD_TASK", "reuse_lane": True, "current_step": "complete", "execution_status": "completed", "standard_task_contract": {"task_id": "task-current"}, "reuse": {"lightweight_validation": {"checked_at": "2026-08-19T00:00:00+00:00"}}})
    assert progress["progress_percent"] == 100 and progress["current_action"] == "复用验证完成"
    assert progress["execution_id"] is None and progress["founder_action_required"] is False
