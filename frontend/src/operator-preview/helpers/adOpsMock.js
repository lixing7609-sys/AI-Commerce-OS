import { createLocalRepository, tagDemo } from "../../shared/localRepository.js";
import { computeContributionProfit } from "../../shared/agentEvolution/evolutionMock.js";

/**
 * 经营者版「广告投放」（阶段：release-blocking repair — 广告投放
 * 模块）。经营者版目前唯一一个真实建设的广告相关模块，与 Founder 的
 * console/mock/adCenterMock.js 概念一致但不是同一个仓库——Founder
 * 管理的是店铺自身真实广告账户的完整开发态，经营者版这里是"客户
 * 安全"的受限操作视图（不暴露无限制的广告开发工具），两者故意
 * 不共享 mock 状态，只共享同一个 computeContributionProfit() 计算
 * 逻辑（来自 shared/agentEvolution），避免利润口径不一致。
 *
 * 核心操作路径：
 *   店铺绑定 → 广告账户绑定 → AI 策略草案 → 预算审批 → 广告执行 →
 *   效果数据回流 → 贡献利润归因 → AI 优化
 *
 * 两类资金/账户来源（概念上必须分开，不能混成一个"广告花费"数字）：
 *   A. 经营者自己的平台广告账户（操作者自行连接、AI 只生成建议/
 *      已批准的操作）
 *   B. AI Commerce OS 广告服务钱包（平台媒介预算 / 广告运营服务费 /
 *      内容与 Token 创作预算 / AI 优化服务费，四个口径分别记账）
 *   C. 未来集中采购/官方代理——只在数据模型里预留字段，不在 UI 上
 *      声称已经存在。
 *
 * 所有数值均为模拟数据（模拟数据角标），不声称任何真实支付/广告账户
 * /投放执行集成。
 */

export const PLATFORM_AD_MAPPING = [
  { commercePlatform: "抖音小店", adPlatform: "巨量千川" },
  { commercePlatform: "淘宝 / 天猫", adPlatform: "阿里妈妈" },
  { commercePlatform: "拼多多", adPlatform: "多多进宝" },
  { commercePlatform: "京东", adPlatform: "京准通" },
  { commercePlatform: "小红书", adPlatform: "聚光" },
  { commercePlatform: "视频号", adPlatform: "腾讯广告" },
];

export const APPROVAL_STATUSES = [
  "draft", "pending_approval", "approved", "running", "paused", "completed", "rejected",
];

export const APPROVAL_STATUS_LABEL = {
  draft: "草稿",
  pending_approval: "待审批",
  approved: "已批准",
  running: "投放中",
  paused: "已暂停",
  completed: "已结束",
  rejected: "已驳回",
};

function seedAccounts() {
  return [
    {
      id: "adacct-1",
      operatorId: "operator-self",
      tenantId: "tenant-self",
      storeId: "demo-shop-1",
      storeName: "星辰家居抖音旗舰店",
      commercePlatform: "抖音小店",
      adPlatform: "巨量千川",
      accountIdentifier: "qc-8834xxxx",
      authorizationStatus: "authorized",
      connectionStatus: "connected",
      budgetSource: "operator_owned",
      executionMode: "ai_recommend_operator_approve",
      lastSyncAt: new Date(Date.now() - 20 * 60000).toISOString(),
      dataStatus: "synced",
    },
    {
      id: "adacct-2",
      operatorId: "operator-self",
      tenantId: "tenant-self",
      storeId: "demo-shop-2",
      storeName: "星辰家居淘宝店",
      commercePlatform: "淘宝 / 天猫",
      adPlatform: "阿里妈妈",
      accountIdentifier: "alimama-2291xxxx",
      authorizationStatus: "not_authorized",
      connectionStatus: "disconnected",
      budgetSource: "operator_owned",
      executionMode: "ai_recommend_operator_approve",
      lastSyncAt: null,
      dataStatus: "never_synced",
    },
    {
      id: "adacct-3",
      operatorId: "operator-self",
      tenantId: "tenant-self",
      storeId: "demo-shop-3",
      storeName: "Chenxing Home US",
      commercePlatform: "视频号",
      adPlatform: "腾讯广告",
      accountIdentifier: "—",
      authorizationStatus: "not_authorized",
      connectionStatus: "not_connected",
      budgetSource: "aicos_wallet",
      executionMode: "ai_recommend_operator_approve",
      lastSyncAt: null,
      dataStatus: "not_applicable",
    },
  ];
}

function withContributionProfit(c) {
  const profit = computeContributionProfit({
    revenue: c.attributedRevenue,
    productCost: c.productCost,
    platformCommission: c.platformCommission,
    adCost: c.platformAdSpend,
    refundLoss: c.refundLoss,
    fulfillmentCost: c.fulfillmentCost,
    contentTokenCost: c.contentTokenCost + c.adServiceFee + c.aiOptimizationFee,
  });
  return { ...c, contributionProfit: profit.contributionProfit };
}

function seedCampaigns() {
  return [
    {
      id: "adcamp-1",
      accountId: "adacct-1",
      storeName: "星辰家居抖音旗舰店",
      targetProduct: "便携折叠加湿器",
      targetPlatform: "抖音小店",
      status: "running",
      proposedBudget: 1500,
      platformAdSpend: 980,
      audienceRecommendation: "近30天加购未下单人群 + 家居生活方式兴趣人群",
      biddingRecommendation: "oCPM 智能出价，目标千次展现成本 ¥18-24",
      creativeRecommendation: "复用「秋冬加湿静音」短视频素材，追加价格锚点贴纸",
      expectedOrders: 62,
      expectedRevenue: 3596,
      roas: 3.7,
      riskLevel: "low",
      reason: "该商品近7天自然流量转化率高于类目均值，追加投放预算能承接更多已产生兴趣的潜在客户",
      attributedRevenue: 3596,
      productCost: 1150,
      platformCommission: 180,
      refundLoss: 60,
      fulfillmentCost: 220,
      contentTokenCost: 8,
      adServiceFee: 49,
      aiOptimizationFee: 20,
    },
    {
      id: "adcamp-2",
      accountId: "adacct-1",
      storeName: "星辰家居抖音旗舰店",
      targetProduct: "夏季轻薄防晒衣",
      targetPlatform: "抖音小店",
      status: "pending_approval",
      proposedBudget: 2000,
      platformAdSpend: 0,
      audienceRecommendation: "25-40岁女性，近期浏览防晒/户外品类",
      biddingRecommendation: "oCPM，目标千次展现成本 ¥15-20",
      creativeRecommendation: "新拍「实测紫外线」短视频，突出UPF50+卖点",
      expectedOrders: 45,
      expectedRevenue: 2160,
      roas: 1.08,
      riskLevel: "medium",
      reason: "该商品近期新增1条2星差评（面料偏薄），建议先小额测试确认差评未影响转化率再放量",
      attributedRevenue: 0,
      productCost: 0,
      platformCommission: 0,
      refundLoss: 0,
      fulfillmentCost: 0,
      contentTokenCost: 0,
      adServiceFee: 0,
      aiOptimizationFee: 0,
    },
    {
      id: "adcamp-3",
      accountId: "adacct-1",
      storeName: "星辰家居抖音旗舰店",
      targetProduct: "无线降噪耳机 Pro",
      targetPlatform: "抖音小店",
      status: "paused",
      proposedBudget: 3000,
      platformAdSpend: 2860,
      audienceRecommendation: "科技数码兴趣人群，25-35岁",
      biddingRecommendation: "oCPM，目标千次展现成本 ¥22-28",
      creativeRecommendation: "对比测评类短视频",
      expectedOrders: 38,
      expectedRevenue: 2280,
      roas: 0.8,
      riskLevel: "high",
      reason: "投放3天 ROAS 仅 0.8，低于止损线，贡献利润已为负，AI 建议已自动暂停并等待你确认下一步",
      attributedRevenue: 2280,
      productCost: 1520,
      platformCommission: 114,
      refundLoss: 180,
      fulfillmentCost: 190,
      contentTokenCost: 6,
      adServiceFee: 143,
      aiOptimizationFee: 30,
    },
  ].map(withContributionProfit);
}

function seedWallet() {
  return {
    available: 6200,
    platformBudgetAllocation: 4200,
    serviceFeeAllocation: 800,
    tokenCreativeBudget: 900,
    aiOptimizationFeeAllocation: 300,
    frozen: 500,
    consumed: 3840,
    rechargeHistory: [
      { id: "adopsrc-1", amount: 5000, createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), note: "初始充值" },
      { id: "adopsrc-2", amount: 2000, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), note: "追加充值" },
    ],
    settlementRecords: [
      {
        id: "adopsst-1",
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        platformAdSpend: 980,
        adServiceFee: 49,
        contentTokenCost: 8,
        aiOptimizationFee: 20,
        campaignId: "adcamp-1",
      },
    ],
  };
}

function seedBudgetCeilings() {
  return {
    dailyCeiling: 1000,
    accountCeiling: 5000,
    storeCeiling: 8000,
    lowBalanceThreshold: 1000,
  };
}

const repository = createLocalRepository("operatorAdOps.state", () => ({
  accounts: seedAccounts(),
  campaigns: seedCampaigns(),
  wallet: seedWallet(),
  budgetCeilings: seedBudgetCeilings(),
}));

export function getAdOpsState() {
  return tagDemo(repository.get());
}

export function getContributionSummary() {
  const { campaigns } = repository.get();
  return campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.platformAdSpend,
      revenue: acc.revenue + c.attributedRevenue,
      contributionProfit: acc.contributionProfit + c.contributionProfit,
    }),
    { spend: 0, revenue: 0, contributionProfit: 0 }
  );
}

/**
 * 审批：待审批 -> 已批准（尚未真正开始花钱，还需要下一步"开始投放"）。
 * 严格要求批准理由与预算不超过账户/店铺预算上限——AI 不能未经批准
 * 直接花钱，这里就是那个人工控制边界。
 */
export function approveCampaign(campaignId) {
  return repository.update((state) => {
    const campaign = state.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return state;
    if (campaign.status !== "pending_approval") return state;
    if (campaign.proposedBudget > state.budgetCeilings.accountCeiling) return state;
    return {
      ...state,
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId ? { ...c, status: "approved" } : c
      ),
    };
  });
}

export function rejectCampaign(campaignId, reason) {
  if (!reason) return { ok: false, error: "驳回需要填写理由" };
  repository.update((state) => ({
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === campaignId && (c.status === "pending_approval" || c.status === "approved")
        ? { ...c, status: "rejected", rejectionReason: reason }
        : c
    ),
  }));
  return { ok: true };
}

export function startCampaign(campaignId) {
  repository.update((state) => ({
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === campaignId && c.status === "approved" ? { ...c, status: "running" } : c
    ),
  }));
  return { ok: true };
}

/** 暂停——包括"紧急停止"场景，都是把状态切回 paused，永远不是删除记录。 */
export function pauseCampaign(campaignId) {
  repository.update((state) => ({
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === campaignId && c.status === "running" ? { ...c, status: "paused" } : c
    ),
  }));
  return { ok: true };
}

export function resumeCampaign(campaignId) {
  repository.update((state) => ({
    ...state,
    campaigns: state.campaigns.map((c) =>
      c.id === campaignId && c.status === "paused" ? { ...c, status: "running" } : c
    ),
  }));
  return { ok: true };
}
