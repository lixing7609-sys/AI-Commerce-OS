import { useMemo, useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { DemoBadge } from "../../../kit/StatusPill.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { TrendLineChart, BreakdownPieChart } from "../../../kit/ChartFrame.jsx";
import { DEMO_STORES } from "../../../mock/storesMock.js";
import { getAnalyticsSummary } from "../mock/analyticsMock.js";

const ALL = "all";
const RANGE_OPTIONS = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "90d", label: "近 90 天" },
];

export function AnalyticsPage() {
  const [storeId, setStoreId] = useState(ALL);
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(false);

  const summary = useMemo(() => getAnalyticsSummary({ storeId, range }), [storeId, range]);

  function handleRangeChange(nextRange) {
    setLoading(true);
    setRange(nextRange);
    window.setTimeout(() => setLoading(false), 250);
  }

  return (
    <div>
      <PageHeader
        title="数据与经营分析"
        subtitle="按店铺 / 时间范围筛选的 GMV、订单、渠道与商品表现"
        actions={<DemoBadge />}
      />

      <div className="fdr-card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <select className="fdr-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value={ALL}>全部店铺</option>
          {DEMO_STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              className={"fdr-btn " + (range === r.key ? "fdr-btn--primary" : "fdr-btn--secondary")}
              onClick={() => handleRangeChange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="fdr-card"><EmptyState icon="…" message="正在计算数据" /></div>
      ) : summary.gmvTrend.length === 0 ? (
        <div className="fdr-card"><EmptyState icon="◔" message="当前筛选条件下暂无数据" /></div>
      ) : (
        <>
          <StatGrid>
            <StatCard label="GMV 合计" value={`¥${summary.totalGmv.toLocaleString()}`} />
            <StatCard label="订单数" value={summary.totalOrders} />
            <StatCard label="客单价" value={`¥${summary.avgOrderValue}`} />
            <StatCard label="转化率" value={`${(summary.conversionRate * 100).toFixed(1)}%`} />
          </StatGrid>

          <div className="fdr-card">
            <h3 className="fdr-card__title">GMV 趋势</h3>
            <TrendLineChart data={summary.gmvTrend} xKey="date" series={[{ key: "gmv", label: "GMV" }]} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="fdr-card">
              <h3 className="fdr-card__title">渠道占比</h3>
              {summary.channelBreakdown.length > 0 ? (
                <BreakdownPieChart data={summary.channelBreakdown.map((c) => ({ name: c.storeName, value: c.gmv }))} height="sm" />
              ) : (
                <EmptyState icon="◔" message="暂无渠道数据" />
              )}
            </div>
            <div className="fdr-card">
              <h3 className="fdr-card__title">复购率</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "12px 0" }}>{(summary.customerRepeatRate * 100).toFixed(1)}%</p>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>近 {range === "7d" ? 7 : range === "30d" ? 30 : 90} 天内下单 ≥2 次的客户占比</p>
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">热销商品</h3>
            <DataTable
              columns={[
                { key: "name", label: "商品" },
                { key: "sku", label: "SKU" },
                { key: "sales", label: "销量" },
                { key: "gmv", label: "GMV", render: (r) => `¥${r.gmv.toLocaleString()}` },
              ]}
              rows={summary.topProducts}
            />
          </div>
        </>
      )}
    </div>
  );
}
