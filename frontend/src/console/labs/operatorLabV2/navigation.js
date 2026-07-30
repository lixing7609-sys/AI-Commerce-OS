/**
 * Founder 内嵌 Operator 实验室 v2 的唯一权威导航列表（阶段 Founder
 * Full-System v3 Batch 2）。
 *
 * 这是一份**独立于** `operator-preview/helpers/navigation.js` 的新
 * 列表——交办任务明确要求本批次不得改动独立 `/operator` 应用，而
 * Operator 实验室原来的"零分叉"架构意味着继续复用
 * `operator-preview/` 的 registry 会不可避免地一起改到独立应用。
 * 因此这里 fork 出 Founder 专属的 Operator 实验室导航+registry：
 * 复用不需要改动的底层组件（ShopCenterContent、AIGrowthPage 等，
 * 这些本来就是 `shared/`/`operator-preview/` 下已经很完整的实现，
 * 直接 import 不算"修改"独立应用），新建本批次要求必须补齐到
 * LEVEL B 的模块（客户/自动经营/数据与经营分析），并且把商品/订单/
 * 客服/审批四个原来在 Founder 侧边栏里以`pendingOperatorParity`
 * 重复警告按钮存在的模块，直接接到 Operator 实验室自己已有的完整
 * Founder 版实现（ProductCenterModule 等）——这样"重复导航"问题从
 * 根上解决：不再有两条并列的导航路径指向同一堆功能。
 *
 * 这是 fork，不是长期分裂——原始交办任务本身说明了方向："未来会从
 * Founder 内部完整能力中提取独立 Operator 产品"，即 Founder 的
 * Operator 实验室是上游、独立 Operator 未来从这里提取，所以本次
 * Founder 实验室领先于独立应用是符合既定方向的，不是架构倒退。
 */
/**
 * `directModule`（可选）：这四项底层复用的是 Founder 自己的顶级
 * 模块组件（ProductCenterModule/OrderCenterModule/
 * CustomerServiceCenterModule/ApprovalCenterModule）——这些组件内部
 * 直接读 `useConsoleNavContext()` 的全局 `subView` 当作"当前店铺范围/
 * 详情 tab"，如果按普通子项那样把它们塞进
 * `navigate("operatorLab", {subView:"orders"})`，组件内部会把
 * `"orders"` 这个字符串误当成店铺 id/tab 使用（真实复现过："undefined
 * 店铺明细"）。有 `directModule` 的子项点击后直接
 * `rootNavigate(item.directModule)`，让这些组件继续拥有自己的顶层
 * `module` 值，不经过 operatorLab 的 subView——见
 * shell/ConsoleSidebar.jsx 对应分支。
 */
/**
 * Founder Master Edition Charter §3.3 收口后的 13 项（曾经的 15 项
 * 收口/吸收如下，全部迁移映射见 Charter 实施记录）：
 *   - secretary + growth → AI Secretary（AiSecretaryWorkbenchPage）
 *   - costToken → Finance & Profit（FinanceProfitPage，新增"利润" Tab）
 *   - approvals + autoOps → Organization（OrganizationPage，新增
 *     "团队与权限" Tab）
 *   - shops + settings → Settings（SettingsWorkbenchPage，新增"平台
 *     连接" Tab）
 *   - content → 由新的 Marketing（MarketingPage）替代，承接其"跳转
 *     Studio"意图，旧 content key 仍在 pageRegistry 里可解析
 *   - brand → 全新（BrandPage）
 * 被吸收的旧 key（secretary/growth/costToken/approvals/autoOps/
 * shops/content）不再是这份列表的顶级子项，但仍在 pageRegistry.jsx
 * 的 OPERATOR_V2_PAGE_COMPONENTS 里可解析，指向对应组合页面的正确
 * 默认 Tab——不会 404，见 pageRegistry.jsx 顶部注释。
 */
export const OPERATOR_V2_NAV_ITEMS = [
  { key: "workbench", label: "Workspace", icon: "◆" },
  { key: "products", label: "Products", icon: "▣", directModule: "productCenter" },
  { key: "orders", label: "Orders", icon: "▤", directModule: "orderCenter" },
  { key: "customers", label: "Customers", icon: "◐" },
  { key: "customerService", label: "Customer Service", icon: "⟲", directModule: "customerServiceCenter" },
  { key: "marketing", label: "Marketing", icon: "▥" },
  { key: "adOps", label: "Advertising", icon: "■" },
  { key: "brand", label: "Brand", icon: "◆" },
  { key: "aiSecretary", label: "AI Secretary", icon: "☑" },
  { key: "analytics", label: "Data", icon: "▦" },
  { key: "financeProfit", label: "Finance & Profit", icon: "◔" },
  { key: "organization", label: "Organization", icon: "☲" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

export function isValidOperatorV2NavKey(key) {
  return OPERATOR_V2_NAV_ITEMS.some((item) => item.key === key);
}

export function getOperatorV2NavItem(key) {
  return OPERATOR_V2_NAV_ITEMS.find((item) => item.key === key) ?? null;
}
