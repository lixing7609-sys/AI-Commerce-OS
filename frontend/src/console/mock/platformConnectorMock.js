import { createLocalRepository, simulateLatency } from "./mockUtils.js";

/**
 * 店铺级平台连接器（阶段：Founder Store Center IA 精修）。
 *
 * 意图层级：
 *   Operator / 主体 → 店铺 → 电商平台 → 平台账号 → 授权 →
 *   平台连接器 → 连接器任务 → 执行日志
 *
 * 之前版本把"统一平台连接器"做成店铺中心顶部一个独立面板，一次性
 * 平铺展示所有店铺的连接状态——但凭据、健康度、同步状态和支持的
 * 能力天然是"这一个店铺连的这一个平台账号"的属性，不应该脱离具体
 * 店铺单独存在。现在改为按真实店铺 id（来自 services/shopApi.js
 * 的 getShop()，不是本文件自己的店铺列表）懒加载/生成，每个店铺
 * 各自持有自己的连接器记录，互不共享。
 *
 * 边界：本文件只负责"连接器"本身（类型/版本/健康度/能力矩阵/
 * 同步状态）；账号身份、授权方式、凭据是否已配置、上次测试结果
 * 属于「链接与授权」，由调用方直接读取真实 shop.auth_type /
 * shop.connection_status / shop.last_connection_test_status，本文件
 * 不重复保存一份凭据或授权状态，只在展示时引用。
 *
 * 所有数据均为原型/模拟数据，不代表任何真实平台账号或真实 API 集成。
 */

export const CAPABILITIES = [
  { key: "product_read", label: "商品读取" },
  { key: "product_publish", label: "商品发布" },
  { key: "inventory_read", label: "库存读取" },
  { key: "inventory_update", label: "库存更新" },
  { key: "order_read", label: "订单读取" },
  { key: "fulfillment_callback", label: "发货回传" },
  { key: "after_sales_read", label: "售后读取" },
  { key: "customer_message", label: "客服消息" },
  { key: "content_publish", label: "内容发布" },
  { key: "ad_data", label: "广告数据" },
  { key: "data_report", label: "数据报表" },
  { key: "webhook", label: "Webhook" },
];

export const CAPABILITY_STATUSES = [
  { key: "supported", label: "已支持", tone: "success" },
  { key: "read_only", label: "只读", tone: "info" },
  { key: "pending_integration", label: "待接入", tone: "warning" },
  { key: "unauthorized", label: "未授权", tone: "warning" },
  { key: "unsupported", label: "平台不支持", tone: "neutral" },
  { key: "mock", label: "模拟能力", tone: "info" },
];

export function getCapabilityStatusLabel(key) {
  return CAPABILITY_STATUSES.find((s) => s.key === key)?.label ?? key;
}
export function getCapabilityStatusTone(key) {
  return CAPABILITY_STATUSES.find((s) => s.key === key)?.tone ?? "neutral";
}

const CONNECTOR_TYPE_BY_PLATFORM = {
  douyin: { connectorType: "巨量百应 / 店铺开放平台", accountSuffix: "抖音开放平台账号" },
  kuaishou: { connectorType: "快手小店开放平台", accountSuffix: "快手开放平台账号" },
  taobao: { connectorType: "阿里开放平台（淘宝）", accountSuffix: "淘宝卖家账号" },
  tmall: { connectorType: "阿里开放平台（天猫）", accountSuffix: "天猫卖家账号" },
  jd: { connectorType: "京东开放平台", accountSuffix: "京东商家账号" },
  pinduoduo: { connectorType: "拼多多开放平台", accountSuffix: "拼多多商家账号" },
  xiaohongshu: { connectorType: "小红书开放平台", accountSuffix: "小红书商家账号" },
  wechat_shop: { connectorType: "视频号小店开放平台", accountSuffix: "视频号小店账号" },
  amazon: { connectorType: "Amazon SP-API", accountSuffix: "Amazon Seller 账号" },
  shopee: { connectorType: "Shopee Open Platform", accountSuffix: "Shopee 卖家账号" },
  other: { connectorType: "通用连接器框架", accountSuffix: "平台账号" },
};

/**
 * 5 组"连贯但不同"的演示场景（阶段要求：不能让所有店铺看起来共用
 * 一份连接器记录），按店铺 id 的确定性哈希轮转选择——同一个店铺
 * id 每次都得到同一个场景，不随机抖动。
 */
const SCENARIOS = [
  {
    key: "healthy",
    connectionStatus: "connected",
    healthStatus: "healthy",
    integrationMode: "api",
    environment: "sandbox",
    capabilityBias: "mostly_supported",
    freshnessHoursAgo: 0.3,
    failureHoursAgo: null,
    rateLimitState: "normal",
    warning: null,
  },
  {
    key: "expiring_soon",
    connectionStatus: "connected",
    healthStatus: "warning",
    integrationMode: "api",
    environment: "sandbox",
    capabilityBias: "mostly_supported",
    freshnessHoursAgo: 2,
    failureHoursAgo: null,
    rateLimitState: "normal",
    warning: "授权即将到期，建议提前在「链接与授权」完成续期",
  },
  {
    key: "partial",
    connectionStatus: "connected",
    healthStatus: "warning",
    integrationMode: "hybrid",
    environment: "sandbox",
    capabilityBias: "partial",
    freshnessHoursAgo: 6,
    failureHoursAgo: 30,
    rateLimitState: "normal",
    warning: "该平台部分能力仅支持只读或尚未开放",
  },
  {
    key: "awaiting_integration",
    connectionStatus: "connected",
    healthStatus: "unknown",
    integrationMode: "mock",
    environment: "mock",
    capabilityBias: "mostly_mock",
    freshnessHoursAgo: null,
    failureHoursAgo: null,
    rateLimitState: "unknown",
    warning: "该平台连接器仍以模拟能力为主，真实 API 对接尚未完成",
  },
  {
    key: "sync_warning",
    connectionStatus: "connected",
    healthStatus: "warning",
    integrationMode: "api",
    environment: "sandbox",
    capabilityBias: "mostly_supported",
    freshnessHoursAgo: 18,
    failureHoursAgo: 1,
    rateLimitState: "throttled",
    warning: "最近一次同步失败，且当前处于限流状态",
  },
];

function hashStoreId(storeId) {
  const str = String(storeId);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function capabilityStatusFor(bias, index) {
  // 确定性但不单调——同一个 bias 下让不同能力呈现不同状态，而不是
  // 12 个能力清一色同一个状态，更接近真实连接器的参差状态。
  const cycles = {
    mostly_supported: ["supported", "supported", "supported", "read_only", "supported", "supported"],
    partial: ["supported", "read_only", "unsupported", "pending_integration", "supported", "read_only"],
    mostly_mock: ["mock", "mock", "pending_integration", "mock", "unauthorized", "mock"],
  };
  const cycle = cycles[bias] ?? cycles.mostly_supported;
  return cycle[index % cycle.length];
}

function seedConnectorFor(shop) {
  const scenario = SCENARIOS[hashStoreId(shop.id) % SCENARIOS.length];
  const platformMeta = CONNECTOR_TYPE_BY_PLATFORM[shop.platform] ?? CONNECTOR_TYPE_BY_PLATFORM.other;
  const now = Date.now();

  const grantedCapabilities = Object.fromEntries(
    CAPABILITIES.map((cap, index) => [cap.key, capabilityStatusFor(scenario.capabilityBias, index)])
  );

  return {
    connectorId: `connector-${shop.id}`,
    storeId: shop.id,
    platform: shop.platform,
    connectorType: platformMeta.connectorType,
    connectorVersion: "v1.4.0-demo",
    integrationMode: scenario.integrationMode, // "api" | "hybrid" | "mock"
    accountLabel: `${shop.shop_name ?? shop.name ?? shop.id} · ${platformMeta.accountSuffix}`,
    connectionStatus: scenario.connectionStatus, // 连接器自身连接状态（不等同于「链接与授权」的账号授权状态）
    healthStatus: scenario.healthStatus, // "healthy" | "warning" | "error" | "unknown"
    supportedCapabilities: CAPABILITIES.map((c) => c.key),
    grantedCapabilities,
    webhookStatus: scenario.integrationMode === "mock" ? "mock" : scenario.rateLimitState === "throttled" ? "degraded" : "active",
    lastSuccessfulSyncAt: scenario.freshnessHoursAgo == null ? null : new Date(now - scenario.freshnessHoursAgo * 3600000).toISOString(),
    lastFailedSyncAt: scenario.failureHoursAgo == null ? null : new Date(now - scenario.failureHoursAgo * 3600000).toISOString(),
    lastHealthCheckAt: new Date(now - 5 * 60000).toISOString(),
    dataFreshness: scenario.freshnessHoursAgo == null ? "unknown" : scenario.freshnessHoursAgo < 1 ? "fresh" : scenario.freshnessHoursAgo < 12 ? "delayed" : "stale",
    rateLimitState: scenario.rateLimitState, // "normal" | "throttled" | "unknown"
    retryPolicy: { autoRetry: scenario.integrationMode !== "mock", maxRetries: 3, backoffSeconds: 30 },
    environment: scenario.environment, // "sandbox" | "mock"
    isLive: false,
    warning: scenario.warning,
    scenarioKey: scenario.key,
  };
}

const repository = createLocalRepository("platformConnector.state", () => ({ records: {} }));

/**
 * $1 = 真实店铺对象（来自 services/shopApi.js 的 getShop()/getShops()，
 * 至少需要 { id, platform }）。同一个店铺 id 每次返回同一份记录
 * （懒加载并持久化），不同店铺互不影响、不跨租户共享。
 */
export function getStoreConnectorState(shop) {
  if (!shop || shop.id == null) return null;
  const key = String(shop.id);
  const existing = repository.get().records[key];
  if (existing) return existing;
  const seeded = seedConnectorFor(shop);
  repository.update((state) => ({
    ...state,
    records: { ...state.records, [key]: seeded },
  }));
  return seeded;
}

export async function simulateTestConnection(storeId) {
  await simulateLatency(500, 900);
  const key = String(storeId);
  return repository.update((state) => {
    const record = state.records[key];
    if (!record) return state;
    return {
      ...state,
      records: {
        ...state.records,
        [key]: { ...record, healthStatus: "healthy", lastHealthCheckAt: new Date().toISOString(), warning: null },
      },
    };
  }).records[key];
}

export async function simulateReconnect(storeId, capabilityKey) {
  await simulateLatency(500, 1000);
  const key = String(storeId);
  return repository.update((state) => {
    const record = state.records[key];
    if (!record) return state;
    return {
      ...state,
      records: {
        ...state.records,
        [key]: {
          ...record,
          lastSuccessfulSyncAt: new Date().toISOString(),
          grantedCapabilities: { ...record.grantedCapabilities, [capabilityKey]: "supported" },
        },
      },
    };
  }).records[key];
}
