from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft, build_execution_package, generate_task_asset_draft

ApplicationStatus = Literal["active", "blueprint", "development", "deployed"]


@dataclass(frozen=True, slots=True)
class ApplicationDefinition:
    key: str
    name: str
    status: ApplicationStatus


class ApplicationRegistry:
    """Planning registry. It does not instantiate or deploy application systems."""

    def __init__(self):
        self._applications = (
            ApplicationDefinition("founder_ai", "Founder AI", "active"),
            ApplicationDefinition("operator_ai", "Operator AI", "blueprint"),
            ApplicationDefinition("studio_ai", "Studio AI", "blueprint"),
            ApplicationDefinition("industrial_ai", "Industrial AI", "blueprint"),
            ApplicationDefinition("quant_ai", "Quant AI", "blueprint"),
        )

    def list(self) -> list[ApplicationDefinition]:
        return list(self._applications)

    def get(self, key: str) -> ApplicationDefinition | None:
        return next((item for item in self._applications if item.key == key), None)


@dataclass(frozen=True, slots=True)
class SystemBlueprint:
    system_key: str
    system_name: str
    purpose: str
    target_user: str
    capabilities: list[str]
    agents: list[str]
    workflows: list[str]
    connectors: list[str]
    memory_requirements: list[str]
    execution_requirements: list[str]
    status: str = "blueprint"


@dataclass(frozen=True, slots=True)
class GeneratedCapabilitySet:
    capabilities: list[str]
    agents: list[str]
    skills: list[str]
    workflows: list[str]


@dataclass(frozen=True, slots=True)
class AgentRole:
    role: str
    responsibilities: list[str]
    skills: list[str]
    tools: list[str]


@dataclass(frozen=True, slots=True)
class AgentArchitecture:
    system_key: str
    roles: list[AgentRole]


@dataclass(frozen=True, slots=True)
class SystemBuildPlan:
    system_blueprint: SystemBlueprint
    generated_capabilities: GeneratedCapabilitySet
    agent_architecture: AgentArchitecture
    task_asset_draft: TaskAssetDraft
    execution_package: ExecutionPackage

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CapabilityGenerator:
    def generate(self, blueprint: SystemBlueprint) -> GeneratedCapabilitySet:
        skills = [f"{capability} Skill" for capability in blueprint.capabilities]
        return GeneratedCapabilitySet(list(blueprint.capabilities), list(blueprint.agents), skills, list(blueprint.workflows))


class AgentArchitectureDesigner:
    def design(self, blueprint: SystemBlueprint, generated: GeneratedCapabilitySet) -> AgentArchitecture:
        roles = []
        for index, agent in enumerate(generated.agents):
            capability = generated.capabilities[index % len(generated.capabilities)]
            roles.append(AgentRole(agent, [f"Own {capability}", "Report decisions and execution state"], [f"{capability} Skill"], list(blueprint.connectors) + ["Memory API", "TaskAsset API"]))
        return AgentArchitecture(blueprint.system_key, roles)


class SinoSystemBuilder:
    def __init__(self, *, registry: ApplicationRegistry | None = None, capability_generator: CapabilityGenerator | None = None, agent_designer: AgentArchitectureDesigner | None = None):
        self.registry = registry or ApplicationRegistry()
        self.capability_generator = capability_generator or CapabilityGenerator()
        self.agent_designer = agent_designer or AgentArchitectureDesigner()

    def build(self, system_goal: str, *, conversation_id: str | None = None) -> SystemBuildPlan:
        goal = (system_goal or "").strip()
        if not goal:
            raise ValueError("system_goal must not be empty")
        application = self._resolve_application(goal)
        if application.key == "founder_ai":
            raise ValueError("Founder AI is already active; System Builder only plans blueprint applications")
        blueprint = self._blueprint(application, goal)
        generated = self.capability_generator.generate(blueprint)
        architecture = self.agent_designer.design(blueprint, generated)
        task = generate_task_asset_draft(
            f"Build {application.name} from approved system blueprint",
            conversation_id=conversation_id,
            context={"system_id": "founder_ai", "target_application": application.key, "system_blueprint": asdict(blueprint), "agent_architecture": asdict(architecture)},
            constraints=["Founder approval is required", "Keep target application in blueprint status until execution is approved"],
            risk="high",
            approval_required=True,
        )
        package = build_execution_package(task, verification=["Validate application boundary", "Review generated capabilities, agents, skills and workflows", "Run required tests"])
        return SystemBuildPlan(blueprint, generated, architecture, task, package)

    def _resolve_application(self, goal: str) -> ApplicationDefinition:
        lowered = goal.lower()
        aliases = {"operator_ai": ("operator", "运营"), "studio_ai": ("studio", "创作", "内容"), "industrial_ai": ("industrial", "工业"), "quant_ai": ("quant", "量化"), "founder_ai": ("founder",)}
        for key, terms in aliases.items():
            if any(term in lowered for term in terms):
                application = self.registry.get(key)
                if application is not None:
                    return application
        application = self.registry.get("operator_ai")
        if application is None:
            raise LookupError("Operator AI blueprint is not registered")
        return application

    @staticmethod
    def _blueprint(application: ApplicationDefinition, goal: str) -> SystemBlueprint:
        domain = application.name.removesuffix(" AI")
        return SystemBlueprint(
            system_key=application.key,
            system_name=application.name,
            purpose=goal,
            target_user=f"AI Commerce OS {domain} team",
            capabilities=[f"{domain} Planning", f"{domain} Decision Support", f"{domain} Execution Coordination"],
            agents=[f"{domain} Lead Agent", f"{domain} Specialist Agent"],
            workflows=[f"{domain} Goal Analysis", f"{domain} Approval Workflow", f"{domain} Execution Review"],
            connectors=["Context API", "TaskAsset API"],
            memory_requirements=["Decision Memory", "Task Memory", "Execution Learning"],
            execution_requirements=["Founder approval", "Isolated application boundary", "Audited Codex execution"],
        )
