import { createLocalRepository, simulateLatency, tagDemo } from "../../shared/localRepository.js";

/**
 * 热点分析 / 趋势预测 / 选题池的 Mock 数据层（阶段：Studio V3
 * Integration §十一/补充§一/§六）。覆盖抖音/小红书/视频号/快手/B站/
 * 微博/红果/番茄/TikTok/YouTube/搜索关键词/行业热点/商品相关热点
 * 12 类来源，每条热点同时携带视频内容和图文内容两套适配字段——
 * 图文不是"是否适合图文"这一个布尔值的附属品，而是完整的推荐维度
 * 集合。结构保持可被真实 Connector 数据替换的形状（字段名和含义
 * 稳定，读取函数是唯一入口）。
 */

export const PLATFORM_SOURCES = [
  "抖音", "小红书", "视频号", "快手", "B站", "微博",
  "红果短剧", "番茄小说", "TikTok", "YouTube", "平台搜索关键词", "行业热点", "商品相关热点",
];

function seedHotspots() {
  return [
    {
      trendId: "trend-1", name: "普通人用 AI 开一人公司", sourcePlatform: "抖音",
      heatScore: 96, growthRate: 326, lifecyclePhase: "peaking", competitionLevel: "medium",
      suitableContentTypes: ["shortvideo", "graphic_content", "matrix_content"], suitableAccountIds: ["matrix-4"],
      riskNote: "低", recommendedAngle: "商业观察 + 真实工具演示", estimatedTraffic: 1260000,
      estimatedMonetization: "知识付费 + 品牌合作", suitableForGraphic: true,
      graphicPlatforms: ["公众号", "知乎", "头条号"], graphicFormats: ["行业分析", "教程攻略"],
      recommendedKeywords: ["AI一人公司", "副业", "自动化经营"], searchLifecycle: "上升期，预计持续 3-4 周",
      savePotential: 82, sharePotential: 74, privateTrafficPotential: 88,
      recommendedTitleDirection: "《普通人如何用 AI 建立一人公司》", recommendedGraphicForm: "长文 + 信息长图",
    },
    {
      trendId: "trend-2", name: "红果女性重生短剧", sourcePlatform: "红果短剧",
      heatScore: 93, growthRate: 142, lifecyclePhase: "peaking", competitionLevel: "high",
      suitableContentTypes: ["shortdrama"], suitableAccountIds: ["matrix-1", "matrix-2"],
      riskNote: "低", recommendedAngle: "职场逆袭 + 强情绪钩子", estimatedTraffic: 4200000,
      estimatedMonetization: "平台分成", suitableForGraphic: false,
      graphicPlatforms: [], graphicFormats: [], recommendedKeywords: ["重生", "逆袭", "职场爽剧"],
      searchLifecycle: "红果近 7 日完播率 42%，处于平台推荐高峰期",
      savePotential: 40, sharePotential: 55, privateTrafficPotential: 20,
      recommendedTitleDirection: "《重生后我接管了老板的公司》", recommendedGraphicForm: "—",
    },
    {
      trendId: "trend-3", name: "出租屋氛围灯改造", sourcePlatform: "小红书",
      heatScore: 88, growthRate: 187, lifecyclePhase: "emerging", competitionLevel: "medium",
      suitableContentTypes: ["shortvideo", "graphic_content"], suitableAccountIds: ["matrix-3"],
      riskNote: "低", recommendedAngle: "改造前后对比 + 绑定 LED 商品", estimatedTraffic: 900000,
      estimatedMonetization: "带货 + 品牌种草", suitableForGraphic: true,
      graphicPlatforms: ["小红书", "公众号"], graphicFormats: ["商品种草图文", "教程攻略"],
      recommendedKeywords: ["出租屋改造", "氛围灯", "租房好物"], searchLifecycle: "小红书搜索量上涨 187%，仍在上升",
      savePotential: 91, sharePotential: 68, privateTrafficPotential: 60,
      recommendedTitleDirection: "《出租屋氛围灯改造指南》", recommendedGraphicForm: "图片轮播 + 商品卡片",
    },
    {
      trendId: "trend-4", name: "老板突然消失的第七天", sourcePlatform: "番茄小说",
      heatScore: 86, growthRate: 64, lifecyclePhase: "emerging", competitionLevel: "medium",
      suitableContentTypes: ["shortdrama"], suitableAccountIds: ["matrix-1"],
      riskNote: "低", recommendedAngle: "悬疑职场，可扩展 24 集", estimatedTraffic: 620000,
      estimatedMonetization: "平台分成", suitableForGraphic: false,
      graphicPlatforms: [], graphicFormats: [], recommendedKeywords: ["悬疑", "职场", "反转"],
      searchLifecycle: "题材上升期", savePotential: 30, sharePotential: 42, privateTrafficPotential: 15,
      recommendedTitleDirection: "《老板突然消失的第七天》", recommendedGraphicForm: "—",
    },
    {
      trendId: "trend-5", name: "AI创业避坑指南", sourcePlatform: "知乎（搜索关键词）",
      heatScore: 79, growthRate: 58, lifecyclePhase: "emerging", competitionLevel: "low",
      suitableContentTypes: ["graphic_content"], suitableAccountIds: ["matrix-4"],
      riskNote: "低", recommendedAngle: "真实案例复盘 + 专业论证", estimatedTraffic: 210000,
      estimatedMonetization: "知识付费 + 涨粉", suitableForGraphic: true,
      graphicPlatforms: ["知乎", "公众号"], graphicFormats: ["知识科普", "案例拆解"],
      recommendedKeywords: ["AI创业", "避坑", "商业模式"], searchLifecycle: "搜索意图强，长尾稳定",
      savePotential: 76, sharePotential: 50, privateTrafficPotential: 55,
      recommendedTitleDirection: "普通人做 AI 创业最容易踩的 5 个坑", recommendedGraphicForm: "问题匹配 + 论证结构",
    },
    {
      trendId: "trend-6", name: "618/双十一家居好物清单", sourcePlatform: "视频号",
      heatScore: 74, growthRate: 33, lifecyclePhase: "peaking", competitionLevel: "high",
      suitableContentTypes: ["live", "graphic_content", "shortvideo"], suitableAccountIds: ["matrix-3"],
      riskNote: "中（大促合规话术）", recommendedAngle: "清单型 + 直播切片", estimatedTraffic: 780000,
      estimatedMonetization: "带货", suitableForGraphic: true,
      graphicPlatforms: ["小红书", "头条号"], graphicFormats: ["清单型内容", "测评对比"],
      recommendedKeywords: ["家居好物", "大促清单", "省钱攻略"], searchLifecycle: "大促窗口期，2 周内",
      savePotential: 85, sharePotential: 60, privateTrafficPotential: 40,
      recommendedTitleDirection: "2026 家居好物清单：这 8 件闭眼入", recommendedGraphicForm: "清单卡片 + 商品卡片",
    },
    {
      trendId: "trend-7", name: "跨境电商出海实录", sourcePlatform: "YouTube",
      heatScore: 68, growthRate: 21, lifecyclePhase: "emerging", competitionLevel: "low",
      suitableContentTypes: ["matrix_content", "graphic_content"], suitableAccountIds: ["matrix-4"],
      riskNote: "低", recommendedAngle: "纪实 Vlog + 招商说明", estimatedTraffic: 310000,
      estimatedMonetization: "品牌合作 + 招商", suitableForGraphic: true,
      graphicPlatforms: ["公众号", "头条号"], graphicFormats: ["行业分析", "品牌故事"],
      recommendedKeywords: ["跨境电商", "出海", "海外仓"], searchLifecycle: "行业热点，长期稳定",
      savePotential: 55, sharePotential: 38, privateTrafficPotential: 45,
      recommendedTitleDirection: "锦程国际·出海日记", recommendedGraphicForm: "长文 + 信息图",
    },
    {
      trendId: "trend-8", name: "B站创作激励新规解读", sourcePlatform: "B站",
      heatScore: 61, growthRate: 12, lifecyclePhase: "declining", competitionLevel: "medium",
      suitableContentTypes: ["graphic_content", "shortvideo"], suitableAccountIds: ["matrix-1"],
      riskNote: "低", recommendedAngle: "政策解读 + 创作者建议", estimatedTraffic: 150000,
      estimatedMonetization: "内容分成", suitableForGraphic: true,
      graphicPlatforms: ["B站专栏", "知乎"], graphicFormats: ["行业分析"],
      recommendedKeywords: ["创作激励", "B站规则"], searchLifecycle: "热点已过峰值，建议 3 日内切入",
      savePotential: 42, sharePotential: 30, privateTrafficPotential: 20,
      recommendedTitleDirection: "B站创作激励新规，你需要知道这 5 点", recommendedGraphicForm: "问答结构",
    },
    {
      trendId: "trend-9", name: "微博职场话题#被裁后我开了公司#", sourcePlatform: "微博",
      heatScore: 71, growthRate: 45, lifecyclePhase: "emerging", competitionLevel: "medium",
      suitableContentTypes: ["shortdrama", "graphic_content"], suitableAccountIds: ["matrix-1"],
      riskNote: "低", recommendedAngle: "真实故事 + 情绪共鸣", estimatedTraffic: 540000,
      estimatedMonetization: "涨粉 + 平台分成", suitableForGraphic: true,
      graphicPlatforms: ["头条号", "百家号"], graphicFormats: ["热点评论", "案例拆解"],
      recommendedKeywords: ["职场", "创业", "被裁"], searchLifecycle: "话题榜前 20，预计 5 天热度",
      savePotential: 58, sharePotential: 80, privateTrafficPotential: 35,
      recommendedTitleDirection: "被裁员之后，我用 AI 开了一家公司", recommendedGraphicForm: "叙事长文",
    },
    {
      trendId: "trend-10", name: "TikTok 海外家居改造挑战", sourcePlatform: "TikTok",
      heatScore: 65, growthRate: 28, lifecyclePhase: "emerging", competitionLevel: "medium",
      suitableContentTypes: ["shortvideo", "matrix_content"], suitableAccountIds: ["matrix-3"],
      riskNote: "低", recommendedAngle: "海外版氛围灯改造挑战赛", estimatedTraffic: 480000,
      estimatedMonetization: "带货 + 涨粉", suitableForGraphic: false,
      graphicPlatforms: [], graphicFormats: [], recommendedKeywords: ["home makeover", "LED"],
      searchLifecycle: "海外趋势同步窗口期", savePotential: 60, sharePotential: 66, privateTrafficPotential: 25,
      recommendedTitleDirection: "Room Makeover Challenge", recommendedGraphicForm: "—",
    },
  ];
}

function seedTrendForecasts() {
  return [
    { forecastId: "fc-1", topic: "AI一人公司 / 商业观察赛道", currentPhase: "上升期", predictedPeakInDays: 12, predictedDeclineInDays: 40, confidence: 0.82, recommendedAction: "立即立项，优先图文 + 短视频矩阵" },
    { forecastId: "fc-2", topic: "红果女性重生短剧题材", currentPhase: "高峰期", predictedPeakInDays: 0, predictedDeclineInDays: 21, confidence: 0.76, recommendedAction: "保持现有连载节奏，不新增同题材项目" },
    { forecastId: "fc-3", topic: "出租屋改造 / 租房好物", currentPhase: "上升期", predictedPeakInDays: 18, predictedDeclineInDays: 55, confidence: 0.71, recommendedAction: "扩大矩阵账号覆盖，图文 + 短视频并行" },
    { forecastId: "fc-4", topic: "跨境电商出海纪实", currentPhase: "萌芽期", predictedPeakInDays: 35, predictedDeclineInDays: 90, confidence: 0.58, recommendedAction: "先用图文低成本验证，效果好再上视频" },
  ];
}

function seedTopicPool() {
  return [
    { topicId: "topic-1", title: "普通人如何用 AI 建立一人公司", sourceTrendId: "trend-1", status: "approved", contentTypes: ["graphic_content", "shortvideo"], owner: "内容策划 Agent", priority: "high" },
    { topicId: "topic-2", title: "出租屋氛围灯改造指南", sourceTrendId: "trend-3", status: "approved", contentTypes: ["graphic_content", "shortvideo"], owner: "内容策划 Agent", priority: "high" },
    { topicId: "topic-3", title: "老板突然消失的第七天（24集短剧大纲）", sourceTrendId: "trend-4", status: "in_review", contentTypes: ["shortdrama"], owner: "编剧 Agent", priority: "medium" },
    { topicId: "topic-4", title: "AI创业最容易踩的 5 个坑", sourceTrendId: "trend-5", status: "pending", contentTypes: ["graphic_content"], owner: "选题 Agent", priority: "medium" },
    { topicId: "topic-5", title: "2026 家居好物清单", sourceTrendId: "trend-6", status: "pending", contentTypes: ["graphic_content", "live"], owner: "选题 Agent", priority: "low" },
    { topicId: "topic-6", title: "被裁员之后，我用 AI 开了一家公司", sourceTrendId: "trend-9", status: "rejected", contentTypes: ["graphic_content"], owner: "选题 Agent", priority: "low", rejectReason: "与 trend-1 重复度过高" },
  ];
}

const repository = createLocalRepository("studio.hotspot", () => ({
  hotspots: seedHotspots(),
  trendForecasts: seedTrendForecasts(),
  topicPool: seedTopicPool(),
}));

export function getHotspotState() {
  return tagDemo(repository.get());
}

export async function updateTopicStatus(topicId, status) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    topicPool: state.topicPool.map((t) => (t.topicId === topicId ? { ...t, status } : t)),
  }));
}
