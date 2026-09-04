from app.founder_ai.orchestrator import (
    FOUNDER_SYSTEM_KEY,
    build_execution_package,
    build_memory_asset_draft,
    classify_goal,
    generate_task_asset_draft,
)


def test_goal_classification_generates_founder_task_asset_draft():
    goal = "开发一个海报设计 Agent"
    classified = classify_goal(goal)
    draft = generate_task_asset_draft(goal, conversation_id="conversation-1")

    assert classified.goal_type == "development"
    assert draft.system_id == FOUNDER_SYSTEM_KEY
    assert draft.conversation_id == "conversation-1"
    assert draft.goal_type == "development"
    assert draft.approval_required is True


def test_task_asset_draft_generates_non_executable_package():
    draft = generate_task_asset_draft("迁移 Founder AI 页面", constraints=["不删除旧 API"])
    package = build_execution_package(draft)

    assert package.task_asset is draft
    assert "不删除旧 API" in package.constraints
    assert package.approval_required is True
    assert package.execution_allowed is False
    assert "Founder approval" in package.commit_requirement


def test_founder_context_boundary_rejects_other_system():
    try:
        generate_task_asset_draft("开发能力", context={"system_id": "operator_ai"})
    except ValueError as error:
        assert "founder_ai" in str(error)
    else:
        raise AssertionError("non-Founder context must be rejected")


def test_memory_asset_draft_preserves_learning_fields_without_persistence():
    draft = build_memory_asset_draft(
        decision="保留旧 API",
        artifact="artifact-1",
        commit="abc123",
        learning="先读后写",
    )

    assert draft.system_id == FOUNDER_SYSTEM_KEY
    assert draft.status == "draft"
    assert draft.decision == "保留旧 API"
    assert draft.artifact == "artifact-1"
    assert draft.commit == "abc123"
    assert draft.learning == "先读后写"
