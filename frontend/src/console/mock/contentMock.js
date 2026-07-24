import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES, getStoreName } from "./storesMock.js";
import { getProducts } from "./productMock.js";
import {
  canTransitionContentProject,
  createPlatformExecution,
  createPublishJob,
  createReviewSnapshot,
  createTrafficAttribution,
  deterministicPerformanceFor,
  getReviewSnapshotForProject,
  getTrafficAttributionForProject,
  platformExecutionContract,
  updatePlatformExecution,
  updatePublishJob,
} from "./operatingLoopMock.js";
import { appendReplayEvent } from "./replayMock.js";
import { createApprovalRequest, decideRequest, getApprovalRequest, getApprovalRequests } from "./approvalMock.js";
import { createAttributedOrder } from "./orderMock.js";
import { createConversationForOrder, getConversation } from "./dailyCustomerServiceMock.js";
import { createKnowledgeCandidate } from "./knowledgeMock.js";

/**
 * 内容中心的核心 mock 数据（阶段 Founder UX Review V4）。内容中心
 * 不是一个文案生成器，而是"选题池 → 内容项目 → 二创任务（Hot
 * Content Task，完整状态机）→ 审核 → 渠道适配 → 发布计划 → 资产库
 * → 数据复盘"的完整闭环，字段与选题池/热点雷达（trendMock.js）
 * 用同一套 store/category/product 语言，可以互相跳转。
 */

export const CONTENT_TYPES = [
  "商品短视频", "商品图文", "口播视频", "情景短剧", "测评内容", "教程内容", "清单内容",
  "买家秀二创", "店铺活动内容", "小红书笔记", "视频号内容", "直播预热", "直播切片",
  "商品详情补充", "广告素材", "朋友圈内容",
];

export const HOT_CONTENT_STATES = [
  "新发现", "待评估", "建议跟进", "已忽略", "策划中", "二创中", "生产中", "原创检查",
  "版权检查", "合规检查", "待审批", "待发布", "发布中", "已发布", "发布失败", "表现观察中", "已复盘",
];

export const REPURPOSING_LEVELS = [
  { key: "light", label: "轻量适配", description: "只调整标题、封面、标签、开头钩子与渠道格式，不改变内容主体。" },
  { key: "deep", label: "深度二创", description: "重写脚本、场景、人设、内容结构与卖点顺序，制作新的图片或视频素材。" },
  { key: "original", label: "热点借势原创", description: "只把热点当作选题信号，使用自有商品与素材完全原创产出，不复用参考内容本身。" },
];

const ALLOWED_ACTIONS = [
  "复述热点事实", "重构选题角度", "结合店铺自有商品", "基于品牌语言改写", "使用自有商品素材",
  "二次剪辑已授权买家内容", "总结公开信息", "创作全新脚本/图片/视频/场景", "生产渠道专属版本",
];
const DISALLOWED_ACTIONS = [
  "直接搬运视频", "去除水印", "复制完整脚本", "复制完整文章", "使用未授权音乐",
  "使用未授权肖像", "未授权模仿声音", "使用未授权影视片段", "误导性商标使用", "低质量重复批量生产",
];

export function getRepurposingBoundaries() {
  return { allowed: ALLOWED_ACTIONS, disallowed: DISALLOWED_ACTIONS };
}

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name).id;
}

function productIdFor(sku) {
  return getProducts().find((p) => p.sku === sku)?.id ?? null;
}

/**
 * 经营闭环 golden path 使用的固定项目 id——种子数据首次生成时就
 * 确定，供 operatingLoopMock 的编排函数、Approval/Order/客服/Replay
 * 各处直接引用，不需要每次都从列表里按名称查找。
 */
export const OPERATING_LOOP_PROJECT_ID = "cproj-loop-led-strip";
export const OPERATING_LOOP_REPLAY_RUN_ID = "run-loop-led-strip";

function seedContentProjects() {
  const now = Date.now();
  return [
    // ---- Founder V4.3 经营闭环 golden path：抖音店A / LED灯带套装 3米（家用智能感应灯带类目） ----
    {
      id: OPERATING_LOOP_PROJECT_ID,
      name: "LED感应灯带 · 电视背景氛围感内容项目",
      source: "商品运营",
      storeId: storeId("抖音店A"),
      productId: productIdFor("SKU-LED-005"),
      category: "LED电工",
      product: "LED灯带套装 3米 SKU-LED-005",
      businessGoal: "拉动商品自然流量转化为订单",
      marketingGoal: "拉动商品自然流量转化为订单",
      targetPlatform: "抖音",
      targetAudience: "18-35岁租房/宿舍改造人群",
      contentTheme: "电视背后灯带氛围感安装展示",
      contentType: "商品短视频",
      contentFormats: ["商品短视频"],
      plannedChannels: ["抖音"],
      sourceTrend: "内部商品运营信号：LED灯带近7天商品详情页访问量上升",
      relatedAgents: ["内容策略Agent", "脚本Agent", "视频生产Agent", "原创度检查Agent", "版权检查Agent", "平台合规Agent"],
      contentOwner: "Founder",
      automationLevel: "AI 生成 + Founder 审批 + 辅助执行发布",
      costCeilingUsd: 3,
      status: "策划中",
      createdAt: new Date(now - 6 * 3600000).toISOString(),
      updatedAt: new Date(now - 6 * 3600000).toISOString(),
      dueAt: new Date(now + 72 * 3600000).toISOString(),
      expectedResult: "商品详情页访问 +25%，本周新增成交 3-5 单",
      actualResult: null,
      // ---- 经营闭环字段（阶段 V4.3）----
      loopState: "Draft",
      contentVersions: [],
      approvalRequestId: null,
      publishJobId: null,
      orderId: null,
      conversationId: null,
      reviewSnapshotId: null,
      replayRunId: OPERATING_LOOP_REPLAY_RUN_ID,
    },
    {
      id: nextMockId("cproj"),
      name: "夏季防晒衣内容矩阵",
      source: "热点雷达",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      marketingGoal: "拉动商品访问与转化",
      targetAudience: "18-35岁通勤女性",
      contentTheme: "高温通勤防晒实测",
      contentFormats: ["商品短视频", "直播预热", "商品详情补充"],
      plannedChannels: ["抖音", "小红书"],
      relatedAgents: ["内容策略Agent", "脚本Agent", "视频生产Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 5,
      status: "进行中",
      createdAt: new Date(now - 20 * 3600000).toISOString(),
      dueAt: new Date(now + 28 * 3600000).toISOString(),
      expectedResult: "商品访问 +30%，成交 +15 单",
      actualResult: "商品访问 +22%，成交 +9 单（进行中）",
    },
    {
      id: nextMockId("cproj"),
      name: "男士皮鞋测评专题",
      source: "热点雷达",
      storeId: storeId("淘宝店A"),
      category: "鞋服",
      product: "男士休闲皮鞋 SKU-SHO-101",
      marketingGoal: "承接小红书测评流量",
      targetAudience: "25-40岁男性通勤群体",
      contentTheme: "通勤皮鞋耐磨测评",
      contentFormats: ["测评内容", "商品图文"],
      plannedChannels: ["小红书"],
      relatedAgents: ["选题Agent", "图文Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 3,
      status: "待审批",
      createdAt: new Date(now - 40 * 3600000).toISOString(),
      dueAt: new Date(now + 8 * 3600000).toISOString(),
      expectedResult: "商品详情页停留时长 +20%",
      actualResult: null,
    },
    {
      id: nextMockId("cproj"),
      name: "库存清仓·加湿器清单",
      source: "库存事件",
      storeId: storeId("抖音店A"),
      category: "家居",
      product: "便携折叠加湿器 SKU-HUM-002",
      marketingGoal: "清理积压库存",
      targetAudience: "预算敏感型买家",
      contentTheme: "宿舍好物清单",
      contentFormats: ["清单内容", "商品短视频"],
      plannedChannels: ["抖音"],
      relatedAgents: ["选题Agent", "视频生产Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 2,
      status: "策划中",
      createdAt: new Date(now - 8 * 3600000).toISOString(),
      dueAt: new Date(now + 48 * 3600000).toISOString(),
      expectedResult: "库存周转天数 -10 天",
      actualResult: null,
    },
    {
      id: nextMockId("cproj"),
      name: "直播切片二次分发",
      source: "直播复盘",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      marketingGoal: "复用高表现直播片段",
      targetAudience: "直播间高互动用户",
      contentTheme: "防晒衣上身实测切片",
      contentFormats: ["直播切片", "广告素材"],
      plannedChannels: ["抖音"],
      relatedAgents: ["内容数据Agent", "渠道适配Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 1,
      status: "已完成",
      createdAt: new Date(now - 60 * 3600000).toISOString(),
      dueAt: new Date(now - 12 * 3600000).toISOString(),
      expectedResult: "转化为 3 条广告素材",
      actualResult: "已产出 3 条广告素材，ROI 3.1",
    },
    {
      id: nextMockId("cproj"),
      name: "客服高频问题内容化",
      source: "客服问题",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      marketingGoal: "降低犹豫用户流失",
      targetAudience: "犹豫下单的潜在买家",
      contentTheme: "防晒衣是否闷热实测",
      contentFormats: ["测评内容", "商品详情补充"],
      plannedChannels: ["抖音", "直播预热"],
      relatedAgents: ["选题Agent", "脚本Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 2,
      status: "进行中",
      createdAt: new Date(now - 14 * 3600000).toISOString(),
      dueAt: new Date(now + 60 * 3600000).toISOString(),
      expectedResult: "详情页跳出率 -15%",
      actualResult: null,
    },
    {
      id: nextMockId("cproj"),
      name: "秋冬家纺提前布局",
      source: "品类趋势",
      storeId: storeId("淘宝店A"),
      category: "家纺",
      product: "四件套家纺套件 SKU-HOM-102",
      marketingGoal: "提前占位秋冬搜索流量",
      targetAudience: "25-45岁家庭采购决策者",
      contentTheme: "换季家纺选购指南",
      contentFormats: ["教程内容", "商品图文"],
      plannedChannels: ["淘宝逛逛", "小红书"],
      relatedAgents: ["内容策略Agent", "图文Agent"],
      contentOwner: "Founder",
      costCeilingUsd: 2,
      status: "待审批",
      createdAt: new Date(now - 4 * 3600000).toISOString(),
      dueAt: new Date(now + 200 * 3600000).toISOString(),
      expectedResult: "秋冬类目搜索曝光 +25%",
      actualResult: null,
    },
  ];
}

function seedHotContentTasks() {
  const now = Date.now();
  return [
    {
      id: nextMockId("hct"),
      projectName: "夏季防晒衣内容矩阵",
      trendSource: "中央气象台 · 持续高温天气",
      trendSnapshot: "多地气温突破 35°C，防晒相关内容互动量显著上升",
      sourceUrlPlaceholder: "https://mock.trend-source.example/heat-wave",
      sourceType: "external",
      referenceContent: "（演示）参考同类高热度短视频的选题角度，不复制其脚本或画面",
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      targetAudience: "18-35岁通勤女性",
      creativeAngle: "35度通勤实测：防晒衣到底闷不闷？",
      contentFormat: "商品短视频",
      brandExpression: "轻松真实、第一视角实测",
      selfOwnedAssets: ["商品实拍图 x6", "品牌口播模板"],
      generatedVersions: 2,
      originalityScore: 92,
      copyrightResult: "通过",
      complianceResult: "通过",
      riskLevel: "低",
      promptVersion: "商品详情文案 Prompt v1",
      skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "防晒服商品知识 v2",
      model: "Claude Sonnet 5",
      tokenCost: 2400,
      productionCostUsd: 0.8,
      approvalStatus: "已通过",
      publishingChannels: ["抖音", "小红书"],
      publishingTime: new Date(now - 3 * 3600000).toISOString(),
      publishingResult: "已发布",
      platformContentId: "DY-CT-88213",
      performance: { views: 12800, likes: 640, comments: 88, shares: 42, productClicks: 960, orders: 18, gmv: 2322 },
      contentRoi: 3.4,
      status: "已发布",
    },
    {
      id: nextMockId("hct"),
      projectName: "客服高频问题内容化",
      trendSource: "店铺内搜索数据 · 防晒衣搜索量周环比 +65%",
      trendSnapshot: "店内「防晒衣」关键词搜索量一周内上涨 65%",
      sourceUrlPlaceholder: "https://mock.trend-source.example/internal-search",
      sourceType: "internal",
      referenceContent: "（演示）参考客服高频问题作为脚本素材来源",
      authorizationStatus: "内部数据，无需授权",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      targetAudience: "店铺现有粉丝",
      creativeAngle: "为什么这件防晒衣突然被疯狂搜索？",
      contentFormat: "口播视频",
      brandExpression: "专业但亲切",
      selfOwnedAssets: ["商品实拍图 x4", "工厂溯源素材"],
      generatedVersions: 1,
      originalityScore: 95,
      copyrightResult: "通过",
      complianceResult: "待复检",
      riskLevel: "低",
      promptVersion: "商品详情文案 Prompt v1",
      skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "防晒服商品知识 v2",
      model: "Claude Sonnet 5",
      tokenCost: 1800,
      productionCostUsd: 0.6,
      approvalStatus: "待审批",
      publishingChannels: ["抖音"],
      publishingTime: null,
      publishingResult: null,
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "待审批",
    },
    {
      id: nextMockId("hct"),
      projectName: "直播切片二次分发",
      trendSource: "直播复盘 · 防晒衣上身实测切片",
      trendSnapshot: "该直播片段片段完播率 68%，远高于平均水平",
      sourceUrlPlaceholder: "https://mock.trend-source.example/live-clip-8821",
      sourceType: "internal",
      referenceContent: "自有直播录像片段（已获店铺自身授权）",
      authorizationStatus: "已授权（自有内容）",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001",
      targetAudience: "直播间高互动用户",
      creativeAngle: "直播高光时刻二次剪辑为广告素材",
      contentFormat: "广告素材",
      brandExpression: "直播原声，保留真实感",
      selfOwnedAssets: ["直播录像片段", "商品实拍图"],
      generatedVersions: 3,
      originalityScore: 88,
      copyrightResult: "通过",
      complianceResult: "通过",
      riskLevel: "低",
      promptVersion: "商品详情文案 Prompt v1",
      skillVersion: "经营摘要生成 v2",
      knowledgeVersion: "抖音平台发布规则 v3",
      model: "GPT-5",
      tokenCost: 3100,
      productionCostUsd: 1.1,
      approvalStatus: "已通过",
      publishingChannels: ["抖音"],
      publishingTime: new Date(now - 20 * 3600000).toISOString(),
      publishingResult: "已发布",
      platformContentId: "DY-CT-88190",
      performance: { views: 34500, likes: 1820, comments: 240, shares: 156, productClicks: 2600, orders: 61, gmv: 7869 },
      contentRoi: 5.8,
      status: "已复盘",
    },
    {
      id: nextMockId("hct"),
      projectName: null,
      trendSource: "微博热搜 · 熬夜急救护肤话题",
      trendSnapshot: "话题阅读量 2.3 亿，涉及功效宣称合规风险",
      sourceUrlPlaceholder: "https://mock.trend-source.example/weibo-skincare",
      sourceType: "external",
      referenceContent: "（演示）参考公开话题讨论角度，不复制具体文案",
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId: storeId("小红书店A"),
      category: "美妆",
      product: "保湿精华面霜 SKU-BEA-201",
      targetAudience: "22-32岁女性",
      creativeAngle: "熬夜后的急救面霜怎么用",
      contentFormat: "小红书笔记",
      brandExpression: "闺蜜分享感",
      selfOwnedAssets: ["商品实拍图 x5"],
      generatedVersions: 1,
      originalityScore: 90,
      copyrightResult: "通过",
      complianceResult: "不通过",
      riskLevel: "高",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "禁限售词与合规规则 v4",
      model: "Claude Sonnet 5",
      tokenCost: 1200,
      productionCostUsd: 0.5,
      approvalStatus: "未提交",
      publishingChannels: [],
      publishingTime: null,
      publishingResult: null,
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "合规检查",
      complianceFailReason: "文案出现「急救」「医用级」等功效宣称词，需修改后重新提交",
    },
    {
      id: nextMockId("hct"),
      projectName: null,
      trendSource: "抖音热点榜 · 通勤穿搭挑战",
      trendSnapshot: "话题播放量持续上升，同类内容竞争激烈",
      sourceUrlPlaceholder: "https://mock.trend-source.example/douyin-commute-challenge",
      sourceType: "external",
      referenceContent: "（演示）仅参考话题结构，脚本与画面全部原创",
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId: storeId("抖音店A"),
      category: "鞋服",
      product: "夏季百搭帆布鞋 SKU-SHO-004",
      targetAudience: "20-30岁都市职场人群",
      creativeAngle: "职场通勤鞋一周穿搭挑战",
      contentFormat: "买家秀二创",
      brandExpression: "活力、真实、有梗",
      selfOwnedAssets: ["商品实拍图 x3"],
      generatedVersions: 1,
      originalityScore: 76,
      copyrightResult: "待检查",
      complianceResult: "待检查",
      riskLevel: "中",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "抖音平台发布规则 v3",
      model: "DeepSeek V3",
      tokenCost: 900,
      productionCostUsd: 0.3,
      approvalStatus: "未提交",
      publishingChannels: [],
      publishingTime: null,
      publishingResult: null,
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "二创中",
    },
    {
      id: nextMockId("hct"),
      projectName: "库存清仓·加湿器清单",
      trendSource: "库存监控 · 加湿器库存积压",
      trendSnapshot: "库存周转天数超过预警线，建议促销清仓",
      sourceUrlPlaceholder: "https://mock.trend-source.example/internal-inventory",
      sourceType: "internal",
      referenceContent: "内部库存数据，无外部参考",
      authorizationStatus: "内部数据，无需授权",
      storeId: storeId("抖音店A"),
      category: "家居",
      product: "便携折叠加湿器 SKU-HUM-002",
      targetAudience: "预算敏感型买家",
      creativeAngle: "9.9元好物清单：宿舍必备小家电",
      contentFormat: "清单内容",
      brandExpression: "省钱好物、干货感",
      selfOwnedAssets: ["商品实拍图 x2"],
      generatedVersions: 0,
      originalityScore: null,
      copyrightResult: "未开始",
      complianceResult: "未开始",
      riskLevel: "低",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: null,
      knowledgeVersion: null,
      model: "Qwen Max",
      tokenCost: 0,
      productionCostUsd: 0,
      approvalStatus: "未提交",
      publishingChannels: [],
      publishingTime: null,
      publishingResult: null,
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "策划中",
    },
    {
      id: nextMockId("hct"),
      projectName: "男士皮鞋测评专题",
      trendSource: "小红书热点 · 男士通勤鞋测评走红",
      trendSnapshot: "同类测评笔记平均互动量高于大盘 2.3 倍",
      sourceUrlPlaceholder: "https://mock.trend-source.example/xhs-mens-shoes",
      sourceType: "external",
      referenceContent: "（演示）仅参考测评结构，测评数据与画面全部自采",
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId: storeId("淘宝店A"),
      category: "鞋服",
      product: "男士休闲皮鞋 SKU-SHO-101",
      targetAudience: "25-40岁男性通勤群体",
      creativeAngle: "30天耐磨实测：这双皮鞋能撑多久",
      contentFormat: "测评内容",
      brandExpression: "理工科式严谨测评",
      selfOwnedAssets: ["商品实拍图 x8", "耐磨测试记录"],
      generatedVersions: 1,
      originalityScore: 84,
      copyrightResult: "通过",
      complianceResult: "通过",
      riskLevel: "低",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: "商品详情文案生成 v1",
      knowledgeVersion: "鞋服类目运营知识 v1",
      model: "Claude Sonnet 5",
      tokenCost: 1600,
      productionCostUsd: 0.6,
      approvalStatus: "待审批",
      publishingChannels: ["小红书"],
      publishingTime: null,
      publishingResult: null,
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "待审批",
    },
    {
      id: nextMockId("hct"),
      projectName: "秋冬家纺提前布局",
      trendSource: "视频号热点 · 家居改造话题升温",
      trendSnapshot: "话题增长率 32%，尚处于萌芽期",
      sourceUrlPlaceholder: "https://mock.trend-source.example/wechat-home-makeover",
      sourceType: "external",
      referenceContent: "（演示）仅参考选题信号，脚本原创",
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId: storeId("淘宝店A"),
      category: "家纺",
      product: "四件套家纺套件 SKU-HOM-102",
      targetAudience: "25-45岁新家庭用户",
      creativeAngle: "新家纺换季改造记录",
      contentFormat: "情景短剧",
      brandExpression: "温馨、生活化",
      selfOwnedAssets: ["商品实拍图 x4"],
      generatedVersions: 0,
      originalityScore: null,
      copyrightResult: "未开始",
      complianceResult: "未开始",
      riskLevel: "低",
      promptVersion: "通用运营 Prompt v1",
      skillVersion: null,
      knowledgeVersion: null,
      model: "Qwen Max",
      tokenCost: 0,
      productionCostUsd: 0,
      approvalStatus: "未提交",
      publishingChannels: [],
      publishingTime: null,
      publishingResult: "发布失败",
      platformContentId: null,
      performance: null,
      contentRoi: null,
      status: "发布失败",
      publishFailReason: "渠道适配未完成：缺少视频号所需的竖屏封面素材",
    },
  ];
}

function seedChannelVariants() {
  return [
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "抖音", account: "抖音店A · 官方号", storeId: storeId("抖音店A"), contentType: "竖屏强钩子视频", aspectRatio: "9:16", duration: "25秒", title: "35度通勤实测：这件防晒衣真的不闷！", caption: "上身3小时实测反馈，评论区告诉我你最关心的问题👇", tags: ["防晒衣", "通勤穿搭", "夏日好物"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: false, approvalStatus: "已通过", publishingMode: "官方API", scheduledTime: null, publishingStatus: "已发布", failureReason: null, platformContentId: "DY-CT-88213", publishedTime: new Date(Date.now() - 3 * 3600000).toISOString() },
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "小红书", account: "小红书店A · 品牌号", storeId: storeId("抖音店A"), contentType: "6图体验型笔记", aspectRatio: "3:4", duration: "—", title: "通勤党的防晒自救指南", caption: "6图告诉你这件防晒衣值不值得买", tags: ["防晒衣", "通勤", "夏日穿搭"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: true, approvalStatus: "已通过", publishingMode: "人工确认", scheduledTime: new Date(Date.now() + 5 * 3600000).toISOString(), publishingStatus: "待发布", failureReason: null, platformContentId: null, publishedTime: null },
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "视频号", account: "抖音店A · 视频号", storeId: storeId("抖音店A"), contentType: "讲解视频", aspectRatio: "9:16", duration: "45秒", title: "防晒衣到底该怎么选", caption: "45秒讲清楚防晒衣的核心指标", tags: ["防晒", "选购指南"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: false, approvalStatus: "待审核", publishingMode: "浏览器自动化", scheduledTime: null, publishingStatus: "待渠道适配", failureReason: null, platformContentId: null, publishedTime: null },
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "淘宝逛逛", account: "淘宝店A · 逛逛号", storeId: storeId("淘宝店A"), contentType: "商品导向短视频", aspectRatio: "9:16", duration: "30秒", title: "防晒衣详情页同款视频", caption: "点击商品卡直接查看详情", tags: ["防晒衣"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: false, approvalStatus: "草稿", publishingMode: "官方API", scheduledTime: null, publishingStatus: "草稿", failureReason: null, platformContentId: null, publishedTime: null },
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "朋友圈", account: "Founder 个人号", storeId: storeId("抖音店A"), contentType: "短文案+海报", aspectRatio: "1:1", duration: "—", title: "夏天最闷热的不是天气，是穿错的防晒衣", caption: "戳链接了解详情", tags: ["防晒衣"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: false, approvalStatus: "已通过", publishingMode: "人工确认", scheduledTime: new Date(Date.now() + 2 * 3600000).toISOString(), publishingStatus: "待发布", failureReason: null, platformContentId: null, publishedTime: null },
    { id: nextMockId("chv"), motherContentTitle: "夏季通勤防晒衣实测", platform: "直播间", account: "抖音店A · 直播间", storeId: storeId("抖音店A"), contentType: "商品讲解话术", aspectRatio: "—", duration: "3分钟", title: "防晒衣直播讲解话术", caption: "用于今晚直播商品讲解环节", tags: ["防晒衣", "直播话术"], productAssociation: "轻薄防晒衣 SKU-SUN-001", aiDisclosureRequired: false, approvalStatus: "已通过", publishingMode: "人工确认", scheduledTime: null, publishingStatus: "已发布", failureReason: null, platformContentId: "LIVE-SCRIPT-4021", publishedTime: new Date(Date.now() - 20 * 3600000).toISOString() },
  ];
}

function seedCalendarEntries() {
  const now = Date.now();
  return [
    { id: nextMockId("cal"), title: "35度通勤实测：这件防晒衣真的不闷！", storeId: storeId("抖音店A"), platform: "抖音", contentType: "商品短视频", status: "已发布", scheduledAt: new Date(now - 3 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "通勤党的防晒自救指南", storeId: storeId("抖音店A"), platform: "小红书", contentType: "小红书笔记", status: "待发布", scheduledAt: new Date(now + 5 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "夏天最闷热的不是天气，是穿错的防晒衣", storeId: storeId("抖音店A"), platform: "朋友圈", contentType: "朋友圈内容", status: "待发布", scheduledAt: new Date(now + 2 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "30天耐磨实测：这双皮鞋能撑多久", storeId: storeId("淘宝店A"), platform: "小红书", contentType: "测评内容", status: "待审核", scheduledAt: new Date(now + 30 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "新家纺换季改造记录", storeId: storeId("淘宝店A"), platform: "视频号", contentType: "情景短剧", status: "发布失败", scheduledAt: new Date(now - 10 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "9.9元好物清单：宿舍必备小家电", storeId: storeId("抖音店A"), platform: "抖音", contentType: "清单内容", status: "生产中", scheduledAt: new Date(now + 48 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "直播预热：今晚8点防晒衣专场", storeId: storeId("抖音店A"), platform: "抖音", contentType: "直播预热", status: "待发布", scheduledAt: new Date(now + 6 * 3600000).toISOString() },
    { id: nextMockId("cal"), title: "直播切片：防晒衣上身实测", storeId: storeId("抖音店A"), platform: "抖音", contentType: "直播切片", status: "已发布", scheduledAt: new Date(now - 20 * 3600000).toISOString() },
  ];
}

function seedContentAssets() {
  const now = Date.now();
  return [
    { id: nextMockId("asset"), name: "轻薄防晒衣实拍图 01", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "商品图片", source: "自有拍摄", authorizationStatus: "已授权", owner: "Founder", version: 1, generatedBy: "人工拍摄", promptVersion: null, model: null, tokenCost: 0, copyrightResult: "通过", reuseCount: 6, relatedProjects: ["夏季防晒衣内容矩阵"], createdAt: new Date(now - 30 * 86400000).toISOString() },
    { id: nextMockId("asset"), name: "防晒衣通勤实测脚本 v1", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "脚本", source: "Agent 生成", authorizationStatus: "无需授权", owner: "脚本Agent", version: 1, generatedBy: "脚本Agent", promptVersion: "商品详情文案 Prompt v1", model: "Claude Sonnet 5", tokenCost: 820, copyrightResult: "通过", reuseCount: 2, relatedProjects: ["夏季防晒衣内容矩阵"], createdAt: new Date(now - 2 * 3600000).toISOString() },
    { id: nextMockId("asset"), name: "防晒衣上身实测直播片段", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "直播切片", source: "直播录制", authorizationStatus: "已授权（自有内容）", owner: "Founder", version: 1, generatedBy: "直播复盘Agent", promptVersion: null, model: null, tokenCost: 0, copyrightResult: "通过", reuseCount: 3, relatedProjects: ["直播切片二次分发"], createdAt: new Date(now - 40 * 3600000).toISOString() },
    { id: nextMockId("asset"), name: "品牌口播模板", storeId: storeId("抖音店A"), product: null, assetType: "品牌资产", source: "品牌手册", authorizationStatus: "已授权", owner: "Founder", version: 2, generatedBy: "人工整理", promptVersion: null, model: null, tokenCost: 0, copyrightResult: "通过", reuseCount: 12, relatedProjects: [], createdAt: new Date(now - 90 * 86400000).toISOString() },
    { id: nextMockId("asset"), name: "男士皮鞋耐磨测试记录", storeId: storeId("淘宝店A"), product: "男士休闲皮鞋 SKU-SHO-101", assetType: "原始素材", source: "自有测试", authorizationStatus: "已授权", owner: "Founder", version: 1, generatedBy: "人工记录", promptVersion: null, model: null, tokenCost: 0, copyrightResult: "通过", reuseCount: 1, relatedProjects: ["男士皮鞋测评专题"], createdAt: new Date(now - 5 * 3600000).toISOString() },
    { id: nextMockId("asset"), name: "防晒衣配音（AI 生成）", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "配音", source: "Agent 生成", authorizationStatus: "无需授权", owner: "视频生产Agent", version: 1, generatedBy: "视频生产Agent", promptVersion: "商品详情文案 Prompt v1", model: "GPT-5", tokenCost: 640, copyrightResult: "通过", reuseCount: 1, relatedProjects: ["夏季防晒衣内容矩阵"], createdAt: new Date(now - 3 * 3600000).toISOString() },
    { id: nextMockId("asset"), name: "防晒衣通勤视频封面 · 抖音版", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "封面", source: "Agent 生成", authorizationStatus: "无需授权", owner: "图片Agent", version: 1, generatedBy: "图片Agent", promptVersion: "商品详情文案 Prompt v1", model: "Qwen Max", tokenCost: 210, copyrightResult: "通过", reuseCount: 1, relatedProjects: ["夏季防晒衣内容矩阵"], createdAt: new Date(now - 3 * 3600000).toISOString() },
    { id: nextMockId("asset"), name: "防晒衣广告素材·抖音9:16", storeId: storeId("抖音店A"), product: "轻薄防晒衣 SKU-SUN-001", assetType: "渠道版本", source: "渠道适配Agent", authorizationStatus: "无需授权", owner: "渠道适配Agent", version: 1, generatedBy: "渠道适配Agent", promptVersion: "商品详情文案 Prompt v1", model: "Claude Sonnet 5", tokenCost: 380, copyrightResult: "通过", reuseCount: 4, relatedProjects: ["直播切片二次分发"], createdAt: new Date(now - 18 * 3600000).toISOString() },
  ];
}

const repository = createLocalRepository("contentCenter.state", () => ({
  contentProjects: seedContentProjects(),
  hotContentTasks: seedHotContentTasks(),
  channelVariants: seedChannelVariants(),
  calendarEntries: seedCalendarEntries(),
  contentAssets: seedContentAssets(),
}));

export function getContentState() {
  return repository.get();
}

/**
 * 内容项目 → 二创任务（Hot Content Task）的反向查找（阶段 V4.2
 * 架构修正）：内容项目详情页需要直接展示其产出的 Deliverable
 * （生成脚本/图片/视频、审核结果、发布结果、ROI），不需要跳转到
 * 二创工作台另开一个页面才能看到。一个项目当前允许关联 0-1 个
 * 主任务（尚未开始生产的项目关联为空，属于正常状态）。
 */
export function getHotContentTaskForProject(projectName) {
  const { hotContentTasks } = repository.get();
  return hotContentTasks.find((t) => t.projectName === projectName) ?? null;
}

export function getContentOverviewStats() {
  const { hotContentTasks } = repository.get();
  const published = hotContentTasks.filter((t) => t.status === "已发布" || t.status === "已复盘");
  const totalGmv = published.reduce((sum, t) => sum + (t.performance?.gmv ?? 0), 0);
  const totalCost = hotContentTasks.reduce((sum, t) => sum + (t.productionCostUsd ?? 0), 0);
  return {
    todayTrendsFound: 6,
    recommendedTrends: 3,
    activeProjects: repository.get().contentProjects.filter((p) => p.status === "进行中" || p.status === "策划中").length,
    pendingReview: hotContentTasks.filter((t) => ["原创检查", "版权检查", "合规检查", "待审批"].includes(t.status)).length,
    pendingPublish: hotContentTasks.filter((t) => t.status === "待发布").length,
    publishedToday: published.length,
    publishFailed: hotContentTasks.filter((t) => t.status === "发布失败").length,
    todayCostUsd: Number(totalCost.toFixed(2)),
    productVisits: 2860,
    productOrders: 79,
    contentRoi: totalCost > 0 ? Number((totalGmv / (totalCost * 7.2)).toFixed(2)) : 0,
    highPerformingCount: hotContentTasks.filter((t) => (t.contentRoi ?? 0) >= 3).length,
    expiringTrendsCount: 2,
  };
}

export function getContentAiRecommendations() {
  return [
    { id: "crec-1", type: "follow_up_trend", label: "建议立即跟进的热点", detail: "「持续高温天气」机会分 86，48 小时内有效", targetModule: "contentCenter", targetSubView: "trendRadar" },
    { id: "crec-2", type: "to_ad_creative", label: "建议转为广告素材的内容", detail: "「防晒衣上身实测切片」ROI 5.8，建议投放到广告中心", targetModule: "contentCenter", targetSubView: "performance" },
    { id: "crec-3", type: "to_live_script", label: "建议改编为直播话术的内容", detail: "「防晒衣是否闷热」客服高频问题可直接写入直播脚本", targetModule: "liveCenter", targetSubView: "script" },
    { id: "crec-4", type: "stop_production", label: "建议停止继续生产的主题", detail: "「返校季装饰」热点已过期，不建议继续投入", targetModule: "contentCenter", targetSubView: "topicPool" },
    { id: "crec-5", type: "expand_platform", label: "建议扩展到其他平台的内容", detail: "「防晒衣通勤实测」在抖音表现优异，建议扩展到视频号", targetModule: "contentCenter", targetSubView: "projects" },
    { id: "crec-6", type: "add_self_assets", label: "建议补充自有素材的项目", detail: "「男士皮鞋测评专题」缺少更多角度实拍图", targetModule: "contentCenter", targetSubView: "assets" },
  ];
}

export function createRepurposingTask(payload) {
  return repository.update((state) => ({
    ...state,
    hotContentTasks: [
      {
        id: nextMockId("hct"),
        generatedVersions: 0,
        originalityScore: null,
        copyrightResult: "未开始",
        complianceResult: "未开始",
        approvalStatus: "未提交",
        publishingChannels: [],
        publishingTime: null,
        publishingResult: null,
        platformContentId: null,
        performance: null,
        contentRoi: null,
        tokenCost: 0,
        productionCostUsd: 0,
        status: "策划中",
        ...payload,
      },
      ...state.hotContentTasks,
    ],
  }));
}

export function updateHotContentTask(taskId, patch) {
  return repository.update((state) => ({
    ...state,
    hotContentTasks: state.hotContentTasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  }));
}

export async function runOriginalityCheck(taskId) {
  await simulateLatency(500, 1000);
  const score = 78 + Math.round(Math.random() * 18);
  return updateHotContentTask(taskId, {
    status: "版权检查",
    originalityScore: score,
    originalityDetail: {
      scriptSimilarity: Math.max(3, 30 - score / 4),
      structureSimilarity: Math.max(2, 25 - score / 5),
      visualSimilarity: Math.max(1, 15 - score / 8),
      audioSimilarity: Math.max(1, 10 - score / 10),
      referenceDependency: score < 80 ? "中" : "低",
      originalContribution: score >= 85 ? "高" : "中",
      result: score >= 75 ? "通过" : score >= 60 ? "建议修改" : "不通过",
    },
  });
}

export async function runCopyrightCheck(taskId) {
  await simulateLatency(500, 1000);
  return updateHotContentTask(taskId, {
    status: "合规检查",
    copyrightResult: "通过",
    copyrightDetail: {
      sourceAuthorization: "通过", musicAuthorization: "通过（使用无版权音乐库）", portraitAuthorization: "通过（自有出镜）",
      voiceAuthorization: "通过（AI 配音已授权使用）", trademarkUse: "未发现风险", filmMaterial: "未使用",
      buyerContentAuthorization: "不涉及", watermarkDetection: "未检测到水印", result: "通过",
    },
  });
}

export async function runComplianceCheck(taskId) {
  await simulateLatency(500, 1000);
  return updateHotContentTask(taskId, {
    status: "待审批",
    complianceResult: "通过",
    complianceDetail: {
      platform: "抖音", prohibitedTerms: "未发现禁用词", marketingClaims: "未发现夸大宣称", priceClaims: "价格表述合规",
      medicalClaims: "不涉及", aiDisclosure: "需在简介标注 AI 辅助生成", digitalHumanDisclosure: "不涉及",
      sensitiveEvents: "未涉及敏感事件", minorRelated: "不涉及", complianceScore: 92, result: "通过",
    },
  });
}

export function submitApproval(taskId) {
  return updateHotContentTask(taskId, { status: "待发布", approvalStatus: "已通过" });
}

export async function retryMockPublishing(taskId) {
  await simulateLatency(600, 1200);
  const succeeded = Math.random() > 0.15;
  return updateHotContentTask(taskId, {
    status: succeeded ? "已发布" : "发布失败",
    publishingResult: succeeded ? "已发布" : "发布失败",
    publishingTime: succeeded ? new Date().toISOString() : null,
    platformContentId: succeeded ? `MOCK-CT-${Math.floor(100000 + Math.random() * 900000)}` : null,
  });
}

/* ==================================================================
 * 经营闭环编排（阶段 Founder V4.3：真实经营闭环预备）——把"店铺 →
 * 商品 → 内容 → 审批 → 发布 → 订单 → 客服 → 复盘"这条链路串起来。
 * 每个函数只做：校验前置条件 → 状态机跃迁校验 → 写入对应仓库 →
 * 追加 Replay 事件，不重复实现各仓库自己的读写逻辑。所有写操作都
 * 发生在事件处理函数内部，不在渲染期间调用 Date.now()。
 * ================================================================== */

export function getContentProject(id) {
  return repository.get().contentProjects.find((p) => p.id === id) ?? null;
}

function updateProjectLoopState(projectId, patch) {
  const updated = repository.update((state) => ({
    ...state,
    contentProjects: state.contentProjects.map((p) =>
      p.id === projectId ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
    ),
  }));
  return updated.contentProjects.find((p) => p.id === projectId);
}

function buildContentVersion(project, versionNumber) {
  return {
    id: nextMockId("cver"),
    version: versionNumber,
    createdAt: new Date().toISOString(),
    headline: "电视背后装这条灯带，追剧氛围感直接拉满",
    caption: "3米长度覆盖大部分电视墙，可剪裁自由拼接，出租屋也能免打孔安装～",
    script: [
      "0-3秒：黑屏客厅，手指按下遥控器，灯带瞬间点亮——强钩子开场",
      "3-10秒：展示灯带贴在电视背后的走线与3M背胶粘贴过程",
      "10-18秒：16色氛围灯效切换，分别演示追剧/游戏/聚会三种场景",
      "18-22秒：卖点字幕叠加（12V低压安全、可剪裁拼接、遥控可调），引导下单",
    ].join("\n"),
    shotPlan: ["远景：客厅全景开灯瞬间", "特写：灯带背胶粘贴电视背板", "特写：遥控器切换颜色", "远景：三种场景灯光效果对比"],
    coverDirection: "封面：夜晚客厅电视背光点亮后的暖色调实拍，画面对比开灯前后的氛围差异",
    sellingPoints: [
      "12V 低压安全供电，家有老人小孩也能放心用",
      "支持剪裁自由拼接，适配不同尺寸电视墙",
      "3M 背胶免打孔安装，租房也能贴",
      "16色遥控调节，一键切换追剧/游戏/聚会场景",
    ],
    cta: "点击下方商品卡，今晚就给电视墙加个氛围",
    platformVariants: [
      {
        platform: "抖音",
        aspectRatio: "9:16",
        duration: "22秒",
        title: "电视背后装这条灯带，追剧氛围感直接拉满",
        caption: "出租屋免打孔安装教程，评论区告诉我你想要哪种颜色👇",
      },
    ],
    generatedAssetRecords: [
      { name: `LED灯带演示脚本 v${versionNumber}`, type: "脚本", generatedBy: "脚本Agent" },
      { name: `LED灯带封面方向 v${versionNumber}`, type: "封面", generatedBy: "图片Agent" },
      { name: "LED灯带渠道版本 · 抖音9:16", type: "渠道版本", generatedBy: "渠道适配Agent" },
    ],
    originalityScore: 91,
    copyrightResult: "通过",
    complianceResult: "通过",
    relatedAgents: project.relatedAgents,
    tokenCost: 2100,
    modelUsed: "Claude Sonnet 5",
  };
}

/**
 * 生成内容方案——校验店铺/商品已选定，跃迁到 Generating → 生成一个
 * 内容版本（含原创度/版权/合规结果、可复用的资产记录）→ 跃迁到
 * Generated → 追加 Replay 事件。
 */
export function generateContentPackage(projectId) {
  const project = getContentProject(projectId);
  if (!project) return { ok: false, error: "内容项目不存在" };
  if (!project.storeId) return { ok: false, error: "未选择店铺，无法生成内容" };
  if (!project.productId) return { ok: false, error: "未选择商品，无法生成内容" };

  const check = canTransitionContentProject(project.loopState, "Generating");
  if (!check.ok) return { ok: false, error: check.error };

  const previousState = project.loopState;
  const versionNumber = project.contentVersions.length + 1;
  const version = buildContentVersion(project, versionNumber);

  const updated = updateProjectLoopState(projectId, {
    loopState: "Generated",
    contentVersions: [...project.contentVersions, version],
  });

  appendReplayEvent(project.replayRunId, {
    module: "内容中心",
    actor: "Founder",
    agent: "脚本Agent",
    promptVersion: "商品短视频脚本 Prompt v1",
    skillVersion: "商品详情文案生成 v1",
    knowledgeRefs: ["LED灯带商品知识", "商品短视频脚本结构知识"],
    model: version.modelUsed,
    tokenUsage: version.tokenCost,
    inputSummary: `店铺=${getStoreName(project.storeId)}，商品=${project.product}，主题=${project.contentTheme}`,
    outputSummary: `生成内容版本 v${versionNumber}：${version.headline}`,
    businessObject: `ContentProject:${projectId}`,
    previousState,
    newState: "Generated",
  });

  return { ok: true, project: updated, version };
}

/**
 * 提交审批——幂等：同一个内容版本已存在待处理审批时不重复创建，
 * 直接返回已存在的审批事项。
 */
export function submitForApproval(projectId) {
  const project = getContentProject(projectId);
  if (!project) return { ok: false, error: "内容项目不存在" };
  if (project.contentVersions.length === 0) return { ok: false, error: "尚未生成内容版本，无法提交审批" };

  const check = canTransitionContentProject(project.loopState, "Pending Approval");
  if (!check.ok) return { ok: false, error: check.error };

  const latestVersion = project.contentVersions[project.contentVersions.length - 1];
  const aiRecommendation =
    latestVersion.originalityScore >= 85 && latestVersion.copyrightResult === "通过" && latestVersion.complianceResult === "通过"
      ? "建议批准（原创度/版权/合规均通过）"
      : "建议人工复核后再决定";

  const { record: approvalRequest, alreadyExists } = createApprovalRequest({
    type: "content_approval",
    requestedBy: `内容中心：${project.name}`,
    summary: `「${latestVersion.headline}」待审批发布`,
    riskLevel: "low",
    payload: {},
    sourceModule: "内容中心",
    store: getStoreName(project.storeId),
    platform: project.targetPlatform,
    object: `${project.contentType}内容 v${latestVersion.version}`,
    amountOrCost: `Token ${latestVersion.tokenCost}`,
    deadline: new Date(Date.now() + 8 * 3600000).toISOString(),
    aiRecommendation,
    evidence: "原创度检查报告 + 版权检查报告 + 合规检查报告",
    relatedRules: "抖音平台发布规则",
    contentProjectId: projectId,
    contentVersionId: latestVersion.id,
    originatingModule: "contentCenter",
    originatingSubView: "projects",
    originatingEntityId: projectId,
    checks: { originality: latestVersion.originalityScore, copyright: latestVersion.copyrightResult, compliance: latestVersion.complianceResult },
    tokenCost: latestVersion.tokenCost,
  });

  if (alreadyExists) {
    return { ok: false, error: "该内容版本已提交审批，请勿重复提交", alreadyExists: true, approvalRequest };
  }

  const updated = updateProjectLoopState(projectId, {
    loopState: "Pending Approval",
    approvalRequestId: approvalRequest.id,
    submittedAt: new Date().toISOString(),
  });

  appendReplayEvent(project.replayRunId, {
    module: "审批中心",
    actor: "Founder",
    businessObject: `ContentProject:${projectId}`,
    previousState: "Generated",
    newState: "Pending Approval",
    inputSummary: `提交审批：${latestVersion.headline}`,
    outputSummary: `已创建审批事项 ${approvalRequest.id}`,
  });

  return { ok: true, project: updated, approvalRequest };
}

/**
 * 决策一条内容审批事项：批准 → 内容项目跃迁 Approved；驳回/要求
 * 修改 → 内容项目跃迁 Revision Requested（保留已生成的版本，不
 * 删除），且都要求填写理由/修改说明。内部复用 approvalMock 的
 * decideRequest，已经做了"该事项已处理"的幂等校验。
 */
export function decideContentApproval(approvalRequestId, decision, note) {
  if ((decision === "rejected" || decision === "returned") && !note?.trim()) {
    return { ok: false, error: decision === "rejected" ? "驳回需要填写理由" : "要求修改需要填写修改说明" };
  }

  const approvalBefore = getApprovalRequest(approvalRequestId);
  if (!approvalBefore) return { ok: false, error: "审批事项不存在" };

  const result = decideRequest(approvalRequestId, decision, note);
  if (!result.ok) return result;

  const projectId = approvalBefore.contentProjectId;
  if (!projectId) return { ok: true, approvalRequest: result.record };

  const project = getContentProject(projectId);
  if (!project) return { ok: true, approvalRequest: result.record };

  const nextLoopState = decision === "approved" ? "Approved" : "Revision Requested";
  const check = canTransitionContentProject(project.loopState, nextLoopState);
  if (!check.ok) return { ok: false, error: check.error };

  const patch = { loopState: nextLoopState };
  if (decision === "approved") patch.approvedAt = new Date().toISOString();
  if (decision === "rejected") patch.rejectionReason = note;
  if (decision === "returned") patch.revisionNote = note;

  const updated = updateProjectLoopState(projectId, patch);

  appendReplayEvent(project.replayRunId, {
    module: "审批中心",
    actor: "Founder",
    businessObject: `ContentProject:${projectId}`,
    previousState: "Pending Approval",
    newState: nextLoopState,
    approvalDecision: decision,
    outputSummary: note ? `决策：${decision}，说明：${note}` : `决策：${decision}`,
  });

  return { ok: true, project: updated, approvalRequest: result.record };
}

/**
 * 进入发布——Approved → Ready to Publish 的显式一步，对应"发布计划"
 * 里的发布配置确认（店铺/平台/账号/发布模式/执行模式等在这一步
 * 之后才允许模拟发布）。
 */
export function enterPublishing(projectId) {
  const project = getContentProject(projectId);
  if (!project) return { ok: false, error: "内容项目不存在" };

  const check = canTransitionContentProject(project.loopState, "Ready to Publish");
  if (!check.ok) return { ok: false, error: check.error };

  const updated = updateProjectLoopState(projectId, { loopState: "Ready to Publish" });

  appendReplayEvent(project.replayRunId, {
    module: "内容中心",
    actor: "Founder",
    businessObject: `ContentProject:${projectId}`,
    previousState: "Approved",
    newState: "Ready to Publish",
    outputSummary: "已确认发布配置，进入待发布",
  });

  return { ok: true, project: updated };
}

/**
 * 模拟发布——完整链路：校验审批与连接器状态 → 创建 PublishJob/
 * PlatformExecution 并推进 Queued → Executing → Succeeded → 内容
 * 项目跃迁 Published → 生成流量归因（确定性表现数据）→ 生成归因
 * 订单（幂等）→ 生成客服跟进会话（幂等）。任何一步失败都不会让
 * 已写入的数据处于矛盾状态——发布任务本身幂等，重复点击不会创建
 * 第二个 PublishJob/订单/会话。
 */
export async function simulatePublish(projectId) {
  const project = getContentProject(projectId);
  if (!project) return { ok: false, error: "内容项目不存在" };

  if (project.loopState !== "Ready to Publish") {
    if (["Published", "Monitoring", "Reviewed"].includes(project.loopState)) {
      return { ok: false, error: "该内容已发布，请勿重复发布", alreadyExists: true };
    }
    if (project.loopState === "Approved") {
      return { ok: false, error: "请先点击「进入发布」完成发布配置确认" };
    }
    return { ok: false, error: "内容尚未通过审批，无法发布" };
  }

  const latestVersion = project.contentVersions[project.contentVersions.length - 1];
  const store = DEMO_STORES.find((s) => s.id === project.storeId);

  const connection = await platformExecutionContract.validateConnection(project.storeId, project.targetPlatform);
  if (!connection.ok) return { ok: false, error: "平台连接器不可用，无法发布" };

  const payload = { storeId: project.storeId, productSku: project.product, contentVersionId: latestVersion.id, platform: project.targetPlatform };
  const payloadCheck = platformExecutionContract.validatePayload(payload);
  if (!payloadCheck.ok) return { ok: false, error: payloadCheck.error };

  const { record: publishJob, alreadyExists } = createPublishJob({
    contentProjectId: projectId,
    contentVersionId: latestVersion.id,
    storeId: project.storeId,
    platform: project.targetPlatform,
    account: `${store?.name ?? project.storeId} · 官方号`,
    publishMode: "官方API",
    executionMode: "assisted_execution",
    approvalRequestId: project.approvalRequestId,
  });
  if (alreadyExists && publishJob.status === "Succeeded") {
    return { ok: false, error: "该内容版本已发布，请勿重复发布", alreadyExists: true, publishJob };
  }

  updateProjectLoopState(projectId, { loopState: "Publishing" });
  updatePublishJob(publishJob.id, { status: "Queued" });
  const execution = createPlatformExecution({ publishJobId: publishJob.id, contentProjectId: projectId, status: "Queued" });

  await platformExecutionContract.prepareExecution(payload);
  updatePublishJob(publishJob.id, { status: "Executing" });
  updatePlatformExecution(execution.id, { status: "Executing" });

  const result = await platformExecutionContract.execute(payload);

  updatePlatformExecution(execution.id, { status: "Succeeded", platformContentId: result.platformContentId, executedAt: result.executedAt });
  const publishedAt = new Date().toISOString();
  updatePublishJob(publishJob.id, { status: "Succeeded", publishedAt, platformContentId: result.platformContentId });

  updateProjectLoopState(projectId, { loopState: "Published", publishJobId: publishJob.id, publishedAt });

  appendReplayEvent(project.replayRunId, {
    module: "内容中心",
    actor: "系统（模拟发布）",
    businessObject: `ContentProject:${projectId}`,
    previousState: "Publishing",
    newState: "Published",
    platformExecution: { executionId: execution.id, platformContentId: result.platformContentId },
    outputSummary: `模拟发布成功，平台内容ID：${result.platformContentId}`,
  });

  const performance = deterministicPerformanceFor(projectId);
  createTrafficAttribution({
    contentProjectId: projectId,
    contentVersionId: latestVersion.id,
    platformContentId: result.platformContentId,
    storeId: project.storeId,
    ...performance,
  });

  appendReplayEvent(project.replayRunId, {
    module: "流量网络中心",
    actor: "系统（模拟流量归因）",
    businessObject: `ContentProject:${projectId}`,
    outputSummary: `播放 ${performance.views}，商品点击 ${performance.productClicks}，归因订单 ${performance.ordersAttributed} 笔`,
  });

  const product = getProducts().find((p) => p.id === project.productId);
  const { record: order, alreadyExists: orderAlreadyExists } = createAttributedOrder({
    storeId: project.storeId,
    platform: "douyin",
    product: project.product.split(" ")[0],
    sku: product?.sku ?? "SKU-LED-005",
    amount: performance.gmvAttributed,
    attribution: {
      trafficSource: "内容自然流量",
      contentProjectId: projectId,
      contentVersionId: latestVersion.id,
      platformContentId: result.platformContentId,
      campaignSource: null,
      conversionPath: "短视频 → 商品卡 → 详情页 → 下单",
      attributedGmv: performance.gmvAttributed,
    },
  });

  if (!orderAlreadyExists) {
    appendReplayEvent(project.replayRunId, {
      module: "订单中心",
      actor: "系统（模拟订单归因）",
      businessObject: `Order:${order.id}`,
      outputSummary: `已生成归因订单 ${order.orderNumber}，金额 ¥${order.amount}`,
    });
  }

  updateProjectLoopState(projectId, { orderId: order.id });

  const { record: conversation, alreadyExists: conversationAlreadyExists } = createConversationForOrder(order, {
    conversationType: "安装指导",
    responsibleAgent: "商品问答Agent",
    riskLevel: "低",
    suggestedReply: "可以剪裁哦～灯带每3颗灯珠一个剪裁点，剪开后用配套连接头接线即可，电视背后走线建议贴3M背胶固定，不影响正常使用～",
    customerQuestion: "请问这个灯带可以剪断安装在电视后面吗？会不会剪坏就不亮了？",
    contentProjectId: projectId,
    platformLabel: "抖音",
  });

  if (!conversationAlreadyExists) {
    appendReplayEvent(project.replayRunId, {
      module: "客服中心",
      actor: "系统（模拟客服会话生成）",
      businessObject: `Conversation:${conversation.id}`,
      outputSummary: `已生成客户咨询会话：${conversation.customer} · ${conversation.conversationType}`,
    });
  }

  updateProjectLoopState(projectId, { conversationId: conversation.id });

  return {
    ok: true,
    project: getContentProject(projectId),
    publishJob,
    execution,
    performance,
    order,
    conversation,
  };
}

/**
 * 生成复盘——要求发布/订单归因/客服跟进都已经存在，否则明确提示
 * "还不能生成复盘"而不是渲染空白页。幂等：同一个项目只生成一份
 * 复盘快照，重复点击返回已存在的快照。复盘会额外产出知识候选
 * （createKnowledgeCandidate，status: "candidate"），但不会自动
 * 写入生产 Knowledge——候选需要 Founder 在 Agent 工作室 Knowledge
 * 资产库里逐条"采纳"或"驳回"。
 */
export function generateReview(projectId) {
  const project = getContentProject(projectId);
  if (!project) return { ok: false, error: "内容项目不存在" };

  // 幂等：复盘生成后项目会跃迁到 Reviewed，不再满足下面的
  // Published/Monitoring 前置状态——必须先检查是否已经有复盘快照，
  // 否则第二次调用会被状态守卫拦在前面，报出一句和真实原因（已经
  // 生成过复盘）不符的"尚未发布"提示。
  if (project.reviewSnapshotId) {
    return { ok: true, project, review: getReviewSnapshotForProject(projectId), alreadyExists: true };
  }
  if (!["Published", "Monitoring"].includes(project.loopState)) {
    return { ok: false, error: "内容尚未发布，暂时无法生成复盘" };
  }
  if (!project.orderId || !project.conversationId) {
    return { ok: false, error: "订单归因或客服跟进尚未完成，暂时无法生成复盘" };
  }

  const latestVersion = project.contentVersions[project.contentVersions.length - 1];
  const performance = getTrafficAttributionForProject(projectId);
  const approval = project.approvalRequestId ? getApprovalRequest(project.approvalRequestId) : null;
  const trafficRoi = performance ? Number((performance.gmvAttributed / (latestVersion.tokenCost / 1000 * 0.02 + 3)).toFixed(2)) : null;

  const { record: review, alreadyExists } = createReviewSnapshot({
    contentProjectId: projectId,
    contentVersionId: latestVersion.id,
    contentGoal: project.businessGoal,
    approvalResult: approval?.status ?? "—",
    publishResult: project.loopState,
    trafficPerformance: performance,
    orderConversion: performance?.ordersAttributed ?? 0,
    attributedGmv: performance?.gmvAttributed ?? 0,
    customerServiceConversationId: project.conversationId,
    tokenCost: latestVersion.tokenCost,
    mockPlatformCostUsd: 0.8,
    trafficRoi,
    keyLearning: "开箱即用的安装场景演示能显著降低「是否能剪裁」这类咨询量",
    recommendedNextAction: "建议追加一条安装 FAQ 切片，并将该演示复用到流量网络中心的运营者分发池",
    recommendations: [
      "保留开场前三秒的产品使用场景",
      "制作一条安装 FAQ 切片",
      "复用该内容到流量网络中心",
      "准备一场直播讲解演示",
      "把安装问答补充进商品知识",
    ],
  });

  const updated = updateProjectLoopState(projectId, {
    loopState: "Reviewed",
    reviewSnapshotId: review.id,
    actualResult: performance
      ? `${performance.views} 播放，归因 ${performance.ordersAttributed} 单，GMV ¥${performance.gmvAttributed}`
      : project.actualResult,
  });

  if (alreadyExists) {
    return { ok: true, project: updated, review, alreadyExists: true };
  }

  appendReplayEvent(project.replayRunId, {
    module: "内容中心 · 数据复盘",
    actor: "Founder",
    businessObject: `ContentProject:${projectId}`,
    previousState: "Monitoring",
    newState: "Reviewed",
    outputSummary: "已生成业务复盘快照",
  });

  const candidates = [
    {
      candidateType: "内容表现洞察",
      name: `LED灯带内容表现洞察 · ${new Date().toLocaleDateString("zh-CN")}`,
      evidence: `播放 ${performance?.views}，完播率 ${Math.round((performance?.completionRate ?? 0) * 100)}%，商品点击 ${performance?.productClicks}`,
      confidence: "高",
      riskLevel: "低",
    },
    {
      candidateType: "商品常见问题",
      name: "LED灯带可剪裁安装 FAQ",
      evidence: "客户咨询「能否剪断安装在电视后面」，AI 已给出可剪裁 + 3M 背胶固定的标准答复",
      confidence: "高",
      riskLevel: "低",
    },
    {
      candidateType: "平台发布经验",
      name: "抖音氛围感场景开场钩子经验",
      evidence: "黑屏转亮灯开场的强钩子设计，配合场景化演示，完播率高于历史均值",
      confidence: "中",
      riskLevel: "低",
    },
  ];

  candidates.forEach((c) => {
    createKnowledgeCandidate({
      name: c.name,
      type: c.candidateType,
      candidateType: c.candidateType,
      scope: "category",
      applicableStore: project.storeId,
      applicableCategory: project.category,
      description: c.evidence,
      content: c.evidence,
      sourceProjectId: projectId,
      sourceProjectName: project.name,
      evidence: c.evidence,
      confidence: c.confidence,
      riskLevel: c.riskLevel,
    });
  });

  appendReplayEvent(project.replayRunId, {
    module: "Agent 工作室 · Knowledge",
    actor: "Founder",
    businessObject: `ContentProject:${projectId}`,
    outputSummary: `已从复盘生成 ${candidates.length} 条知识候选，待 Founder 逐条确认`,
  });

  return { ok: true, project: updated, review, alreadyExists: false };
}

function isToday(isoString) {
  if (!isoString) return false;
  const d = new Date(isoString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Dashboard 经营闭环摘要（阶段 Founder V4.3）——只统计带 loopState
 * 的经营闭环项目，不影响旧演示项目的既有统计口径。当前只有一个
 * golden path 项目，数字大多是 0/1，如实反映"闭环机制已打通"而
 * 不是伪造一批虚假活跃度。
 */
export function getOperatingLoopSummary() {
  const projects = repository.get().contentProjects.filter((p) => p.loopState);
  const conversations = projects.filter((p) => p.conversationId).map((p) => getConversation(p.conversationId)).filter(Boolean);

  return {
    activeContentProjects: projects.filter((p) => !["Archived", "Reviewed"].includes(p.loopState)).length,
    pendingApprovals: getApprovalRequests().filter((r) => r.type === "content_approval" && r.status === "pending").length,
    readyToPublish: projects.filter((p) => p.loopState === "Ready to Publish").length,
    publishedToday: projects.filter((p) => isToday(p.publishedAt)).length,
    attributedOrders: projects.filter((p) => p.orderId).length,
    attributedGmv: projects.reduce((sum, p) => sum + (getTrafficAttributionForProject(p.id)?.gmvAttributed ?? 0), 0),
    openConversations: conversations.filter((c) => c.status !== "已完成").length,
    humanTakeoverRequests: conversations.filter((c) => ["建议人工接管", "等待人工接管"].includes(c.status)).length,
    reviewPending: projects.filter((p) => ["Published", "Monitoring"].includes(p.loopState) && !p.reviewSnapshotId).length,
  };
}
