import DashboardPage from "../../../../operator-preview/pages/DashboardPage.jsx";
import { DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { getFeaturedOrder } from "../../../../demoData/operatorDemoData.js";

/**
 * Operator工作台——阶段 Founder Full-System v3 Batch 2 §B/§D。
 *
 * 之前 Founder 侧边栏在"Operator 实验室"展开面板最上方单独渲染了
 * 四个 FOUNDER_MODULES 按钮（真实店铺接入/商品中心/订单中心/客服
 * 中心/审批中心），它们的 title 属性全都是同一段警告文案"该模块
 * 尚未和 Operator 实验室完成单一真源合并"，视觉上看起来像是四个
 * 完全相同、无法区分的重复入口——这正是交办任务点名的"重复导航"
 * 问题。修复方式不是删掉这几个能力的入口，而是把它们做成本页面
 * 里的快捷操作卡片，各自显示真实名称（不是警告文案），点击后跳到
 * Operator 实验室 v2 registry 里对应的真实功能页——不再是并列于
 * 侧边栏的第二套导航。
 *
 * 顶部沿用 `operator-preview/pages/DashboardPage.jsx`（未改动、直接
 * 复用，不算修改独立 /operator 应用）拿到真实系统快照 + 演示经营
 * 数据——这部分内容本来就是完整实现，本次不重写。
 */
const QUICK_ACTIONS = [
  { key: "storeConnection", label: "真实店铺接入", description: "连接抖音/淘宝/小红书等平台账号", icon: "⛓" },
  { key: "products", label: "商品中心", description: "商品列表、AI 详情文案、多平台上架", icon: "▣" },
  { key: "orders", label: "订单中心", description: "订单筛选、发货、异常处理", icon: "▤" },
  { key: "customerService", label: "客服中心", description: "会话、售后、人工接管", icon: "⟲" },
  { key: "approvals", label: "审批中心", description: "待你确认的 AI 建议与操作", icon: "☑" },
];

/**
 * 补充经营提醒——今日经营概览/店铺状态/待处理订单已经由下方复用的
 * `DashboardPage`（未改动、直接复用）覆盖，这里补齐规范要求但
 * `DashboardPage` 没有单独呈现的六类提醒：客服消息/营销任务/广告
 * 建议/利润提醒/Operator秘书建议/待审批事项，每张卡片都能跳到对应
 * 的功能页面，不是纯展示。
 */
function buildReminderCards() {
  const featuredOrder = getFeaturedOrder();
  return [
    { key: "customerService", title: "客服消息", detail: "2 条售后消息等待回复，1 条超过 30 分钟未处理", icon: "⟲" },
    { key: "marketing", title: "营销任务", detail: "「夏季大促满减」活动进行中，内容需求 1 条待受理", icon: "▥" },
    { key: "adOps", title: "广告建议", detail: "「店铺新客召回」贡献利润被退款侵蚀，建议收紧人群包", icon: "■" },
    {
      key: "financeProfit",
      title: "利润提醒",
      detail: featuredOrder ? `订单 ${featuredOrder.orderNumber} 退款中，预计影响本月净利润 ¥${featuredOrder.amount.toLocaleString()}` : "本月净经营利润较上月下降，建议查看利润趋势",
      icon: "◔",
    },
    { key: "aiSecretary", title: "Operator 秘书建议", detail: "4 条今日建议待处理，其中 1 条商品建议与库存相关", icon: "☑" },
    { key: "organization", title: "待审批事项", detail: "2 项经营审批等待处理，1 项自动经营策略待启用", icon: "☲" },
  ];
}

export function WorkbenchPage({ navigate }) {
  const reminderCards = buildReminderCards();
  return (
    <div>
      <div className="fdr-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fdr-card__title" style={{ margin: 0 }}>快捷入口</h3>
        <DemoBadge />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            className="fdr-card"
            style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
            onClick={() => navigate(action.key)}
          >
            <div style={{ fontSize: 20 }}>{action.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, margin: "6px 0 2px" }}>{action.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{action.description}</div>
          </button>
        ))}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">补充经营提醒</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {reminderCards.map((card) => (
            <div key={card.key} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>{card.icon} {card.title}</strong>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 10px" }}>{card.detail}</p>
              <Button size="sm" variant="secondary" onClick={() => navigate(card.key)}>查看详情 →</Button>
            </div>
          ))}
        </div>
      </div>

      <DashboardPage onNavigate={navigate} />
    </div>
  );
}
