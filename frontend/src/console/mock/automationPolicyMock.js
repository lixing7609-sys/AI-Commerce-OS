import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";

/**
 * 自动化策略中心（阶段 Founder UX Review V3，P0-9 扩展）。系统
 * 自带 5 条"系统自动化"（每条一个数值阈值，低于阈值自动执行，
 * 超过则需要审批；不可删除），Founder 可以额外创建"自定义自动化"
 * ——完整的触发器/条件/动作/风险分级配置，可编辑/停用/复制/删除。
 */

export const TRIGGER_TYPES = [
  { key: "scheduled", label: "定时" },
  { key: "new_order", label: "新订单" },
  { key: "payment_completed", label: "支付完成" },
  { key: "inventory_threshold", label: "库存阈值" },
  { key: "new_review", label: "新评价" },
  { key: "ad_threshold", label: "广告阈值" },
  { key: "token_balance_threshold", label: "Token 余额阈值" },
  { key: "product_status_change", label: "商品状态变化" },
  { key: "manual", label: "手动触发" },
  // ---- V4 新增：内容智能 / 直播 / 售后触发器 ----
  { key: "new_trend_detected", label: "发现新热点" },
  { key: "trend_top_ranking", label: "热点进入 Top 榜单" },
  { key: "trend_growth_exceeds", label: "热点增长超阈值" },
  { key: "keyword_search_increase", label: "关键词搜索量上升" },
  { key: "competitor_content_exceeds", label: "竞品内容播放超阈值" },
  { key: "store_comments_increase", label: "店铺评论量上升" },
  { key: "customer_service_cluster", label: "客服问题集中出现" },
  { key: "refund_reason_increase", label: "退款原因增多" },
  { key: "product_refund_rate_increase", label: "商品退款率上升" },
  { key: "inventory_accumulation", label: "库存积压" },
  { key: "inventory_shortage", label: "库存告急" },
  { key: "weather_event", label: "天气事件" },
  { key: "holiday_window", label: "节日窗口期" },
  { key: "live_session_ends", label: "直播场次结束" },
  { key: "live_clip_conversion_exceeds", label: "直播切片转化超阈值" },
  { key: "content_completion_exceeds", label: "内容完播率超阈值" },
  { key: "content_click_exceeds", label: "内容商品点击超阈值" },
  { key: "publishing_fails", label: "发布失败" },
  { key: "after_sales_deadline_approaching", label: "售后处理临近超时" },
  { key: "platform_intervention_begins", label: "平台介入开始" },
  // ---- V4.1 新增：流量网络触发器 ----
  { key: "new_viral_content", label: "新爆款内容" },
  { key: "short_drama_completed", label: "短剧完成" },
  { key: "high_performing_ad", label: "高表现广告" },
  { key: "traffic_threshold_exceeded", label: "流量阈值超出" },
];

export const ACTION_TYPES = [
  { key: "generate_ai_content", label: "生成 AI 内容" },
  { key: "submit_approval", label: "提交审批" },
  { key: "publish_product", label: "发布商品" },
  { key: "pause_ad", label: "暂停广告" },
  { key: "adjust_ad_budget", label: "调整广告预算" },
  { key: "send_customer_reply", label: "发送客服回复" },
  { key: "create_restock_recommendation", label: "创建补货建议" },
  { key: "generate_daily_report", label: "生成每日报告" },
  { key: "notify_founder", label: "通知 Founder" },
  { key: "export_data", label: "导出数据" },
  { key: "invoke_agent", label: "调用 Agent" },
  // ---- V4 新增：内容智能 / 直播 / 售后动作 ----
  { key: "create_trend_opportunity", label: "创建热点机会" },
  { key: "add_to_topic_pool", label: "加入选题池" },
  { key: "generate_three_directions", label: "生成三个创意方向" },
  { key: "create_content_project", label: "创建内容项目" },
  { key: "create_repurposing_task", label: "创建二创任务" },
  { key: "generate_short_video_script", label: "生成短视频脚本" },
  { key: "generate_graphic_content", label: "生成图文内容" },
  { key: "generate_live_talking_point", label: "生成直播话术要点" },
  { key: "create_live_plan", label: "创建直播计划" },
  { key: "create_live_clip_task", label: "创建直播切片任务" },
  { key: "schedule_content", label: "加入发布计划" },
  { key: "simulate_auto_publish", label: "模拟自动发布" },
  { key: "create_ad_creative_candidate", label: "创建广告素材候选" },
  { key: "create_after_sales_case", label: "创建售后工单" },
  { key: "generate_after_sales_response", label: "生成售后回复" },
  { key: "escalate_to_human", label: "升级人工处理" },
  { key: "update_knowledge_candidate", label: "更新知识库候选" },
  // ---- V4.1 新增：流量网络动作 ----
  { key: "recommend_reusable_traffic_asset", label: "自动推荐可复用流量资产" },
];

export const AUTOMATION_RISK_EXAMPLES = [
  { key: "L0", label: "L0 · 仅记录", description: "只记录事件，不生成任何建议或内容" },
  { key: "L1", label: "L1 · 生成建议", description: "生成建议，等待经营者查看" },
  { key: "L2", label: "L2 · 生成并送审", description: "生成内容并提交审批，不自动发布" },
  { key: "L3", label: "L3 · 白名单内自动发布", description: "在已批准的白名单范围内自动发布" },
  { key: "L4", label: "L4 · 自动发布+投流需双重审核", description: "自动发布并涉及广告投放时需要双重审核" },
];

export const RISK_LEVELS = [
  { key: "L0", label: "L0 · 仅建议", description: "只生成建议，不自动执行任何操作" },
  { key: "L1", label: "L1 · 准备并需确认", description: "准备好操作内容，执行前需要人工确认" },
  { key: "L2", label: "L2 · 低风险自动执行", description: "风险很低的操作可以自动执行，无需确认" },
  { key: "L3", label: "L3 · 授权预算内执行", description: "在预先授权的预算范围内自动执行" },
  { key: "L4", label: "L4 · 执行前双重校验", description: "需要两重独立校验通过后才能执行" },
];

function seedPolicies() {
  return [
    {
      id: "policy-ad-budget",
      origin: "system",
      name: "广告预算调整",
      scope: "广告中心",
      thresholdLabel: "单次调整金额",
      thresholdValue: 300,
      unit: "¥",
      classification: "conditional",
      enabled: true,
    },
    {
      id: "policy-price-change",
      origin: "system",
      name: "商品价格调整",
      scope: "商品中心",
      thresholdLabel: "单次调整幅度",
      thresholdValue: 3,
      unit: "%",
      classification: "conditional",
      enabled: true,
    },
    {
      id: "policy-refund",
      origin: "system",
      name: "客户退款",
      scope: "客服",
      thresholdLabel: "单笔退款金额",
      thresholdValue: 20,
      unit: "¥",
      classification: "conditional",
      enabled: true,
    },
    {
      id: "policy-product-publish",
      origin: "system",
      name: "商品发布",
      scope: "商品中心",
      thresholdLabel: "—",
      thresholdValue: null,
      unit: "",
      classification: "requires_approval",
      enabled: true,
    },
    {
      id: "policy-campaign-pause",
      origin: "system",
      name: "投放暂停 / 恢复",
      scope: "广告中心",
      thresholdLabel: "—",
      thresholdValue: null,
      unit: "",
      classification: "automatic",
      enabled: true,
    },
  ];
}

function seedCustomAutomations() {
  return [
    {
      id: nextMockId("auto"),
      origin: "custom",
      name: "低库存自动补货建议",
      description: "库存低于阈值时，自动生成补货建议并通知 Founder。",
      applicableStore: "全部店铺",
      applicableCategory: "不限类目",
      enabled: true,
      status: "enabled",
      trigger: { type: "inventory_threshold", scheduleTime: null },
      conditions: { inventoryLevel: 10 },
      actions: ["create_restock_recommendation", "notify_founder"],
      riskLevel: "L0",
      limits: {
        dailyExecutionLimit: 20,
        singleExecutionCostLimit: 0.5,
        dailyTokenCostLimit: 500,
        dailyAdLimit: 0,
        failureRetry: true,
        failureNotification: true,
        auditLog: true,
      },
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      id: nextMockId("auto"),
      origin: "custom",
      name: "高价值热点自动建议",
      description: "发现机会分超过 80 的热点时，自动生成三个创意方向并加入选题池，等待经营者查看。",
      applicableStore: "全部店铺",
      applicableCategory: "不限类目",
      enabled: true,
      status: "enabled",
      trigger: { type: "trend_growth_exceeds", scheduleTime: null },
      conditions: { adRoi: "", tokenBalance: "" },
      actions: ["generate_three_directions", "add_to_topic_pool", "notify_founder"],
      riskLevel: "L1",
      limits: {
        dailyExecutionLimit: 10, singleExecutionCostLimit: 0.3, dailyTokenCostLimit: 800, dailyAdLimit: 0,
        failureRetry: true, failureNotification: true, auditLog: true,
      },
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: nextMockId("auto"),
      origin: "custom",
      name: "直播结束自动生成切片任务",
      description: "直播场次结束后，自动创建直播切片任务并提交审批，不自动发布。",
      applicableStore: "全部店铺",
      applicableCategory: "不限类目",
      enabled: true,
      status: "enabled",
      trigger: { type: "live_session_ends", scheduleTime: null },
      conditions: {},
      actions: ["create_live_clip_task", "submit_approval"],
      riskLevel: "L2",
      limits: {
        dailyExecutionLimit: 5, singleExecutionCostLimit: 0.5, dailyTokenCostLimit: 500, dailyAdLimit: 0,
        failureRetry: true, failureNotification: true, auditLog: true,
      },
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      id: nextMockId("auto"),
      origin: "custom",
      name: "爆款内容自动推荐给运营者",
      description: "检测到爆款内容或短剧完成时，自动向匹配的运营者账号推荐可复用流量资产并通知 Founder。",
      applicableStore: "全部店铺",
      applicableCategory: "不限类目",
      enabled: true,
      status: "enabled",
      trigger: { type: "new_viral_content", scheduleTime: null },
      conditions: {},
      actions: ["recommend_reusable_traffic_asset", "notify_founder"],
      riskLevel: "L1",
      limits: {
        dailyExecutionLimit: 10, singleExecutionCostLimit: 0.2, dailyTokenCostLimit: 400, dailyAdLimit: 0,
        failureRetry: true, failureNotification: true, auditLog: true,
      },
      createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    },
  ];
}

function seedRunLog() {
  const now = Date.now();
  return [
    { id: "log-1", policyId: "policy-ad-budget", triggeredAt: new Date(now - 3600000).toISOString(), outcome: "auto_executed", detail: "广告预算 +¥150（低于阈值，自动执行）" },
    { id: "log-2", policyId: "policy-refund", triggeredAt: new Date(now - 7200000).toISOString(), outcome: "requires_approval", detail: "退款 ¥45 超出阈值，已转入审批中心" },
  ];
}

const repository = createLocalRepository("automationPolicy.state", () => ({
  policies: seedPolicies(),
  customAutomations: seedCustomAutomations(),
  runLog: seedRunLog(),
}));

export function getAutomationPolicyState() {
  return repository.get();
}

export function updatePolicyThreshold(policyId, thresholdValue) {
  return repository.update((state) => ({
    ...state,
    policies: state.policies.map((p) => (p.id === policyId ? { ...p, thresholdValue } : p)),
  }));
}

export function togglePolicyEnabled(policyId) {
  return repository.update((state) => ({
    ...state,
    policies: state.policies.map((p) => (p.id === policyId ? { ...p, enabled: !p.enabled } : p)),
  }));
}

export function createCustomAutomation(payload) {
  return repository.update((state) => ({
    ...state,
    customAutomations: [
      {
        id: nextMockId("auto"),
        origin: "custom",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...payload,
      },
      ...state.customAutomations,
    ],
  }));
}

export function updateCustomAutomation(id, patch) {
  return repository.update((state) => ({
    ...state,
    customAutomations: state.customAutomations.map((a) =>
      a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a
    ),
  }));
}

export function toggleCustomAutomationEnabled(id) {
  return repository.update((state) => ({
    ...state,
    customAutomations: state.customAutomations.map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled, status: !a.enabled ? "enabled" : "disabled" } : a
    ),
  }));
}

export function duplicateCustomAutomation(id) {
  return repository.update((state) => {
    const source = state.customAutomations.find((a) => a.id === id);
    if (!source) return state;
    const copy = {
      ...source,
      id: nextMockId("auto"),
      name: `${source.name}（副本）`,
      status: "draft",
      enabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { ...state, customAutomations: [copy, ...state.customAutomations] };
  });
}

// 系统自动化不可删除（阶段 V3 明确要求），只有自定义自动化可以删除。
export function deleteCustomAutomation(id) {
  return repository.update((state) => ({
    ...state,
    customAutomations: state.customAutomations.filter((a) => a.id !== id),
  }));
}

export async function testCustomAutomation() {
  await simulateLatency(500, 1000);
  return { ok: true, message: "（演示）测试运行完成：触发条件匹配，按当前配置将执行以下动作序列。" };
}
