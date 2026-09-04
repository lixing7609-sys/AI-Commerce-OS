from app.founder_ai.system_builder import ApplicationRegistry, SinoSystemBuilder


def test_application_registry_keeps_only_founder_active():
    applications = ApplicationRegistry().list()
    assert [item.name for item in applications] == ["Founder AI", "Operator AI", "Studio AI", "Industrial AI", "Quant AI"]
    assert [item.name for item in applications if item.status == "active"] == ["Founder AI"]
    assert all(item.status == "blueprint" for item in applications[1:])


def test_system_blueprint_generates_application_architecture_structure():
    plan = SinoSystemBuilder().build("Create Operator AI for commerce operations")
    blueprint = plan.system_blueprint
    assert blueprint.system_key == "operator_ai"
    assert blueprint.status == "architecture_proposal"
    assert blueprint.system_goal == "Create Operator AI for commerce operations"
    assert blueprint.system_boundaries
    assert blueprint.core_modules
    assert blueprint.system_relationships
    assert blueprint.implementation_plan


def test_system_blueprint_does_not_manage_agent_assets_or_execution():
    payload = SinoSystemBuilder().build("Create Studio AI for content production").to_dict()
    assert set(payload) == {"system_blueprint"}
    text = str(payload)
    for field in ("generated_capabilities", "agent_architecture", "skills", "prompts", "workflows", "models", "task_asset_draft", "execution_package"):
        assert field not in payload
        assert field not in payload["system_blueprint"]
    assert "AI Agent" in text
    assert "AI 能力中心" in text


def test_blueprint_stage_does_not_create_execution_package():
    plan = SinoSystemBuilder().build("Create Industrial AI", conversation_id="conv-1")
    assert not hasattr(plan, "task_asset_draft")
    assert not hasattr(plan, "execution_package")


def test_founder_application_can_be_modified_without_cross_application_creation():
    blueprint = SinoSystemBuilder().build("Modify Founder AI system structure").system_blueprint
    assert blueprint.system_key == "founder_ai"
    assert "仅修改 Founder AI 应用系统边界" in blueprint.system_boundaries
