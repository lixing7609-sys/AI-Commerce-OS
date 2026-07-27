export function formatDateTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString("zh-CN");
}

export function formatMoney(value) {
  return `¥${Number(value ?? 0).toLocaleString("zh-CN")}`;
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("zh-CN");
}
