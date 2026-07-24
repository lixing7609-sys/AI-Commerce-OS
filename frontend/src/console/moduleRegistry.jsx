import { SecretaryModule } from "./modules/secretary/SecretaryModule.jsx";
import { DashboardModule } from "./modules/dashboard/DashboardModule.jsx";
import { StoreCenterModule } from "./modules/storeCenter/StoreCenterModule.jsx";
import { ProductCenterModule } from "./modules/productCenter/ProductCenterModule.jsx";
import { OrderCenterModule } from "./modules/orderCenter/OrderCenterModule.jsx";
import { ContentCenterModule } from "./modules/contentCenter/ContentCenterModule.jsx";
import { LiveCenterModule } from "./modules/liveCenter/LiveCenterModule.jsx";
import { CustomerServiceCenterModule } from "./modules/customerServiceCenter/CustomerServiceCenterModule.jsx";
import { TrafficNetworkCenterModule } from "./modules/trafficNetworkCenter/TrafficNetworkCenterModule.jsx";
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

/**
 * 模块 key -> 组件的唯一映射，ConsoleShell 从这里查表渲染当前
 * 模块，不写一长串 if/else。key 必须和 nav/navConfig.js 中的
 * FOUNDER_MODULES 完全对应。
 */
export const MODULE_COMPONENTS = {
  secretary: SecretaryModule,
  dashboard: DashboardModule,
  storeCenter: StoreCenterModule,
  productCenter: ProductCenterModule,
  orderCenter: OrderCenterModule,
  contentCenter: ContentCenterModule,
  liveCenter: LiveCenterModule,
  customerServiceCenter: CustomerServiceCenterModule,
  trafficNetworkCenter: TrafficNetworkCenterModule,
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
};
