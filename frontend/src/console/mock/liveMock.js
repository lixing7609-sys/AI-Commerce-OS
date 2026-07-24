import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * AI 直播中心 mock 数据（阶段 Founder UX Review V4）。三种直播
 * 模式中，"真人直播 + AI 辅助"是当前 Founder Alpha 阶段最实际的
 * 模式；"无人直播工作流"标注为高风险受限模式，不作为默认推荐。
 * 全部数据均为演示，不连接任何真实直播平台。
 */

export const LIVE_MODES = [
  { key: "human_ai_assisted", label: "真人直播 + AI辅助", risk: "低", recommended: true, description: "主播真人出镜，AI 负责排品、脚本、场控建议与风险提示——当前 Founder Alpha 阶段推荐模式。" },
  { key: "digital_human", label: "数字人直播", risk: "中", recommended: false, description: "数字人形象出镜讲解，适合稳定商品的长时段讲解，仍需人工监督。" },
  { key: "unmanned_workflow", label: "无人直播工作流", risk: "高", recommended: false, description: "全流程无人值守，风险高、受限——需要额外审批与合规评估，V4 仅作为架构预留，不建议启用。" },
];

export const PRODUCT_ROLES = [
  { key: "traffic", label: "引流款" },
  { key: "welfare", label: "福利款" },
  { key: "hero", label: "爆款" },
  { key: "profit", label: "利润款" },
  { key: "carry", label: "承接款" },
  { key: "clearance", label: "清库存款" },
];

export const SCRIPT_SECTIONS = [
  "开场", "预热", "留人", "商品介绍", "卖点讲解", "演示", "异议处理", "互动", "催单", "行动号召", "过渡", "收尾",
];

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name).id;
}

function seedLivePlans() {
  const now = Date.now();
  return [
    {
      id: nextMockId("live"),
      storeId: storeId("抖音店A"),
      platform: "抖音",
      account: "抖音店A · 官方号",
      title: "今晚8点防晒衣专场",
      mode: "human_ai_assisted",
      theme: "夏季防晒衣通勤专场",
      startTime: new Date(now + 6 * 3600000).toISOString(),
      durationMinutes: 90,
      gmvGoal: 15000,
      orderGoal: 120,
      trafficGoal: 20000,
      adBudget: 800,
      productPoolCount: 6,
      host: "小艾（真人主播）",
      digitalHumanConfig: null,
      scriptVersion: "v2",
      knowledgeBindings: ["防晒服商品知识", "抖音平台发布规则"],
      riskLevel: "低",
      approvalStatus: "已通过",
      status: "待开播",
    },
    {
      id: nextMockId("live"),
      storeId: storeId("淘宝店A"),
      platform: "淘宝",
      account: "淘宝店A · 直播间",
      title: "秋冬家纺提前购",
      mode: "human_ai_assisted",
      theme: "换季家纺清单",
      startTime: new Date(now + 30 * 3600000).toISOString(),
      durationMinutes: 60,
      gmvGoal: 8000,
      orderGoal: 60,
      trafficGoal: 9000,
      adBudget: 300,
      productPoolCount: 4,
      host: "老王（真人主播）",
      digitalHumanConfig: null,
      scriptVersion: "v1",
      knowledgeBindings: ["鞋服类目运营知识"],
      riskLevel: "低",
      approvalStatus: "待审批",
      status: "待开播",
    },
    {
      id: nextMockId("live"),
      storeId: storeId("抖音店A"),
      platform: "抖音",
      account: "抖音店A · 官方号",
      title: "防晒衣上身实测（已结束）",
      mode: "human_ai_assisted",
      theme: "防晒衣通勤实测",
      startTime: new Date(now - 30 * 3600000).toISOString(),
      durationMinutes: 75,
      gmvGoal: 10000,
      orderGoal: 90,
      trafficGoal: 15000,
      adBudget: 600,
      productPoolCount: 5,
      host: "小艾（真人主播）",
      digitalHumanConfig: null,
      scriptVersion: "v1",
      knowledgeBindings: ["防晒服商品知识"],
      riskLevel: "低",
      approvalStatus: "已通过",
      status: "已结束",
    },
    {
      id: nextMockId("live"),
      storeId: storeId("小红书店A"),
      platform: "视频号",
      account: "小红书店A · 数字人账号",
      title: "美妆专场（数字人试点）",
      mode: "digital_human",
      theme: "熬夜急救护肤",
      startTime: new Date(now + 50 * 3600000).toISOString(),
      durationMinutes: 45,
      gmvGoal: 5000,
      orderGoal: 40,
      trafficGoal: 6000,
      adBudget: 200,
      productPoolCount: 3,
      host: null,
      digitalHumanConfig: { avatar: "美妆顾问·小美", voice: "标准女声-温柔", disclosureRequired: true },
      scriptVersion: "v1",
      knowledgeBindings: ["禁限售词与合规规则"],
      riskLevel: "中",
      approvalStatus: "待审批",
      status: "待开播",
    },
  ];
}

function seedLineup(livePlanId) {
  return [
    { id: nextMockId("lu"), livePlanId, product: "轻薄防晒衣", sku: "SKU-SUN-001", role: "hero", sequence: 1, plannedMinutes: 15, price: 129, coupon: "满99减20", inventory: 320, expectedClicks: 4200, expectedConversion: "12%", expectedGmv: 5400, scriptSection: "卖点讲解", risk: "低", replacementProduct: "夏季百搭帆布鞋" },
    { id: nextMockId("lu"), livePlanId, product: "夏季百搭帆布鞋", sku: "SKU-SHO-004", role: "traffic", sequence: 2, plannedMinutes: 10, price: 159, coupon: "无", inventory: 210, expectedClicks: 2600, expectedConversion: "6%", expectedGmv: 2480, scriptSection: "商品介绍", risk: "低", replacementProduct: "无" },
    { id: nextMockId("lu"), livePlanId, product: "便携折叠加湿器", sku: "SKU-HUM-002", role: "clearance", sequence: 3, plannedMinutes: 8, price: 89, coupon: "库存清仓价", inventory: 0, expectedClicks: 1100, expectedConversion: "9%", expectedGmv: 780, scriptSection: "演示", risk: "中", replacementProduct: "LED灯带套装" },
    { id: nextMockId("lu"), livePlanId, product: "LED灯带套装", sku: "SKU-LED-005", role: "welfare", sequence: 4, plannedMinutes: 6, price: 45, coupon: "直播间专享9折", inventory: 480, expectedClicks: 1800, expectedConversion: "18%", expectedGmv: 1450, scriptSection: "互动", risk: "低", replacementProduct: "无" },
  ];
}

function seedScriptBlocks(livePlanId) {
  return SCRIPT_SECTIONS.map((section, idx) => ({
    id: nextMockId("script"),
    livePlanId,
    section,
    relatedProduct: idx < 2 ? "轻薄防晒衣 SKU-SUN-001" : idx < 6 ? "夏季百搭帆布鞋 SKU-SHO-004" : "全场",
    durationMinutes: [2, 3, 5, 8, 10, 6, 4, 5, 4, 3, 2, 3][idx] ?? 3,
    scriptText:
      section === "开场"
        ? "家人们晚上好！今天给大家带来夏天必备的防晒好物，全程真人实测，不夸大不虚标～"
        : section === "卖点讲解"
        ? "这件防晒衣是 UPF50+ 面料，我现在就穿着，摸一下真的很轻薄，完全不闷！"
        : section === "催单"
        ? "库存不多了家人们，前100单享满99减20，链接已经上车～"
        : `（演示脚本）${section} 环节内容，可根据热点与商品信息重新生成。`,
    promptVersion: "商品详情文案 Prompt v1",
    knowledgeSource: "防晒服商品知识 v2",
    complianceStatus: section === "卖点讲解" ? "需复核" : "通过",
    risk: section === "卖点讲解" ? "中" : "低",
    suggestedHostAction: section === "演示" ? "现场展示商品细节，特写面料" : "保持自然语速，眼神看镜头",
    suggestedScreenAction: section === "催单" ? "弹出限时优惠券贴纸" : "商品卡片置顶",
  }));
}

function seedControlRoomState(livePlanId) {
  return {
    livePlanId,
    onlineViewers: 1240,
    newViewers: 86,
    avgStaySeconds: 92,
    comments: 340,
    productClicks: 560,
    addToCart: 210,
    orders: 38,
    gmv: 4890,
    currentProduct: "轻薄防晒衣 SKU-SUN-001",
    currentScriptSection: "卖点讲解",
    inventory: 320,
    couponStatus: "已发放 86 张，剩余 214 张",
    adSpend: 210,
    riskAlerts: ["「卖点讲解」环节存在1条需复核表述"],
    networkStatus: "正常",
    audioStatus: "正常",
    videoStatus: "正常",
  };
}

function controlRoomRecommendations() {
  return [
    { id: "cr-1", type: "switch_product", label: "切换商品", detail: "当前商品讲解已超过 12 分钟，建议切换到下一款" },
    { id: "cr-2", type: "extend_explanation", label: "延长当前商品讲解", detail: "商品点击率持续上升，建议再讲解 2 分钟" },
    { id: "cr-3", type: "answer_question", label: "回答高频问题", detail: "弹幕中「会不会闷」被提及 18 次，建议现场回应" },
    { id: "cr-4", type: "issue_coupon", label: "发放优惠券", detail: "在线人数上升，建议发放限量优惠券刺激下单" },
    { id: "cr-5", type: "increase_traffic", label: "提高投流", detail: "当前 ROI 良好，建议提高投流预算" },
    { id: "cr-6", type: "stop_risky_wording", label: "停止风险表述", detail: "「卖点讲解」环节话术需要复核，建议主播换一种说法" },
  ];
}

function seedLiveReviews() {
  const now = Date.now();
  return [
    {
      id: nextMockId("lreview"),
      livePlanTitle: "防晒衣上身实测（已结束）",
      storeId: storeId("抖音店A"),
      gmv: 11860,
      orders: 96,
      conversionRate: "8.4%",
      productClicks: 6200,
      avgStaySeconds: 88,
      peakViewers: 2100,
      adSpend: 580,
      liveRoi: 4.2,
      productPerformance: [
        { product: "轻薄防晒衣", clicks: 3200, orders: 61, gmv: 7869 },
        { product: "夏季百搭帆布鞋", clicks: 1800, orders: 22, gmv: 2400 },
      ],
      scriptPerformance: [
        { section: "卖点讲解", retentionDelta: "+18%" },
        { section: "催单", retentionDelta: "+9%" },
      ],
      hostPerformance: "语速适中，互动响应及时，卖点讲解环节表现最佳",
      refundPrediction: "预计退款率 3.2%（低于店铺平均）",
      afterSalesRisk: "低",
      reviewedAt: new Date(now - 10 * 3600000).toISOString(),
      aiOutputs: {
        highPerformingScriptBlocks: ["卖点讲解：UPF50+ 实测演示", "催单：前100单专属优惠"],
        highPerformingMoments: ["00:18:32 上身试穿环节", "00:42:10 破价宣布瞬间"],
        highPerformingQA: ["「会不会闷」现场解答，带动弹幕互动"],
        recommendedClips: ["上身试穿环节（60秒）", "破价瞬间（30秒）"],
        recommendedShortVideo: "把「上身试穿环节」剪成 25 秒短视频",
        recommendedAdCreative: "「破价瞬间」适合做转化类广告素材",
        recommendedKnowledgeUpdates: ["把「会不会闷」问答加入防晒服商品知识"],
        recommendedNextPlan: "建议下次直播延长卖点讲解环节至 12 分钟",
      },
    },
  ];
}

const repository = createLocalRepository("liveCenter.state", () => {
  const plans = seedLivePlans();
  const activePlan = plans[0];
  return {
    plans,
    lineups: { [activePlan.id]: seedLineup(activePlan.id) },
    scripts: { [activePlan.id]: seedScriptBlocks(activePlan.id) },
    controlRoom: seedControlRoomState(activePlan.id),
    reviews: seedLiveReviews(),
  };
});

export function getLiveState() {
  return repository.get();
}

export function getLiveOverviewStats() {
  const { plans } = repository.get();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    todaySessions: plans.length,
    pendingStart: plans.filter((p) => p.status === "待开播").length,
    live: plans.filter((p) => p.status === "直播中").length,
    ended: plans.filter((p) => p.status === "已结束").length,
    todayGmv: 11860,
    todayOrders: 96,
    avgStaySeconds: 88,
    productClickRate: "9.1%",
    liveConversionRate: "8.4%",
    adSpend: 580,
    liveRoi: 4.2,
    refundPrediction: "3.2%",
    riskAlerts: 1,
    pendingApprovalPlans: plans.filter((p) => p.approvalStatus === "待审批").length,
  };
}

export function getLiveAiRecommendations() {
  return [
    { id: "lrec-1", label: "推荐下一场直播主题", detail: "「秋冬家纺提前购」话题热度上升，建议下周排期", targetSubView: "planning" },
    { id: "lrec-2", label: "推荐商品", detail: "「LED灯带套装」适合作为福利款引流", targetSubView: "lineup" },
    { id: "lrec-3", label: "推荐排品顺序", detail: "建议把防晒衣提前到第2位讲解，承接直播预热流量", targetSubView: "lineup" },
    { id: "lrec-4", label: "推荐投流预算", detail: "建议本场追加 ¥300 投流预算，预计 ROI 4.0+", targetSubView: "planning" },
    { id: "lrec-5", label: "推荐脚本调整", detail: "「卖点讲解」环节话术存在风险表述，建议修改", targetSubView: "script" },
    { id: "lrec-6", label: "推荐复用高表现内容", detail: "上次直播「上身试穿环节」适合剪成短视频复用", targetSubView: "review" },
    { id: "lrec-7", label: "推荐复用直播切片", detail: "「破价瞬间」片段建议二次发布为广告素材", targetSubView: "review" },
  ];
}

export function createLivePlan(payload) {
  return repository.update((state) => {
    const plan = {
      id: nextMockId("live"),
      status: "待开播",
      approvalStatus: "待审批",
      riskLevel: "低",
      productPoolCount: 0,
      scriptVersion: "v1",
      knowledgeBindings: [],
      digitalHumanConfig: null,
      ...payload,
    };
    return { ...state, plans: [plan, ...state.plans] };
  });
}

export function generateLineup(livePlanId) {
  return repository.update((state) => ({
    ...state,
    lineups: { ...state.lineups, [livePlanId]: seedLineup(livePlanId) },
  }));
}

export function reorderLineup(livePlanId, itemId, direction) {
  return repository.update((state) => {
    const items = [...(state.lineups[livePlanId] ?? [])];
    const idx = items.findIndex((i) => i.id === itemId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= items.length) return state;
    [items[idx], items[swapWith]] = [items[swapWith], items[idx]];
    items.forEach((item, i) => { item.sequence = i + 1; });
    return { ...state, lineups: { ...state.lineups, [livePlanId]: items } };
  });
}

export function generateScript(livePlanId) {
  return repository.update((state) => ({
    ...state,
    scripts: { ...state.scripts, [livePlanId]: seedScriptBlocks(livePlanId) },
  }));
}

export function insertTrendIntoScript(livePlanId, sectionKey, trendTitle) {
  return repository.update((state) => ({
    ...state,
    scripts: {
      ...state.scripts,
      [livePlanId]: (state.scripts[livePlanId] ?? []).map((block) =>
        block.section === sectionKey
          ? { ...block, scriptText: `${block.scriptText}（已插入热点话题：${trendTitle}）` }
          : block
      ),
    },
  }));
}

export async function triggerMockRecommendation(recId) {
  await simulateLatency(300, 700);
  return controlRoomRecommendations().find((r) => r.id === recId) ?? null;
}

export function getControlRoomRecommendations() {
  return controlRoomRecommendations();
}

export function startMockLive(livePlanId) {
  return repository.update((state) => ({
    ...state,
    plans: state.plans.map((p) => (p.id === livePlanId ? { ...p, status: "直播中" } : p)),
  }));
}

export function endMockLive(livePlanId) {
  return repository.update((state) => ({
    ...state,
    plans: state.plans.map((p) => (p.id === livePlanId ? { ...p, status: "已结束" } : p)),
  }));
}

export function generateLiveClips(livePlanId) {
  const plan = repository.get().plans.find((p) => p.id === livePlanId);
  return [
    { id: nextMockId("clip"), title: `${plan?.title ?? "直播"} · 高光片段 1`, durationSeconds: 45, performance: "完播率 68%" },
    { id: nextMockId("clip"), title: `${plan?.title ?? "直播"} · 高光片段 2`, durationSeconds: 30, performance: "转化率 12%" },
  ];
}
