export const CHART_COLORS = ["#16171a", "#54565f", "#8b8d96", "#c3c4cb", "#e3e4e8"];

export function computeDonutSegments(segments) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  return segments.map((segment, index) => {
    const pct = total > 0 ? (segment.value / total) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return {
      ...segment,
      pct,
      start,
      end: cursor,
      color: segment.color ?? CHART_COLORS[index % CHART_COLORS.length],
    };
  });
}

export function groupCountsByKey(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildShopSalesSegments(shops) {
  return shops.map((shop) => ({
    name: shop.name ?? shop.shop_name,
    value: shop.todaySales ?? 0,
  }));
}
