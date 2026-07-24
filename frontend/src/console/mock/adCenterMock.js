import { createLocalRepository, nextMockId } from "./mockUtils.js";

/**
 * 广告中心演示数据。广告钱包与 Token 中心的账户是两个完全独立的
 * 余额（ADR-0003：广告现金与 Token 配额永不合并、永不自动互相
 * 转换），这里刻意不复用 tokenCenterMock 的任何字段或仓库。充值/
 * 退款也只作用于广告钱包自身，不涉及 Token 钱包。
 */

function seedWallet() {
  return { available: 8600, frozen: 1200, todaySpend: 860, totalSpend: 4200 };
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
    },
  ];
}

function seedRechargeHistory() {
  return [
    { id: nextMockId("adrc"), amount: 5000, createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), note: "初始充值" },
  ];
}

function seedRefundHistory() {
  return [];
}

const repository = createLocalRepository("adCenter.state", () => ({
  wallet: seedWallet(),
  campaigns: seedCampaigns(),
  rechargeHistory: seedRechargeHistory(),
  refundHistory: seedRefundHistory(),
}));

export function getAdCenterState() {
  return repository.get();
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
