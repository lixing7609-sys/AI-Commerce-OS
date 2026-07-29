import { FounderWorkbenchModule } from "./modules/founderWorkbench/FounderWorkbenchModule.jsx";
import { DesignDnaModule } from "./modules/designDna/DesignDnaModule.jsx";
import { ProductCenterModule } from "./modules/productCenter/ProductCenterModule.jsx";
import { OrderCenterModule } from "./modules/orderCenter/OrderCenterModule.jsx";
import { CustomerServiceCenterModule } from "./modules/customerServiceCenter/CustomerServiceCenterModule.jsx";
import { AgentStudioModule } from "./modules/agentStudio/AgentStudioModule.jsx";
import { ModelRouterModule } from "./modules/modelRouter/ModelRouterModule.jsx";
import { PromptCenterModule } from "./modules/promptCenter/PromptCenterModule.jsx";
import { SkillCenterModule } from "./modules/skillCenter/SkillCenterModule.jsx";
import { KnowledgeCenterModule } from "./modules/knowledgeCenter/KnowledgeCenterModule.jsx";
import { ConnectorCenterModule } from "./modules/connectorCenter/ConnectorCenterModule.jsx";
import { TokenCenterModule } from "./modules/tokenCenter/TokenCenterModule.jsx";
import { AdCenterModule } from "./modules/adCenter/AdCenterModule.jsx";
import { AutomationPolicyModule } from "./modules/automationPolicy/AutomationPolicyModule.jsx";
import { ApprovalCenterModule } from "./modules/approvalCenter/ApprovalCenterModule.jsx";
import { BenchmarkCenterModule } from "./modules/benchmarkCenter/BenchmarkCenterModule.jsx";
import { ReplayCenterModule } from "./modules/replayCenter/ReplayCenterModule.jsx";
import { EvaluationCenterModule } from "./modules/evaluationCenter/EvaluationCenterModule.jsx";
import { SystemCenterModule } from "./modules/systemCenter/SystemCenterModule.jsx";
import { OperatorLabV2Connected } from "./labs/OperatorLabV2Connected.jsx";
import { StudioLabConnected } from "./labs/StudioLabConnected.jsx";
import { MarketplaceCenter } from "./labs/MarketplaceCenter.jsx";
import { CloudCenterConnected } from "./labs/CloudCenterConnected.jsx";
import {
  StudioAgentsModule, StudioPromptsModule, StudioSkillsModule, StudioWorkflowsModule, StudioModelRoutingModule,
} from "./modules/studioLab/StudioAgentModules.jsx";
import {
  StudioPromptTestModule, StudioReplayModule, StudioEvaluationModule,
} from "./modules/studioLab/StudioTestingModules.jsx";
import {
  StudioLogsModule, StudioCostsModule, StudioReleasesModule,
} from "./modules/studioLab/StudioOpsModules.jsx";

/**
 * 模块 key -> 组件的唯一映射，ConsoleShell 从这里查表渲染当前
 * 模块，不写一长串 if/else。key 必须和 nav/navConfig.js 中的
 * FOUNDER_MODULES 完全对应。
 *
 * 阶段 Founder Full-System v3 Batch 2：`secretary`/`dashboard` 不再
 * 是独立顶级模块（合并进 `founderWorkbench`，见 navConfig.js 的
 * MODULE_REDIRECTS——旧链接会在导航状态解析阶段就被重写成
 * `founderWorkbench`，从不会以 `secretary`/`dashboard` 为 module 落到
 * 这张表，所以这里不需要也不应该再保留这两个 key）。
 * `storeConnectionCenter` 同理，改为 Operator 实验室 v2 registry 内部
 * 的一个子页面（`console/labs/operatorLabV2/pageRegistry.jsx`），不再
 * 是顶层模块。
 *
 * `productCenter`/`orderCenter`/`customerServiceCenter`/
 * `approvalCenter` 仍然保留在这里——不是因为它们还在侧边栏出现
 * （`hiddenFromSidebar: true`，见 navConfig.js 顶部注释），而是因为
 * 这几个组件内部大量标签页/详情跳转直接 `navigate("orderCenter", …)`
 * 自我引用，必须保持可解析。
 */
export const MODULE_COMPONENTS = {
  designDna: DesignDnaModule,
  founderWorkbench: FounderWorkbenchModule,
  productCenter: ProductCenterModule,
  orderCenter: OrderCenterModule,
  customerServiceCenter: CustomerServiceCenterModule,
  agentStudio: AgentStudioModule,
  modelRouter: ModelRouterModule,
  promptCenter: PromptCenterModule,
  skillCenter: SkillCenterModule,
  knowledgeCenter: KnowledgeCenterModule,
  connectorCenter: ConnectorCenterModule,
  tokenCenter: TokenCenterModule,
  adCenter: AdCenterModule,
  automationPolicy: AutomationPolicyModule,
  approvalCenter: ApprovalCenterModule,
  benchmarkCenter: BenchmarkCenterModule,
  replayCenter: ReplayCenterModule,
  evaluationCenter: EvaluationCenterModule,
  systemCenter: SystemCenterModule,
  operatorLab: OperatorLabV2Connected,
  studioLab: StudioLabConnected,
  marketplaceCenter: MarketplaceCenter,
  cloudCenter: CloudCenterConnected,
  // Studio 实验控制层（阶段 Studio V3 Integration）——Founder 专属，
  // 渲染在 Studio 实验室手风琴展开面板里 Studio 完整业务导航之后，
  // 与 productCenter/orderCenter 等 operatorLabGroup 的 Founder 专属
  // 项同一个模式：独立的顶级模块 key，不经过 StudioLab 的 subView。
  studioAgents: StudioAgentsModule,
  studioPrompts: StudioPromptsModule,
  studioSkills: StudioSkillsModule,
  studioWorkflows: StudioWorkflowsModule,
  studioModelRouting: StudioModelRoutingModule,
  studioPromptTest: StudioPromptTestModule,
  studioReplay: StudioReplayModule,
  studioEvaluation: StudioEvaluationModule,
  studioLogs: StudioLogsModule,
  studioCosts: StudioCostsModule,
  studioReleases: StudioReleasesModule,
};
