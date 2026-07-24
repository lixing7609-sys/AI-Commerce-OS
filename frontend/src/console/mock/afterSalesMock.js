import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * 售后客服 mock 数据（阶段 Founder UX Review V4；架构冻结阶段
 * 移入客服中心的"售后客服"标签页，数据模型不变）。订单中心回答
 * "订单状态是什么"；售后客服回答"这个问题该按照店铺/平台/类目/
 * 商品/物流商/历史案例的规则怎么处理"——两者独立但通过订单号
 * 互相跳转，不合并模块。全部规则/处理结果均为演示数据，不构成
 * 真实法律或平台依据，不执行任何真实退款。
 */

export const CASE_TYPES = [
  "仅退款", "退货退款", "换货", "补发", "少件", "错发", "破损", "质量问题", "物流异常",
  "延迟发货", "未收到货", "价格争议", "差评处理", "平台投诉", "知识产权投诉", "商家责任争议", "平台介入",
];

export const CASE_STATES = [
  "待受理", "AI分析中", "待补充证据", "待经营者确认", "待审批", "等待买家", "等待物流", "等待平台",
  "处理中", "平台介入", "已同意", "已驳回", "已退款", "已补发", "已换货", "已完成", "异常", "已关闭",
];

export const RESPONSIBILITY_PARTIES = ["商家责任", "买家责任", "物流责任", "供应商责任", "平台责任", "证据不足"];

export const RESOLUTION_OPTIONS = [
  "同意退款", "要求退货", "换货", "补发", "部分退款", "优惠券补偿", "驳回并要求补充证据", "升级平台介入", "转人工处理",
];

export const AFTER_SALES_AUTOMATION_EXAMPLES = {
  autoLowRisk: {
    title: "低风险自动处理示例",
    conditions: ["金额 ≤ ¥20", "证据充分", "买家无异常历史", "商品非高风险品类", "案例匹配已批准策略"],
  },
  mandatoryApproval: {
    title: "强制审批示例",
    conditions: ["金额 > ¥100", "平台已介入", "批量退款", "知识产权投诉", "食品/健康/医疗/安全问题", "疑似恶意索赔", "供应商级批量缺陷", "重大公开投诉"],
  },
  levels: [
    { key: "L0", label: "L0 · 仅建议", description: "AI 只分析并给出建议，不执行任何操作" },
    { key: "L1", label: "L1 · 准备并需确认", description: "AI 准备回复内容，经营者确认后发送" },
    { key: "L2", label: "L2 · 低风险自动处理", description: "低价值标准案例可在策略范围内自动处理" },
    { key: "L3", label: "L3 · 授权额度内自动执行", description: "退款/补发/补偿可在授权额度内自动执行" },
    { key: "L4", label: "L4 · 双重审核", description: "平台纠纷/批量问题/大额/安全问题/知识产权投诉需要双重审核" },
  ],
};

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name).id;
}

function seedCases() {
  const now = Date.now();
  return [
    {
      id: nextMockId("as"),
      platform: "抖音",
      storeId: storeId("抖音店A"),
      orderNumber: "DY202407240001",
      product: "轻薄防晒衣",
      sku: "SKU-SUN-001",
      buyer: "买家1006",
      caseType: "质量问题",
      reason: "买家反馈防晒衣袖口线头脱线",
      buyerEvidence: "3张实拍图 + 1段视频",
      merchantEvidence: "质检记录（该批次抽检合格）",
      platformRule: "抖音《七天无理由退换货规则》",
      storeRule: "店铺质量问题优先补发",
      categoryRule: "服饰类目退货需保留吊牌",
      productRule: "该 SKU 无特殊售后政策",
      supplierResponsibility: "待确认",
      logisticsResponsibility: "不涉及",
      maxCompensationAuthorityUsd: 20,
      deadline: new Date(now + 20 * 3600000).toISOString(),
      riskLevel: "低",
      approvalStatus: "AI 已生成建议，待经营者确认",
      executionStatus: "处理中",
      status: "待经营者确认",
      amount: 129,
      timeline: [
        { time: new Date(now - 6 * 3600000).toISOString(), event: "买家发起仅退款申请", actor: "买家" },
        { time: new Date(now - 5 * 3600000).toISOString(), event: "售后受理Agent 完成案例分类与证据提取", actor: "售后受理Agent" },
        { time: new Date(now - 4 * 3600000).toISOString(), event: "规则匹配Agent 匹配到店铺质量问题优先补发规则", actor: "规则匹配Agent" },
        { time: new Date(now - 3 * 3600000).toISOString(), event: "方案决策Agent 建议：补发同款", actor: "方案决策Agent" },
      ],
    },
    {
      id: nextMockId("as"),
      platform: "淘宝",
      storeId: storeId("淘宝店A"),
      orderNumber: "TB202407230098",
      product: "男士休闲皮鞋",
      sku: "SKU-SHO-101",
      buyer: "买家2044",
      caseType: "少件",
      reason: "买家反馈只收到一只鞋",
      buyerEvidence: "开箱视频",
      merchantEvidence: "发货重量记录",
      platformRule: "淘宝《消费者保障服务规则》",
      storeRule: "少件问题 24 小时内核实并补发",
      categoryRule: "—",
      productRule: "—",
      supplierResponsibility: "待确认",
      logisticsResponsibility: "疑似分拣错误",
      maxCompensationAuthorityUsd: 40,
      deadline: new Date(now + 10 * 3600000).toISOString(),
      riskLevel: "中",
      approvalStatus: "待审批",
      executionStatus: "等待物流",
      status: "待审批",
      amount: 279,
      timeline: [
        { time: new Date(now - 10 * 3600000).toISOString(), event: "买家提交少件投诉", actor: "买家" },
        { time: new Date(now - 9 * 3600000).toISOString(), event: "售后受理Agent 标记为紧急", actor: "售后受理Agent" },
        { time: new Date(now - 8 * 3600000).toISOString(), event: "责任判定Agent 判定：物流责任为主", actor: "责任判定Agent" },
      ],
    },
    {
      id: nextMockId("as"),
      platform: "抖音",
      storeId: storeId("抖音店A"),
      orderNumber: "DY202407220077",
      product: "便携折叠加湿器",
      sku: "SKU-HUM-002",
      buyer: "买家3391",
      caseType: "仅退款",
      reason: "买家不想要了，商品未拆封",
      buyerEvidence: "无",
      merchantEvidence: "不涉及",
      platformRule: "抖音《七天无理由退换货规则》",
      storeRule: "¥20 以下仅退款自动同意",
      categoryRule: "—",
      productRule: "—",
      supplierResponsibility: "不涉及",
      logisticsResponsibility: "不涉及",
      maxCompensationAuthorityUsd: 20,
      deadline: new Date(now + 40 * 3600000).toISOString(),
      riskLevel: "低",
      approvalStatus: "已自动通过（L2 策略范围内）",
      executionStatus: "已完成",
      status: "已完成",
      amount: 18,
      timeline: [
        { time: new Date(now - 20 * 3600000).toISOString(), event: "买家发起仅退款", actor: "买家" },
        { time: new Date(now - 19.9 * 3600000).toISOString(), event: "规则匹配Agent 匹配到 L2 自动处理策略", actor: "规则匹配Agent" },
        { time: new Date(now - 19.8 * 3600000).toISOString(), event: "执行Agent 已模拟执行退款", actor: "执行Agent" },
      ],
    },
    {
      id: nextMockId("as"),
      platform: "小红书",
      storeId: storeId("小红书店A"),
      orderNumber: "XHS202407210055",
      product: "保湿精华面霜",
      sku: "SKU-BEA-201",
      buyer: "买家4820",
      caseType: "平台投诉",
      reason: "买家投诉产品导致皮肤过敏，要求平台介入",
      buyerEvidence: "过敏照片 + 医院单据",
      merchantEvidence: "产品成分检测报告",
      platformRule: "小红书《食品药品安全投诉处理规则》",
      storeRule: "涉及健康安全问题一律升级平台介入",
      categoryRule: "美妆类目投诉需 24 小时内响应",
      productRule: "该 SKU 曾有 1 次同类投诉记录",
      supplierResponsibility: "待供应商复核",
      logisticsResponsibility: "不涉及",
      maxCompensationAuthorityUsd: 0,
      deadline: new Date(now + 4 * 3600000).toISOString(),
      riskLevel: "高",
      approvalStatus: "待双重审核（L4）",
      executionStatus: "平台介入",
      status: "平台介入",
      amount: 219,
      timeline: [
        { time: new Date(now - 30 * 3600000).toISOString(), event: "买家提交平台投诉", actor: "买家" },
        { time: new Date(now - 29 * 3600000).toISOString(), event: "售后风控Agent 标记为高风险案例", actor: "售后风控Agent" },
        { time: new Date(now - 28 * 3600000).toISOString(), event: "案例升级为 L4，需双重审核", actor: "系统" },
      ],
    },
    {
      id: nextMockId("as"),
      platform: "抖音",
      storeId: storeId("抖音店A"),
      orderNumber: "DY202407190032",
      product: "LED灯带套装",
      sku: "SKU-LED-005",
      buyer: "买家5117",
      buyerEvidence: "开箱图片",
      merchantEvidence: "不涉及",
      caseType: "破损",
      reason: "运输途中灯带外包装破损",
      platformRule: "抖音《运输破损理赔规则》",
      storeRule: "破损问题优先补发",
      categoryRule: "—",
      productRule: "—",
      supplierResponsibility: "不涉及",
      logisticsResponsibility: "主要责任",
      maxCompensationAuthorityUsd: 30,
      deadline: new Date(now + 30 * 3600000).toISOString(),
      riskLevel: "低",
      approvalStatus: "已同意",
      executionStatus: "已补发",
      status: "已补发",
      amount: 45,
      timeline: [
        { time: new Date(now - 40 * 3600000).toISOString(), event: "买家提交破损投诉", actor: "买家" },
        { time: new Date(now - 39 * 3600000).toISOString(), event: "责任判定Agent 判定：物流责任", actor: "责任判定Agent" },
        { time: new Date(now - 38 * 3600000).toISOString(), event: "方案决策Agent 建议补发，经营者已确认", actor: "方案决策Agent" },
        { time: new Date(now - 36 * 3600000).toISOString(), event: "执行Agent 已模拟补发", actor: "执行Agent" },
      ],
    },
    {
      id: nextMockId("as"),
      platform: "淘宝",
      storeId: storeId("淘宝店A"),
      orderNumber: "TB202407180015",
      product: "四件套家纺套件",
      sku: "SKU-HOM-102",
      buyer: "买家6203",
      caseType: "延迟发货",
      reason: "下单超过 48 小时未发货",
      buyerEvidence: "订单截图",
      merchantEvidence: "库存记录（补货中）",
      platformRule: "淘宝《发货时效规则》",
      storeRule: "超时未发货主动补偿优惠券",
      categoryRule: "—",
      productRule: "—",
      supplierResponsibility: "供货延迟",
      logisticsResponsibility: "不涉及",
      maxCompensationAuthorityUsd: 20,
      deadline: new Date(now + 6 * 3600000).toISOString(),
      riskLevel: "中",
      approvalStatus: "待经营者确认",
      executionStatus: "处理中",
      status: "待经营者确认",
      amount: 199,
      timeline: [
        { time: new Date(now - 3 * 3600000).toISOString(), event: "买家催发货", actor: "买家" },
        { time: new Date(now - 2 * 3600000).toISOString(), event: "责任判定Agent 判定：供应商供货延迟", actor: "责任判定Agent" },
      ],
    },
  ];
}

const repository = createLocalRepository("afterSalesCenter.state", () => ({
  cases: seedCases(),
}));

export function getAfterSalesState() {
  return repository.get();
}

export function getCase(caseId) {
  return repository.get().cases.find((c) => c.id === caseId) ?? null;
}

export function getAfterSalesOverviewStats() {
  const { cases } = repository.get();
  const now = Date.now();
  return {
    newToday: cases.filter((c) => Date.now() - new Date(c.timeline[0].time).getTime() < 24 * 3600000).length,
    pending: cases.filter((c) => !["已完成", "已关闭", "已退款", "已补发", "已换货"].includes(c.status)).length,
    nearTimeout: cases.filter((c) => new Date(c.deadline).getTime() - now < 6 * 3600000 && new Date(c.deadline).getTime() > now).length,
    platformIntervention: cases.filter((c) => c.status === "平台介入").length,
    pendingApproval: cases.filter((c) => c.status === "待审批" || c.status === "待经营者确认").length,
    completed: cases.filter((c) => c.status === "已完成").length,
    refundAmount: cases.filter((c) => ["已退款", "已完成"].includes(c.status)).reduce((sum, c) => sum + c.amount, 0),
    reshipCount: cases.filter((c) => c.status === "已补发").length,
    refundOnlyCount: cases.filter((c) => c.caseType === "仅退款").length,
    returnRefundCount: cases.filter((c) => c.caseType === "退货退款").length,
    afterSalesRate: "4.8%",
    refundRate: "2.1%",
    estimatedLoss: cases.reduce((sum, c) => sum + (["待审批", "待经营者确认", "平台介入"].includes(c.status) ? c.amount : 0), 0),
    hotIssueProduct: "轻薄防晒衣（质量问题 1 起）",
    hotIssueSupplier: "华南面料供应商（供货延迟 1 起）",
    hotIssueLogistics: "顺丰速运（少件/破损 2 起）",
    riskyBuyers: 0,
    healthScore: 86,
  };
}

export function getAfterSalesAiRecommendations() {
  return [
    { id: "asrec-1", label: "批准低风险退款", detail: "「便携折叠加湿器」仅退款案例符合 L2 自动策略", targetCaseIndex: 2 },
    { id: "asrec-2", label: "要求补充证据", detail: "「男士休闲皮鞋」少件投诉建议要求买家补充称重凭证", targetCaseIndex: 1 },
    { id: "asrec-3", label: "升级平台介入", detail: "「保湿精华面霜」健康安全类投诉建议立即升级", targetCaseIndex: 3 },
    { id: "asrec-4", label: "触发供应商索赔", detail: "「四件套家纺套件」延迟发货建议向供应商发起索赔", targetCaseIndex: 5 },
    { id: "asrec-5", label: "更新商品内容", detail: "「防晒衣线头脱线」建议更新商品详情说明面料工艺", targetCaseIndex: 0 },
    { id: "asrec-6", label: "更新直播话术", detail: "「防晒衣是否闷热」问题建议补充进直播脚本", targetCaseIndex: null },
    { id: "asrec-7", label: "更新尺码指引", detail: "「男士休闲皮鞋」偏码问题建议补充尺码对照表", targetCaseIndex: null },
    { id: "asrec-8", label: "暂停高退款商品广告", detail: "暂无商品触发该建议（退款率均在正常范围）", targetCaseIndex: null },
    { id: "asrec-9", label: "加入知识库", detail: "「运输破损理赔规则」建议沉淀为售后知识库条目", targetCaseIndex: 4 },
  ];
}

export function updateCaseStatus(caseId, status, event, actor = "Founder") {
  return repository.update((state) => ({
    ...state,
    cases: state.cases.map((c) =>
      c.id === caseId
        ? { ...c, status, timeline: [...c.timeline, { time: new Date().toISOString(), event, actor }] }
        : c
    ),
  }));
}

export function selectResolution(caseId, resolution) {
  return updateCaseStatus(caseId, "待审批", `方案决策Agent 建议：${resolution}，等待审批`, "方案决策Agent");
}

export async function generateCommunication(caseId) {
  await simulateLatency(400, 900);
  const c = getCase(caseId);
  return {
    platform: c?.platform,
    tone: "礼貌、明确、遵守平台时限",
    text: `亲爱的买家您好，关于订单 ${c?.orderNumber} 的问题，我们已核实情况，将按照店铺售后政策为您处理，感谢您的理解与耐心等待。`,
    evidenceRequestText: "为了更快为您处理，请补充问题商品的实拍图片或视频，谢谢配合。",
    platformAppealText: "（演示）平台申诉文本：本店已核实该案例证据，申请维持原判定结果。",
  };
}

export async function executeMockResolution(caseId, resolutionStatus) {
  await simulateLatency(500, 1000);
  return updateCaseStatus(caseId, resolutionStatus, `执行Agent 已模拟执行：${resolutionStatus}`, "执行Agent");
}

export function getAfterSalesReview() {
  return {
    productRefundRates: [
      { product: "轻薄防晒衣", refundRate: "1.8%" },
      { product: "男士休闲皮鞋", refundRate: "3.1%" },
      { product: "便携折叠加湿器", refundRate: "5.6%" },
    ],
    rootCauses: [
      { cause: "供应商供货延迟", count: 1 },
      { cause: "物流分拣错误", count: 2 },
      { cause: "面料工艺瑕疵", count: 1 },
    ],
    supplierIssues: ["华南面料供应商存在批次质检遗漏"],
    logisticsIssues: ["顺丰速运近期少件/破损案例增加"],
    contentOverpromise: ["「防晒衣不闷热」宣称需要更谨慎的表述"],
    liveScriptOverpromise: ["直播中「绝对不过敏」等表述存在风险，建议规避"],
    storeProcessIssues: ["少件类案例平均响应时间偏长，建议提高优先级"],
    knowledgeUpdateSuggestions: ["把「运输破损理赔规则」沉淀为售后知识库条目", "补充「防晒衣是否闷热」标准问答"],
  };
}
