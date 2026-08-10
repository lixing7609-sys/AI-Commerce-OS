from app.founder_ai import api
from app.founder_ai.execution_registry import get_execution_session
from app.founder_ai.system_builder import AgentArchitectureDesigner, ApplicationRegistry, CapabilityGenerator, SinoSystemBuilder


def test_application_registry_keeps_only_founder_active():
    applications = ApplicationRegistry().list()
    assert [item.name for item in applications] == ["Founder AI", "Operator AI", "Studio AI", "Industrial AI", "Quant AI"]
    assert [item.name for item in applications if item.status == "active"] == ["Founder AI"]
    assert all(item.status == "blueprint" for item in applications[1:])


def test_system_blueprint_generation():
    blueprint = SinoSystemBuilder().build("Create Operator AI for commerce operations").system_blueprint
    assert blueprint.system_key == "operator_ai"
    assert blueprint.status == "blueprint"
    assert blueprint.purpose == "Create Operator AI for commerce operations"
    assert blueprint.memory_requirements
    assert "Founder approval" in blueprint.execution_requirements


def test_capability_generator_creates_capabilities_agents_skills_and_workflows():
    plan = SinoSystemBuilder().build("Create Studio AI for content production")
    generated = CapabilityGenerator().generate(plan.system_blueprint)
    assert generated.capabilities
    assert generated.agents
    assert all(item.endswith("Skill") for item in generated.skills)
    assert generated.workflows


def test_agent_architecture_design_assigns_roles_responsibilities_skills_and_tools():
    plan = SinoSystemBuilder().build("Create Quant AI for research")
    architecture = AgentArchitectureDesigner().design(plan.system_blueprint, plan.generated_capabilities)
    assert architecture.roles
    assert architecture.roles[0].responsibilities
    assert architecture.roles[0].skills
    assert "TaskAsset API" in architecture.roles[0].tools


def test_blueprint_to_task_requires_founder_approval():
    plan = SinoSystemBuilder().build("Create Industrial AI", conversation_id="conv-1")
    assert plan.task_asset_draft.conversation_id == "conv-1"
    assert plan.task_asset_draft.approval_required is True
    assert plan.execution_package.approval_required is True
    assert plan.execution_package.execution_allowed is False
    assert plan.execution_package.context["target_application"] == "industrial_ai"
    created = api.create_founder_execution(api.ExecutionCreateIn(task_asset_id="task-blueprint", execution_package=plan.to_dict()["execution_package"]))
    _, stored_package = get_execution_session(created.id)
    assert stored_package.context["target_application"] == "industrial_ai"
    assert stored_package.execution_allowed is False
