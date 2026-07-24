import { createLocalRepository, nextMockId } from "./mockUtils.js";

/**
 * Token 中心演示数据。字段命名参照真实后端 Token Phase 1A 领域
 * 模型（backend/app/models/token_*_db.py）：account 的 available/
 * reserved、ledger entry 的 grant_credit/manual_adjustment 类型等，
 * 便于未来 Token Phase 1B 提供真实 HTTP 接口时替换为真实数据源，
 * 不需要重新设计字段形状。当前阶段没有任何真实调用——ADR-0003
 * 明确 Token 配额与广告现金/RMB 账单三者严格分离，本模块的余额
 * 与广告中心的广告钱包互不合并。
 */

/**
 * account 字段区分"可退"与"不可退"两类资金来源（阶段 Founder UX
 * Review V3）：founderGrantTotal（Founder 授予）、promotionalTotal
 * （营销赠送）、testCreditTotal（测试额度）三类永不退款；只有
 * paidRechargeTotal（实付充值）里尚未消耗、尚未退款的部分才可退，
 * 且退款金额永远不能超过当前可用余额 available（已消耗/冻结的
 * 部分同样不可退）。
 */
function seedAccount() {
  return {
    balance: 12400,
    founderGrantTotal: 20000,
    promotionalTotal: 500,
    testCreditTotal: 200,
    paidRechargeTotal: 1500,
    refundedTotal: 0,
    available: 1240,
    reserved: 0,
    consumed: 18760,
    todayConsumed: 8760,
    lowBalanceThreshold: 2000,
  };
}

/**
 * 可退余额 = min(可用余额, 实付充值中尚未退款的部分)。Founder 授予
 * /营销赠送/测试额度/已消耗/冻结中的余额一律不计入可退范围。
 */
export function getRefundableBalance(account) {
  const unrefundedPaid = Math.max(0, account.paidRechargeTotal - account.refundedTotal);
  return Math.max(0, Math.min(account.available, unrefundedPaid));
}

function seedLedger() {
  const now = Date.now();
  return [
    { id: nextMockId("ledger"), type: "grant_credit", amount: 20000, note: "Founder 初始授予", createdAt: new Date(now - 20 * 86400000).toISOString() },
    { id: nextMockId("ledger"), type: "manual_adjustment", amount: -6200, note: "AI CEO 经营分析消耗", createdAt: new Date(now - 5 * 86400000).toISOString() },
    { id: nextMockId("ledger"), type: "manual_adjustment", amount: -8100, note: "产品 Agent 内容生成消耗", createdAt: new Date(now - 3 * 86400000).toISOString() },
    { id: nextMockId("ledger"), type: "manual_adjustment", amount: -4460, note: "销售 Agent 客服问答消耗", createdAt: new Date(now - 1 * 86400000).toISOString() },
  ];
}

function seedPricing() {
  return [
    { model: "Claude Sonnet 5", providerCostPer1k: 0.009, sellingPricePer1k: 0.015 },
    { model: "GPT-5", providerCostPer1k: 0.0125, sellingPricePer1k: 0.02 },
    { model: "DeepSeek V3", providerCostPer1k: 0.00105, sellingPricePer1k: 0.0025 },
    { model: "Qwen Max", providerCostPer1k: 0.002, sellingPricePer1k: 0.004 },
  ].map((row) => ({
    ...row,
    grossMarginPct: Math.round(((row.sellingPricePer1k - row.providerCostPer1k) / row.sellingPricePer1k) * 100),
  }));
}

function seedBurnTrend() {
  const days = ["07-17", "07-18", "07-19", "07-20", "07-21", "07-22", "07-23"];
  return days.map((date, idx) => ({ date, consumed: 900 + idx * 220 + (idx % 2 === 0 ? 300 : 0) }));
}

function seedRechargeHistory() {
  return [
    { id: nextMockId("tkrc"), amount: 1500, method: "对公转账", createdAt: new Date(Date.now() - 12 * 86400000).toISOString(), note: "实付充值" },
  ];
}

function seedRefundHistory() {
  return [];
}

const repository = createLocalRepository("tokenCenter.state", () => ({
  account: seedAccount(),
  ledger: seedLedger(),
  pricing: seedPricing(),
  burnTrend: seedBurnTrend(),
  rechargeHistory: seedRechargeHistory(),
  refundHistory: seedRefundHistory(),
  originalPaymentAccount: "对公账户 · 招商银行（尾号 6688）",
}));

export function getTokenState() {
  return repository.get();
}

// Founder 免费授予——不计入实付充值，永不可退（见 seedAccount 顶部注释）。
export function grantTokens(amount, note) {
  return repository.update((state) => {
    const entry = {
      id: nextMockId("ledger"),
      type: "grant_credit",
      amount,
      note: note || "Founder 追加授予",
      createdAt: new Date().toISOString(),
    };
    return {
      ...state,
      account: {
        ...state.account,
        balance: state.account.balance + amount,
        founderGrantTotal: state.account.founderGrantTotal + amount,
        available: state.account.available + amount,
      },
      ledger: [entry, ...state.ledger],
    };
  });
}

/**
 * 实付充值——计入 paidRechargeTotal，是唯一可能产生"可退余额"的
 * 资金来源。与广告钱包充值一样，只影响 Token 钱包自身，不与广告
 * 钱包账户合并（ADR-0003）。
 */
export function rechargeTokens(amount, method) {
  return repository.update((state) => ({
    ...state,
    account: {
      ...state.account,
      balance: state.account.balance + amount,
      paidRechargeTotal: state.account.paidRechargeTotal + amount,
      available: state.account.available + amount,
    },
    rechargeHistory: [
      { id: nextMockId("tkrc"), amount, method: method || "对公转账", note: "Founder 充值", createdAt: new Date().toISOString() },
      ...state.rechargeHistory,
    ],
  }));
}

/**
 * Token 余额退款——只能作用于可退余额（见 getRefundableBalance），
 * 退款目的地固定为原支付账户，不支持退往任意账户。退款后从
 * available 和 paidRechargeTotal 的可退计数中同步扣减。
 */
export function refundTokens(amount, refundMethod) {
  return repository.update((state) => {
    const refundable = getRefundableBalance(state.account);
    const safeAmount = Math.max(0, Math.min(amount, refundable));
    return {
      ...state,
      account: {
        ...state.account,
        balance: state.account.balance - safeAmount,
        available: state.account.available - safeAmount,
        refundedTotal: state.account.refundedTotal + safeAmount,
      },
      refundHistory: [
        {
          id: nextMockId("tkrf"),
          amount: safeAmount,
          destination: state.originalPaymentAccount,
          method: refundMethod || "原路退回",
          estimatedArrival: "1-3 个工作日",
          status: "processing",
          createdAt: new Date().toISOString(),
        },
        ...state.refundHistory,
      ],
    };
  });
}
