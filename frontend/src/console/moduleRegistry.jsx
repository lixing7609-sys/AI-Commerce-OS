import { SecretaryModule } from "./modules/secretary/SecretaryModule.jsx";
import { DashboardModule } from "./modules/dashboard/DashboardModule.jsx";
import { ProductCenterModule } from "./modules/productCenter/ProductCenterModule.jsx";
import { OrderCenterModule } from "./modules/orderCenter/OrderCenterModule.jsx";
import { CustomerServiceCenterModule } from "./modules/customerServiceCenter/CustomerServiceCenterModule.jsx";
import { AgentStudioModule } from "./modules/agentStudio/AgentStudioModule.jsx";
import { ModelRouterModule } from "./modules/modelRouter/ModelRouterModule.jsx";
import { TokenCenterModule } from "./modules/tokenCenter/TokenCenterModule.jsx";
import { AdCenterModule } from "./modules/adCenter/AdCenterModule.jsx";
import { AutomationPolicyModule } from "./modules/automationPolicy/AutomationPolicyModule.jsx";
import { ApprovalCenterModule } from "./modules/approvalCenter/ApprovalCenterModule.jsx";
import { BenchmarkCenterModule } from "./modules/benchmarkCenter/BenchmarkCenterModule.jsx";
import { ReplayCenterModule } from "./modules/replayCenter/ReplayCenterModule.jsx";
import { EvaluationCenterModule } from "./modules/evaluationCenter/EvaluationCenterModule.jsx";
import { SystemCenterModule } from "./modules/systemCenter/SystemCenterModule.jsx";
import { StoreConnectionCenter } from "./labs/StoreConnectionCenter.jsx";
import { OperatorLabWithExit } from "./labs/OperatorLabWithExit.jsx";
import { StudioLabConnected } from "./labs/StudioLabConnected.jsx";

/**
 * 模块 key -> 组件的唯一映射，ConsoleShell 从这里查表渲染当前
 * 模块，不写一长串 if/else。key 必须和 nav/navConfig.js 中的
 * FOUNDER_MODULES 完全对应。
 *
 * 阶段 M8 Founder Product Shell Consolidation：storeCenter/
 * contentCenter/liveCenter/trafficNetworkCenter 已经从这里移除——
 * 不是删除功能，而是通过 navConfig.js 的 MODULE_REDIRECTS 分别落到
 * Operator 实验室（店铺）和 Studio 实验室（内容/直播/流量网络）的
 * 对应页面，避免维护两份重复实现。productCenter/orderCenter/
 * customerServiceCenter/approvalCenter 仍然保留在这里——它们是
 * `pendingOperatorParity: true` 的已知未完成收口项，见
 * navConfig.js 顶部注释和 founder-superset-live-pilot.md。
 */
export const MODULE_COMPONENTS = {
  secretary: SecretaryModule,
  dashboard: DashboardModule,
  productCenter: ProductCenterModule,
  orderCenter: OrderCenterModule,
  customerServiceCenter: CustomerServiceCenterModule,
  agentStudio: AgentStudioModule,
  modelRouter: ModelRouterModule,
  tokenCenter: TokenCenterModule,
  adCenter: AdCenterModule,
  automationPolicy: AutomationPolicyModule,
  approvalCenter: ApprovalCenterModule,
  benchmarkCenter: BenchmarkCenterModule,
  replayCenter: ReplayCenterModule,
  evaluationCenter: EvaluationCenterModule,
  systemCenter: SystemCenterModule,
  storeConnectionCenter: StoreConnectionCenter,
  operatorLab: OperatorLabWithExit,
  studioLab: StudioLabConnected,
};
