from app.core.project.lifecycle_projection import project_lifecycle_projection


def test_planning_only_projects_project_planning():
    result = project_lifecycle_projection({"project_aware": True, "discussion_maturity": {"maturity_status": "continue_analysis"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "project_planning"


def test_confirmed_definition_projects_next_planning_stage():
    result = project_lifecycle_projection({"discussion_maturity": {"review_status": "founder_confirmed"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "definition_confirmed"


def test_approved_plan_projects_package_preparation():
    result = project_lifecycle_projection({"implementation_planning": {"status": "founder_approved", "execution_approval": "approved"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "implementation_planning"
    assert result["current_action"]["action_id"] == "prepare_execution_package"


def test_ready_package_projects_ready_for_execution():
    result = project_lifecycle_projection({"execution_package": {"execution_status": "not_started", "preflight_status": "ready"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "execution_package"
    assert result["current_action"]["status_label"] == "Ready for Execution"


def test_running_execution_projects_execution():
    result = project_lifecycle_projection({"execution_package": {"execution_status": "running", "current_work_item": "work-2"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "execution"
    assert result["current_action"]["title"] == "Execution Running"


def test_validated_execution_result_projects_completed():
    result = project_lifecycle_projection({"execution_context_feedback": {"implementation_status": "completed", "validation_status": "passed", "overall_execution_status": "completed"}}, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "validated_result"
    assert result["rank"] > 600


def test_external_dependency_result_overrides_old_planning_stage_without_mutation():
    discovery = {
        "discussion_maturity": {"maturity_status": "evaluating", "reason": "old planning state"},
        "implementation_planning": {"execution_approval": "approved"},
        "execution_package": {"execution_status": "blocked", "package_id": "package-1"},
        "execution_context_feedback": {
            "implementation_status": "completed", "validation_status": "blocked_by_external_dependency", "overall_execution_status": "blocked",
            "external_dependencies": [{"dependency_target": "Runtime Foundation", "blocking_scope": "work-7", "reason": "runtime missing"}],
            "next_step": "resolve_external_dependency_then_resume_validation",
        },
    }
    before = repr(discovery)
    result = project_lifecycle_projection(discovery, conversation_stage="project_planning")
    assert result["lifecycle_stage"] == "validation_result"
    assert result["current_dependency"]["dependency_target"] == "Runtime Foundation"
    assert result["resume_point"] == "work-7"
    assert result["current_action"]["action_id"] == "resume_validation_after_dependency"
    assert "Project Planning" not in result["current_action"]["title"]
    assert repr(discovery) == before


def test_runtime_binding_founder_gate_remains_highest_package_projection():
    result = project_lifecycle_projection({"execution_package": {"execution_status": "not_started", "preflight_status": "founder_gate_required", "runtime_binding": {"requires_runtime_binding": True, "binding_status": "founder_review_required", "recommendation": {"summary": "Review environment"}}}}, conversation_stage="execution_package")
    assert result["lifecycle_stage"] == "execution_package"
    assert result["current_action"]["action_id"] == "runtime_environment_binding_review"
    assert result["current_action"]["title"] == "审核运行环境方案"
