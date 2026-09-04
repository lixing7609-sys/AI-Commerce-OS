import { createLocalRepository, nextMockId, simulateLatency, tagDemo } from "../../shared/localRepository.js";

/**
 * AI图文的 Mock 数据层（阶段：Studio V3 Integration 补充需求）。
 * AI图文是与 AI短剧/AI视频/AI直播并列的一级内容形态，不是"生成一张
 * 图/写一段文案"的附属功能——独立的项目模型（GraphicContentProject）、
 * 独立的 14 阶段生产流程（GRAPHIC_WORKFLOW_STAGES）、正文由结构化
 * ContentBlock 组成（不是一整段不可编辑字符串）、支持小红书/公众号/
 * 知乎/头条/商品种草多平台独立版本。
 *
 * 演示项目对应 §二十三/补充§十二 要求的两个图文母项目：
 *   1. 《普通人如何用AI建立一人公司》——关联 AI一人公司商业观察IP（ip-6）
 *   2. 《出租屋氛围灯改造指南》——关联 LightOS 商品（ip-5）
 */

export const GRAPHIC_WORKFLOW_STAGES = [
  { stageKey: "trendKeyword", order: 1, name: "热点与关键词分析", agentName: "Topic Research Agent" },
  { stageKey: "topicGoal", order: 2, name: "选题与内容目标", agentName: "Graphic Content Director Agent" },
  { stageKey: "brief", order: 3, name: "图文 Brief", agentName: "Graphic Content Director Agent" },
  { stageKey: "titleCover", order: 4, name: "标题与封面方向", agentName: "Title Agent" },
  { stageKey: "outline", order: 5, name: "内容结构 / 大纲", agentName: "Outline Agent" },
  { stageKey: "body", order: 6, name: "正文生成", agentName: "Article Writer Agent" },
  { stageKey: "imagePlan", order: 7, name: "配图规划", agentName: "Graphic Planner Agent" },
  { stageKey: "imageGen", order: 8, name: "图片 / 图表 / 信息图生成", agentName: "Infographic Agent" },
  { stageKey: "layout", order: 9, name: "图文排版", agentName: "Layout Agent" },
  { stageKey: "platformAdapt", order: 10, name: "平台适配", agentName: "Platform Adaptation Agent" },
  { stageKey: "review", order: 11, name: "内容审核", agentName: "Graphic Review Agent" },
  { stageKey: "publish", order: 12, name: "矩阵发布", agentName: "Graphic Publisher Agent" },
  { stageKey: "traffic", order: 13, name: "流量与搜索表现分析", agentName: "Graphic Traffic Agent" },
  { stageKey: "monetization", order: 14, name: "商业变现分析", agentName: "Monetization Agent" },
];

export const GRAPHIC_TYPE_LABEL = {
  xiaohongshu_note: "小红书图文笔记", wechat_article: "微信公众号文章", zhihu_answer: "知乎回答与文章",
  toutiao_article: "今日头条 / 头条号文章", baijiahao_article: "百家号文章", other_portal: "搜狐号等资讯平台文章",
  product_seeding: "商品种草图文", product_detail: "商品详情图文", brand_story: "品牌故事",
  industry_analysis: "行业分析", trend_comment: "热点评论", knowledge_explainer: "知识科普",
  tutorial: "教程攻略", checklist: "清单型内容", comparison: "测评对比", case_study: "案例拆解",
  poster_set: "海报组图", long_form: "长图文", comic: "漫画图文", infographic: "信息图",
  moments: "朋友圈内容", private_group: "私域社群内容", seo_article: "SEO文章", multi_platform_matrix: "多平台图文矩阵",
};

export const PLATFORM_VARIANT_LABEL = {
  xiaohongshu: "小红书", wechat: "微信公众号", zhihu: "知乎", toutiao: "今日头条 / 百家号", product_seeding: "商品种草图文",
};

const now = Date.now();
const days = (n) => new Date(now + n * 86400000).toISOString();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

function seedProjects() {
  return [
    {
      projectId: "gproj-1", name: "《普通人如何用 AI 建立一人公司》", graphicType: "multi_platform_matrix",
      ipId: "ip-6", relatedProductId: null, relatedTrendId: "trend-1", stage: "layout",
      ownerAgentOrPerson: "Graphic Content Director Agent", targetPlatforms: ["wechat", "zhihu", "xiaohongshu", "toutiao"],
      monetizationModel: "涨粉 + 品牌合作 + 知识产品", tokenUsed: 21400, computeUnitsUsed: 38, budget: 18000,
      status: "in_production", expectedCompleteAt: days(2),
    },
    {
      projectId: "gproj-2", name: "《出租屋氛围灯改造指南》", graphicType: "product_seeding",
      ipId: "ip-5", relatedProductId: "prod-lightos-led-01", relatedTrendId: "trend-3", stage: "platformAdapt",
      ownerAgentOrPerson: "Graphic Content Director Agent", targetPlatforms: ["xiaohongshu", "wechat", "product_seeding"],
      monetizationModel: "商品带货 + 品牌种草 + 搜索流量", tokenUsed: 12800, computeUnitsUsed: 22, budget: 10000,
      status: "in_review", expectedCompleteAt: days(1),
    },
    {
      projectId: "gproj-3", name: "AI创业最容易踩的 5 个坑", graphicType: "knowledge_explainer",
      ipId: "ip-6", relatedProductId: null, relatedTrendId: "trend-5", stage: "body",
      ownerAgentOrPerson: "Article Writer Agent", targetPlatforms: ["zhihu", "wechat"],
      monetizationModel: "知识付费 + 涨粉", tokenUsed: 3600, computeUnitsUsed: 4, budget: 6000,
      status: "in_production", expectedCompleteAt: days(4),
    },
    {
      projectId: "gproj-4", name: "2026 家居好物清单", graphicType: "checklist",
      ipId: "ip-2", relatedProductId: null, relatedTrendId: "trend-6", stage: "trendKeyword",
      ownerAgentOrPerson: "Topic Research Agent", targetPlatforms: ["xiaohongshu"],
      monetizationModel: "商品带货", tokenUsed: 200, computeUnitsUsed: 0, budget: 5000,
      status: "planning", expectedCompleteAt: days(9),
    },
  ];
}

function seedContentBlocks() {
  return {
    "gproj-1": [
      { blockId: "b1-1", order: 1, type: "heading", text: "普通人如何用 AI 建立一人公司", tone: "专业+鼓舞", length: 14, keywords: ["AI一人公司", "副业"], seoWeight: 92, platformStyle: "公众号", keepBrandTone: true, allowExaggeration: false, sourceRef: "trend-1", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 3, aiSuggestion: "", generationCost: 0.2, locked: false },
      { blockId: "b1-2", order: 2, type: "paragraph", text: "过去创业需要团队、资金和大量试错时间；今天，一个人配合一组 AI Agent，就可以完成从选品到发布的完整闭环。这篇文章拆解真实可复制的方法论。", tone: "专业+鼓舞", length: 96, keywords: ["自动化经营"], seoWeight: 70, platformStyle: "公众号", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 6, aiSuggestion: "可增加一个真实数据案例增强说服力", generationCost: 0.6, locked: false },
      { blockId: "b1-3", order: 3, type: "image", text: "一人公司 AI 工作流示意图", tone: "", length: 0, keywords: [], seoWeight: 0, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "流程图，展示选题→生产→发布→复盘四步", imageRatio: "16:9", imageStyle: "扁平插画风", generationModel: "Infographic Model A", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 1.2, locked: false },
      { blockId: "b1-4", order: 4, type: "list", text: "1. 选题：Trend Agent 扫描全网热点\n2. 生产：Writer/Image/Video Agent 协同生成\n3. 发布：Publisher Agent 多平台适配发布\n4. 复盘：Analytics Agent 回收数据、反哺选题", tone: "", length: 60, keywords: ["工作流"], seoWeight: 40, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 2, aiSuggestion: "", generationCost: 0.3, locked: false },
      { blockId: "b1-5", order: 5, type: "callout", text: "关键不是找到「完美工具」，而是搭建一条能持续运转的 AI 生产流水线。", tone: "", length: 32, keywords: [], seoWeight: 20, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 0.1, locked: false },
      { blockId: "b1-6", order: 6, type: "CTA", text: "关注「AI一人公司观察」，获取完整工作流模板。", tone: "", length: 18, keywords: [], seoWeight: 10, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 0.1, locked: true },
    ],
    "gproj-2": [
      { blockId: "b2-1", order: 1, type: "heading", text: "出租屋氛围灯改造指南｜3 步告别白炽灯", tone: "种草+亲切", length: 16, keywords: ["出租屋改造", "氛围灯"], seoWeight: 88, platformStyle: "小红书", keepBrandTone: true, allowExaggeration: true, sourceRef: "trend-3", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 2, aiSuggestion: "", generationCost: 0.2, locked: false },
      { blockId: "b2-2", order: 2, type: "paragraph", text: "租房不能砸墙不能刷漆，但灯光可以完全自己做主。这套 LightOS 智能氛围灯 30 分钟安装完成，租期结束直接拆走不留痕迹。", tone: "种草+亲切", length: 68, keywords: ["租房好物"], seoWeight: 65, platformStyle: "小红书", keepBrandTone: true, allowExaggeration: true, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 4, aiSuggestion: "", generationCost: 0.5, locked: false },
      { blockId: "b2-3", order: 3, type: "image", text: "改造前后对比图", tone: "", length: 0, keywords: [], seoWeight: 0, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "左右对比构图，暖光效果突出", imageRatio: "3:4", imageStyle: "真实生活写真", generationModel: "Image Model B · 写实", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 1.0, locked: false },
      { blockId: "b2-4", order: 4, type: "product-card", text: "LightOS 智能氛围灯 · 免打孔款", tone: "", length: 0, keywords: ["LightOS"], seoWeight: 30, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "prod-lightos-led-01", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "中（需核对商品参数）", duplicateRate: 0, aiSuggestion: "建议补充价格与购买链接占位", generationCost: 0.1, locked: false },
      { blockId: "b2-5", order: 5, type: "list", text: "Step 1 选位置 → Step 2 贴装 → Step 3 App 调色联动音乐", tone: "", length: 24, keywords: ["安装步骤"], seoWeight: 30, platformStyle: "", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 0.2, locked: false },
    ],
    "gproj-3": [
      { blockId: "b3-1", order: 1, type: "heading", text: "AI创业最容易踩的 5 个坑", tone: "专业", length: 12, keywords: ["AI创业", "避坑"], seoWeight: 80, platformStyle: "知乎", keepBrandTone: true, allowExaggeration: false, sourceRef: "trend-5", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 1, aiSuggestion: "", generationCost: 0.2, locked: false },
      { blockId: "b3-2", order: 2, type: "paragraph", text: "坑一：把 AI 当成万能替代人力的工具，忽视了业务判断本身的价值……（草稿）", tone: "专业", length: 40, keywords: [], seoWeight: 50, platformStyle: "知乎", keepBrandTone: true, allowExaggeration: false, sourceRef: "", imageRequirement: "", imageRatio: "", imageStyle: "", generationModel: "", complianceRisk: "低", duplicateRate: 8, aiSuggestion: "正文仍为草稿，建议继续生成剩余 4 个坑", generationCost: 0.4, locked: false },
    ],
  };
}

function seedVariants() {
  return [
    { variantId: "var-1-1", projectId: "gproj-1", platform: "wechat", title: "普通人如何用 AI 建立一人公司", coverTitle: "一人公司实操指南", tags: ["AI创业", "副业"], summary: "完整工作流拆解 + 真实案例", status: "in_review", publishedAt: null },
    { variantId: "var-1-2", projectId: "gproj-1", platform: "zhihu", title: "普通人可以靠 AI 建立一人公司吗？", coverTitle: "", tags: ["AI创业"], summary: "问题匹配版本，强化论证结构", status: "draft", publishedAt: null },
    { variantId: "var-1-3", projectId: "gproj-1", platform: "xiaohongshu", title: "一个人 + AI = 一家公司🔥保姆级拆解", coverTitle: "一人公司保姆级拆解", tags: ["AI创业", "搞钱"], summary: "短段落 + emoji + 收藏型结构", status: "draft", publishedAt: null },
    { variantId: "var-1-4", projectId: "gproj-1", platform: "toutiao", title: "普通人靠 AI 也能开公司？真相是这样", coverTitle: "", tags: ["AI创业"], summary: "资讯型结构，强调时效", status: "draft", publishedAt: null },
    { variantId: "var-2-1", projectId: "gproj-2", platform: "xiaohongshu", title: "出租屋氛围灯改造，3 步搞定✨", coverTitle: "出租屋改造指南", tags: ["租房好物", "氛围感"], summary: "图片轮播 + 种草表达", status: "approved", publishedAt: null },
    { variantId: "var-2-2", projectId: "gproj-2", platform: "wechat", title: "租房党的灯光自由：LightOS 改造实录", coverTitle: "", tags: ["租房攻略"], summary: "长文教程结构", status: "in_review", publishedAt: null },
    { variantId: "var-2-3", projectId: "gproj-2", platform: "product_seeding", title: "LightOS 智能氛围灯 · 使用场景全解析", coverTitle: "", tags: ["种草"], summary: "使用场景 + 痛点 + 卖点 + 购买 CTA", status: "draft", publishedAt: null },
  ];
}

function seedSeoKeywords() {
  return [
    { keyword: "AI一人公司", searchVolume: 42000, rankingPosition: 8, intent: "信息型" },
    { keyword: "AI创业副业", searchVolume: 18600, rankingPosition: 14, intent: "信息型" },
    { keyword: "出租屋改造", searchVolume: 96000, rankingPosition: 5, intent: "导航型" },
    { keyword: "氛围灯推荐", searchVolume: 31000, rankingPosition: 3, intent: "交易型" },
  ];
}

function seedPublishTasks() {
  return [
    { taskId: "gpub-1", projectId: "gproj-2", variantId: "var-2-1", platform: "小红书", accountId: "matrix-9", scheduledAt: days(0.2), status: "scheduled", retryCount: 0, contentUrl: "", dataSyncStatus: "pending" },
    { taskId: "gpub-2", projectId: "gproj-1", variantId: "var-1-1", platform: "微信公众号", accountId: "matrix-6", scheduledAt: daysAgo(1), status: "published", retryCount: 0, contentUrl: "https://mp.weixin.qq.com/s/demo-gpub-2", dataSyncStatus: "synced" },
  ];
}

function seedMetrics() {
  return [
    { projectId: "gproj-1", variantId: "var-1-1", impressions: 86000, reads: 21400, clickRate: 24.9, avgReadDuration: 96, completionRate: 41, saves: 1860, likes: 2400, comments: 186, shares: 620, newFollowers: 340, searchEntries: 4200, keywordRanking: 8, privateTrafficImported: 96, productClicks: 0, conversions: 0 },
    { projectId: "gproj-2", variantId: "var-2-1", impressions: 154000, reads: 68000, clickRate: 44.2, avgReadDuration: 38, completionRate: 58, saves: 6200, likes: 8900, comments: 340, shares: 1200, newFollowers: 210, searchEntries: 12000, keywordRanking: 3, privateTrafficImported: 44, productClicks: 3800, conversions: 210 },
  ];
}

function seedRevenue() {
  return [
    { entryId: "grev-1", projectId: "gproj-1", category: "公众号流量主", revenue: 1860, generationCost: 320, imageCost: 60, distributionCost: 0, adCost: 0, grossMargin: 1480, settlementStatus: "已结算" },
    { entryId: "grev-2", projectId: "gproj-1", category: "知乎内容收益", revenue: 640, generationCost: 180, imageCost: 20, distributionCost: 0, adCost: 0, grossMargin: 440, settlementStatus: "待结算" },
    { entryId: "grev-3", projectId: "gproj-2", category: "商品带货", revenue: 9600, generationCost: 220, imageCost: 80, distributionCost: 0, adCost: 400, grossMargin: 8900, settlementStatus: "部分结算" },
    { entryId: "grev-4", projectId: "gproj-2", category: "小红书品牌合作", revenue: 4200, generationCost: 0, imageCost: 0, distributionCost: 0, adCost: 0, grossMargin: 4200, settlementStatus: "待结算" },
  ];
}

const repository = createLocalRepository("studio.graphicContent", () => ({
  projects: seedProjects(),
  blocks: seedContentBlocks(),
  variants: seedVariants(),
  seoKeywords: seedSeoKeywords(),
  publishTasks: seedPublishTasks(),
  metrics: seedMetrics(),
  revenue: seedRevenue(),
}));

export function getGraphicContentState() {
  return tagDemo(repository.get());
}

export function getGraphicProjectBlocks(projectId) {
  const state = repository.get();
  return tagDemo(state.blocks[projectId] ?? []);
}

export async function updateContentBlock(projectId, blockId, patch) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    blocks: { ...state.blocks, [projectId]: (state.blocks[projectId] ?? []).map((b) => (b.blockId === blockId ? { ...b, ...patch } : b)) },
  }));
}

export async function addContentBlock(projectId, type, afterOrder) {
  await simulateLatency(250, 500);
  return repository.update((state) => {
    const blocks = state.blocks[projectId] ?? [];
    const newBlock = {
      blockId: nextMockId("block"), order: afterOrder + 0.5, type, text: type === "image" ? "" : "新增内容块，点击编辑",
      tone: "", length: 0, keywords: [], seoWeight: 0, platformStyle: "", keepBrandTone: true, allowExaggeration: false,
      sourceRef: "", imageRequirement: type === "image" ? "描述所需配图" : "", imageRatio: "1:1", imageStyle: "",
      generationModel: "", complianceRisk: "低", duplicateRate: 0, aiSuggestion: "", generationCost: 0, locked: false,
    };
    const next = [...blocks, newBlock].sort((a, b) => a.order - b.order).map((b, i) => ({ ...b, order: i + 1 }));
    return { ...state, blocks: { ...state.blocks, [projectId]: next } };
  });
}

export async function removeContentBlock(projectId, blockId) {
  await simulateLatency(150, 300);
  return repository.update((state) => {
    const next = (state.blocks[projectId] ?? []).filter((b) => b.blockId !== blockId).map((b, i) => ({ ...b, order: i + 1 }));
    return { ...state, blocks: { ...state.blocks, [projectId]: next } };
  });
}

export async function reorderContentBlock(projectId, blockId, direction) {
  await simulateLatency(120, 250);
  return repository.update((state) => {
    const blocks = [...(state.blocks[projectId] ?? [])].sort((a, b) => a.order - b.order);
    const idx = blocks.findIndex((b) => b.blockId === blockId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= blocks.length) return state;
    [blocks[idx], blocks[swapIdx]] = [blocks[swapIdx], blocks[idx]];
    const next = blocks.map((b, i) => ({ ...b, order: i + 1 }));
    return { ...state, blocks: { ...state.blocks, [projectId]: next } };
  });
}

export async function aiRewriteBlock(projectId, blockId, mode) {
  await simulateLatency(400, 900);
  const MODE_SUFFIX = {
    expand: "（AI已扩写，补充细节与案例）", shorten: "（AI已缩写，保留核心信息）",
    tone: "（AI已调整语气为更贴近平台风格）", platform: "（AI已改写为目标平台风格）",
    case: "（AI已补充真实案例）", data: "（AI已补充数据支撑）",
  };
  return repository.update((state) => ({
    ...state,
    blocks: {
      ...state.blocks,
      [projectId]: (state.blocks[projectId] ?? []).map((b) =>
        b.blockId === blockId ? { ...b, text: `${b.text} ${MODE_SUFFIX[mode] ?? "（AI已改写）"}`, generationCost: b.generationCost + 0.3 } : b
      ),
    },
  }));
}

export async function regenerateBlockImage(projectId, blockId) {
  await simulateLatency(500, 1000);
  return repository.update((state) => ({
    ...state,
    blocks: {
      ...state.blocks,
      [projectId]: (state.blocks[projectId] ?? []).map((b) =>
        b.blockId === blockId ? { ...b, generationCost: b.generationCost + 1.0, aiSuggestion: "已重新生成配图" } : b
      ),
    },
  }));
}

export async function advanceGraphicStage(projectId, nextStage) {
  await simulateLatency(300, 600);
  return repository.update((state) => ({
    ...state,
    projects: state.projects.map((p) => (p.projectId === projectId ? { ...p, stage: nextStage } : p)),
  }));
}

/** 新建 AI图文项目（§九新建项目工作台，contentType 落在图文族时使用）。 */
export async function createGraphicContentProject(input) {
  await simulateLatency(400, 800);
  const projectId = nextMockId("gproj");
  const project = {
    projectId,
    name: input.name || "未命名图文项目",
    graphicType: input.graphicType || "wechat_article",
    ipId: input.ipId || null,
    relatedProductId: input.relatedProductId || null,
    relatedTrendId: input.relatedTrendId || null,
    stage: "trendKeyword",
    ownerAgentOrPerson: "Graphic Content Director Agent · 待分配",
    targetPlatforms: input.targetPlatforms || ["wechat"],
    monetizationModel: input.monetizationModel || "涨粉与流量池",
    tokenUsed: 0, computeUnitsUsed: 0, budget: Number(input.budgetCap) || 5000,
    status: "planning", expectedCompleteAt: input.deadline || days(7),
  };
  repository.update((state) => ({
    ...state,
    projects: [project, ...state.projects],
    blocks: { ...state.blocks, [projectId]: [] },
  }));
  return tagDemo(project);
}

export async function createPlatformVariant(projectId, platform) {
  await simulateLatency(400, 800);
  return repository.update((state) => {
    const project = state.projects.find((p) => p.projectId === projectId);
    const newVariant = {
      variantId: nextMockId("var"), projectId, platform, title: `${project?.name ?? "新图文"}（${PLATFORM_VARIANT_LABEL[platform]}版）`,
      coverTitle: "", tags: [], summary: "AI 已生成该平台版本草稿", status: "draft", publishedAt: null,
    };
    return { ...state, variants: [...state.variants, newVariant] };
  });
}
