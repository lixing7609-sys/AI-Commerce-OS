import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";
import { getAfterSalesState } from "./afterSalesMock.js";

/**
 * 客服中心 · 日常客服 mock 数据（阶段 Founder V4 架构冻结，客服中心
 * 修正）。日常客服（售前/使用期咨询）与售后客服（afterSalesMock.js
 * 里已有的工单）是客服中心下的两类业务，共用同一套人工接管/AI
 * 自动化语言，但各自的数据模型保持独立——"统一会话"视图负责把
 * 两类数据汇总成一份跨类型列表，不是合并成一个数据表。全部为
 * 演示数据，不产生真实客服消息。
 */

export const CONVERSATION_TYPES = [
  "商品咨询", "尺码咨询", "材质咨询", "库存咨询", "优惠咨询", "发货时间咨询", "物流咨询",
  "使用指导", "安装指导", "活动规则", "订单修改", "发货提醒", "物流提醒", "选购推荐", "商品对比", "复购推荐",
];

export const AUTOMATION_MODES = [
  { key: "ai_auto", label: "AI全自动" },
  { key: "ai_draft_human_send", label: "AI生成草稿，人工发送" },
  { key: "human_ai_assist", label: "人工接管，AI辅助" },
];

export const CONVERSATION_STATES = [
  "AI 处理中", "AI 等待信息", "建议人工接管", "等待人工接管", "人工处理中",
  "人工暂时离开", "已交还 AI", "已完成",
];

export const TAKEOVER_ACTIONS = [
  { key: "takeover_now", label: "立即接管" },
  { key: "hand_back_ai", label: "交还 AI" },
  { key: "ai_assist_reply", label: "AI 辅助回复" },
  { key: "draft_only", label: "仅生成回复草稿" },
  { key: "pause_auto_reply", label: "暂停自动回复" },
  { key: "transfer_agent", label: "转交其他客服" },
  { key: "escalate_founder", label: "升级 Founder" },
];

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name).id;
}

function seedConversations() {
  const now = Date.now();
  return [
    {
      id: nextMockId("csc"), storeId: storeId("抖音店A"), platform: "抖音", customer: "买家7701",
      product: "轻薄防晒衣 SKU-SUN-001", orderNumber: null, conversationType: "尺码咨询",
      responsibleAgent: "商品问答Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 2 * 3600000).toISOString(), status: "AI 处理中",
      sentiment: "中性", lastMessageAt: new Date(now - 3 * 60000).toISOString(),
      suggestedReply: "亲亲这款是标准码，如果您平时穿M码建议拍M码，稍显瘦可以拍大一码哦～",
      messages: [
        { from: "customer", text: "这个码数偏小吗？", time: new Date(now - 5 * 60000).toISOString() },
        { from: "agent", text: "亲亲这款是标准码～", time: new Date(now - 3 * 60000).toISOString() },
      ],
    },
    {
      id: nextMockId("csc"), storeId: storeId("抖音店A"), platform: "抖音", customer: "买家7702",
      product: "轻薄防晒衣 SKU-SUN-001", orderNumber: null, conversationType: "材质咨询",
      responsibleAgent: "商品问答Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 3 * 3600000).toISOString(), status: "已完成",
      sentiment: "正面", lastMessageAt: new Date(now - 40 * 60000).toISOString(),
      suggestedReply: null,
      messages: [{ from: "customer", text: "面料会不会很闷？", time: new Date(now - 42 * 60000).toISOString() }, { from: "agent", text: "采用冰丝面料，透气清凉～", time: new Date(now - 40 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("抖音店A"), platform: "抖音", customer: "买家7703",
      product: "LED灯带套装 SKU-LED-005", orderNumber: "DY202407240010", conversationType: "订单修改",
      responsibleAgent: "订单查询Agent", humanOwner: null, automationMode: "ai_draft_human_send",
      riskLevel: "中", responseDeadline: new Date(now + 1 * 3600000).toISOString(), status: "建议人工接管",
      sentiment: "负面", lastMessageAt: new Date(now - 8 * 60000).toISOString(),
      suggestedReply: "亲亲订单还未发货，可以帮您修改收货地址，麻烦提供新地址～",
      messages: [
        { from: "customer", text: "我地址填错了，还能改吗？很急！", time: new Date(now - 10 * 60000).toISOString() },
        { from: "customer", text: "在吗？？", time: new Date(now - 8 * 60000).toISOString() },
      ],
    },
    {
      id: nextMockId("csc"), storeId: storeId("淘宝店A"), platform: "淘宝", customer: "买家8801",
      product: "男士休闲皮鞋 SKU-SHO-101", orderNumber: null, conversationType: "商品对比",
      responsibleAgent: "销售转化Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 4 * 3600000).toISOString(), status: "AI 等待信息",
      sentiment: "中性", lastMessageAt: new Date(now - 15 * 60000).toISOString(),
      suggestedReply: "方便告诉我您平时穿多大码、常见使用场景吗？我可以帮您推荐更合适的款式～",
      messages: [{ from: "customer", text: "这个和你们另一款皮鞋有什么区别？", time: new Date(now - 15 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("淘宝店A"), platform: "淘宝", customer: "买家8802",
      product: "四件套家纺套件 SKU-HOM-102", orderNumber: "TB202407240022", conversationType: "发货提醒",
      responsibleAgent: "物流查询Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "中", responseDeadline: new Date(now + 30 * 60000).toISOString(), status: "等待人工接管",
      sentiment: "负面", lastMessageAt: new Date(now - 2 * 60000).toISOString(),
      suggestedReply: "非常抱歉发货延迟，已加急处理，预计今晚发出，另附赠一张优惠券表示歉意～",
      messages: [
        { from: "customer", text: "都三天了怎么还没发货？", time: new Date(now - 4 * 60000).toISOString() },
        { from: "customer", text: "要投诉了", time: new Date(now - 2 * 60000).toISOString() },
      ],
    },
    {
      id: nextMockId("csc"), storeId: storeId("小红书店A"), platform: "小红书", customer: "买家9901",
      product: "保湿精华面霜 SKU-BEA-201", orderNumber: null, conversationType: "选购推荐",
      responsibleAgent: "销售转化Agent", humanOwner: "客服-小林", automationMode: "human_ai_assist",
      riskLevel: "低", responseDeadline: new Date(now + 6 * 3600000).toISOString(), status: "人工处理中",
      sentiment: "正面", lastMessageAt: new Date(now - 1 * 60000).toISOString(),
      suggestedReply: "根据您描述的干皮、易泛红，推荐搭配我们的舒缓精华一起使用效果更佳～",
      messages: [{ from: "customer", text: "我是干皮容易泛红，这个适合吗？", time: new Date(now - 3 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("抖音店A"), platform: "抖音", customer: "买家7704",
      product: "夏季百搭帆布鞋 SKU-SHO-004", orderNumber: null, conversationType: "库存咨询",
      responsibleAgent: "商品问答Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 5 * 3600000).toISOString(), status: "已完成",
      sentiment: "正面", lastMessageAt: new Date(now - 60 * 60000).toISOString(),
      suggestedReply: null,
      messages: [{ from: "customer", text: "39码还有货吗？", time: new Date(now - 61 * 60000).toISOString() }, { from: "agent", text: "39码现货充足～", time: new Date(now - 60 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("淘宝店A"), platform: "淘宝", customer: "买家8803",
      product: "四件套家纺套件 SKU-HOM-102", orderNumber: null, conversationType: "复购推荐",
      responsibleAgent: "销售转化Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 8 * 3600000).toISOString(), status: "已交还 AI",
      sentiment: "正面", lastMessageAt: new Date(now - 20 * 60000).toISOString(),
      suggestedReply: "上次购买的四件套用得还满意吗？新到货一批秋冬加厚款，老客专享9折～",
      messages: [{ from: "customer", text: "有新款吗？", time: new Date(now - 22 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("抖音店A"), platform: "抖音", customer: "买家7705",
      product: "LED灯带套装 SKU-LED-005", orderNumber: null, conversationType: "安装指导",
      responsibleAgent: "商品问答Agent", humanOwner: null, automationMode: "ai_auto",
      riskLevel: "低", responseDeadline: new Date(now + 10 * 3600000).toISOString(), status: "AI 处理中",
      sentiment: "中性", lastMessageAt: new Date(now - 6 * 60000).toISOString(),
      suggestedReply: "灯带背胶自带3M胶，清洁墙面后直接粘贴即可，附赠说明书～",
      messages: [{ from: "customer", text: "怎么安装啊？", time: new Date(now - 6 * 60000).toISOString() }],
    },
    {
      id: nextMockId("csc"), storeId: storeId("小红书店A"), platform: "小红书", customer: "买家9902",
      product: "保湿精华面霜 SKU-BEA-201", orderNumber: "XHS202407240031", conversationType: "活动规则",
      responsibleAgent: "咨询受理Agent", humanOwner: "客服-小林", automationMode: "human_ai_assist",
      riskLevel: "中", responseDeadline: new Date(now + 45 * 60000).toISOString(), status: "人工暂时离开",
      sentiment: "负面", lastMessageAt: new Date(now - 12 * 60000).toISOString(),
      suggestedReply: "活动满199减30，当前订单已满足条件，优惠会在结算时自动抵扣～",
      messages: [{ from: "customer", text: "满减活动到底怎么算的，客服不理我", time: new Date(now - 12 * 60000).toISOString() }],
    },
  ];
}

const repository = createLocalRepository("dailyCustomerService.state", () => ({
  conversations: seedConversations(),
}));

export function getDailyCsState() {
  return repository.get();
}

export function getConversation(id) {
  return repository.get().conversations.find((c) => c.id === id) ?? null;
}

export function getDailyCsAnalytics() {
  const { conversations } = repository.get();
  return {
    enquiryVolume: conversations.length,
    firstResponseTimeSeconds: 38,
    aiResolutionRate: "72%",
    humanTakeoverRate: "18%",
    enquiryToOrderConversion: "9.4%",
    agentAssistedGmvUsd: 860,
    recommendedProductClickRate: "14.2%",
    satisfaction: "4.6/5",
    timeoutRisk: conversations.filter((c) => new Date(c.responseDeadline).getTime() - Date.now() < 3600000).length,
  };
}

export function getDailyCsAiRecommendations() {
  return [
    { id: "csrec-1", label: "建议立即接管", detail: "买家7703订单修改请求已等待超10分钟，情绪偏负面", conversationIndex: 2 },
    { id: "csrec-2", label: "建议优先处理", detail: "买家8802发货延迟投诉，距离响应时限仅剩30分钟", conversationIndex: 4 },
    { id: "csrec-3", label: "建议补充商品知识", detail: "「商品对比」类型咨询近期增多，建议补充竞品对比知识", conversationIndex: null },
    { id: "csrec-4", label: "建议关注人工离开会话", detail: "买家9902的活动规则咨询客服暂时离开，AI 可先辅助回复", conversationIndex: 9 },
  ];
}

/**
 * 统一会话：把日常客服会话与售后客服工单汇总成同一份跨类型列表，
 * 供"统一会话"标签页做跨类型筛选——两类底层数据模型各自独立，
 * 这里只做展示层的归一化，不产生新的持久化数据。
 */
export function getUnifiedConversations() {
  const daily = repository.get().conversations.map((c) => ({
    id: c.id,
    kind: "daily",
    storeId: c.storeId,
    platform: c.platform,
    customer: c.customer,
    product: c.product,
    orderNumber: c.orderNumber,
    conversationType: c.conversationType,
    responsibleAgent: c.responsibleAgent,
    humanOwner: c.humanOwner,
    automationMode: c.automationMode,
    riskLevel: c.riskLevel,
    responseDeadline: c.responseDeadline,
    status: c.status,
  }));
  const afterSales = getAfterSalesState().cases.map((c) => ({
    id: c.id,
    kind: "afterSales",
    storeId: c.storeId,
    platform: c.platform,
    customer: c.buyer,
    product: c.product,
    orderNumber: c.orderNumber,
    conversationType: c.caseType,
    responsibleAgent: "沟通Agent",
    humanOwner: null,
    automationMode: "ai_draft_human_send",
    riskLevel: c.riskLevel,
    responseDeadline: c.deadline,
    status: c.status,
  }));
  return [...daily, ...afterSales].sort((a, b) => new Date(a.responseDeadline) - new Date(b.responseDeadline));
}

function updateConversation(id, patch, event) {
  return repository.update((state) => ({
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === id
        ? { ...c, ...patch, messages: event ? [...c.messages, { from: "system", text: event, time: new Date().toISOString() }] : c.messages }
        : c
    ),
  }));
}

export async function performTakeoverAction(id, actionKey) {
  await simulateLatency(300, 700);
  switch (actionKey) {
    case "takeover_now":
      return updateConversation(id, { status: "人工处理中", humanOwner: "Founder", automationMode: "human_ai_assist" }, "Founder 已立即接管");
    case "hand_back_ai":
      return updateConversation(id, { status: "已交还 AI", humanOwner: null, automationMode: "ai_auto" }, "已交还 AI 处理");
    case "ai_assist_reply":
      return updateConversation(id, { status: "人工处理中", automationMode: "human_ai_assist" }, "已切换为 AI 辅助回复模式");
    case "draft_only":
      return updateConversation(id, { automationMode: "ai_draft_human_send" }, "已切换为仅生成回复草稿");
    case "pause_auto_reply":
      return updateConversation(id, { status: "等待人工接管" }, "已暂停自动回复");
    case "transfer_agent":
      return updateConversation(id, { humanOwner: "客服-小林" }, "已转交给客服-小林");
    case "escalate_founder":
      return updateConversation(id, { status: "建议人工接管", humanOwner: "Founder" }, "已升级 Founder 处理");
    default:
      return repository.get();
  }
}
