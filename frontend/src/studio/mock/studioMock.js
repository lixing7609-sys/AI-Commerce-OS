import { createLocalRepository, simulateLatency, tagDemo } from "../../shared/localRepository.js";

/**
 * AI Commerce OS Studio 的 Mock 数据层（阶段：四端产品体系 V1，§5）。
 * 字段命名与 shared/domainTypes.js 的 ContentProject / ContentAsset /
 * MatrixAccount / TrafficResource / AdvertisingResource /
 * AdvertisingOrder 对齐，本文件负责生成符合业务逻辑的具体种子数据、
 * 以及 Studio 页面需要的读取/操作函数——不是纯静态卡片，未来接入
 * 真实后端时只需要替换这些函数的实现，页面组件不需要改。
 *
 * 内容生产流程（Studio 概览页引用）：
 *   选题 → 脚本 → 分镜 → 生成 → 剪辑 → 审核 → 发布 → 数据回收 → 流量资产沉淀
 */

export const PRODUCTION_PIPELINE_STAGES = [
  "选题", "脚本", "分镜", "生成", "剪辑", "审核", "发布", "数据回收", "流量资产沉淀",
];

export const CONTENT_TYPE_LABEL = {
  shortdrama: "AI 短剧",
  shortvideo: "短视频",
  live: "直播内容",
  ad_creative: "广告素材",
  brand_column: "品牌栏目",
  matrix_content: "矩阵内容",
};

export const PROJECT_STATUS_LABEL = {
  planning: "策划中",
  in_production: "生产中",
  in_review: "审核中",
  published: "已发布",
  archived: "已归档",
};

export const PROJECT_STATUS_TONE = {
  planning: "neutral",
  in_production: "info",
  in_review: "warning",
  published: "success",
  archived: "neutral",
};

export const MONETIZATION_LABEL = {
  ad_revenue: "广告分成",
  revenue_share: "平台分成",
  licensing: "版权授权",
  internal_marketing: "内部营销（不直接变现）",
};

const now = Date.now();
const days = (n) => new Date(now + n * 86400000).toISOString();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

const IP_LIST = [
  { ipId: "ip-1", name: "《重生豪门之我在家居行业当扫地僧》" },
  { ipId: "ip-2", name: "星辰家居·匠心系列" },
  { ipId: "ip-3", name: "锦程国际·出海日记" },
];

function seedContentProjects() {
  return [
    {
      projectId: "proj-1", name: "《重生豪门》第 13-16 集", contentType: "shortdrama", ipId: "ip-1",
      stage: "剪辑", ownerAgentOrPerson: "短剧生产 Agent · 王导", expectedCompleteAt: days(2),
      tokenUsed: 48200, computeUnitsUsed: 320, budget: 60000, status: "in_production",
      monetizationModel: "ad_revenue",
    },
    {
      projectId: "proj-2", name: "星辰家居 11 月新品种草视频", contentType: "shortvideo", ipId: "ip-2",
      stage: "审核", ownerAgentOrPerson: "内容 Agent", expectedCompleteAt: days(1),
      tokenUsed: 9600, computeUnitsUsed: 40, budget: 12000, status: "in_review",
      monetizationModel: "internal_marketing",
    },
    {
      projectId: "proj-3", name: "锦程国际·出海日记 EP04", contentType: "matrix_content", ipId: "ip-3",
      stage: "生成", ownerAgentOrPerson: "矩阵内容 Agent", expectedCompleteAt: days(4),
      tokenUsed: 15400, computeUnitsUsed: 88, budget: 20000, status: "in_production",
      monetizationModel: "revenue_share",
    },
    {
      projectId: "proj-4", name: "双十一直播预热广告素材包", contentType: "ad_creative", ipId: null,
      stage: "分镜", ownerAgentOrPerson: "广告素材 Agent", expectedCompleteAt: days(3),
      tokenUsed: 3200, computeUnitsUsed: 12, budget: 8000, status: "in_production",
      monetizationModel: "ad_revenue",
    },
    {
      projectId: "proj-5", name: "《重生豪门》第 9-12 集", contentType: "shortdrama", ipId: "ip-1",
      stage: "流量资产沉淀", ownerAgentOrPerson: "短剧生产 Agent · 王导", expectedCompleteAt: daysAgo(3),
      tokenUsed: 52000, computeUnitsUsed: 410, budget: 60000, status: "published",
      monetizationModel: "ad_revenue",
    },
    {
      projectId: "proj-6", name: "品牌栏目《匠心访谈录》第 2 期", contentType: "brand_column", ipId: "ip-2",
      stage: "选题", ownerAgentOrPerson: "内容策划 Agent", expectedCompleteAt: days(7),
      tokenUsed: 400, computeUnitsUsed: 0, budget: 15000, status: "planning",
      monetizationModel: "licensing",
    },
  ];
}

function seedMatrixAccounts() {
  return [
    { accountId: "matrix-1", platform: "抖音", handle: "@重生豪门官方", positioning: "都市逆袭短剧", ipId: "ip-1", followers: 486200, lastUpdatedAt: daysAgo(0.3), contentCount: 46, totalPlays: 28600000, accountHealth: "healthy", monetizationStatus: "monetized", sellableTrafficValue: 68000 },
    { accountId: "matrix-2", platform: "快手", handle: "重生豪门剧场", positioning: "都市逆袭短剧", ipId: "ip-1", followers: 152300, lastUpdatedAt: daysAgo(1), contentCount: 40, totalPlays: 9800000, accountHealth: "healthy", monetizationStatus: "monetized", sellableTrafficValue: 21000 },
    { accountId: "matrix-3", platform: "小红书", handle: "星辰家居研究所", positioning: "家居选购种草", ipId: "ip-2", followers: 68900, lastUpdatedAt: daysAgo(0.1), contentCount: 128, totalPlays: 4200000, accountHealth: "healthy", monetizationStatus: "in_progress", sellableTrafficValue: 9800 },
    { accountId: "matrix-4", platform: "视频号", handle: "锦程出海笔记", positioning: "跨境贸易纪实", ipId: "ip-3", followers: 21400, lastUpdatedAt: daysAgo(6), contentCount: 18, totalPlays: 610000, accountHealth: "attention", monetizationStatus: "not_started", sellableTrafficValue: 1200 },
    { accountId: "matrix-5", platform: "B站", handle: "重生豪门UP主剪辑版", positioning: "都市逆袭短剧", ipId: "ip-1", followers: 9200, lastUpdatedAt: daysAgo(14), contentCount: 12, totalPlays: 380000, accountHealth: "at_risk", monetizationStatus: "not_started", sellableTrafficValue: 300 },
  ];
}

function seedContentAssets() {
  return [
    { assetId: "asset-1", title: "《重生豪门》EP12 完整剪辑", assetType: "短剧成片", ipId: "ip-1", copyrightStatus: "cleared", reusable: true, generationSource: "AI短剧生产线 v2", tokenCost: 12400, computeCost: 96, publishedPlatforms: ["抖音", "快手"], cumulativePlays: 3200000, cumulativeRevenue: 18600, commercialLicenseStatus: "licensed" },
    { assetId: "asset-2", title: "星辰家居products种草脚本模板", assetType: "脚本模板", ipId: "ip-2", copyrightStatus: "cleared", reusable: true, generationSource: "内容策划 Agent", tokenCost: 800, computeCost: 0, publishedPlatforms: [], cumulativePlays: 0, cumulativeRevenue: 0, commercialLicenseStatus: "internal_only" },
    { assetId: "asset-3", title: "锦程出海 EP03 数字人口播素材", assetType: "数字人素材", ipId: "ip-3", copyrightStatus: "pending", reusable: false, generationSource: "AI数字人 v1", tokenCost: 4200, computeCost: 30, publishedPlatforms: ["视频号"], cumulativePlays: 210000, cumulativeRevenue: 0, commercialLicenseStatus: "internal_only" },
    { assetId: "asset-4", title: "双十一预热封面图集（12张）", assetType: "封面图", ipId: null, copyrightStatus: "cleared", reusable: true, generationSource: "AI图片 Agent", tokenCost: 600, computeCost: 4, publishedPlatforms: ["抖音", "小红书"], cumulativePlays: 0, cumulativeRevenue: 0, commercialLicenseStatus: "internal_only" },
    { assetId: "asset-5", title: "《重生豪门》主题曲（AI配音）", assetType: "音频", ipId: "ip-1", copyrightStatus: "disputed", reusable: false, generationSource: "AI配音 Agent", tokenCost: 1800, computeCost: 8, publishedPlatforms: ["抖音"], cumulativePlays: 1800000, cumulativeRevenue: 2400, commercialLicenseStatus: "licensed" },
  ];
}

function seedTrafficPool() {
  return [
    { trafficId: "traffic-1", platform: "抖音", accountId: "matrix-1", ipId: "ip-1", contentType: "shortdrama", region: "全国", audienceTags: ["都市女性", "25-35岁", "下沉市场"], sellableVolume: 4200000, lockedVolume: 800000, deliveredVolume: 1200000, estimatedAdValue: 84000 },
    { trafficId: "traffic-2", platform: "快手", accountId: "matrix-2", ipId: "ip-1", contentType: "shortdrama", region: "华北/华中", audienceTags: ["都市女性", "35-45岁"], sellableVolume: 1600000, lockedVolume: 200000, deliveredVolume: 300000, estimatedAdValue: 26000 },
    { trafficId: "traffic-3", platform: "小红书", accountId: "matrix-3", ipId: "ip-2", contentType: "matrix_content", region: "一二线城市", audienceTags: ["家居装修", "精致生活"], sellableVolume: 900000, lockedVolume: 100000, deliveredVolume: 420000, estimatedAdValue: 15600 },
    { trafficId: "traffic-4", platform: "视频号", accountId: "matrix-4", ipId: "ip-3", contentType: "matrix_content", region: "全国", audienceTags: ["外贸从业者", "跨境电商"], sellableVolume: 210000, lockedVolume: 0, deliveredVolume: 60000, estimatedAdValue: 3800 },
  ];
}

function seedAdResources() {
  return [
    { resourceId: "adres-1", name: "《重生豪门》剧中商品植入（单集）", resourceType: "shortdrama_placement", coveredPlatforms: ["抖音", "快手"], expectedExposure: 3800000, targetAudience: "都市女性 25-35岁", sellableQuantity: 3, unitPrice: 42000, status: "available" },
    { resourceId: "adres-2", name: "重生豪门官方账号信息流发布", resourceType: "account_post", coveredPlatforms: ["抖音"], expectedExposure: 1200000, targetAudience: "都市女性 25-45岁", sellableQuantity: 8, unitPrice: 9800, status: "available" },
    { resourceId: "adres-3", name: "星辰家居研究所笔记植入", resourceType: "content_placement", coveredPlatforms: ["小红书"], expectedExposure: 420000, targetAudience: "家居装修意向人群", sellableQuantity: 5, unitPrice: 3600, status: "reserved" },
    { resourceId: "adres-4", name: "跨境贸易人群定向流量包", resourceType: "audience_targeting", coveredPlatforms: ["视频号"], expectedExposure: 210000, targetAudience: "外贸从业者", sellableQuantity: 2, unitPrice: 6800, status: "available" },
    { resourceId: "adres-5", name: "重生豪门 IP 联名素材授权", resourceType: "ip_co_branding", coveredPlatforms: ["抖音", "快手", "B站"], expectedExposure: 6000000, targetAudience: "泛都市剧受众", sellableQuantity: 1, unitPrice: 128000, status: "available" },
    { resourceId: "adres-6", name: "定制口播直播口碑植入", resourceType: "live_mention", coveredPlatforms: ["抖音"], expectedExposure: 500000, targetAudience: "直播间实时观众", sellableQuantity: 0, unitPrice: 15000, status: "sold_out" },
  ];
}

function seedAdOrders() {
  return [
    { orderId: "adorder-1", customerType: "operator", customerName: "星辰家居贸易", sourceOperatorBusinessUnitId: "bu-operator-1", resourceId: "adres-3", contractAmount: 18000, collectedAmount: 18000, deliveryProgress: 100, expectedExposure: 420000, actualExposure: 456000, startAt: daysAgo(20), endAt: daysAgo(5), settlementStatus: "settled" },
    { orderId: "adorder-2", customerType: "operator", customerName: "锦程国际贸易", sourceOperatorBusinessUnitId: "bu-operator-4", resourceId: "adres-4", contractAmount: 6800, collectedAmount: 3400, deliveryProgress: 45, expectedExposure: 210000, actualExposure: 96000, startAt: daysAgo(6), endAt: days(4), settlementStatus: "partially_settled" },
    { orderId: "adorder-3", customerType: "external", customerName: "某美妆品牌方", sourceOperatorBusinessUnitId: null, resourceId: "adres-1", contractAmount: 126000, collectedAmount: 63000, deliveryProgress: 30, expectedExposure: 3800000, actualExposure: 1100000, startAt: daysAgo(3), endAt: days(11), settlementStatus: "partially_settled" },
    { orderId: "adorder-4", customerType: "external", customerName: "某快消品牌方", sourceOperatorBusinessUnitId: null, resourceId: "adres-2", contractAmount: 39200, collectedAmount: 0, deliveryProgress: 0, expectedExposure: 1200000, actualExposure: 0, startAt: days(2), endAt: days(16), settlementStatus: "pending" },
  ];
}

function seedShortDramaDetail() {
  return {
    projectId: "proj-1",
    episodes: [
      { episode: 13, script: "已定稿", storyboard: "已完成", voiceover: "已完成", videoGen: "已完成", editing: "剪辑中", review: "未开始" },
      { episode: 14, script: "已定稿", storyboard: "已完成", voiceover: "已完成", videoGen: "生成中", editing: "未开始", review: "未开始" },
      { episode: 15, script: "已定稿", storyboard: "进行中", voiceover: "未开始", videoGen: "未开始", editing: "未开始", review: "未开始" },
      { episode: 16, script: "草稿", storyboard: "未开始", voiceover: "未开始", videoGen: "未开始", editing: "未开始", review: "未开始" },
    ],
    characters: [
      { name: "沈知行", role: "男主角", voiceProfile: "沉稳青年音", status: "已建模" },
      { name: "林晚意", role: "女主角", voiceProfile: "清亮少女音", status: "已建模" },
      { name: "陆总", role: "反派", voiceProfile: "低沉中年音", status: "已建模" },
    ],
    distributionData: [
      { platform: "抖音", plays: 18600000, revenue: 96000 },
      { platform: "快手", plays: 6200000, revenue: 31000 },
      { platform: "B站", plays: 380000, revenue: 1800 },
    ],
  };
}

function seedAiVideoTasks() {
  return [
    { taskId: "video-1", name: "星辰家居 11 月新品种草视频", template: "产品种草模板 A", stage: "生成", scriptStatus: "已完成", storyboardStatus: "已完成", assetStatus: "素材齐全", generationModel: "Video-Gen v3", tokenCost: 9600, computeCost: 40, publishPlatform: "小红书/抖音", performance: "待发布" },
    { taskId: "video-2", name: "双十一预热广告视频 15s", template: "促销广告模板", stage: "剪辑", scriptStatus: "已完成", storyboardStatus: "已完成", assetStatus: "素材齐全", generationModel: "Video-Gen v3", tokenCost: 3200, computeCost: 12, publishPlatform: "抖音", performance: "待发布" },
    { taskId: "video-3", name: "品牌栏目《匠心访谈录》预告", template: "访谈栏目模板", stage: "脚本", scriptStatus: "草稿", storyboardStatus: "未开始", assetStatus: "待补充", generationModel: "—", tokenCost: 400, computeCost: 0, publishPlatform: "待定", performance: "—" },
    { taskId: "video-4", name: "锦程出海纪实 EP03", template: "纪实Vlog模板", stage: "已发布", scriptStatus: "已完成", storyboardStatus: "已完成", assetStatus: "素材齐全", generationModel: "Video-Gen v2", tokenCost: 4200, computeCost: 30, publishPlatform: "视频号", performance: "播放 21万" },
  ];
}

function seedAiLiveProjects() {
  return [
    { liveId: "live-1", name: "重生豪门角色见面会（数字人）", digitalHuman: "沈知行 数字人", script: "已完成", topicOrProduct: "IP联名周边预售", platform: "抖音", sessionCount: 3, status: "已排期", viewers: 0, traffic: 0, revenue: 0, complianceRisk: "低" },
    { liveId: "live-2", name: "星辰家居双十一好物直播", digitalHuman: "无（真人+AI辅助）", script: "已完成", topicOrProduct: "家居爆款清单", platform: "抖音", sessionCount: 12, status: "进行中", viewers: 42000, traffic: 680000, revenue: 32000, complianceRisk: "低" },
    { liveId: "live-3", name: "锦程国际招商说明会", digitalHuman: "陆总 数字人", script: "审核中", topicOrProduct: "海外仓招商", platform: "视频号", sessionCount: 1, status: "待审核", viewers: 0, traffic: 0, revenue: 0, complianceRisk: "中（涉及招商话术）" },
    { liveId: "live-4", name: "重生豪门剧情彩蛋直播", digitalHuman: "林晚意 数字人", script: "已完成", topicOrProduct: "剧情彩蛋+周边带货", platform: "快手", sessionCount: 5, status: "已结束", viewers: 128000, traffic: 2100000, revenue: 54000, complianceRisk: "低" },
  ];
}

const repository = createLocalRepository("studio.state", () => ({
  contentProjects: seedContentProjects(),
  matrixAccounts: seedMatrixAccounts(),
  contentAssets: seedContentAssets(),
  trafficPool: seedTrafficPool(),
  adResources: seedAdResources(),
  adOrders: seedAdOrders(),
  shortDramaDetail: seedShortDramaDetail(),
  aiVideoTasks: seedAiVideoTasks(),
  aiLiveProjects: seedAiLiveProjects(),
}));

export function getStudioState() {
  return tagDemo(repository.get());
}

export function getIpList() {
  return tagDemo(IP_LIST);
}

export function getIpName(ipId) {
  return IP_LIST.find((ip) => ip.ipId === ipId)?.name ?? "无关联 IP";
}

export function getStudioOverview() {
  const state = repository.get();
  const todayProjects = state.contentProjects.filter((p) => p.status === "in_production").length;
  const weeklyPublished = state.contentProjects.filter((p) => p.status === "published").length;
  const inProduction = state.contentProjects.filter((p) => p.status === "in_production").length;
  const pendingReview = state.contentProjects.filter((p) => p.status === "in_review").length;
  const totalFollowers = state.matrixAccounts.reduce((sum, a) => sum + a.followers, 0);
  const activeAccounts = state.matrixAccounts.filter((a) => a.accountHealth !== "at_risk").length;
  const todayPlays = 3860000;
  const monthlyTraffic = state.trafficPool.reduce((sum, t) => sum + t.deliveredVolume, 0);
  const sellableResources = state.adResources.filter((r) => r.status === "available").length;
  const monthlyAdRevenue = state.adOrders.reduce((sum, o) => sum + o.collectedAmount, 0);
  const contentShareRevenue = state.contentAssets.reduce((sum, a) => sum + a.cumulativeRevenue, 0);
  const computeUsage = state.contentProjects.reduce((sum, p) => sum + p.computeUnitsUsed, 0);

  return tagDemo({
    todayProjects,
    weeklyPublished,
    inProduction,
    pendingReview,
    matrixAccountCount: state.matrixAccounts.length,
    activeAccounts,
    totalFollowers,
    todayPlays,
    monthlyTraffic,
    sellableResources,
    monthlyAdRevenue,
    contentShareRevenue,
    computeUsage,
  });
}

export async function reserveAdResource(resourceId) {
  await simulateLatency(300, 600);
  return repository.update((state) => ({
    ...state,
    adResources: state.adResources.map((r) =>
      r.resourceId === resourceId && r.status === "available" ? { ...r, status: "reserved" } : r
    ),
  }));
}

export async function advanceProjectStage(projectId, nextStage) {
  await simulateLatency(300, 600);
  return repository.update((state) => ({
    ...state,
    contentProjects: state.contentProjects.map((p) =>
      p.projectId === projectId ? { ...p, stage: nextStage } : p
    ),
  }));
}
