import { useState } from "react";
import { getIpName, getStudioState, reserveAdResource } from "../mock/studioMock.js";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { formatDateTime, formatMoney, formatNumber } from "./formatters.js";

/**
 * 流量池 / 广告资源 / 广告订单（§5.H/I/J）。流量池要体现"内容 →
 * 账号 → 人群 → 流量资源 → 广告产品 → 广告收入"这条链路，不能只有
 * 播放量一个数字。
 */

export function TrafficPoolPage() {
  const { trafficPool, matrixAccounts, trafficSourceBreakdown } = getStudioState();

  return (
    <div>
      <div className="st-card">
        <div className="st-flow">
          <span className="st-flow-step">内容</span><span className="st-flow-arrow">→</span>
          <span className="st-flow-step">账号</span><span className="st-flow-arrow">→</span>
          <span className="st-flow-step">人群</span><span className="st-flow-arrow">→</span>
          <span className="st-flow-step">流量资源</span><span className="st-flow-arrow">→</span>
          <span className="st-flow-step">广告产品</span><span className="st-flow-arrow">→</span>
          <span className="st-flow-step">广告收入</span>
        </div>
      </div>

      <Card title="流量来源结构（8类）" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "sourceType", label: "流量来源" },
            { key: "share", label: "占比", render: (r) => `${r.share}%` },
            { key: "cost", label: "流量成本", render: (r) => formatMoney(r.cost) },
            { key: "conversion", label: "转化率", render: (r) => `${r.conversion}%` },
            { key: "retainableUsers", label: "可沉淀用户", render: (r) => formatNumber(r.retainableUsers) },
            { key: "contentContribution", label: "内容贡献" },
            { key: "accountContribution", label: "账号贡献" },
            { key: "trend", label: "趋势", render: (r) => <Pill tone={r.trend === "上升" ? "success" : r.trend === "下降" ? "danger" : "neutral"}>{r.trend}</Pill> },
            { key: "aiSuggestion", label: "AI 优化建议" },
          ]}
          rows={trafficSourceBreakdown.map((t, idx) => ({ id: idx, ...t }))}
        />
      </Card>

      <Card title="流量池明细" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "platform", label: "平台流量" },
            { key: "accountId", label: "账号流量", render: (r) => matrixAccounts.find((a) => a.accountId === r.accountId)?.handle ?? "—" },
            { key: "ip", label: "IP 流量", render: (r) => getIpName(r.ipId) },
            { key: "contentType", label: "内容类型流量" },
            { key: "region", label: "地区流量" },
            { key: "audienceTags", label: "人群标签", render: (r) => r.audienceTags.join("、") },
            { key: "sellableVolume", label: "可售流量", render: (r) => formatNumber(r.sellableVolume) },
            { key: "lockedVolume", label: "已锁定流量", render: (r) => formatNumber(r.lockedVolume) },
            { key: "deliveredVolume", label: "已交付流量", render: (r) => formatNumber(r.deliveredVolume) },
            { key: "estimatedAdValue", label: "预计广告价值", render: (r) => formatMoney(r.estimatedAdValue) },
          ]}
          rows={trafficPool}
        />
      </Card>
    </div>
  );
}

const RESOURCE_TYPE_LABEL = {
  account_post: "矩阵账号发布", content_placement: "内容植入", shortdrama_placement: "短剧植入",
  live_mention: "直播口播", custom_video: "视频定制", account_repost: "账号转发",
  traffic_package: "流量包", audience_targeting: "人群定向资源", ip_co_branding: "IP联名资源",
};
const RESOURCE_STATUS_LABEL = { available: "可售", reserved: "已预定", sold_out: "已售罄", retired: "已下架" };
const RESOURCE_STATUS_TONE = { available: "success", reserved: "warning", sold_out: "neutral", retired: "neutral" };

export function AdResourcesPage() {
  const [state, setState] = useState(() => getStudioState());
  const [feedback, setFeedback] = useState(null);

  async function handleReserve(resourceId) {
    const next = await reserveAdResource(resourceId);
    setState(next);
    setFeedback("已模拟预定该广告资源（演示，未产生真实交易）");
    window.setTimeout(() => setFeedback(null), 3000);
  }

  return (
    <Card
      title="广告资源"
      action={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {feedback ? <span style={{ fontSize: 12, color: "var(--st-accent, #0D9488)" }}>{feedback}</span> : null}
          <DemoBadge />
        </span>
      }
    >
      <Table
        columns={[
          { key: "name", label: "资源名称" },
          { key: "resourceType", label: "资源类型", render: (r) => RESOURCE_TYPE_LABEL[r.resourceType] },
          { key: "coveredPlatforms", label: "覆盖平台", render: (r) => r.coveredPlatforms.join("、") },
          { key: "expectedExposure", label: "预计曝光", render: (r) => formatNumber(r.expectedExposure) },
          { key: "targetAudience", label: "目标人群" },
          { key: "sellableQuantity", label: "可售数量" },
          { key: "unitPrice", label: "单价", render: (r) => formatMoney(r.unitPrice) },
          { key: "status", label: "状态", render: (r) => <Pill tone={RESOURCE_STATUS_TONE[r.status]}>{RESOURCE_STATUS_LABEL[r.status]}</Pill> },
          {
            key: "actions", label: "操作", render: (r) => (
              r.status === "available" ? (
                <button type="button" className="st-btn" onClick={(e) => { e.stopPropagation(); handleReserve(r.resourceId); }}>
                  模拟预定
                </button>
              ) : "—"
            ),
          },
        ]}
        rows={state.adResources}
      />
    </Card>
  );
}

const SETTLEMENT_LABEL = { pending: "待结算", partially_settled: "部分结算", settled: "已结算" };
const SETTLEMENT_TONE = { pending: "warning", partially_settled: "info", settled: "success" };

export function AdOrdersPage() {
  const { adOrders, adResources } = getStudioState();
  return (
    <Card title="广告订单" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "orderId", label: "订单编号" },
          { key: "customerType", label: "客户类型", render: (r) => (r.customerType === "operator" ? <Pill tone="info">来自 Operator</Pill> : <Pill tone="neutral">外部客户</Pill>) },
          { key: "customerName", label: "客户名称" },
          { key: "resourceId", label: "广告资源", render: (r) => adResources.find((res) => res.resourceId === r.resourceId)?.name ?? r.resourceId },
          { key: "contractAmount", label: "合同金额", render: (r) => formatMoney(r.contractAmount) },
          { key: "collectedAmount", label: "已收金额", render: (r) => formatMoney(r.collectedAmount) },
          { key: "deliveryProgress", label: "交付进度", render: (r) => `${r.deliveryProgress}%` },
          { key: "expectedExposure", label: "预计曝光", render: (r) => formatNumber(r.expectedExposure) },
          { key: "actualExposure", label: "实际曝光", render: (r) => formatNumber(r.actualExposure) },
          { key: "startAt", label: "开始时间", render: (r) => formatDateTime(r.startAt) },
          { key: "endAt", label: "结束时间", render: (r) => formatDateTime(r.endAt) },
          { key: "settlementStatus", label: "结算状态", render: (r) => <Pill tone={SETTLEMENT_TONE[r.settlementStatus]}>{SETTLEMENT_LABEL[r.settlementStatus]}</Pill> },
        ]}
        rows={adOrders}
      />
    </Card>
  );
}
