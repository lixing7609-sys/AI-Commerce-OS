import DashboardPage from "../../../../operator-preview/pages/DashboardPage.jsx";
import { DemoBadge } from "../../../kit/StatusPill.jsx";

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

export function WorkbenchPage({ navigate }) {
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
      <DashboardPage onNavigate={navigate} />
    </div>
  );
}
