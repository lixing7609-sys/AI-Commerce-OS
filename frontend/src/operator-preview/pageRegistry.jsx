import DashboardPage from "./pages/DashboardPage";
import SecretaryPage from "./pages/SecretaryPage";
import SettingsPage from "./pages/SettingsPage";
import { AIGrowthPage, CostTokenPage, DeviceUpdatesPage, DataPrivacyPage } from "./pages/AIGrowthPage";
import { AdOpsPage } from "./pages/AdOpsPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import ShopCenterContent from "../shared/products/operator/ShopCenterContent.jsx";
import { MarketplaceBrowser } from "../shared/marketplace/MarketplaceBrowser.jsx";

/**
 * 模块 key -> 渲染函数的唯一映射，OperatorPreviewApp 从这里查表
 * 渲染当前页面，不写一长串 if/else——与 Founder 的
 * console/moduleRegistry.jsx 同一个原则，key 必须和
 * helpers/navigation.js 里的 OPERATOR_NAV_ITEMS 完全对应。
 *
 * 每一项接收 (props) => ReactNode，props 里包含 onNavigate/
 * initialDetail 等页面各自需要的东西；ComingSoonPage 那几项直接
 * 用箭头函数包一层，把标题/说明/计划功能列表固定下来。
 *
 * 阶段 M8 Founder Product Shell Consolidation：这份注册表现在是
 * Operator 唯一真源——Founder 的 Operator 实验室
 * （console/labs/OperatorLab.jsx）和这里的独立 Operator
 * （OperatorPreviewApp.jsx）渲染完全相同的组件，不允许 Founder 另外
 * fork 一份。唯一允许的宿主差异是 `founderOverlay` prop——只有
 * OperatorLab.jsx 会传入它，用来注入 Founder 专属的研发/诊断增强层
 * （例如店铺详情页的"平台连接器"标签页），独立 Operator 永远拿到
 * `undefined`，行为不变。
 */
export const PAGE_COMPONENTS = {
  dashboard: ({ navigate }) => <DashboardPage onNavigate={navigate} />,
  secretary: ({ navigate, detailRoute }) => <SecretaryPage onNavigate={navigate} initialDetail={detailRoute} />,
  shops: ({ founderOverlay }) => <ShopCenterContent extraDetailTabs={founderOverlay?.storeExtraDetailTabs} />,
  products: () => (
    <ComingSoonPage
      title="商品"
      description="管理你店铺的商品、定价与上架状态。"
      plannedFeatures={["商品列表与筛选", "AI 生成商品详情文案", "多平台上架状态", "库存与价格管理"]}
    />
  ),
  content: () => (
    <ComingSoonPage
      title="内容"
      description="AI 生成的图文/短视频内容与发布状态。"
      plannedFeatures={["内容项目列表", "AI 内容生成与审核", "多渠道发布状态", "内容表现数据"]}
    />
  ),
  adOps: () => <AdOpsPage />,
  orders: () => (
    <ComingSoonPage
      title="订单"
      description="店铺订单与异常订单处理。"
      plannedFeatures={["订单列表与筛选", "异常订单提醒", "发货状态跟踪"]}
    />
  ),
  customerService: () => (
    <ComingSoonPage
      title="客服"
      description="AI 客服会话与人工接管。"
      plannedFeatures={["日常咨询会话", "AI 回复草稿", "人工接管入口", "售后处理"]}
    />
  ),
  approvals: () => (
    <ComingSoonPage
      title="审批"
      description="需要你确认的 AI 建议与操作。"
      plannedFeatures={["待审批事项列表", "批准/驳回", "审批历史"]}
    />
  ),
  growth: () => <AIGrowthPage />,
  costToken: () => <CostTokenPage />,
  marketplace: () => <MarketplaceBrowser theme="operator" />,
  deviceUpdates: () => <DeviceUpdatesPage />,
  dataPrivacy: () => <DataPrivacyPage />,
  settings: () => <SettingsPage />,
};
