import { useEffect, useState } from "react";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDashboardSummary, getTaskStats } from "../../../services/api.js";
import { getTaskAnalytics } from "../../../services/analyticsApi.js";
import { safeCall } from "../../realDataSafe.js";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { TrendLineChart, ComparisonBarChart } from "../../kit/ChartFrame.jsx";
import { Button } from "../../kit/Button.jsx";

const RANGE_OPTIONS = [
  { key: "today", label: "今天" },
  { key: "7d", label: "7 天" },
  { key: "30d", label: "30 天" },
];

export function DashboardModule() {
  const { navigate } = useConsoleNavContext();
  const [range, setRange] = useState("7d");
  const [summary, setSummary] = useState({ connected: false, data: null });
  const [stats, setStats] = useState({ connected: false, data: null });
  const [analytics, setAnalytics] = useState({ connected: false, data: null });

  useEffect(() => {
    safeCall(getDashboardSummary).then(setSummary);
    safeCall(getTaskStats).then(setStats);
  }, []);

  useEffect(() => {
    safeCall(() => getTaskAnalytics(range)).then(setAnalytics);
  }, [range]);

  const trend = analytics.data?.trend ?? [];
  const byAgent = (analytics.data?.by_agent ?? []).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="今日运营"
        subtitle="经营全景 — 更完整的趋势与明细"
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                variant={range === option.key ? "primary" : "secondary"}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      />

      <StatGrid>
        <StatCard
          label="任务总数"
          value={analytics.connected ? analytics.data?.totals?.total ?? "—" : stats.data?.total ?? "—"}
        />
        <StatCard
          label="完成率"
          value={
            analytics.connected && analytics.data?.completion_rate != null
              ? `${Math.round(analytics.data.completion_rate * 100)}%`
              : "—"
          }
        />
        <StatCard
          label="商品数"
          value={summary.connected ? summary.data?.products ?? "—" : "未接入"}
          onClick={() => navigate("productCenter")}
        />
        <StatCard label="GMV（演示）" value="¥ 12,480" delta={6} />
        <StatCard label="广告花费（演示）" value="¥ 640" delta={-3} onClick={() => navigate("adCenter")} />
        <StatCard label="Token 消耗（演示）" value="8,760" delta={11} onClick={() => navigate("tokenCenter")} />
      </StatGrid>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>跨系统概览（演示）</h3>
        </div>
        <StatGrid>
          <StatCard label="内容机会" value="6" onClick={() => navigate("contentCenter", { subView: "trendRadar" })} />
          <StatCard label="内容生产中" value="3" onClick={() => navigate("contentCenter", { subView: "repurposing" })} />
          <StatCard label="内容 ROI" value="3.1" onClick={() => navigate("contentCenter", { subView: "performance" })} />
          <StatCard label="直播 GMV" value="¥11,860" onClick={() => navigate("liveCenter", { subView: "overview" })} />
          <StatCard label="直播 ROI" value="4.2" onClick={() => navigate("liveCenter", { subView: "review" })} />
          <StatCard label="售后工单数" value="6" onClick={() => navigate("customerServiceCenter", { subView: "afterSales" })} />
          <StatCard label="退款率" value="2.1%" onClick={() => navigate("customerServiceCenter", { subView: "overview" })} />
          <StatCard label="流量网络账号数" value="13" onClick={() => navigate("trafficNetworkCenter")} />
          <StatCard label="流量 ROI" value="3.6" onClick={() => navigate("trafficNetworkCenter", { subView: "analytics" })} />
          <StatCard label="Agent 健康度均值" value="88%" onClick={() => navigate("agentStudio")} />
        </StatGrid>
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>任务量趋势</h3>
        </div>
        {trend.length > 0 ? (
          <TrendLineChart data={trend} xKey="date" series={[{ key: "count", label: "任务数" }]} />
        ) : (
          <EmptyState icon="▤" message="暂无趋势数据" />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">按 Agent 分布</h3>
        {byAgent.length > 0 ? (
          <ComparisonBarChart
            data={byAgent}
            xKey="agent"
            series={[
              { key: "completed", label: "已完成", color: "#22C55E" },
              { key: "failed", label: "失败", color: "#EF4444" },
            ]}
          />
        ) : (
          <EmptyState icon="▤" message="暂无 Agent 分布数据" />
        )}
      </div>

      <div style={{ marginTop: 4 }}>
        <DemoBadge /> <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>GMV/广告花费/Token 消耗为演示数据，其余来自真实后端</span>
      </div>
    </div>
  );
}
