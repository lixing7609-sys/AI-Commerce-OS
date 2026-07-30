import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { CostTokenPage } from "../../../../operator-preview/pages/AIGrowthPage.jsx";

const TABS = [
  { key: "costToken", label: "成本与 Token" },
  { key: "profit", label: "利润" },
];

const PROFIT_BY_SHOP = [
  { id: 719, name: "新城", revenue: 61200, cost: 38400, tokenCost: 1860, margin: "34.3%" },
  { id: 731, name: "淘宝旗舰店", revenue: 25220, cost: 19800, tokenCost: 940, margin: "18.0%" },
  { id: 718, name: "演示店铺", revenue: 0, cost: 0, tokenCost: 0, margin: "—" },
];

/**
 * Operator Lab · Finance & Profit (Charter §3.3) — Operator's own
 * P&L view (revenue − cost − token spend) alongside the existing
 * cost/Token consumption page. Cross-links to Cloud Center's Token
 * for the underlying ledger, per the charter's "clear relationships
 * to other Founder modules" requirement.
 */
export function FinanceProfitPage({ rootNavigate, activeKey }) {
  const [tab, setTab] = useState(activeKey === "costToken" ? "costToken" : "profit");
  const totalRevenue = PROFIT_BY_SHOP.reduce((s, r) => s + r.revenue, 0);
  const totalCost = PROFIT_BY_SHOP.reduce((s, r) => s + r.cost + r.tokenCost, 0);

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "costToken" ? <CostTokenPage /> : null}
      {tab === "profit" ? (
        <div>
          <PageHeader title="利润" subtitle="按店铺的收入-成本-Token 支出核算" actions={<DemoBadge />} />
          <StatGrid>
            <StatCard label="总收入（30天）" value={`¥${totalRevenue.toLocaleString()}`} />
            <StatCard label="总成本（含Token）" value={`¥${totalCost.toLocaleString()}`} />
            <StatCard label="综合毛利率" value={totalRevenue > 0 ? `${(((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1)}%` : "—"} />
          </StatGrid>
          <div className="fdr-card" style={{ marginTop: 16 }}>
            <DataTable
              columns={[
                { key: "name", label: "店铺" },
                { key: "revenue", label: "收入", render: (r) => `¥${r.revenue.toLocaleString()}` },
                { key: "cost", label: "运营成本", render: (r) => `¥${r.cost.toLocaleString()}` },
                { key: "tokenCost", label: "Token 支出", render: (r) => `¥${r.tokenCost.toLocaleString()}` },
                { key: "margin", label: "毛利率", render: (r) => <StatusPill tone={r.margin === "—" ? "neutral" : "success"}>{r.margin}</StatusPill> },
              ]}
              rows={PROFIT_BY_SHOP}
            />
          </div>
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <button type="button" className="fdr-btn fdr-btn--ghost" onClick={() => rootNavigate("cloudToken")}>查看 Cloud Center · Token 明细 →</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
