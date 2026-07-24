import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * 流量网络中心（阶段 Founder UX Review V4.1）。核心理念："流量不是
 * 一个池子，而是一张网络"——每个账号、达人、直播、内容资产、广告
 * 账户和运营者都是 AI Commerce Network 的一个节点。本模块负责
 * 组织、增长、分发、变现这张网络里的流量资源，不是简单的社媒账号
 * 管理工具。全部为演示数据，不连接任何真实平台，不执行真实账号
 * 管理/发布/广告投放。
 */

export const ACCOUNT_TYPES = [
  { key: "official_brand", label: "官方品牌账号", group: "official" },
  { key: "industry", label: "行业账号", group: "matrix" },
  { key: "category", label: "类目账号", group: "matrix" },
  { key: "operator", label: "运营者账号", group: "matrix" },
  { key: "short_drama", label: "短剧账号", group: "matrix" },
  { key: "ai_education", label: "AI教育账号", group: "matrix" },
  { key: "livestream", label: "直播账号", group: "matrix" },
  { key: "koc", label: "KOC账号", group: "creator" },
  { key: "creator", label: "达人账号", group: "creator" },
];

export function getAccountTypeLabel(key) {
  return ACCOUNT_TYPES.find((t) => t.key === key)?.label ?? key;
}

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name)?.id ?? null;
}

function seedAccounts() {
  return [
    {
      id: nextMockId("acct"), accountType: "official_brand", platform: "抖音", account: "AI Commerce OS 官方号",
      storeBinding: null, category: "品牌", followers: 128000, monthlyImpressions: 3200000,
      trafficQuality: "高", commercialValue: "高", growth: "+8.2%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "official_brand", platform: "小红书", account: "AI Commerce OS 品牌号",
      storeBinding: null, category: "品牌", followers: 46000, monthlyImpressions: 890000,
      trafficQuality: "高", commercialValue: "中", growth: "+5.1%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "industry", platform: "抖音", account: "电商经营干货铺",
      storeBinding: null, category: "行业资讯", followers: 65000, monthlyImpressions: 1450000,
      trafficQuality: "中", commercialValue: "中", growth: "+3.4%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "category", platform: "抖音", account: "防晒好物研究所",
      storeBinding: storeId("抖音店A"), category: "防晒服", followers: 38000, monthlyImpressions: 980000,
      trafficQuality: "高", commercialValue: "高", growth: "+12.6%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "category", platform: "小红书", account: "鞋服穿搭日记",
      storeBinding: storeId("淘宝店A"), category: "鞋服", followers: 22000, monthlyImpressions: 410000,
      trafficQuality: "中", commercialValue: "中", growth: "+2.1%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "operator", platform: "抖音", account: "抖音店A · 运营者账号",
      storeBinding: storeId("抖音店A"), category: "防晒服", followers: 15400, monthlyImpressions: 320000,
      trafficQuality: "中", commercialValue: "中", growth: "+6.0%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "operator", platform: "淘宝", account: "淘宝店A · 运营者账号",
      storeBinding: storeId("淘宝店A"), category: "鞋服", followers: 9800, monthlyImpressions: 180000,
      trafficQuality: "低", commercialValue: "低", growth: "-1.2%", risk: "中", status: "需关注",
    },
    {
      id: nextMockId("acct"), accountType: "short_drama", platform: "抖音", account: "AI短剧·打工女孩逆袭记",
      storeBinding: storeId("抖音店A"), category: "AI短剧", followers: 210000, monthlyImpressions: 5600000,
      trafficQuality: "高", commercialValue: "高", growth: "+34.5%", risk: "中", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "ai_education", platform: "视频号", account: "AI电商实战课堂",
      storeBinding: null, category: "AI教育", growth: "+9.8%", followers: 31000, monthlyImpressions: 560000,
      trafficQuality: "中", commercialValue: "中", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "livestream", platform: "抖音", account: "抖音店A · 直播账号",
      storeBinding: storeId("抖音店A"), category: "防晒服", followers: 15400, monthlyImpressions: 890000,
      trafficQuality: "高", commercialValue: "高", growth: "+7.4%", risk: "低", status: "运行中",
    },
    {
      id: nextMockId("acct"), accountType: "koc", platform: "小红书", account: "@小夏的夏日日常",
      storeBinding: storeId("抖音店A"), category: "防晒服", followers: 8200, monthlyImpressions: 145000,
      trafficQuality: "中", commercialValue: "中", growth: "+4.0%", risk: "低", status: "合作中",
    },
    {
      id: nextMockId("acct"), accountType: "koc", platform: "抖音", account: "@通勤穿搭研究员",
      storeBinding: storeId("淘宝店A"), category: "鞋服", followers: 12600, monthlyImpressions: 260000,
      trafficQuality: "中", commercialValue: "中", growth: "+1.8%", risk: "低", status: "合作中",
    },
    {
      id: nextMockId("acct"), accountType: "creator", platform: "抖音", account: "@测评师老陈",
      storeBinding: null, category: "综合测评", followers: 340000, monthlyImpressions: 8900000,
      trafficQuality: "高", commercialValue: "高", growth: "+15.2%", risk: "中", status: "洽谈中",
    },
  ];
}

function seedContentSupplyAssets() {
  const now = Date.now();
  return [
    {
      id: nextMockId("tasset"), name: "防晒衣通勤实测（母版）", assetType: "原创短视频",
      source: "内容中心 · 二创工作台", storeId: storeId("抖音店A"), category: "防晒服", product: "轻薄防晒衣 SKU-SUN-001",
      originalProject: "夏季防晒衣内容矩阵", originality: 92, authorization: "已授权（自有内容）",
      reuseCount: 4, distributedCount: 6, trafficGenerated: 128000, revenueGenerated: 2322,
      createdAt: new Date(now - 3 * 86400000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "AI短剧《打工女孩逆袭记》· 第3集切片", assetType: "AI短剧",
      source: "AI短剧项目", storeId: storeId("抖音店A"), category: "防晒服", product: "轻薄防晒衣 SKU-SUN-001",
      originalProject: "打工女孩逆袭记", originality: 88, authorization: "已授权（自有生产）",
      reuseCount: 9, distributedCount: 14, trafficGenerated: 560000, revenueGenerated: 8900,
      createdAt: new Date(now - 1 * 86400000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "防晒衣上身实测直播切片", assetType: "直播切片",
      source: "AI直播中心 · 直播复盘", storeId: storeId("抖音店A"), category: "防晒服", product: "轻薄防晒衣 SKU-SUN-001",
      originalProject: "直播切片二次分发", originality: 85, authorization: "已授权（自有内容）",
      reuseCount: 3, distributedCount: 5, trafficGenerated: 76000, revenueGenerated: 1450,
      createdAt: new Date(now - 20 * 3600000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "AI电商入门：三分钟看懂内容矩阵", assetType: "教育视频",
      source: "AI教育账号自制", storeId: null, category: "AI教育", product: null,
      originalProject: "AI电商实战课堂", originality: 95, authorization: "已授权（自有生产）",
      reuseCount: 2, distributedCount: 3, trafficGenerated: 34000, revenueGenerated: 0,
      createdAt: new Date(now - 5 * 86400000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "防晒衣产品演示图文", assetType: "图文资产",
      source: "内容中心 · 内容资产库", storeId: storeId("抖音店A"), category: "防晒服", product: "轻薄防晒衣 SKU-SUN-001",
      originalProject: "夏季防晒衣内容矩阵", originality: 90, authorization: "无需授权",
      reuseCount: 6, distributedCount: 8, trafficGenerated: 21000, revenueGenerated: 340,
      createdAt: new Date(now - 4 * 86400000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "男士皮鞋耐磨测评常见问题 FAQ", assetType: "FAQ视频",
      source: "内容中心 · 客服问题内容化", storeId: storeId("淘宝店A"), category: "鞋服", product: "男士休闲皮鞋 SKU-SHO-101",
      originalProject: "男士皮鞋测评专题", originality: 80, authorization: "无需授权",
      reuseCount: 1, distributedCount: 2, trafficGenerated: 8600, revenueGenerated: 120,
      createdAt: new Date(now - 12 * 3600000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "防晒衣广告创意·抖音信息流", assetType: "广告素材",
      source: "内容中心 · 渠道适配", storeId: storeId("抖音店A"), category: "防晒服", product: "轻薄防晒衣 SKU-SUN-001",
      originalProject: "直播切片二次分发", originality: 84, authorization: "无需授权",
      reuseCount: 5, distributedCount: 5, trafficGenerated: 96000, revenueGenerated: 3100,
      createdAt: new Date(now - 18 * 3600000).toISOString(),
    },
    {
      id: nextMockId("tasset"), name: "AI Commerce OS 品牌形象片", assetType: "品牌资产",
      source: "品牌手册", storeId: null, category: "品牌", product: null,
      originalProject: null, originality: 100, authorization: "已授权",
      reuseCount: 10, distributedCount: 12, trafficGenerated: 45000, revenueGenerated: 0,
      createdAt: new Date(now - 60 * 86400000).toISOString(),
    },
  ];
}

function seedShortDramas() {
  return [
    {
      id: nextMockId("drama"), title: "打工女孩逆袭记", storeId: storeId("抖音店A"), category: "防晒服",
      product: "轻薄防晒衣 SKU-SUN-001", totalEpisodes: 8, clipsProduced: 24, status: "连载中",
      totalTraffic: 5600000, totalRevenue: 8900,
      flow: ["AI 短剧生产", "多条切片", "流量网络", "运营者账号", "直播预热", "广告", "订单"],
    },
    {
      id: nextMockId("drama"), title: "退货率之谜：客服小美的一天", storeId: storeId("淘宝店A"), category: "鞋服",
      product: "男士休闲皮鞋 SKU-SHO-101", totalEpisodes: 4, clipsProduced: 10, status: "策划中",
      totalTraffic: 0, totalRevenue: 0,
      flow: ["AI 短剧生产", "多条切片", "流量网络", "运营者账号", "直播预热", "广告", "订单"],
    },
  ];
}

function seedDistributionRecords() {
  const now = Date.now();
  return [
    {
      id: nextMockId("dist"), motherAssetName: "防晒衣通勤实测（母版）",
      chain: ["原始内容", "渠道变体（抖音/小红书/视频号）", "官方账号", "矩阵账号（防晒好物研究所）", "运营者账号（抖音店A）", "直播预热", "广告", "订单"],
      distributedAt: new Date(now - 3 * 86400000).toISOString(), status: "已完成", trafficGenerated: 128000,
    },
    {
      id: nextMockId("dist"), motherAssetName: "AI短剧《打工女孩逆袭记》· 第3集切片",
      chain: ["原始内容", "渠道变体（抖音竖屏/视频号）", "官方账号", "矩阵账号（短剧账号）", "运营者账号（抖音店A）", "直播预热", "广告", "订单"],
      distributedAt: new Date(now - 1 * 86400000).toISOString(), status: "分发中", trafficGenerated: 560000,
    },
    {
      id: nextMockId("dist"), motherAssetName: "防晒衣上身实测直播切片",
      chain: ["原始内容", "渠道变体（抖音）", "矩阵账号（防晒好物研究所）", "运营者账号（抖音店A）", "广告"],
      distributedAt: new Date(now - 20 * 3600000).toISOString(), status: "已完成", trafficGenerated: 76000,
    },
  ];
}

function seedOperatorRecommendations() {
  return [
    {
      id: nextMockId("oprec"), assetName: "防晒衣通勤实测（母版）", assetType: "原创短视频",
      recommendedTo: "抖音店A · 运营者账号", reason: "商品直接匹配，历史 ROI 3.4", status: "待认领",
    },
    {
      id: nextMockId("oprec"), assetName: "AI短剧《打工女孩逆袭记》· 第3集切片", assetType: "AI短剧切片",
      recommendedTo: "抖音店A · 运营者账号", reason: "近 7 天流量增长 +34.5%，建议尽快复用", status: "待认领",
    },
    {
      id: nextMockId("oprec"), assetName: "男士皮鞋耐磨测评常见问题 FAQ", assetType: "FAQ视频",
      recommendedTo: "淘宝店A · 运营者账号", reason: "命中高频客服问题，可降低详情页跳出率", status: "已认领",
    },
    {
      id: nextMockId("oprec"), assetName: "秋冬家纺换季广告创意", assetType: "广告素材",
      recommendedTo: "淘宝店A · 运营者账号", reason: "秋冬类目趋势窗口期，建议提前布局", status: "待认领",
    },
  ];
}

function seedRevenueRecords() {
  return [
    { category: "广告收入", amountUsd: 1280, note: "官方账号 + 矩阵账号广告分成" },
    { category: "流量分发收入", amountUsd: 640, note: "分发给运营者账号的流量服务费" },
    { category: "内容授权收入", amountUsd: 210, note: "AI短剧片段授权给第三方复用" },
    { category: "官方账号推广收入", amountUsd: 380, note: "品牌合作推广位" },
    { category: "矩阵账号推广收入", amountUsd: 190, note: "类目账号广告位" },
    { category: "达人合作收入", amountUsd: 460, note: "KOC/达人带货分成" },
    { category: "品牌campaign收入", amountUsd: 520, note: "品牌联合活动" },
    { category: "运营者服务收入", amountUsd: 150, note: "运营者账号增值服务" },
    { category: "流量服务费", amountUsd: 95, note: "跨店铺流量调配服务费" },
  ];
}

function seedNetworkAnalytics() {
  return {
    trafficSources: [
      { source: "官方账号", share: 28 }, { source: "矩阵账号", share: 34 }, { source: "达人/KOC", share: 18 },
      { source: "广告投放", share: 12 }, { source: "自然搜索", share: 8 },
    ],
    trafficDestinations: [
      { destination: "商品详情页", share: 40 }, { destination: "直播间", share: 32 },
      { destination: "店铺主页", share: 18 }, { destination: "广告落地页", share: 10 },
    ],
    platformDistribution: [
      { platform: "抖音", share: 52 }, { platform: "小红书", share: 24 }, { platform: "视频号", share: 14 }, { platform: "淘宝", share: 10 },
    ],
    topAccounts: ["防晒好物研究所", "AI短剧·打工女孩逆袭记", "AI Commerce OS 官方号"],
    topContent: ["防晒衣通勤实测（母版）", "防晒衣上身实测直播切片"],
    topShortDramas: ["打工女孩逆袭记"],
    trafficToOrderConversion: "3.8%",
    trafficToLiveConversion: "11.2%",
    trafficToAdConversion: "6.5%",
    trafficRoi: 3.6,
  };
}

const repository = createLocalRepository("trafficNetwork.state", () => ({
  accounts: seedAccounts(),
  contentSupplyAssets: seedContentSupplyAssets(),
  shortDramas: seedShortDramas(),
  distributionRecords: seedDistributionRecords(),
  operatorRecommendations: seedOperatorRecommendations(),
  revenueRecords: seedRevenueRecords(),
}));

export function getTrafficNetworkState() {
  return repository.get();
}

export function getNetworkAnalytics() {
  return seedNetworkAnalytics();
}

export function getTrafficOverviewStats() {
  const { accounts, contentSupplyAssets, distributionRecords, revenueRecords } = repository.get();
  const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);
  const totalImpressions = accounts.reduce((sum, a) => sum + a.monthlyImpressions, 0);
  const totalAdRevenue = revenueRecords.find((r) => r.category === "广告收入")?.amountUsd ?? 0;
  const totalLicenseRevenue = revenueRecords.find((r) => r.category === "内容授权收入")?.amountUsd ?? 0;
  return {
    totalAccounts: accounts.length,
    totalFollowers,
    monthlyImpressions: totalImpressions,
    monthlyOrganicTraffic: Math.round(totalImpressions * 0.62),
    monthlyPaidTraffic: Math.round(totalImpressions * 0.22),
    monthlyLiveTraffic: Math.round(totalImpressions * 0.16),
    contentSuppliedThisWeek: contentSupplyAssets.length,
    trafficDistributedThisWeek: distributionRecords.length,
    operatorsReceivingTraffic: new Set(accounts.filter((a) => a.accountType === "operator").map((a) => a.storeBinding)).size,
    advertisingRevenueUsd: totalAdRevenue,
    contentLicensingRevenueUsd: totalLicenseRevenue,
    trafficUtilization: "76%",
    topPerformingAccounts: [...accounts].sort((a, b) => b.monthlyImpressions - a.monthlyImpressions).slice(0, 3).map((a) => a.account),
  };
}

export function getTrafficAiRecommendations() {
  return [
    { id: "trec-1", label: "建议加大投入的账号", detail: "「防晒好物研究所」增长 +12.6%，建议追加内容供给", targetSubView: "matrix" },
    { id: "trec-2", label: "建议推荐给运营者的资产", detail: "「打工女孩逆袭记」第3集切片近7天流量暴涨，建议立即推荐", targetSubView: "operators" },
    { id: "trec-3", label: "建议关注的账号", detail: "「淘宝店A · 运营者账号」流量下滑 -1.2%，建议补充内容", targetSubView: "matrix" },
    { id: "trec-4", label: "建议洽谈的达人合作", detail: "「@测评师老陈」商业价值高，建议尽快推进合作", targetSubView: "creators" },
    { id: "trec-5", label: "建议扩展的短剧项目", detail: "「打工女孩逆袭记」表现优异，建议规划下一部短剧", targetSubView: "supply" },
  ];
}

export function claimOperatorRecommendation(id) {
  return repository.update((state) => ({
    ...state,
    operatorRecommendations: state.operatorRecommendations.map((r) => (r.id === id ? { ...r, status: "已认领" } : r)),
  }));
}

export async function distributeAsset(assetId, targetAccountIds) {
  await simulateLatency(500, 1000);
  return repository.update((state) => ({
    ...state,
    contentSupplyAssets: state.contentSupplyAssets.map((a) =>
      a.id === assetId ? { ...a, distributedCount: a.distributedCount + targetAccountIds.length } : a
    ),
    distributionRecords: [
      {
        id: nextMockId("dist"),
        motherAssetName: state.contentSupplyAssets.find((a) => a.id === assetId)?.name ?? "未知资产",
        chain: ["原始内容", "渠道变体", "官方账号", "矩阵账号", "运营者账号", "直播预热", "广告", "订单"],
        distributedAt: new Date().toISOString(),
        status: "分发中",
        trafficGenerated: 0,
      },
      ...state.distributionRecords,
    ],
  }));
}
