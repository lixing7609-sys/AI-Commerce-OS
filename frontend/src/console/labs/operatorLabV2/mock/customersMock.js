import { createLocalRepository, nextMockId, tagDemo } from "../../../mock/mockUtils.js";
import { DEMO_STORES } from "../../../mock/storesMock.js";

/**
 * Operator 实验室"客户"模块的演示数据（阶段 Founder Full-System v3
 * Batch 2 §C）——之前完全不存在这个模块，现在从零新建。不是订单的
 * 附属视图：订单中心回答"这一单状态是什么"，客户模块回答"这个人
 * 总共买了多少次、值不值得重点维护、有没有风险"。
 */

const MEMBER_LEVEL_LABEL = { normal: "普通", silver: "银卡", gold: "金卡" };
const RISK_LABEL = { none: "无", watch: "需关注" };
const INTENT_LABEL = { high: "高", medium: "中", low: "低" };
const INTENT_TONE = { high: "success", medium: "warning", low: "neutral" };
const FOLLOW_UP_LABEL = { pending: "待跟进", in_progress: "跟进中", done: "已完成", none: "无需跟进" };
const FOLLOW_UP_TONE = { pending: "danger", in_progress: "warning", done: "success", none: "neutral" };

export function getMemberLevelLabel(level) {
  return MEMBER_LEVEL_LABEL[level] ?? level;
}
export function getRiskLabel(risk) {
  return RISK_LABEL[risk] ?? risk;
}
export function getIntentLabel(intent) {
  return INTENT_LABEL[intent] ?? intent;
}
export function getIntentTone(intent) {
  return INTENT_TONE[intent] ?? "neutral";
}
export function getFollowUpLabel(status) {
  return FOLLOW_UP_LABEL[status] ?? status;
}
export function getFollowUpTone(status) {
  return FOLLOW_UP_TONE[status] ?? "neutral";
}

function buildCustomer({ idx, storeId, memberLevel, totalOrders, totalSpend, daysAgo, tags, riskFlag, sourceChannel, intent, followUpStatus }) {
  const store = DEMO_STORES.find((s) => s.id === storeId);
  return {
    id: nextMockId("cust"),
    name: `客户${1000 + idx}`,
    storeId,
    storeName: store.name,
    platform: store.platform,
    phone: `1${3 + (idx % 6)}${String(10000000 + idx * 7).slice(0, 8)}`,
    memberLevel,
    totalOrders,
    totalSpend,
    lastOrderAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    tags,
    riskFlag,
    sourceChannel,
    intent,
    followUpStatus,
    notes: [],
  };
}

function seedCustomers() {
  return tagDemo([
    buildCustomer({ idx: 1, storeId: "store-1", memberLevel: "gold", totalOrders: 18, totalSpend: 5240, daysAgo: 2, tags: ["复购率高", "偏好新品"], riskFlag: "none", sourceChannel: "短视频广告", intent: "high", followUpStatus: "none" }),
    buildCustomer({ idx: 2, storeId: "store-1", memberLevel: "silver", totalOrders: 6, totalSpend: 980, daysAgo: 5, tags: ["价格敏感"], riskFlag: "none", sourceChannel: "自然搜索", intent: "medium", followUpStatus: "pending" }),
    buildCustomer({ idx: 3, storeId: "store-2", memberLevel: "normal", totalOrders: 1, totalSpend: 129, daysAgo: 30, tags: [], riskFlag: "none", sourceChannel: "直播间", intent: "low", followUpStatus: "none" }),
    buildCustomer({ idx: 4, storeId: "store-2", memberLevel: "gold", totalOrders: 24, totalSpend: 8760, daysAgo: 1, tags: ["VIP", "常咨询客服"], riskFlag: "none", sourceChannel: "老客户带新", intent: "high", followUpStatus: "in_progress" }),
    buildCustomer({ idx: 5, storeId: "store-3", memberLevel: "silver", totalOrders: 4, totalSpend: 560, daysAgo: 45, tags: ["退款过1次"], riskFlag: "watch", sourceChannel: "私域社群", intent: "medium", followUpStatus: "pending" },
    ),
    buildCustomer({ idx: 6, storeId: "store-3", memberLevel: "normal", totalOrders: 2, totalSpend: 210, daysAgo: 60, tags: [], riskFlag: "none", sourceChannel: "自然搜索", intent: "low", followUpStatus: "done" }),
  ]);
}

const repo = createLocalRepository("operatorLabV2.customers", seedCustomers);

export function getCustomers({ storeId, search, tag, riskOnly } = {}) {
  let rows = repo.get();
  if (storeId && storeId !== "all") rows = rows.filter((c) => c.storeId === storeId);
  if (tag) rows = rows.filter((c) => c.tags.includes(tag));
  if (riskOnly) rows = rows.filter((c) => c.riskFlag !== "none");
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }
  return rows;
}

export function getCustomer(id) {
  return repo.get().find((c) => c.id === id) ?? null;
}

export function getAllTags() {
  const tags = new Set();
  for (const c of repo.get()) for (const t of c.tags) tags.add(t);
  return [...tags];
}

export function addCustomerNote(id, note) {
  return repo.update((rows) =>
    rows.map((c) => (c.id === id ? { ...c, notes: [...c.notes, { id: nextMockId("note"), text: note, createdAt: new Date().toISOString() }] } : c))
  );
}

export function toggleRiskFlag(id) {
  return repo.update((rows) =>
    rows.map((c) => (c.id === id ? { ...c, riskFlag: c.riskFlag === "none" ? "watch" : "none" } : c))
  );
}

export function getCustomerStats(storeId) {
  const rows = getCustomers({ storeId });
  return {
    total: rows.length,
    gold: rows.filter((c) => c.memberLevel === "gold").length,
    atRisk: rows.filter((c) => c.riskFlag !== "none").length,
    totalSpend: rows.reduce((sum, c) => sum + c.totalSpend, 0),
  };
}
