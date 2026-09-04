import { useState } from "react";
import { getMonetizationOverview, getMonetizationState, updateBrandDealStage } from "../mock/monetizationMock.js";
import { getStudioState, getIpName } from "../mock/studioMock.js";
import { getGraphicContentState } from "../mock/graphicContentMock.js";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatMoney, formatNumber } from "./formatters.js";

/* ============================ 商业变现中心 ============================ */

export function MonetizationCenterPage({ navigate }) {
  const overview = getMonetizationOverview();
  const { contentProjects } = getStudioState();
  const { projects: graphicProjects } = getGraphicContentState();
  const { projectEconomics } = getMonetizationState();

  const rankingRows = projectEconomics
    .map((e) => {
      const project = contentProjects.find((p) => p.projectId === e.projectId) ?? graphicProjects.find((p) => p.projectId === e.projectId);
      return { ...e, name: project?.name ?? e.projectId };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <Card title="内容商业变现中心" action={<span className="st-btn-row"><Pill tone="info">本月总收入 {formatMoney(overview.totalRevenue)}</Pill><DemoBadge /></span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <MoneyCard label="平台内容分成" value={overview.platformShareRevenue} note="红果、番茄、B站创作激励、视频号、YouTube" onClick={() => navigate("revenueShare")} />
          <MoneyCard label="品牌合作与广告订单" value={overview.brandDealRevenue} note="含 Operator 广告订单 + Studio 品牌合作" onClick={() => navigate("brandDeals")} />
          <MoneyCard label="带货与直播佣金" value={overview.liveCommerceRevenue} note="橱窗 GMV 与佣金" onClick={() => navigate("liveCommerce")} />
          <MoneyCard label="知识产品" value={overview.knowledgeRevenue} note="课程、会员、模板与社群" onClick={() => navigate("knowledgeProducts")} />
          <MoneyCard label="版权与IP授权" value={overview.ipLicensingRevenue} note="剧本授权、角色形象、二创授权" onClick={() => navigate("ipLicensing")} />
          <MoneyCard label="AI图文收入" value={overview.graphicTotalRevenue} note="图文平台分成、种草订单、品牌合作" onClick={() => navigate("graphicContent")} />
          <MoneyCard label="内容生产成本" value={overview.productionCost} note={`综合毛利率 ${overview.grossMargin.toFixed(1)}%`} warn />
        </div>
      </Card>

      <Card title="项目收益排行榜（含图文项目）">
        <Table
          columns={[
            { key: "name", label: "内容项目" },
            { key: "revenue", label: "收入", render: (r) => formatMoney(r.revenue) },
            { key: "modelCost", label: "模型成本", render: (r) => formatMoney(r.modelCost) },
            { key: "adCost", label: "广告成本", render: (r) => formatMoney(r.adCost) },
            { key: "laborCostPlaceholder", label: "人工成本（占位）", render: (r) => formatMoney(r.laborCostPlaceholder) },
            { key: "grossProfit", label: "毛利", render: (r) => formatMoney(r.grossProfit) },
            { key: "roi", label: "ROI", render: (r) => r.roi.toFixed(2) },
            { key: "pendingSettlement", label: "待结算", render: (r) => formatMoney(r.pendingSettlement) },
            { key: "settled", label: "已结算", render: (r) => formatMoney(r.settled) },
          ]}
          rows={rankingRows}
        />
      </Card>
    </div>
  );
}

function MoneyCard({ label, value, note, warn, onClick }) {
  return (
    <div className="st-card" style={{ margin: 0, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <small style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</small>
      <strong style={{ display: "block", fontSize: 22, margin: "8px 0" }}>{formatMoney(value)}</strong>
      <p style={{ fontSize: 11, color: warn ? "var(--warning, #b45309)" : "var(--text-secondary)", margin: 0 }}>{note}</p>
    </div>
  );
}

/* ============================ 平台分成 ============================ */

export function RevenueSharePage() {
  const { platformShare } = getMonetizationState();
  return (
    <Card title="平台分成" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "platform", label: "平台" }, { key: "period", label: "结算周期" },
          { key: "grossRevenue", label: "毛收入", render: (r) => formatMoney(r.grossRevenue) },
          { key: "platformFee", label: "平台费用", render: (r) => formatMoney(r.platformFee) },
          { key: "netRevenue", label: "净收入", render: (r) => formatMoney(r.netRevenue) },
          { key: "status", label: "结算状态", render: (r) => <Pill tone={r.status === "settled" ? "success" : r.status === "partially_settled" ? "warning" : "neutral"}>{{ settled: "已结算", partially_settled: "部分结算", pending: "待结算" }[r.status]}</Pill> },
        ]}
        rows={platformShare}
      />
    </Card>
  );
}

/* ============================ 品牌合作 ============================ */

export function BrandDealsPage() {
  const [state, setState] = useState(() => getMonetizationState());
  const [feedback, showFeedback] = useInlineFeedback();
  const { contentProjects } = getStudioState();
  const { projects: graphicProjects } = getGraphicContentState();

  async function advanceStage(dealId, stage) {
    const next = await updateBrandDealStage(dealId, stage);
    setState((s) => ({ ...s, brandDeals: next.brandDeals }));
    showFeedback(`已更新为「${stage}」`);
  }

  return (
    <Card title="品牌合作" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "brandName", label: "品牌方" },
          { key: "projectId", label: "关联项目", render: (r) => (contentProjects.find((p) => p.projectId === r.projectId) ?? graphicProjects.find((p) => p.projectId === r.projectId))?.name ?? "未关联" },
          { key: "stage", label: "阶段", render: (r) => <Pill tone={r.stage === "执行中" ? "info" : "neutral"}>{r.stage}</Pill> },
          { key: "contractAmount", label: "合同金额", render: (r) => formatMoney(r.contractAmount) },
          { key: "collectedAmount", label: "已收金额", render: (r) => formatMoney(r.collectedAmount) },
          { key: "deliverable", label: "交付物" }, { key: "deadline", label: "截止时间" }, { key: "contact", label: "联系方式" },
          {
            key: "actions", label: "操作", render: (r) => (
              <span className="st-btn-row">
                {r.stage === "待报价" ? <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); advanceStage(r.dealId, "执行中"); }}>标记执行中</button> : null}
                {r.stage === "执行中" ? <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); advanceStage(r.dealId, "已完成"); }}>标记已完成</button> : null}
              </span>
            ),
          },
        ]}
        rows={state.brandDeals}
      />
    </Card>
  );
}

/* ============================ 带货与直播 ============================ */

export function LiveCommercePage() {
  const { liveCommerce } = getMonetizationState();
  return (
    <Card title="带货与直播" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "直播场次" }, { key: "platform", label: "平台" },
          { key: "gmv", label: "GMV", render: (r) => formatMoney(r.gmv) },
          { key: "commissionRate", label: "佣金率", render: (r) => `${(r.commissionRate * 100).toFixed(1)}%` },
          { key: "commission", label: "佣金", render: (r) => formatMoney(r.commission) },
          { key: "orders", label: "订单数", render: (r) => formatNumber(r.orders) },
          { key: "viewers", label: "观看人数", render: (r) => formatNumber(r.viewers) },
        ]}
        rows={liveCommerce}
      />
    </Card>
  );
}

/* ============================ 知识产品 ============================ */

export function KnowledgeProductsPage() {
  const { knowledgeProducts } = getMonetizationState();
  return (
    <Card title="知识产品" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "产品名称" }, { key: "type", label: "类型" },
          { key: "price", label: "定价", render: (r) => formatMoney(r.price) },
          { key: "sold", label: "销量", render: (r) => formatNumber(r.sold) },
          { key: "revenue", label: "累计收入", render: (r) => formatMoney(r.revenue) },
          { key: "ipId", label: "关联 IP", render: (r) => getIpName(r.ipId) },
        ]}
        rows={knowledgeProducts}
      />
    </Card>
  );
}

/* ============================ 版权 / IP授权 ============================ */

export function IpLicensingPage() {
  const { ipLicensing } = getMonetizationState();
  return (
    <Card title="版权 / IP授权" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "授权项目" }, { key: "type", label: "类型" }, { key: "licensee", label: "被授权方" },
          { key: "amount", label: "金额", render: (r) => formatMoney(r.amount) },
          { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "已签约" ? "success" : "warning"}>{r.status}</Pill> },
          { key: "ipId", label: "关联 IP", render: (r) => getIpName(r.ipId) },
        ]}
        rows={ipLicensing}
      />
    </Card>
  );
}
