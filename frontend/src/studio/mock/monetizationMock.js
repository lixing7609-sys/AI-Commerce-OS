import { createLocalRepository, simulateLatency, tagDemo } from "../../shared/localRepository.js";
import { getStudioState } from "./studioMock.js";
import { getGraphicContentState } from "./graphicContentMock.js";

/**
 * 商业变现中心的 Mock 数据层（阶段：Studio V3 Integration §十七 +
 * 补充§十）。覆盖五大变现类别（平台内容分成/品牌合作与广告订单/
 * 带货与直播佣金/知识产品/版权与IP授权）+ 图文专属收入类型，并提供
 * 单项目损益（ProjectEconomics：收入/模型成本/广告成本/人工成本
 * 占位/毛利/ROI）。人民币展示方式沿用 V3 原型（formatMoney）。
 */

function seedPlatformShare() {
  return [
    { settlementId: "settle-1", platform: "红果短剧", period: "2026-07", grossRevenue: 28600, platformFee: 4300, netRevenue: 24300, status: "settled" },
    { settlementId: "settle-2", platform: "番茄小说", period: "2026-07", grossRevenue: 6200, platformFee: 900, netRevenue: 5300, status: "settled" },
    { settlementId: "settle-3", platform: "B站创作激励", period: "2026-07", grossRevenue: 3800, platformFee: 0, netRevenue: 3800, status: "settled" },
    { settlementId: "settle-4", platform: "视频号", period: "2026-07", grossRevenue: 5100, platformFee: 500, netRevenue: 4600, status: "partially_settled" },
    { settlementId: "settle-5", platform: "YouTube", period: "2026-07", grossRevenue: 1900, platformFee: 380, netRevenue: 1520, status: "pending" },
  ];
}

function seedBrandDeals() {
  return [
    { dealId: "deal-1", brandName: "某美妆品牌方", projectId: "proj-2", stage: "执行中", contractAmount: 38000, collectedAmount: 19000, deliverable: "红果短剧植入 + 抖音预热短视频 2 条", deadline: "2026-08-10", contact: "市场部 · 王经理" },
    { dealId: "deal-2", brandName: "LightOS 品牌方", projectId: "gproj-2", stage: "执行中", contractAmount: 12000, collectedAmount: 12000, deliverable: "小红书图文 3 篇 + 商品种草长图 1 篇", deadline: "2026-08-02", contact: "品牌方 · 内部合作" },
    { dealId: "deal-3", brandName: "某快消品牌方", projectId: "proj-9", stage: "待报价", contractAmount: 0, collectedAmount: 0, deliverable: "视频号日更植入 + 直播切片", deadline: "2026-08-20", contact: "市场部 · 李总监" },
    { dealId: "deal-4", brandName: "跨境贸易联盟", projectId: null, stage: "待报价", contractAmount: 0, collectedAmount: 0, deliverable: "行业分析图文专栏合作", deadline: "2026-09-01", contact: "商务合作邮箱" },
  ];
}

function seedLiveCommerce() {
  return [
    { sessionId: "livecom-1", name: "星辰家居双十一好物直播", platform: "抖音", gmv: 286000, commissionRate: 0.11, commission: 31460, orders: 1840, viewers: 42000, projectId: "proj-2" },
    { sessionId: "livecom-2", name: "LightOS 灯光改造专场直播", platform: "抖音", gmv: 96000, commissionRate: 0.09, commission: 8640, orders: 620, viewers: 18000, projectId: "proj-8" },
  ];
}

function seedKnowledgeProducts() {
  return [
    { productId: "know-1", name: "《AI一人公司实操课》", type: "课程", price: 299, sold: 186, revenue: 55614, ipId: "ip-6" },
    { productId: "know-2", name: "AI一人公司观察｜付费社群", type: "社群", price: 99, sold: 320, revenue: 31680, ipId: "ip-6" },
    { productId: "know-3", name: "红果爆款结构模板 V4", type: "数字模板", price: 59, sold: 410, revenue: 24190, ipId: "ip-1" },
    { productId: "know-4", name: "《一人公司工作流手册》", type: "电子书", price: 39, sold: 260, revenue: 10140, ipId: "ip-6" },
  ];
}

function seedIpLicensing() {
  return [
    { licenseId: "ipl-1", name: "《重生豪门》剧本二创授权", type: "剧本授权", licensee: "某短剧平台方", amount: 12000, status: "已签约", ipId: "ip-1" },
    { licenseId: "ipl-2", name: "《重生后我接管了老板的公司》角色形象授权", type: "角色授权", licensee: "周边厂商", amount: 8600, status: "洽谈中", ipId: "ip-4" },
    { licenseId: "ipl-3", name: "AI一人公司观察 内容版权海外授权", type: "海外授权", licensee: "海外内容分发平台", amount: 4200, status: "已签约", ipId: "ip-6" },
  ];
}

function seedProjectEconomics() {
  return [
    { projectId: "proj-1", revenue: 36800, modelCost: 6200, adCost: 2400, laborCostPlaceholder: 0, grossProfit: 28200, roi: 4.28, pendingSettlement: 8600, settled: 28200 },
    { projectId: "proj-8", revenue: 28400, modelCost: 5100, adCost: 2200, laborCostPlaceholder: 0, grossProfit: 21100, roi: 3.89, pendingSettlement: 6400, settled: 22000 },
    { projectId: "proj-9", revenue: 24600, modelCost: 4200, adCost: 1700, laborCostPlaceholder: 0, grossProfit: 18700, roi: 4.17, pendingSettlement: 3200, settled: 21400 },
    { projectId: "gproj-2", revenue: 13800, modelCost: 300, adCost: 400, laborCostPlaceholder: 0, grossProfit: 13100, roi: 33.6, pendingSettlement: 4200, settled: 9600 },
    { projectId: "gproj-1", revenue: 2500, modelCost: 500, adCost: 0, laborCostPlaceholder: 0, grossProfit: 2000, roi: 4.0, pendingSettlement: 640, settled: 1860 },
  ];
}

const repository = createLocalRepository("studio.monetization", () => ({
  platformShare: seedPlatformShare(),
  brandDeals: seedBrandDeals(),
  liveCommerce: seedLiveCommerce(),
  knowledgeProducts: seedKnowledgeProducts(),
  ipLicensing: seedIpLicensing(),
  projectEconomics: seedProjectEconomics(),
}));

export function getMonetizationState() {
  return tagDemo(repository.get());
}

/**
 * 商业变现中心总览——汇总五大类 + 图文收入，来自 studioMock（视频/
 * 短剧/矩阵广告收入）、graphicContentMock（图文收入）与本文件自身
 * 的品牌合作/带货/知识产品/版权数据，不是重复维护的另一份数字。
 */
export function getMonetizationOverview() {
  const { adOrders, contentAssets } = getStudioState();
  const { revenue: graphicRevenue } = getGraphicContentState();
  const { platformShare, brandDeals, liveCommerce, knowledgeProducts, ipLicensing } = repository.get();

  const platformShareRevenue = platformShare.reduce((sum, s) => sum + s.netRevenue, 0)
    + contentAssets.reduce((sum, a) => sum + a.cumulativeRevenue, 0);
  const brandDealRevenue = brandDeals.reduce((sum, d) => sum + d.collectedAmount, 0)
    + adOrders.reduce((sum, o) => sum + o.collectedAmount, 0);
  const liveCommerceRevenue = liveCommerce.reduce((sum, l) => sum + l.commission, 0);
  const knowledgeRevenue = knowledgeProducts.reduce((sum, k) => sum + k.revenue, 0);
  const ipLicensingRevenue = ipLicensing.filter((l) => l.status === "已签约").reduce((sum, l) => sum + l.amount, 0);
  const graphicTotalRevenue = graphicRevenue.reduce((sum, g) => sum + g.revenue, 0);
  const graphicTotalCost = graphicRevenue.reduce((sum, g) => sum + g.generationCost + g.imageCost + g.distributionCost + g.adCost, 0);

  const totalRevenue = platformShareRevenue + brandDealRevenue + liveCommerceRevenue + knowledgeRevenue + ipLicensingRevenue + graphicTotalRevenue;
  const productionCost = 34560 + graphicTotalCost;
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - productionCost) / totalRevenue) * 100 : 0;

  return tagDemo({
    totalRevenue, platformShareRevenue, brandDealRevenue, liveCommerceRevenue,
    knowledgeRevenue, ipLicensingRevenue, graphicTotalRevenue, productionCost, grossMargin,
  });
}

export async function updateBrandDealStage(dealId, stage) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    brandDeals: state.brandDeals.map((d) => (d.dealId === dealId ? { ...d, stage } : d)),
  }));
}
