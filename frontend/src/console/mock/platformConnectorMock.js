import { createLocalRepository, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * 统一平台连接器（阶段 Founder UX Review V4，P0-35）。所有模块
 * 共用同一份"店铺-平台连接"，不在商品中心/内容中心/直播中心/
 * 广告中心/订单中心/客服中心里各自维护一份平台授权记录。
 *
 * 关系：店铺中心 → 统一平台连接器 → 能力矩阵。
 * 本文件的所有连接状态均为演示数据，不代表任何真实平台授权。
 */

export const CAPABILITIES = [
  { key: "product", label: "商品能力" },
  { key: "content_publish", label: "内容发布能力" },
  { key: "live_create", label: "直播创建能力" },
  { key: "live_control", label: "直播控制能力" },
  { key: "ad_placement", label: "广告投放能力" },
  { key: "order_sync", label: "订单同步能力" },
  { key: "after_sales", label: "售后处理能力" },
  { key: "data_callback", label: "数据回传能力" },
];

export const CAPABILITY_STATUSES = [
  { key: "connected", label: "已连接", tone: "success" },
  { key: "partial", label: "部分支持", tone: "warning" },
  { key: "pending_auth", label: "待授权", tone: "warning" },
  { key: "error", label: "异常", tone: "danger" },
  { key: "unsupported", label: "不支持", tone: "neutral" },
  { key: "mock_mode", label: "Mock模式", tone: "info" },
];

export function getCapabilityStatusLabel(key) {
  return CAPABILITY_STATUSES.find((s) => s.key === key)?.label ?? key;
}
export function getCapabilityStatusTone(key) {
  return CAPABILITY_STATUSES.find((s) => s.key === key)?.tone ?? "neutral";
}

function seedMatrixFor(store) {
  const templates = {
    "抖音店A": {
      product: "connected", content_publish: "mock_mode", live_create: "pending_auth", live_control: "pending_auth",
      ad_placement: "connected", order_sync: "connected", after_sales: "partial", data_callback: "mock_mode",
    },
    "淘宝店A": {
      product: "connected", content_publish: "partial", live_create: "mock_mode", live_control: "unsupported",
      ad_placement: "connected", order_sync: "connected", after_sales: "connected", data_callback: "partial",
    },
    "小红书店A": {
      product: "partial", content_publish: "mock_mode", live_create: "pending_auth", live_control: "unsupported",
      ad_placement: "pending_auth", order_sync: "partial", after_sales: "pending_auth", data_callback: "mock_mode",
    },
  };
  const statusMap = templates[store.name] ?? {};
  return {
    storeId: store.id,
    storeName: store.name,
    platform: store.platform,
    account: `${store.name} · 官方账号`,
    authorizationStatus: Object.values(statusMap).includes("error") ? "部分异常" : "已授权（演示）",
    lastSyncAt: new Date(Date.now() - Math.floor(Math.random() * 6 + 1) * 3600000).toISOString(),
    capabilities: Object.fromEntries(
      CAPABILITIES.map((c) => [
        c.key,
        {
          status: statusMap[c.key] ?? "mock_mode",
          accessMode: statusMap[c.key] === "connected" ? "官方API" : statusMap[c.key] === "partial" ? "官方API（部分接口）" : "Mock模式",
          risk: statusMap[c.key] === "error" ? "高" : statusMap[c.key] === "pending_auth" ? "中" : "低",
          error: statusMap[c.key] === "error" ? "授权凭证已过期" : null,
        },
      ])
    ),
  };
}

const repository = createLocalRepository("platformConnector.state", () => ({
  matrix: DEMO_STORES.map(seedMatrixFor),
}));

export function getPlatformConnectorState() {
  return repository.get();
}

export function getStoreCapabilityMatrix(storeId) {
  return repository.get().matrix.find((m) => m.storeId === storeId) ?? null;
}

export async function simulateReconnect(storeId, capabilityKey) {
  await simulateLatency(500, 1000);
  return repository.update((state) => ({
    ...state,
    matrix: state.matrix.map((m) =>
      m.storeId === storeId
        ? {
            ...m,
            lastSyncAt: new Date().toISOString(),
            capabilities: {
              ...m.capabilities,
              [capabilityKey]: { ...m.capabilities[capabilityKey], status: "connected", error: null, risk: "低" },
            },
          }
        : m
    ),
  }));
}
