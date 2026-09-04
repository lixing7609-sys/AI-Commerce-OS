import { createLocalRepository, nextMockId } from "./mockUtils.js";
import { computeContributionProfit } from "../../shared/agentEvolution/evolutionMock.js";

/**
 * 广告中心演示数据。广告钱包与 Token 中心的账户是两个完全独立的
 * 余额（ADR-0003：广告现金与 Token 配额永不合并、永不自动互相
 * 转换），这里刻意不复用 tokenCenterMock 的任何字段或仓库。充值/
 * 退款也只作用于广告钱包自身，不涉及 Token 钱包。
 *
 * 阶段"路由/页面修复 + Operator 品牌统一"：广告决策不能只看 GMV/
 * ROAS——每个计划补充 revenue/productCost/platformCommission/
 * refundLoss/fulfillmentCost/contentTokenCost，用 shared/
 * agentEvolution 的 computeContributionProfit() 算出贡献利润，与
 * 表面 ROAS 并列展示，避免"ROAS 很高但贡献利润是负的"这类误导。
 */

function seedWallet() {
  return { available: 8600, frozen: 1200, todaySpend: 860, totalSpend: 4200 };
}

function withContributionProfit(campaign) {
  const profit = computeContributionProfit({
    revenue: campaign.attributedRevenue,
    productCost: campaign.productCost,
    platformCommission: campaign.platformCommission,
    adCost: campaign.spend,
    refundLoss: campaign.refundLoss,
    fulfillmentCost: campaign.fulfillmentCost,
    contentTokenCost: campaign.contentTokenCost,
  });
  return { ...campaign, contributionProfit: profit.contributionProfit };
}

function seedCampaigns() {
  return [
    {
      id: nextMockId("camp"),
      name: "夏季新品推广",
      platform: "douyin",
      shopId: null,
      budget: 3000,
      spend: 1860,
      status: "running",
      roas: 2.4,
      impressions: 128000,
      clicks: 3400,
      conversions: 96,
      approvalState: "approved",
      attributedRevenue: 4464,
      productCost: 1500,
      platformCommission: 223,
      refundLoss: 90,
      fulfillmentCost: 380,
      contentTokenCost: 12,
      aiRecommendation: "ROAS 2.4 且贡献利润为正，处于当前所有投放计划最高水平，建议追加预算 ¥1,000 扩大投放。",
    },
    {
      id: nextMockId("camp"),
      name: "店铺新客召回",
      platform: "taobao",
      shopId: null,
      budget: 1500,
      spend: 1500,
      status: "completed",
      roas: 1.8,
      impressions: 64000,
      clicks: 1500,
      conversions: 41,
      approvalState: "approved",
      attributedRevenue: 2700,
      productCost: 1150,
      platformCommission: 135,
      refundLoss: 260,
      fulfillmentCost: 220,
      contentTokenCost: 8,
      aiRecommendation: "表面 ROAS 1.8 看似健康，但退款损失偏高（¥260），贡献利润被明显侵蚀，建议排查该批新客的退款原因。",
    },
    {
      id: nextMockId("camp"),
      name: "大促预热",
      platform: "xiaohongshu",
      shopId: null,
      budget: 5000,
      spend: 0,
      status: "pending_approval",
      roas: null,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      approvalState: "pending",
      attributedRevenue: 0,
      productCost: 0,
      platformCommission: 0,
      refundLoss: 0,
      fulfillmentCost: 0,
      contentTokenCost: 0,
      aiRecommendation: "预算高于近 30 天所有计划均值，建议先小额灰度验证素材表现，再批准全量预算。",
    },
    {
      id: nextMockId("camp"),
      name: "老客复购唤醒",
      platform: "douyin",
      shopId: null,
      budget: 1200,
      spend: 980,
      status: "running",
      roas: 3.1,
      impressions: 42000,
      clicks: 1100,
      conversions: 58,
      approvalState: "approved",
      attributedRevenue: 3038,
      productCost: 980,
      platformCommission: 152,
      refundLoss: 40,
      fulfillmentCost: 210,
      contentTokenCost: 6,
      aiRecommendation: "ROAS 与贡献利润同步领先，预算利用率已超 80%，建议本周内追加预算。",
    },
  ].map(withContributionProfit);
}

function seedBudgetRiskAlerts(campaigns) {
  return campaigns
    .filter((c) => c.status === "running" && (c.roas < 1.0 || c.contributionProfit < 0))
    .map((c) => ({
      id: nextMockId("adrisk"),
      campaignId: c.id,
      campaignName: c.name,
      detail: c.contributionProfit < 0
        ? `贡献利润为负（¥${c.contributionProfit.toFixed(0)}），继续投放会持续亏损`
        : `ROAS ${c.roas.toFixed(1)} 低于止损线 1.0`,
      severity: "high",
    }));
}

function seedAdLearningCandidate() {
  return {
    id: nextMockId("adcand"),
    candidateType: "CostOptimization",
    affectedScope: "抖音店A · 「店铺新客召回」计划",
    status: "candidate",
    evidence: "该计划近 30 天贡献利润率持续低于同渠道均值，退款损失是主要拖累项",
    expectedBenefit: "收紧新客召回人群包的退款风险特征后，预计贡献利润率提升 8-12 个百分点",
    possibleRisk: "过度收紧人群包可能降低新客获取量，需灰度验证",
    riskLevel: "low",
  };
}

function seedRechargeHistory() {
  return [
    { id: nextMockId("adrc"), amount: 5000, createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), note: "初始充值" },
  ];
}

function seedRefundHistory() {
  return [];
}

// v2：为每个投放计划补充 contributionProfit 相关字段（阶段"路由/
// 页面修复"）。key 名带版本号，让此前已经写入 localStorage 的
// v1 演示数据（缺少这些字段）被丢弃重新播种，而不是在渲染时对着
// 缺字段的旧数据崩溃——这套 mock 仓库没有字段级迁移机制，版本号
// 是这里最简单、诚实的处理方式。
const repository = createLocalRepository("adCenter.state.v2", () => {
  const campaigns = seedCampaigns();
  return {
    wallet: seedWallet(),
    campaigns,
    budgetRiskAlerts: seedBudgetRiskAlerts(campaigns),
    learningCandidate: seedAdLearningCandidate(),
    rechargeHistory: seedRechargeHistory(),
    refundHistory: seedRefundHistory(),
  };
});

export function getAdCenterState() {
  return repository.get();
}

/**
 * 广告投放的贡献利润汇总——不是简单的 GMV/ROAS 汇总，跨计划累加
 * computeContributionProfit() 的结果，用于总览卡片。
 */
export function getAdContributionSummary() {
  const { campaigns } = repository.get();
  const totals = campaigns.reduce(
    (acc, c) => ({
      revenue: acc.revenue + (c.attributedRevenue ?? 0),
      spend: acc.spend + (c.spend ?? 0),
      contributionProfit: acc.contributionProfit + (c.contributionProfit ?? 0),
    }),
    { revenue: 0, spend: 0, contributionProfit: 0 }
  );
  return totals;
}

export function decideAdLearningCandidate(decision) {
  return repository.update((state) => ({
    ...state,
    learningCandidate: state.learningCandidate
      ? { ...state.learningCandidate, status: decision === "approve" ? "experimenting" : "rejected" }
      : state.learningCandidate,
  }));
}

export function toggleCampaignStatus(campaignId) {
  return repository.update((state) => ({
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === campaignId
        ? { ...c, status: c.status === "running" ? "paused" : c.status === "paused" ? "running" : c.status }
        : c
    ),
  }));
}

/**
 * 充值只增加广告钱包的可用余额，绝不触碰 Token 钱包（见文件顶部
 * 注释）。
 */
export function rechargeAdWallet(amount, note) {
  return repository.update((state) => ({
    ...state,
    wallet: { ...state.wallet, available: state.wallet.available + amount },
    rechargeHistory: [
      { id: nextMockId("adrc"), amount, note: note || "Founder 充值", createdAt: new Date().toISOString() },
      ...state.rechargeHistory,
    ],
  }));
}

/**
 * 退款只能作用于"可用余额"（未花费、未冻结的部分）——冻结中和
 * 已花费的钱不可退。可退余额 = 可用余额，与充值一样只影响广告
 * 钱包自身。
 */
export function refundAdWallet(amount, destination) {
  return repository.update((state) => {
    const refundable = state.wallet.available;
    const safeAmount = Math.min(amount, refundable);
    return {
      ...state,
      wallet: { ...state.wallet, available: state.wallet.available - safeAmount },
      refundHistory: [
        {
          id: nextMockId("adrf"),
          amount: safeAmount,
          destination,
          createdAt: new Date().toISOString(),
        },
        ...state.refundHistory,
      ],
    };
  });
}
