import { WorkbenchPage } from "./pages/WorkbenchPage.jsx";
import { ContentRedirectNotice } from "./pages/ContentRedirectNotice.jsx";
import { DirectModuleRedirect } from "./pages/DirectModuleRedirect.jsx";
import { AdOpsPage } from "./pages/AdOpsPage.jsx";
import { CustomersPage } from "./pages/CustomersPage.jsx";
import { AnalyticsPage } from "./pages/AnalyticsPage.jsx";
import { MarketingPage } from "./pages/MarketingPage.jsx";
import { BrandPage } from "./pages/BrandPage.jsx";
import { AiSecretaryWorkbenchPage } from "./pages/AiSecretaryWorkbenchPage.jsx";
import { FinanceProfitPage } from "./pages/FinanceProfitPage.jsx";
import { OrganizationPage } from "./pages/OrganizationPage.jsx";
import { SettingsWorkbenchPage } from "./pages/SettingsWorkbenchPage.jsx";

/**
 * Operator 实验室 v2 唯一权威 key -> 组件映射（阶段 Founder
 * Full-System v3 Batch 2）。key 必须和 navigation.js 的
 * OPERATOR_V2_NAV_ITEMS 完全对应。
 *
 * 复用未改动的底层组件（`shared/products/operator/ShopCenterContent`、
 * `operator-preview/pages/SecretaryPage` 等）不算修改独立 /operator
 * 应用——这些是导入未经修改的既有实现。真正新建的只有 5 个：
 * WorkbenchPage、AdOpsPage、CustomersPage、AutoOpsPage、
 * AnalyticsPage（见各自文件顶部注释）。
 *
 * "商品"/"订单"/"客服"/"审批" 四项不在这里渲染 Founder 自己的
 * ProductCenterModule/OrderCenterModule/CustomerServiceCenterModule/
 * ApprovalCenterModule——这几个组件内部直接读全局 `subView` 当作
 * "店铺范围/详情 tab"，塞进 `operatorLab` 的 subView 里会读串（真实
 * 复现过"undefined 店铺明细"）。侧边栏点击已经通过 `directModule`
 * 直接跳到这些组件自己的顶层模块（见 navigation.js +
 * shell/ConsoleSidebar.jsx），这里保留的是同一份"重定向"兜底——万一
 * 有人手工拼 `?module=operatorLab&subView=orders` 这样的旧式链接，
 * 也会立刻跳到正确的顶层模块，而不是渲染出同一个读串 bug。
 */
export const OPERATOR_V2_PAGE_COMPONENTS = {
  workbench: ({ navigate }) => <WorkbenchPage navigate={navigate} />,
  products: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="productCenter" />,
  orders: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="orderCenter" />,
  customers: ({ rootNavigate }) => <CustomersPage rootNavigate={rootNavigate} />,
  customerService: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="customerServiceCenter" />,
  marketing: ({ rootNavigate }) => <MarketingPage rootNavigate={rootNavigate} />,
  adOps: ({ rootNavigate }) => <AdOpsPage rootNavigate={rootNavigate} />,
  brand: ({ rootNavigate }) => <BrandPage rootNavigate={rootNavigate} />,
  aiSecretary: ({ navigate, rootNavigate, entityId, activeKey }) => <AiSecretaryWorkbenchPage navigate={navigate} rootNavigate={rootNavigate} entityId={entityId} activeKey={activeKey} />,
  analytics: ({ rootNavigate }) => <AnalyticsPage rootNavigate={rootNavigate} />,
  financeProfit: ({ rootNavigate, activeKey }) => <FinanceProfitPage rootNavigate={rootNavigate} activeKey={activeKey} />,
  organization: ({ activeKey }) => <OrganizationPage activeKey={activeKey} />,
  settings: ({ activeKey }) => <SettingsWorkbenchPage activeKey={activeKey} />,
  // 以下是被吸收进上面六个组合页面的旧 key——不再是 OPERATOR_V2_NAV_ITEMS
  // 的顶级子项，但仍然可以通过旧的 `?module=operatorLab&subView=xxx`
  // 深链解析，落地到组合页面里正确的默认 Tab（`activeKey` 由
  // OperatorLabV2Connected.jsx 透传，等于当前 subView）。
  secretary: (props) => <AiSecretaryWorkbenchPage {...props} />,
  growth: (props) => <AiSecretaryWorkbenchPage {...props} />,
  costToken: (props) => <FinanceProfitPage {...props} />,
  approvals: (props) => <OrganizationPage {...props} />,
  autoOps: (props) => <OrganizationPage {...props} />,
  shops: (props) => <SettingsWorkbenchPage {...props} />,
  content: ({ rootNavigate }) => <ContentRedirectNotice onGoToStudio={() => rootNavigate("studioLab", { subView: "contentProjects" })} />,
  storeConnection: (props) => <SettingsWorkbenchPage {...props} activeKey="connections" />,
};
