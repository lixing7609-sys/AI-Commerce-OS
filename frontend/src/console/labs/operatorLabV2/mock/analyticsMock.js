import { tagDemo } from "../../../mock/mockUtils.js";
import { DEMO_STORES } from "../../../mock/storesMock.js";

/**
 * Operator 实验室"数据与经营分析"模块的演示数据（阶段 Founder
 * Full-System v3 Batch 2 §C，之前不存在这个模块，从零新建）。
 * 按店铺 + 时间范围筛选后重新计算，不是一份写死不变的静态图表。
 */

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildTrendForStore(storeSeed, days) {
  const trend = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86400000);
    const base = 2000 + storeSeed * 800;
    const noise = seededRandom(storeSeed * 1000 + i) * base * 0.6;
    trend.push({
      date: date.toISOString().slice(0, 10),
      gmv: Math.round(base + noise),
      orders: Math.round((base + noise) / 68),
    });
  }
  return trend;
}

export function getAnalyticsSummary({ storeId = "all", range = "7d" } = {}) {
  const days = RANGE_DAYS[range] ?? 7;
  const stores = storeId === "all" ? DEMO_STORES : DEMO_STORES.filter((s) => s.id === storeId);

  if (stores.length === 0) {
    return tagDemo({
      range,
      storeId,
      gmvTrend: [],
      totalGmv: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      channelBreakdown: [],
      topProducts: [],
      conversionRate: 0,
      customerRepeatRate: 0,
    });
  }

  const perStoreTrends = stores.map((s, idx) => buildTrendForStore(idx + 1, days));
  const gmvTrend = perStoreTrends[0].map((_, dayIdx) => {
    const date = perStoreTrends[0][dayIdx].date;
    const gmv = perStoreTrends.reduce((sum, trend) => sum + trend[dayIdx].gmv, 0);
    const orders = perStoreTrends.reduce((sum, trend) => sum + trend[dayIdx].orders, 0);
    return { date, gmv, orders };
  });

  const totalGmv = gmvTrend.reduce((sum, d) => sum + d.gmv, 0);
  const totalOrders = gmvTrend.reduce((sum, d) => sum + d.orders, 0);

  const channelBreakdown = stores.map((s, idx) => {
    const storeGmv = perStoreTrends[idx].reduce((sum, d) => sum + d.gmv, 0);
    const storeOrders = perStoreTrends[idx].reduce((sum, d) => sum + d.orders, 0);
    return {
      storeId: s.id,
      storeName: s.name,
      platform: s.platform,
      gmv: storeGmv,
      orders: storeOrders,
      avgOrderValue: storeOrders > 0 ? Math.round(storeGmv / storeOrders) : 0,
      share: totalGmv > 0 ? storeGmv / totalGmv : 0,
    };
  });

  const topProducts = [
    { name: "夏季轻薄防晒衣", sku: "SKU-SUN-001", sales: Math.round(320 * (totalGmv / (totalGmv || 1))), gmv: Math.round(totalGmv * 0.18) },
    { name: "LED灯带套装 3米", sku: "SKU-LED-005", sales: Math.round(210), gmv: Math.round(totalGmv * 0.12) },
    { name: "夏季百搭帆布鞋", sku: "SKU-SHO-004", sales: Math.round(140), gmv: Math.round(totalGmv * 0.09) },
  ];

  return tagDemo({
    range,
    storeId,
    gmvTrend,
    totalGmv,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? Math.round(totalGmv / totalOrders) : 0,
    channelBreakdown,
    topProducts,
    conversionRate: 0.032 + seededRandom(days) * 0.01,
    customerRepeatRate: 0.21 + seededRandom(days + 1) * 0.05,
  });
}
