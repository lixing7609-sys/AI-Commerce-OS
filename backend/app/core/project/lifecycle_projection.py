"""Pure Project lifecycle read-model built from durable lifecycle evidence."""


def project_lifecycle_projection(discovery: dict | None, *, conversation_stage: str | None = None) -> dict:
    discovery = dict(discovery or {})
    feedback = dict(discovery.get("execution_context_feedback") or {})
    package = dict(discovery.get("execution_package") or {})
    plan = dict(discovery.get("implementation_planning") or {})
    maturity = dict(discovery.get("discussion_maturity") or {})

    if feedback:
        dependencies = list(feedback.get("external_dependencies") or [])
        dependency = dependencies[0] if dependencies else None
        implementation_status = feedback.get("implementation_status")
        validation_status = feedback.get("validation_status")
        resume_point = (dependency or {}).get("blocking_scope")
        if implementation_status == "completed" and validation_status == "blocked_by_external_dependency":
            dependency_name = (dependency or {}).get("dependency_target") or "外部依赖"
            return {
                "rank": 700,
                "lifecycle_stage": "validation_result",
                "stage_label": "Validation / Execution Result",
                "implementation_status": "completed",
                "validation_status": "blocked_by_external_dependency",
                "overall_status": feedback.get("overall_execution_status") or "blocked",
                "current_dependency": dependency,
                "blocking_reason": (dependency or {}).get("reason"),
                "resume_point": resume_point,
                "next_step": feedback.get("next_step") or "resolve_external_dependency_then_resume_validation",
                "current_action": {
                    "action_id": "resume_validation_after_dependency",
                    "title": "等待外部依赖解除后恢复真实环境验证",
                    "description": f"Implementation 已完成；Validation 被 {dependency_name} 阻塞。依赖可用后从 {resume_point or '当前验证点'} 恢复，不重新执行已完成 Work Items。",
                    "status_label": "Validation Blocked by External Dependency",
                    "primary_label": None,
                },
            }
        if validation_status in {"passed", "completed"}:
            return {
                "rank": 700, "lifecycle_stage": "validated_result", "stage_label": "Validated Execution Result",
                "implementation_status": implementation_status, "validation_status": validation_status,
                "overall_status": feedback.get("overall_execution_status") or "completed", "current_dependency": dependency,
                "resume_point": None, "next_step": "review_validated_execution_result",
                "current_action": {"action_id": "validated_execution_result", "title": "Validated Execution Result", "description": "Implementation 与 Validation 已完成。", "status_label": "Completed", "primary_label": None},
            }
        return {
            "rank": 700, "lifecycle_stage": "execution_result", "stage_label": "Execution Result",
            "implementation_status": implementation_status, "validation_status": validation_status,
            "overall_status": feedback.get("overall_execution_status"), "current_dependency": dependency,
            "blocking_reason": (dependency or {}).get("reason"), "resume_point": resume_point,
            "next_step": feedback.get("next_step"),
            "current_action": {"action_id": "execution_result_status", "title": "Execution Result", "description": feedback.get("next_step") or "查看当前 Execution Result。", "status_label": feedback.get("overall_execution_status"), "primary_label": None},
        }

    if package:
        execution_status = package.get("execution_status") or "not_started"
        validation_status = package.get("validation_status")
        if execution_status == "running":
            return {"rank": 600, "lifecycle_stage": "execution", "stage_label": "Execution", "execution_status": execution_status, "validation_status": validation_status, "next_step": "continue_current_execution", "current_action": {"action_id": "execution_running", "title": "Execution Running", "description": package.get("current_work_item") or "正在执行 approved Package。", "status_label": "Running", "primary_label": None}}
        if execution_status in {"blocked", "failed", "paused_for_founder"}:
            return {"rank": 600, "lifecycle_stage": "execution", "stage_label": "Execution / Validation", "execution_status": execution_status, "validation_status": validation_status, "blocking_reason": package.get("blocked_reason"), "next_step": "resolve_execution_blocker", "current_action": {"action_id": "execution_blocked", "title": "Execution Blocked", "description": package.get("blocked_reason") or "当前 Execution 被阻塞。", "status_label": execution_status, "primary_label": None}}
        preflight = package.get("preflight_status")
        runtime_binding = dict(package.get("runtime_binding") or {})
        if preflight == "ready":
            action = {"action_id": "execution_package_ready", "title": "Execution Package Ready", "description": "执行准备完成。", "status_label": "Ready for Execution", "primary_label": None}
        elif preflight == "founder_gate_required" and runtime_binding.get("requires_runtime_binding") and runtime_binding.get("binding_status") != "passed":
            action = {"action_id": "runtime_environment_binding_review", "title": "审核运行环境方案", "description": (runtime_binding.get("recommendation") or {}).get("summary") or "Runtime Environment 尚未绑定。", "status_label": "Founder Gate Required", "primary_label": None}
        else:
            action = {"action_id": "execution_package_preflight", "title": "Execution Package Preflight", "description": "；".join((package.get("preflight") or {}).get("blocking_reasons") or (package.get("preflight") or {}).get("founder_gate_reasons") or []), "status_label": preflight, "primary_label": None}
        return {"rank": 500, "lifecycle_stage": "execution_package", "stage_label": "Execution Package", "execution_status": execution_status, "preflight_status": preflight, "next_step": action["status_label"], "current_action": action}

    if plan:
        approval = plan.get("execution_approval")
        if approval == "approved":
            action = {"action_id": "prepare_execution_package", "title": "生成 Execution Package", "description": "Implementation Plan 已批准，等待生成 canonical Execution Package。", "status_label": "Implementation Approved", "primary_label": None}
        else:
            action = {"action_id": "review_implementation_plan", "title": "审核实施方案", "description": "Implementation Plan 已形成，等待 Founder 判断。", "status_label": plan.get("status"), "primary_label": "批准实施" if plan.get("status") == "ready_for_execution_review" else None}
        return {"rank": 400, "lifecycle_stage": "implementation_planning", "stage_label": "Implementation Planning", "implementation_plan_status": plan.get("status"), "execution_approval": approval, "next_step": action["title"], "current_action": action}

    if maturity.get("review_status") == "founder_confirmed":
        return {"rank": 300, "lifecycle_stage": "definition_confirmed", "stage_label": "Definition Confirmed", "next_step": "implementation_planning", "current_action": {"action_id": "start_implementation_planning", "title": "Implementation Planning", "description": "Project Definition 已确认。", "status_label": "Definition Confirmed", "primary_label": None}}
    if conversation_stage == "project_planning" or discovery.get("project_aware"):
        return {"rank": 200, "lifecycle_stage": "project_planning", "stage_label": "Project Planning", "maturity_status": maturity.get("maturity_status"), "next_step": maturity.get("autonomous_next_analysis"), "current_action": None}
    return {"rank": 100, "lifecycle_stage": "initial", "stage_label": "Initial Conversation", "current_action": None}
