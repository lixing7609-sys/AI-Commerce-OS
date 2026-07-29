import SecretaryPage from "../../../operator-preview/pages/SecretaryPage.jsx";
import SettingsPage from "../../../operator-preview/pages/SettingsPage.jsx";
import { AIGrowthPage, CostTokenPage } from "../../../operator-preview/pages/AIGrowthPage.jsx";
import ShopCenterContent from "../../../shared/products/operator/ShopCenterContent.jsx";
import { STORE_DETAIL_EXTRA_TABS } from "../../modules/storeCenter/storeDetailExtraTabs.jsx";
import { StoreConnectionCenter } from "../StoreConnectionCenter.jsx";
import { WorkbenchPage } from "./pages/WorkbenchPage.jsx";
import { ContentRedirectNotice } from "./pages/ContentRedirectNotice.jsx";
import { DirectModuleRedirect } from "./pages/DirectModuleRedirect.jsx";
import { AdOpsPage } from "./pages/AdOpsPage.jsx";
import { CustomersPage } from "./pages/CustomersPage.jsx";
import { AutoOpsPage } from "./pages/AutoOpsPage.jsx";
import { AnalyticsPage } from "./pages/AnalyticsPage.jsx";

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
  secretary: ({ navigate, entityId }) => <SecretaryPage onNavigate={navigate} initialDetail={entityId} />,
  // `extraDetailTabs`：Founder 专属研发/诊断增强层（店铺详情页的
  // "平台连接器"标签），旧版 OperatorLab.jsx 通过 `founderOverlay` prop
  // 注入同一份 `STORE_DETAIL_EXTRA_TABS`——这里直接传入，效果不变，
  // 独立 Operator（`operator-preview/pageRegistry.jsx`）永远拿不到，
  // 行为不变。
  shops: () => <ShopCenterContent extraDetailTabs={STORE_DETAIL_EXTRA_TABS} />,
  products: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="productCenter" />,
  content: ({ rootNavigate }) => <ContentRedirectNotice onGoToStudio={() => rootNavigate("studioLab", { subView: "contentProjects" })} />,
  adOps: () => <AdOpsPage />,
  orders: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="orderCenter" />,
  customers: () => <CustomersPage />,
  customerService: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="customerServiceCenter" />,
  approvals: ({ rootNavigate }) => <DirectModuleRedirect rootNavigate={rootNavigate} moduleKey="approvalCenter" />,
  growth: () => <AIGrowthPage />,
  costToken: () => <CostTokenPage />,
  analytics: () => <AnalyticsPage />,
  autoOps: () => <AutoOpsPage />,
  storeConnection: () => <StoreConnectionCenter />,
  settings: () => <SettingsPage />,
};
