import { useEffect, useState } from "react";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getDashboardSummary, getTaskStats } from "../../../services/api.js";
import { getTaskAnalytics } from "../../../services/analyticsApi.js";
import { safeCall } from "../../realDataSafe.js";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Metric } from "../../kit/Metric.jsx";
import { SegmentedControl } from "../../kit/SegmentedControl.jsx";
import { KeyValueList } from "../../kit/KeyValueList.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { TrendLineChart, ComparisonBarChart } from "../../kit/ChartFrame.jsx";
import { getOperatingLoopSummary, OPERATING_LOOP_PROJECT_ID } from "../../mock/contentMock.js";
import { getCloudStatusSummary } from "../founderWorkspace/workspaceEntities.js";
import { getFeaturedDevice } from "../../../demoData/founderDemoData.js";
import { RestrictedAction } from "../founderWorkspace/WorkspaceKit.jsx";

const RANGE_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

/**
 * Detail/secondary tier of Founder工作台's Decision Home pilot —
 * see SecretaryModule.jsx for the decision-first primary tier. This
 * tab holds the numbers that matter for review but not for the
 * three-second decision the Secretary tab exists to make.
 */
export function DashboardModule() {
  const { navigate } = useConsoleNavContext();
  const [range, setRange] = useState("7d");
  const loopSummary = getOperatingLoopSummary();
  const cloudStatus = getCloudStatusSummary();
  const featuredDevice = getFeaturedDevice();
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
  const completionRate =
    analytics.connected && analytics.data?.completion_rate != null
      ? Math.round(analytics.data.completion_rate * 100)
      : null;

  return (
    <div>
      <PageHeader
        title="今日经营"
        subtitle="经营全景 — 更完整的趋势与明细"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
            <RestrictedAction label="导出经营报表" />
          </div>
        }
      />

      <div style={{ marginBottom: "var(--space-32)" }}>
        <Metric
          variant="primary"
          value={completionRate != null ? completionRate : "—"}
          unit={completionRate != null ? "%" : undefined}
          caption="任务完成率 — 今日最重要的一个数字"
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-40)", marginBottom: "var(--space-32)" }}>
        <Metric
          variant="standard"
          value={analytics.connected ? analytics.data?.totals?.total ?? "—" : stats.data?.total ?? "—"}
          caption="任务总数"
        />
        <Metric
          variant="standard"
          value={summary.connected ? summary.data?.products ?? "—" : "未接入"}
          caption="商品数"
        />
        <Metric variant="standard" value="¥ 12,480" caption="GMV（演示，较昨日 +6%）" />
        <Metric variant="standard" value="¥ 640" caption="广告花费（演示，较昨日 -3%）" />
        <Metric variant="standard" value="8,760" caption="Token 消耗（演示，较昨日 +11%）" />
      </div>
      <DemoBadge />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "var(--space-24)", marginTop: "var(--space-24)" }}>
        <div className="fdr-card">
          <h3 className="fdr-type-heading-card" style={{ margin: "0 0 var(--space-8)" }}>跨系统概览（演示）</h3>
          <KeyValueList
            items={[
              { label: "内容机会", value: "6", onClick: () => navigate("contentCenter", { subView: "trendRadar" }) },
              { label: "内容生产中", value: "3", onClick: () => navigate("contentCenter", { subView: "repurposing" }) },
              { label: "内容 ROI", value: "3.1", onClick: () => navigate("contentCenter", { subView: "performance" }) },
              { label: "直播 GMV", value: "¥11,860", onClick: () => navigate("liveCenter", { subView: "overview" }) },
              { label: "直播 ROI", value: "4.2", onClick: () => navigate("liveCenter", { subView: "review" }) },
              { label: "售后工单数", value: "6", onClick: () => navigate("customerServiceCenter", { subView: "afterSales" }) },
              { label: "退款率", value: "2.1%", onClick: () => navigate("customerServiceCenter", { subView: "overview" }) },
              { label: "流量网络账号数", value: "13", onClick: () => navigate("trafficNetworkCenter") },
              { label: "流量 ROI", value: "3.6", onClick: () => navigate("trafficNetworkCenter", { subView: "analytics" }) },
              { label: "Agent 健康度均值", value: "88%", onClick: () => navigate("agentStudio") },
            ]}
          />
        </div>

        <div className="fdr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-8)" }}>
            <h3 className="fdr-type-heading-card" style={{ margin: 0 }}>经营闭环摘要（阶段 Founder V4.3）</h3>
            <DemoBadge />
          </div>
          <KeyValueList
            items={[
              { label: "进行中内容项目", value: loopSummary.activeContentProjects, onClick: () => navigate("contentCenter", { subView: "projects", entityId: OPERATING_LOOP_PROJECT_ID }) },
              { label: "待审批", value: loopSummary.pendingApprovals, onClick: () => navigate("approvalCenter") },
              { label: "待发布", value: loopSummary.readyToPublish, onClick: () => navigate("contentCenter", { subView: "projects", entityId: OPERATING_LOOP_PROJECT_ID }) },
              { label: "今日已发布", value: loopSummary.publishedToday, onClick: () => navigate("contentCenter", { subView: "projects", entityId: OPERATING_LOOP_PROJECT_ID }) },
              { label: "归因订单数", value: loopSummary.attributedOrders, onClick: () => navigate("orderCenter") },
              { label: "归因 GMV", value: `¥${loopSummary.attributedGmv}`, onClick: () => navigate("orderCenter") },
              { label: "进行中客服会话", value: loopSummary.openConversations, onClick: () => navigate("customerServiceCenter", { subView: "daily" }) },
              { label: "待人工接管", value: loopSummary.humanTakeoverRequests, onClick: () => navigate("customerServiceCenter", { subView: "takeover" }) },
              { label: "待复盘", value: loopSummary.reviewPending, onClick: () => navigate("contentCenter", { subView: "projects", entityId: OPERATING_LOOP_PROJECT_ID }) },
            ]}
          />
        </div>

        <div className="fdr-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-8)" }}>
            <h3 className="fdr-type-heading-card" style={{ margin: 0 }}>设备与云端状态</h3>
            <DemoBadge />
          </div>
          <p className="fdr-type-body-small" style={{ color: "var(--text-secondary)", margin: "0 0 var(--space-12)" }}>{cloudStatus.summary}</p>
          <KeyValueList
            items={[
              ...cloudStatus.metrics.map((m) => ({ label: m.label, value: m.value, onClick: () => navigate("cloudStatus") })),
              featuredDevice ? { label: "锚点设备", value: `${featuredDevice.id} · ${featuredDevice.health === "healthy" ? "健康" : featuredDevice.health}`, onClick: () => navigate("cloudCenter", { subView: "devices" }) } : null,
            ].filter(Boolean)}
          />
        </div>
      </div>

      <div className="fdr-card" style={{ marginTop: "var(--space-24)" }}>
        <h3 className="fdr-type-heading-card" style={{ margin: "0 0 var(--space-8)" }}>任务量趋势</h3>
        {trend.length > 0 ? (
          <TrendLineChart data={trend} xKey="date" series={[{ key: "count", label: "任务数" }]} />
        ) : (
          <EmptyState message="暂无趋势数据" />
        )}
      </div>

      <div className="fdr-card" style={{ marginTop: "var(--space-24)" }}>
        <h3 className="fdr-type-heading-card" style={{ margin: "0 0 var(--space-8)" }}>按 Agent 分布</h3>
        {byAgent.length > 0 ? (
          <ComparisonBarChart
            data={byAgent}
            xKey="agent"
            series={[
              { key: "completed", label: "已完成", color: "#16A34A" },
              { key: "failed", label: "失败", color: "#DC2626" },
            ]}
          />
        ) : (
          <EmptyState message="暂无 Agent 分布数据" />
        )}
      </div>
    </div>
  );
}
