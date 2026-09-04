import { createLocalRepository, nextMockId, tagDemo } from "../../../mock/mockUtils.js";

/**
 * Operator 实验室"自动经营"模块的演示数据（阶段 Founder Full-System
 * v3 Batch 2 §C/§E）。这是 Operator 执行视角的自动化（"这家店允许
 * 哪些操作自动跑、跑到第几级风险要转人工"），和 Founder Workflow
 * 中心的"自动化策略"（研发侧、跨店铺策略设计工具）是两个不同受众
 * 的模块，不共用同一个组件——但吸取了交办任务里那次截图崩溃
 * （`Cannot read properties of undefined (reading 'length')`）的
 * 教训：即使当时没能复现，这个新模块从第一行代码开始就不允许出现
 * 同类问题——所有返回值都保证形状完整，不存在"某个字段在某种情况
 * 下是 undefined"的分支。
 */

export const RISK_LEVELS = [
  { key: "L0", label: "L0 · 只读/提醒", description: "只生成建议或提醒，不执行任何变更" },
  { key: "L1", label: "L1 · 低风险自动执行", description: "小额/小幅度变更可直接自动执行" },
  { key: "L2", label: "L2 · 中风险阈值内自动", description: "阈值内自动执行，超出阈值转人工审批" },
  { key: "L3", label: "L3 · 高风险总是审批", description: "无论金额大小都需要人工审批后才执行" },
  { key: "L4", label: "L4 · 禁止自动化", description: "该类操作禁止自动化，只能人工手动处理" },
];

export const TRIGGER_TYPES = [
  { key: "inventory_threshold", label: "库存阈值" },
  { key: "order_anomaly", label: "订单异常" },
  { key: "ad_roi_drop", label: "广告 ROI 下降" },
  { key: "refund_spike", label: "退款率异常上升" },
  { key: "scheduled", label: "定时" },
];

export const ACTION_TYPES = [
  { key: "restock_suggestion", label: "生成补货建议" },
  { key: "pause_ad", label: "暂停广告计划" },
  { key: "flag_order", label: "标记异常订单" },
  { key: "notify_operator", label: "通知经营者" },
  { key: "draft_reply", label: "生成客服回复草稿" },
];

/** 仓库边界的默认形状——任何读取路径都不会拿到 undefined 的字段。 */
function emptyState() {
  return { policies: [], executionLog: [] };
}

function buildPolicy({ idx, name, storeId, riskLevel, trigger, actions, threshold, enabled, status = "enabled" }) {
  return {
    id: nextMockId("autoops"),
    name,
    storeId: storeId ?? "all",
    riskLevel,
    trigger,
    actions: Array.isArray(actions) ? actions : [],
    threshold: threshold ?? null,
    enabled: Boolean(enabled),
    status,
    createdAt: new Date(Date.now() - idx * 3600000).toISOString(),
    lastRunAt: idx % 2 === 0 ? new Date(Date.now() - idx * 1800000).toISOString() : null,
    failureCount: 0,
  };
}

function seedState() {
  return tagDemo({
    policies: [
      buildPolicy({ idx: 1, name: "低库存自动生成补货建议", storeId: "all", riskLevel: "L0", trigger: "inventory_threshold", actions: ["restock_suggestion", "notify_operator"], threshold: { inventoryBelow: 5 }, enabled: true }),
      buildPolicy({ idx: 2, name: "广告 ROI 跌破止损线自动暂停", storeId: "store-1", riskLevel: "L1", trigger: "ad_roi_drop", actions: ["pause_ad", "notify_operator"], threshold: { roasBelow: 1.0 }, enabled: true }),
      buildPolicy({ idx: 3, name: "异常订单自动标记", storeId: "all", riskLevel: "L2", trigger: "order_anomaly", actions: ["flag_order"], threshold: { unshippedHours: 24 }, enabled: true }),
      buildPolicy({ idx: 4, name: "退款率异常需人工确认", storeId: "store-2", riskLevel: "L3", trigger: "refund_spike", actions: ["notify_operator"], threshold: { refundRateAbovePct: 8 }, enabled: false, status: "disabled" }),
    ],
    executionLog: [
      { id: nextMockId("run"), policyId: null, policyName: "低库存自动生成补货建议", triggeredAt: new Date(Date.now() - 3600000).toISOString(), detail: "「便携折叠加湿器」库存已为 0，已生成补货建议", outcome: "auto_executed", errorRecovery: null },
      { id: nextMockId("run"), policyId: null, policyName: "广告 ROI 跌破止损线自动暂停", triggeredAt: new Date(Date.now() - 7200000).toISOString(), detail: "「大促预热」ROAS 降至 0.6，已自动暂停投放", outcome: "auto_executed", errorRecovery: null },
      { id: nextMockId("run"), policyId: null, policyName: "退款率异常需人工确认", triggeredAt: new Date(Date.now() - 10800000).toISOString(), detail: "退款率升至 9.2%，已转人工审批", outcome: "escalated", errorRecovery: null },
      { id: nextMockId("run"), policyId: null, policyName: "异常订单自动标记", triggeredAt: new Date(Date.now() - 14400000).toISOString(), detail: "尝试标记订单 #DY000123 失败：订单已被人工处理", outcome: "failed", errorRecovery: "已自动重试 1 次，仍失败，已转人工通知" },
    ],
  });
}

const repo = createLocalRepository("operatorLabV2.autoOps", seedState);

/**
 * 唯一读取入口——所有页面代码都必须经过这个函数，不直接读
 * repo.get()，保证即使底层存储被清空/损坏，也总是拿到形状完整的
 * 对象，而不是在某个 `.length` 访问处崩溃。
 */
export function getAutoOpsState() {
  const raw = repo.get();
  if (!raw || typeof raw !== "object") return emptyState();
  return {
    policies: Array.isArray(raw.policies) ? raw.policies : [],
    executionLog: Array.isArray(raw.executionLog) ? raw.executionLog : [],
  };
}

export function getPoliciesForStore(storeId) {
  const { policies } = getAutoOpsState();
  if (!storeId || storeId === "all") return policies;
  return policies.filter((p) => p.storeId === "all" || p.storeId === storeId);
}

export function createAutoOpsPolicy(draft) {
  return repo.update((state) => {
    const safe = state && typeof state === "object" ? state : emptyState();
    const policies = Array.isArray(safe.policies) ? safe.policies : [];
    const newPolicy = buildPolicy({
      idx: policies.length + 1,
      name: draft?.name?.trim() || "未命名策略",
      storeId: draft?.storeId || "all",
      riskLevel: draft?.riskLevel || "L1",
      trigger: draft?.trigger || TRIGGER_TYPES[0].key,
      actions: draft?.actions || [],
      threshold: draft?.threshold ?? null,
      enabled: draft?.enabled ?? true,
      status: draft?.enabled === false ? "draft" : "enabled",
    });
    return { policies: [...policies, newPolicy], executionLog: Array.isArray(safe.executionLog) ? safe.executionLog : [] };
  });
}

export function updateAutoOpsPolicy(id, patch) {
  return repo.update((state) => {
    const safe = state && typeof state === "object" ? state : emptyState();
    const policies = Array.isArray(safe.policies) ? safe.policies : [];
    return {
      policies: policies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      executionLog: Array.isArray(safe.executionLog) ? safe.executionLog : [],
    };
  });
}

export function togglePolicyEnabled(id) {
  return repo.update((state) => {
    const safe = state && typeof state === "object" ? state : emptyState();
    const policies = Array.isArray(safe.policies) ? safe.policies : [];
    return {
      policies: policies.map((p) => (p.id === id ? { ...p, enabled: !p.enabled, status: !p.enabled ? "enabled" : "disabled" } : p)),
      executionLog: Array.isArray(safe.executionLog) ? safe.executionLog : [],
    };
  });
}

export function deleteAutoOpsPolicy(id) {
  return repo.update((state) => {
    const safe = state && typeof state === "object" ? state : emptyState();
    const policies = Array.isArray(safe.policies) ? safe.policies : [];
    return {
      policies: policies.filter((p) => p.id !== id),
      executionLog: Array.isArray(safe.executionLog) ? safe.executionLog : [],
    };
  });
}

export function resetAutoOpsState() {
  return repo.reset();
}
