import { tagDemo, nextMockId } from "./mockUtils.js";

/**
 * AI 秘书对话/关注事项的演示数据。所有条目都带 is_demo: true，UI
 * 上也应显式标注"演示数据"，绝不能让人误以为这是真实对话历史。
 */

export const QUICK_ACTIONS = [
  { id: "qa-1", label: "我要发布一个新商品", targetModule: "productCenter" },
  { id: "qa-2", label: "给我今天的经营报告", targetModule: "dashboard" },
  { id: "qa-3", label: "生成商品详情页", targetModule: "productCenter" },
  { id: "qa-4", label: "投放一个广告", targetModule: "adCenter" },
];

const CANNED_REPLIES = [
  {
    match: ["发布", "新商品", "上架"],
    reply: "好的，我可以帮你在商品中心创建新商品草稿，并让产品 Agent 生成详情文案。点击下方「去商品中心」继续。",
    targetModule: "productCenter",
  },
  {
    match: ["报告", "今天", "经营"],
    reply: "今天的经营摘要已经在下方「今日运营」卡片里。需要更详细的趋势图可以进入今日运营模块查看。",
    targetModule: "dashboard",
  },
  {
    match: ["详情页", "详情"],
    reply: "生成商品详情属于商品中心的工作流，我可以帮你打开对应商品的「生成详情」入口。",
    targetModule: "productCenter",
  },
  {
    match: ["广告", "投放"],
    reply: "广告投放需要先确认广告钱包余额和预算策略，我带你去广告中心确认。",
    targetModule: "adCenter",
  },
];

const DEFAULT_REPLY = "收到。这个操作目前还在建设中，我会记录下来，你也可以从左侧对应模块里直接操作。";

export function matchReply(text) {
  const lower = text.trim();
  for (const entry of CANNED_REPLIES) {
    if (entry.match.some((keyword) => lower.includes(keyword))) {
      return entry;
    }
  }
  return { reply: DEFAULT_REPLY, targetModule: null };
}

export function seedConversation() {
  return tagDemo([
    {
      id: nextMockId("msg"),
      role: "assistant",
      text: "早上好，Founder。今天有 2 件事需要你决定，1 个 Agent 正在跑任务。",
      timestamp: new Date().toISOString(),
    },
  ]);
}

export function seedAttentionItems() {
  return tagDemo([
    {
      id: "attn-approval",
      type: "approval",
      label: "1 条广告预算审批待处理",
      severity: "warning",
      targetModule: "approvalCenter",
    },
    {
      id: "attn-token",
      type: "token_low_balance",
      label: "Token 余额低于预警线（剩余 1,240）",
      severity: "danger",
      targetModule: "tokenCenter",
    },
    {
      id: "attn-policy",
      type: "policy_threshold",
      label: "有一条自动化策略即将触及阈值",
      severity: "neutral",
      targetModule: "automationPolicy",
    },
  ]);
}

const SEVERITY_RANK = { danger: 3, warning: 2, neutral: 1 };

/**
 * "首要处理事项"和"今天最大的风险"都从同一份 attentionItems 里
 * 挑最高优先级的一条——不是两套独立数据，只是两种不同的问法
 * （见 CEO Morning Brief 改版：两者本来就该指向同一件事，不应该
 * 各自维护一份列表导致互相矛盾）。
 */
export function pickTopPriorityItem(attentionItems) {
  if (!attentionItems.length) return null;
  return [...attentionItems].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
  )[0];
}

export function seedTodayHighlights() {
  return tagDemo({
    completedTasks: 12,
    failedTasks: 1,
    newDeliverables: 3,
    summary: "AI CEO 完成了 1 次经营分析，产品 Agent 生成了 2 篇商品详情文案，销售 Agent 的客服问答任务全部正常完成。",
  });
}

/**
 * 经营目标——Founder 级、跨全部店铺汇总（阶段 Founder UX Review
 * V3：AI 秘书不再按单店铺切换，默认就是全店汇总视图）。GMV/订单/
 * 广告/Token 四组目标与实际值配对，UI 层用进度条渲染完成度。
 */
export function seedOperatingGoals() {
  return tagDemo({
    gmvTarget: 20000,
    gmvCurrent: 12480,
    orderTarget: 260,
    orderCurrent: 154,
    adBudget: 1500,
    adSpend: 640,
    tokenBudget: 12000,
    tokenSpend: 8760,
  });
}

const RECOMMENDATION_TYPE_LABEL = {
  restock: "补充库存",
  pause_low_roi_ad: "暂停低ROI广告",
  raise_high_roi_budget: "提高高ROI商品预算",
  reply_bad_review: "回复差评",
  approve_publish: "审批待发布商品",
  handle_abnormal_order: "处理异常订单",
  adjust_price: "调整商品价格",
  check_token_balance: "检查Token余额",
  check_ad_balance: "检查广告余额",
};

const PRIORITY_RANK = { P0: 3, P1: 2, P2: 1 };

/**
 * AI 建议——按优先级排序的可执行建议列表，每条都必须能回答"为
 * 什么"和"接下来做什么"，不是单纯的状态罗列。targetModule 决定
 * 「去处理」按钮跳转到哪个模块，субView/entityId 可选，用于直达
 * 更具体的操作位置。
 */
export function seedAiRecommendations() {
  return tagDemo(
    [
      {
        id: "rec-1",
        type: "check_token_balance",
        priority: "P0",
        store: "全部店铺",
        reason: "Token 可用余额（1,240）已低于预警线（2,000），今天还有 3 个 Agent 任务待执行，可能因余额不足而中断。",
        suggestedAction: "前往 Token 中心充值或申请 Founder 授予",
        actionLabel: "去处理",
        targetModule: "tokenCenter",
      },
      {
        id: "rec-2",
        type: "restock",
        priority: "P0",
        store: "抖音店A",
        reason: "「便携折叠加湿器」库存已为 0，最近 7 天日均销量 12 件，预计断货将直接影响今日 GMV。",
        suggestedAction: "生成补货建议并同步采购",
        actionLabel: "去商品中心",
        targetModule: "productCenter",
      },
      {
        id: "rec-3",
        type: "pause_low_roi_ad",
        priority: "P1",
        store: "小红书店A",
        reason: "「大促预热」计划投放 3 天 ROAS 仅 0.6，低于止损线 1.0，继续投放将持续亏损广告预算。",
        suggestedAction: "暂停该广告计划，释放预算",
        actionLabel: "去广告中心",
        targetModule: "adCenter",
      },
      {
        id: "rec-4",
        type: "raise_high_roi_budget",
        priority: "P1",
        store: "抖音店A",
        reason: "「夏季新品推广」ROAS 达 2.4，处于当前所有投放计划最高水平，预算利用率已超 60%。",
        suggestedAction: "追加预算 ¥1,000 扩大投放",
        actionLabel: "去广告中心",
        targetModule: "adCenter",
      },
      {
        id: "rec-5",
        type: "approve_publish",
        priority: "P1",
        store: "淘宝店A",
        reason: "「无线降噪耳机 Pro」AI 详情文案已生成，发布配置已就绪，等待 Founder 审批后即可上架。",
        suggestedAction: "审核 AI 生成内容并批准发布",
        actionLabel: "去审批中心",
        targetModule: "approvalCenter",
      },
      {
        id: "rec-6",
        type: "reply_bad_review",
        priority: "P2",
        store: "抖音店A",
        reason: "「夏季轻薄防晒衣」新增 1 条 2 星差评，反馈面料偏薄，超过 12 小时未回复，可能影响店铺评分。",
        suggestedAction: "使用客服 Agent 生成回复草稿",
        actionLabel: "去客服中心",
        targetModule: "customerServiceCenter",
        targetSubView: "afterSales",
      },
      {
        id: "rec-7",
        type: "handle_abnormal_order",
        priority: "P2",
        store: "淘宝店A",
        reason: "有 2 笔订单支付成功超过 24 小时仍未发货，物流触发异常预警。",
        suggestedAction: "查看异常订单并安排发货",
        actionLabel: "去订单中心",
        targetModule: "orderCenter",
      },
      {
        id: "rec-8",
        type: "check_ad_balance",
        priority: "P2",
        store: "全部店铺",
        reason: "广告钱包可用余额 ¥8,600，按近 7 天日均花费估算约可支撑 10 天，建议提前规划下一次充值。",
        suggestedAction: "查看广告钱包余额趋势",
        actionLabel: "去广告中心",
        targetModule: "adCenter",
      },
    ].sort((a, b) => (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0))
  );
}

export function getRecommendationTypeLabel(type) {
  return RECOMMENDATION_TYPE_LABEL[type] ?? type;
}

/**
 * V4 新增：内容智能 / 直播 / 售后运营区域在 CEO 晨报中的提醒卡片
 * （阶段 Founder UX Review V4，P0-40）。这些是独立于"AI建议"列表
 * 的简短跨系统提醒，帮助 Founder 一眼看到新增经营闭环里发生了
 * 什么，不需要逐个模块巡检。
 */
export function seedCrossSystemAlerts() {
  return tagDemo([
    { id: "xsys-1", label: "今日发现 3 个高价值热点", targetModule: "contentCenter", targetSubView: "trendRadar" },
    { id: "xsys-2", label: "1 个热点将在 12 小时内过期", targetModule: "contentCenter", targetSubView: "topicPool" },
    { id: "xsys-3", label: "2 个内容项目等待审批", targetModule: "contentCenter", targetSubView: "projects" },
    { id: "xsys-4", label: "今晚直播排品需要确认", targetModule: "liveCenter", targetSubView: "lineup" },
    { id: "xsys-5", label: "直播脚本存在 1 条高风险表述", targetModule: "liveCenter", targetSubView: "script" },
    { id: "xsys-6", label: "4 个售后工单即将超时", targetModule: "customerServiceCenter", targetSubView: "afterSales" },
    { id: "xsys-7", label: "某商品退款率异常上升", targetModule: "customerServiceCenter", targetSubView: "review" },
    { id: "xsys-8", label: "某直播切片建议转成广告素材", targetModule: "liveCenter", targetSubView: "review" },
    { id: "xsys-9", label: "某客服问题建议生成内容", targetModule: "contentCenter", targetSubView: "overview" },
    { id: "xsys-10", label: "某售后原因建议更新商品详情", targetModule: "customerServiceCenter", targetSubView: "review" },
    { id: "xsys-11", label: "AI短剧新切片已产出，建议推荐给运营者", targetModule: "trafficNetworkCenter", targetSubView: "supply" },
    { id: "xsys-12", label: "1 个矩阵账号流量下滑，建议关注", targetModule: "trafficNetworkCenter", targetSubView: "matrix" },
  ]);
}
