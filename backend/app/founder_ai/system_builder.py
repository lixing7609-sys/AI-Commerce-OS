from dataclasses import asdict, dataclass
from typing import Any, Literal


ApplicationStatus = Literal["active", "blueprint", "development", "deployed"]


@dataclass(frozen=True, slots=True)
class ApplicationDefinition:
    key: str
    name: str
    status: ApplicationStatus


class ApplicationRegistry:
    """Application-system registry. It never creates or configures AI Agents."""

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
    system_goal: str
    system_boundaries: list[str]
    core_modules: list[str]
    system_relationships: list[str]
    implementation_plan: list[str]
    status: str = "architecture_proposal"


@dataclass(frozen=True, slots=True)
class SystemBuildPlan:
    system_blueprint: SystemBlueprint

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SinoSystemBuilder:
    """Generates application architecture proposals; Agent ownership stays in AI Capability Center."""

    def __init__(self, *, registry: ApplicationRegistry | None = None, **_legacy_dependencies):
        self.registry = registry or ApplicationRegistry()

    def build(self, system_goal: str, *, conversation_id: str | None = None, project_intelligence: dict[str, Any] | None = None) -> SystemBuildPlan:
        goal = (system_goal or "").strip()
        if not goal:
            raise ValueError("system_goal must not be empty")
        application = self._resolve_application(goal)
        context = project_intelligence or {}
        return SystemBuildPlan(self._blueprint(application, goal, context))

    def _resolve_application(self, goal: str) -> ApplicationDefinition:
        lowered = goal.lower()
        aliases = {"operator_ai": ("operator", "运营"), "studio_ai": ("studio", "创作", "内容"), "industrial_ai": ("industrial", "工业"), "quant_ai": ("quant", "量化"), "founder_ai": ("founder",)}
        for key, terms in aliases.items():
            if any(term in lowered for term in terms):
                application = self.registry.get(key)
                if application is not None:
                    return application
        application = self.registry.get("founder_ai")
        if application is None:
            raise LookupError("Founder AI is not registered")
        return application

    @staticmethod
    def _blueprint(application: ApplicationDefinition, goal: str, context: dict[str, Any]) -> SystemBlueprint:
        domain = application.name.removesuffix(" AI")
        constraints = [str(item) for item in context.get("constraints", []) if str(item).strip()]
        boundaries = [f"仅修改 {application.name} 应用系统边界", "不在蓝图阶段创建或配置 AI Agent", "不在 Founder 确认前进入代码执行"]
        boundaries.extend(constraints[:3])
        return SystemBlueprint(
            system_key=application.key,
            system_name=application.name,
            system_goal=goal,
            system_boundaries=boundaries,
            core_modules=[f"{domain} 核心业务模块", "上下文与数据模块", "治理与审批模块"],
            system_relationships=["核心业务模块读取上下文与数据模块", "治理与审批模块约束所有实施动作", "Agent 需求仅作为架构依赖，交由 AI 能力中心创建"],
            implementation_plan=["Founder 审阅并确认系统蓝图", "确认后生成 Implementation Plan 与 Task Plan", "Founder 批准后进入 Execution"],
        )
