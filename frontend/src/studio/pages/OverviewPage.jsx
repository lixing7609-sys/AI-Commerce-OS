import { getStudioOverview } from "../mock/studioMock.js";
import { PRODUCTION_PIPELINE_STAGES } from "../mock/studioMock.js";
import { Card, DemoBadge, StatGrid } from "./uiHelpers.jsx";
import { formatMoney, formatNumber } from "./formatters.js";

/**
 * Studio 概览（§5.A）——今日/本周生产与发布状态、矩阵账号与流量
 * 规模、可售广告资源与收入、算力使用量、内容生产流程、以及与
 * Operator 的协同关系。
 */
export function OverviewPage({ navigate }) {
  const overview = getStudioOverview();

  return (
    <div>
      <div className="st-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Studio 概览 —— 内容生产、矩阵账号、流量与广告资源的经营视图
        </div>
        <DemoBadge />
      </div>

      <StatGrid
        items={[
          { label: "生产中项目", value: overview.inProduction, onClick: () => navigate("contentProjects") },
          { label: "本周已发布", value: overview.weeklyPublished, onClick: () => navigate("contentProjects") },
          { label: "待审核内容", value: overview.pendingReview, onClick: () => navigate("contentProjects") },
          { label: "矩阵账号数量", value: overview.matrixAccountCount, onClick: () => navigate("matrixAccounts") },
          { label: "活跃矩阵账号", value: overview.activeAccounts, onClick: () => navigate("matrixAccounts") },
          { label: "总粉丝量", value: formatNumber(overview.totalFollowers), onClick: () => navigate("matrixAccounts") },
          { label: "今日播放量", value: formatNumber(overview.todayPlays) },
          { label: "本月累计流量", value: formatNumber(overview.monthlyTraffic), onClick: () => navigate("trafficPool") },
          { label: "可售广告资源", value: overview.sellableResources, onClick: () => navigate("adResources") },
          { label: "本月广告收入", value: formatMoney(overview.monthlyAdRevenue), onClick: () => navigate("adOrders") },
          { label: "内容分成收入", value: formatMoney(overview.contentShareRevenue), onClick: () => navigate("contentAssets") },
          { label: "算力任务使用量", value: `${overview.computeUsage} 单位`, onClick: () => navigate("computeTasks") },
        ]}
      />

      <Card title="内容生产流程">
        <div className="st-flow">
          {PRODUCTION_PIPELINE_STAGES.map((stage, idx) => (
            <span key={stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="st-flow-step">{stage}</span>
              {idx < PRODUCTION_PIPELINE_STAGES.length - 1 ? <span className="st-flow-arrow">→</span> : null}
            </span>
          ))}
        </div>
      </Card>

      <Card title="Studio 与 Operator 协同">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, fontSize: 13 }}>
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong>Operator 提出素材需求</strong>
            <p style={{ color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
              经营者商品/店铺/品牌营销需要的图片、视频、直播素材，作为内容项目需求进入 Studio 生产排期。
            </p>
          </div>
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong>Studio 提供内容服务</strong>
            <p style={{ color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
              内容成果计入 Studio 的内容资产库，成本由 Operator 承担，计入其经营成本。
            </p>
          </div>
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong>Operator 提出流量需求</strong>
            <p style={{ color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
              经营者的 AI 广告投放需要流量资源时，可比较电商平台广告与 Studio 流量资源。
            </p>
          </div>
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong>Studio 提供广告资源</strong>
            <p style={{ color: "var(--text-secondary)", margin: "6px 0 0 0" }}>
              广告订单收入进入 Studio 账本；对 Operator 而言这笔支出是其广告成本，两边账本分别记录，本轮不做真正的跨端结算。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
