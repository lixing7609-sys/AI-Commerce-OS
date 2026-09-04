import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { useToast } from "../../../kit/useToast.js";
import SecretaryPage from "../../../../operator-preview/pages/SecretaryPage.jsx";
import { AIGrowthPage } from "../../../../operator-preview/pages/AIGrowthPage.jsx";
import { getFeaturedOrder, getFeaturedProduct } from "../../../../demoData/operatorDemoData.js";

const TABS = [
  { key: "today", label: "今日建议" },
  { key: "secretary", label: "秘书任务" },
  { key: "growth", label: "AI 成长" },
];

const CATEGORY_LABEL = { profit: "利润建议", adOps: "广告建议", product: "商品建议", customerService: "客服建议" };
const CATEGORY_TONE = { profit: "success", adOps: "info", product: "warning", customerService: "neutral" };

function buildSuggestions() {
  const order = getFeaturedOrder();
  const product = getFeaturedProduct();
  return [
    {
      id: "sg-profit-1",
      category: "profit",
      title: order ? `订单 ${order.orderNumber} 退款中，建议核实退款原因` : "存在退款中订单，建议核实退款原因",
      detail: order ? `该订单金额 ¥${order.amount.toLocaleString()}，若退款成立将影响本月毛利润约 ${(order.amount / 100).toFixed(1)}%` : "退款会直接侵蚀毛利润，建议尽快处理",
    },
    {
      id: "sg-adops-1",
      category: "adOps",
      title: "「店铺新客召回」计划贡献利润被退款侵蚀，建议收紧人群包",
      detail: "该计划表面 ROAS 尚可，但退款损失偏高，贡献利润率低于同类计划",
    },
    {
      id: "sg-product-1",
      category: "product",
      title: product ? `「${product.title}」（${product.sku}）库存为 0，建议尽快补货` : "存在库存为 0 的商品，建议尽快补货",
      detail: product ? `该商品毛利率约 ${(((product.price - product.cost) / product.price) * 100).toFixed(0)}%，缺货会直接影响本月 GMV` : "缺货商品会直接影响本月 GMV",
    },
    {
      id: "sg-cs-1",
      category: "customerService",
      title: "有 2 条客服会话超过 30 分钟未回复，建议人工介入",
      detail: "AI 客服在售后场景的自动应答置信度偏低，建议人工接管",
    },
  ];
}

const OPERATIONAL_ANOMALIES = [
  { id: "an1", title: "抖音店A今日退款率高于近7日均值", severity: "medium", detectedAt: "今天 09:20" },
  { id: "an2", title: "淘宝店A广告花费超出日预算 80%", severity: "high", detectedAt: "今天 08:05" },
];

const PENDING_APPROVAL_SUMMARY = [
  { id: "pa1", title: "「大促预热」广告投放计划待批准", source: "广告投放" },
  { id: "pa2", title: "自动经营策略「低库存自动补货建议」待启用", source: "组织与审批" },
];

const EXECUTION_LOG = [
  { id: "ex1", time: "今天 10:12", action: "自动回复 3 条售前客服消息", outcome: "已完成" },
  { id: "ex2", time: "今天 08:30", action: "生成夏季新品补货建议", outcome: "已完成" },
  { id: "ex3", time: "昨天 22:00", action: "尝试自动调整「夏季新品推广」出价", outcome: "转人工审批" },
];

const SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
const SEVERITY_TONE = { high: "danger", medium: "warning", low: "neutral" };

function TodaySuggestionsPanel({ rootNavigate }) {
  const toast = useToast();
  const [decisions, setDecisions] = useState({});
  const suggestions = buildSuggestions();
  const pending = suggestions.filter((s) => !decisions[s.id]);

  function decide(item, decision) {
    setDecisions((prev) => ({ ...prev, [item.id]: decision }));
    toast(`已${decision === "accepted" ? "接受" : "驳回"}建议：${item.title}`, decision === "accepted" ? "success" : "danger");
  }

  return (
    <div>
      <StatGrid>
        <StatCard label="今日建议" value={suggestions.length} />
        <StatCard label="经营异常" value={OPERATIONAL_ANOMALIES.length} />
        <StatCard label="待审批事项" value={PENDING_APPROVAL_SUMMARY.length} />
        <StatCard label="今日执行记录" value={EXECUTION_LOG.length} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">今日建议</h3>
        {pending.length === 0 ? (
          <EmptyState icon="☑" message="今日建议已全部处理" />
        ) : (
          pending.map((s) => (
            <div key={s.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StatusPill tone={CATEGORY_TONE[s.category]}>{CATEGORY_LABEL[s.category]}</StatusPill>
                <strong style={{ fontSize: 13 }}>{s.title}</strong>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 8px" }}>{s.detail}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" variant="primary" onClick={() => decide(s, "accepted")}>接受建议</Button>
                <Button size="sm" variant="secondary" onClick={() => decide(s, "rejected")}>驳回建议</Button>
              </div>
            </div>
          ))
        )}
        {Object.keys(decisions).length > 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
            本次会话内已处理 {Object.keys(decisions).length} 条建议（本地演示状态，刷新页面会重置）。
          </p>
        ) : null}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">经营异常</h3>
        {OPERATIONAL_ANOMALIES.map((a) => (
          <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{a.title}</strong>
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-secondary)" }}>{a.detectedAt}</span>
            </div>
            <StatusPill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</StatusPill>
          </div>
        ))}
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>待审批事项</h3>
          {rootNavigate ? (
            <Button size="sm" variant="secondary" onClick={() => rootNavigate("organization")}>前往组织与审批 →</Button>
          ) : null}
        </div>
        <DataTable
          columns={[
            { key: "title", label: "事项" },
            { key: "source", label: "来源模块" },
          ]}
          rows={PENDING_APPROVAL_SUMMARY}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">执行记录</h3>
        <DataTable
          columns={[
            { key: "time", label: "时间" },
            { key: "action", label: "AI 执行内容" },
            { key: "outcome", label: "结果" },
          ]}
          rows={EXECUTION_LOG}
        />
      </div>
    </div>
  );
}

/**
 * Operator Lab · AI Secretary (Charter §3.3) — merges the day-to-day
 * secretary inbox with the AI growth/learning feed, since both are
 * "what is my AI doing for me" from the Operator's point of view.
 * `activeKey` (the caller's activePage, either "aiSecretary" or a
 * legacy "secretary"/"growth" deep link) picks the initial tab.
 *
 * `today` 分类建议/经营异常/待审批事项/执行记录是本次审查新增的
 * 顶层小节——之前只有"秘书任务"（复用未改动的 SecretaryPage）和
 * "AI 成长"两个 Tab，缺少按利润/广告/商品/客服分类、且支持"接受/
 * 驳回"两个本地反馈操作的建议列表。
 */
export function AiSecretaryWorkbenchPage({ navigate, rootNavigate, entityId, activeKey }) {
  const [tab, setTab] = useState(activeKey === "growth" ? "growth" : activeKey === "secretary" ? "secretary" : "today");

  return (
    <div>
      <PageHeader title="Operator 秘书" subtitle="AI 今天在为你做什么，哪些经营事项等你决定" actions={<DemoBadge />} />
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "today" ? <TodaySuggestionsPanel navigate={navigate} rootNavigate={rootNavigate} /> : null}
      {tab === "secretary" ? <SecretaryPage onNavigate={navigate} initialDetail={entityId} /> : null}
      {tab === "growth" ? <AIGrowthPage /> : null}
    </div>
  );
}
