import { useMemo, useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { TrendLineChart, BreakdownPieChart } from "../../../kit/ChartFrame.jsx";
import { useToast } from "../../../kit/useToast.js";
import { DEMO_STORES } from "../../../mock/storesMock.js";
import { getAnalyticsSummary } from "../mock/analyticsMock.js";
import { getAdContributionSummary } from "../../../mock/adCenterMock.js";

const ALL = "all";
const RANGE_OPTIONS = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "90d", label: "近 90 天" },
];

const CONTENT_DATA = {
  publishedCount: 12,
  avgCompletionRate: 0.41,
  avgClickRate: 0.068,
  distributionChannels: 3,
};

function toCsvValue(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportSummaryToCsv(summary) {
  const header = ["日期", "GMV", "订单数"].join(",");
  const rows = summary.gmvTrend.map((d) => [d.date, d.gmv, d.orders].map(toCsvValue).join(","));
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `经营数据_${summary.range}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AnalyticsPage({ rootNavigate }) {
  const toast = useToast();
  const [storeId, setStoreId] = useState(ALL);
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(false);

  const summary = useMemo(() => getAnalyticsSummary({ storeId, range }), [storeId, range]);
  const adSummary = getAdContributionSummary();

  function handleRangeChange(nextRange) {
    setLoading(true);
    setRange(nextRange);
    window.setTimeout(() => setLoading(false), 250);
  }

  function handleExport() {
    exportSummaryToCsv(summary);
    toast("已导出 CSV 到本地下载", "success");
  }

  return (
    <div>
      <PageHeader
        title="数据中心"
        subtitle="按店铺 / 时间范围筛选的销售、商品、客户、订单、广告与内容表现"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <Button size="sm" variant="secondary" onClick={handleExport}>导出数据 CSV</Button>
            {rootNavigate ? <Button size="sm" variant="ghost" onClick={() => rootNavigate("financeProfit")}>查看财务与利润 →</Button> : null}
          </div>
        }
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
            <StatCard label="GMV 合计（销售数据）" value={`¥${summary.totalGmv.toLocaleString()}`} />
            <StatCard label="订单数（订单数据）" value={summary.totalOrders} />
            <StatCard label="客单价" value={`¥${summary.avgOrderValue}`} />
            <StatCard label="转化率" value={`${(summary.conversionRate * 100).toFixed(1)}%`} />
          </StatGrid>

          <div className="fdr-card">
            <h3 className="fdr-card__title">销售趋势</h3>
            <TrendLineChart data={summary.gmvTrend} xKey="date" series={[{ key: "gmv", label: "GMV" }]} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="fdr-card">
              <h3 className="fdr-card__title">渠道数据（占比）</h3>
              {summary.channelBreakdown.length > 0 ? (
                <BreakdownPieChart data={summary.channelBreakdown.map((c) => ({ name: c.storeName, value: c.gmv }))} height="sm" />
              ) : (
                <EmptyState icon="◔" message="暂无渠道数据" />
              )}
            </div>
            <div className="fdr-card">
              <h3 className="fdr-card__title">客户数据（复购率）</h3>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "12px 0" }}>{(summary.customerRepeatRate * 100).toFixed(1)}%</p>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>近 {range === "7d" ? 7 : range === "30d" ? 30 : 90} 天内下单 ≥2 次的客户占比</p>
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">商品数据（热销商品）</h3>
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

          <div className="fdr-card">
            <h3 className="fdr-card__title">广告数据</h3>
            <StatGrid>
              <StatCard label="广告归因收入" value={`¥${adSummary.revenue.toLocaleString()}`} />
              <StatCard label="广告花费" value={`¥${adSummary.spend.toLocaleString()}`} />
              <StatCard label="广告贡献利润" value={`¥${adSummary.contributionProfit.toLocaleString()}`} />
            </StatGrid>
            {rootNavigate ? (
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Button size="sm" variant="ghost" onClick={() => rootNavigate("adOps")}>查看广告投放详情 →</Button>
              </div>
            ) : null}
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">内容数据</h3>
            <StatGrid>
              <StatCard label="已发布内容" value={CONTENT_DATA.publishedCount} />
              <StatCard label="平均完播率" value={`${(CONTENT_DATA.avgCompletionRate * 100).toFixed(0)}%`} />
              <StatCard label="平均点击率" value={`${(CONTENT_DATA.avgClickRate * 100).toFixed(1)}%`} />
              <StatCard label="分发渠道数" value={CONTENT_DATA.distributionChannels} />
            </StatGrid>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">店铺对比</h3>
            {summary.channelBreakdown.length === 0 ? (
              <EmptyState icon="▦" message="暂无可对比的店铺数据" />
            ) : (
              <DataTable
                columns={[
                  { key: "storeName", label: "店铺" },
                  { key: "gmv", label: "GMV", render: (r) => `¥${r.gmv.toLocaleString()}` },
                  { key: "orders", label: "订单数" },
                  { key: "avgOrderValue", label: "客单价", render: (r) => `¥${r.avgOrderValue}` },
                  { key: "share", label: "GMV 占比", render: (r) => <StatusPill tone="neutral">{(r.share * 100).toFixed(1)}%</StatusPill> },
                ]}
                rows={summary.channelBreakdown}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
