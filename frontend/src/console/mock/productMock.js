import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";
import { DEMO_STORES } from "./storesMock.js";

/**
 * 商品中心演示数据（阶段 Founder UX Review V3，P0-6/P0-7 修订：
 * 店铺 → 类目 → 商品三层结构，不再是不区分店铺的全局列表）。
 * storeId 取自 storesMock.js 的演示店铺，category 是该店铺下的
 * 二级类目，两者共同构成商品的层级归属。
 */

const STATUS_LABELS = {
  draft: "草稿",
  active: "已发布",
  out_of_stock: "缺货",
};

export const PRODUCT_STATUSES = Object.keys(STATUS_LABELS);

export function getProductStatusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export const PUBLISH_PLATFORMS = [
  { key: "douyin", label: "抖音" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "taobao", label: "淘宝" },
  { key: "shopify", label: "Shopify" },
  { key: "amazon", label: "Amazon" },
];

const PUBLISH_STATUS_LABELS = {
  not_configured: "未配置",
  draft: "草稿",
  ready: "待发布",
  publishing: "发布中",
  published: "已发布",
  failed: "发布失败",
};

export function getPublishStatusLabel(status) {
  return PUBLISH_STATUS_LABELS[status] ?? status;
}

/**
 * 每个平台独立维护自己的发布状态/发布时间/平台商品 ID/失败原因
 * ——发布到一个平台绝不会连带把其它平台标记为已发布（阶段 V3
 * P0-7 明确要求）。
 */
function defaultPublishStatus() {
  return Object.fromEntries(
    PUBLISH_PLATFORMS.map((p) => [
      p.key,
      { status: "not_configured", publishedAt: null, platformProductId: null, failureReason: null },
    ])
  );
}

function storeId(name) {
  return DEMO_STORES.find((s) => s.name === name).id;
}

function seedProducts() {
  return [
    // ---- 抖音店A：防晒服 / 鞋服 / 家居 / LED电工 ----
    {
      id: nextMockId("prod"),
      title: "夏季轻薄防晒衣",
      sku: "SKU-SUN-001",
      storeId: storeId("抖音店A"),
      category: "防晒服",
      price: 129,
      cost: 48,
      stock: 320,
      status: "active",
      publishStatus: {
        ...defaultPublishStatus(),
        douyin: { status: "published", publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(), platformProductId: "DY-7712349001", failureReason: null },
        taobao: { status: "published", publishedAt: new Date(Date.now() - 4 * 86400000).toISOString(), platformProductId: "TB-889213", failureReason: null },
      },
      lastSyncedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      aiContent: {
        title: "夏日清凉防晒衣，UPF50+ 专业防护",
        description: "轻薄透气面料，长效防晒，出行必备。",
        generatedAt: new Date(Date.now() - 86400000).toISOString(),
        generatedBy: "产品 Agent",
        version: 1,
      },
      aiContentHistory: [
        {
          title: "夏日清凉防晒衣，UPF50+ 专业防护",
          description: "轻薄透气面料，长效防晒，出行必备。",
          generatedAt: new Date(Date.now() - 86400000).toISOString(),
          generatedBy: "产品 Agent",
          version: 1,
        },
      ],
    },
    {
      id: nextMockId("prod"),
      title: "夏季百搭帆布鞋",
      sku: "SKU-SHO-004",
      storeId: storeId("抖音店A"),
      category: "鞋服",
      price: 159,
      cost: 62,
      stock: 210,
      status: "draft",
      publishStatus: defaultPublishStatus(),
      lastSyncedAt: null,
      aiContent: null,
      aiContentHistory: [],
    },
    {
      id: nextMockId("prod"),
      title: "便携折叠加湿器",
      sku: "SKU-HUM-002",
      storeId: storeId("抖音店A"),
      category: "家居",
      price: 89,
      cost: 32,
      stock: 0,
      status: "out_of_stock",
      publishStatus: {
        ...defaultPublishStatus(),
        douyin: { status: "published", publishedAt: new Date(Date.now() - 8 * 86400000).toISOString(), platformProductId: "DY-7712349002", failureReason: null },
        taobao: { status: "ready", publishedAt: null, platformProductId: null, failureReason: null },
      },
      lastSyncedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
      aiContent: null,
      aiContentHistory: [],
    },
    {
      id: nextMockId("prod"),
      title: "LED灯带套装 3米",
      sku: "SKU-LED-005",
      storeId: storeId("抖音店A"),
      category: "LED电工",
      price: 45,
      cost: 16,
      stock: 480,
      status: "active",
      publishStatus: {
        ...defaultPublishStatus(),
        douyin: { status: "published", publishedAt: new Date(Date.now() - 1 * 86400000).toISOString(), platformProductId: "DY-7712349005", failureReason: null },
        xiaohongshu: { status: "failed", publishedAt: null, platformProductId: null, failureReason: "商品图片分辨率不足，需重新上传主图" },
      },
      lastSyncedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      aiContent: {
        title: "LED灯带 3米套装｜氛围感卧室必备",
        description: "12V 低压安全供电，多色可调，附赠遥控器。",
        generatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        generatedBy: "产品 Agent",
        version: 1,
      },
      aiContentHistory: [
        {
          title: "LED灯带 3米套装｜氛围感卧室必备",
          description: "12V 低压安全供电，多色可调，附赠遥控器。",
          generatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          generatedBy: "产品 Agent",
          version: 1,
        },
      ],
    },

    // ---- 淘宝店A：鞋服 / 家纺 ----
    {
      id: nextMockId("prod"),
      title: "男士休闲皮鞋",
      sku: "SKU-SHO-101",
      storeId: storeId("淘宝店A"),
      category: "鞋服",
      price: 279,
      cost: 110,
      stock: 96,
      status: "active",
      publishStatus: {
        ...defaultPublishStatus(),
        taobao: { status: "published", publishedAt: new Date(Date.now() - 12 * 86400000).toISOString(), platformProductId: "TB-889301", failureReason: null },
      },
      lastSyncedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
      aiContent: {
        title: "男士商务休闲皮鞋｜通勤百搭",
        description: "头层牛皮，防滑耐磨，日常通勤首选。",
        generatedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
        generatedBy: "产品 Agent",
        version: 1,
      },
      aiContentHistory: [
        {
          title: "男士商务休闲皮鞋｜通勤百搭",
          description: "头层牛皮，防滑耐磨，日常通勤首选。",
          generatedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
          generatedBy: "产品 Agent",
          version: 1,
        },
      ],
    },
    {
      id: nextMockId("prod"),
      title: "四件套家纺套件",
      sku: "SKU-HOM-102",
      storeId: storeId("淘宝店A"),
      category: "家纺",
      price: 199,
      cost: 78,
      stock: 140,
      status: "draft",
      publishStatus: defaultPublishStatus(),
      lastSyncedAt: null,
      aiContent: null,
      aiContentHistory: [],
    },

    // ---- 小红书店A：3C数码 / 美妆 ----
    {
      id: nextMockId("prod"),
      title: "无线降噪耳机 Pro",
      sku: "SKU-AUD-003",
      storeId: storeId("小红书店A"),
      category: "3C数码",
      price: 399,
      cost: 180,
      stock: 56,
      status: "draft",
      publishStatus: defaultPublishStatus(),
      lastSyncedAt: null,
      aiContent: null,
      aiContentHistory: [],
    },
    {
      id: nextMockId("prod"),
      title: "保湿精华面霜",
      sku: "SKU-BEA-201",
      storeId: storeId("小红书店A"),
      category: "美妆",
      price: 219,
      cost: 85,
      stock: 300,
      status: "active",
      publishStatus: {
        ...defaultPublishStatus(),
        xiaohongshu: { status: "published", publishedAt: new Date(Date.now() - 3 * 86400000).toISOString(), platformProductId: "XHS-556621", failureReason: null },
      },
      lastSyncedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      aiContent: {
        title: "深层保湿精华面霜｜熬夜急救",
        description: "玻尿酸+神经酰胺配方，24 小时长效锁水。",
        generatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        generatedBy: "产品 Agent",
        version: 1,
      },
      aiContentHistory: [
        {
          title: "深层保湿精华面霜｜熬夜急救",
          description: "玻尿酸+神经酰胺配方，24 小时长效锁水。",
          generatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
          generatedBy: "产品 Agent",
          version: 1,
        },
      ],
    },
  ];
}

const repository = createLocalRepository("productCenter.products", seedProducts);

export function getProducts() {
  return repository.get();
}

export function getProduct(productId) {
  return repository.get().find((p) => p.id === productId) ?? null;
}

/**
 * 店铺 → 类目层级：先按店铺分组，再列出该店铺下出现过的所有类目。
 */
export function getCategoriesForStore(storeId) {
  const products = repository.get().filter((p) => p.storeId === storeId);
  return [...new Set(products.map((p) => p.category))];
}

export function getProductsForStoreCategory(storeId, category) {
  return repository.get().filter((p) => p.storeId === storeId && (category === null || p.category === category));
}

/**
 * 商品发布汇总态：published > failed > draft，用于店铺/类目上下文
 * 头部的草稿/已发布/失败计数——只要有一个平台已发布就算已发布，
 * 没有已发布但有平台失败就算失败，否则算草稿。
 */
export function getProductPublishSummary(product) {
  const statuses = Object.values(product.publishStatus).map((p) => p.status);
  if (statuses.includes("published")) return "published";
  if (statuses.includes("failed")) return "failed";
  return "draft";
}

export function getStoreContextCounts(storeId, category) {
  const products = getProductsForStoreCategory(storeId, category);
  const counts = { total: products.length, draft: 0, published: 0, failed: 0 };
  products.forEach((p) => {
    counts[getProductPublishSummary(p)] += 1;
  });
  return counts;
}

export function upsertProduct(product) {
  return repository.update((products) => {
    if (product.id) {
      return products.map((p) => (p.id === product.id ? { ...p, ...product } : p));
    }
    return [
      {
        ...product,
        id: nextMockId("prod"),
        publishStatus: product.publishStatus ?? defaultPublishStatus(),
        aiContent: null,
        aiContentHistory: [],
      },
      ...products,
    ];
  });
}

export function updateProductField(productId, field, value) {
  return repository.update((products) =>
    products.map((p) => (p.id === productId ? { ...p, [field]: value } : p))
  );
}

const AI_CONTENT_VARIANTS = [
  (title) => ({
    title: `${title}｜AI 优化标题`,
    description: `${title} —— 由 AI 生成的详情文案，突出核心卖点与使用场景。`,
  }),
  (title) => ({
    title: `${title}·爆款推荐`,
    description: `${title}，品质保证，好评如潮，限时优惠中。`,
  }),
];

/**
 * 生成/重新生成都走这一个函数——区别只在于生成前 aiContent 是否
 * 已存在。每次生成都会：更新 aiContent（当前版本，永远可见，不会
 * 被隐藏），并把这次结果追加进 aiContentHistory（历史版本永久
 * 保留，供"历史"按钮查看）。
 */
export async function generateAiContent(productId) {
  await simulateLatency(500, 1000);
  return repository.update((products) =>
    products.map((p) => {
      if (p.id !== productId) return p;
      const nextVersion = (p.aiContent?.version ?? 0) + 1;
      const variant = AI_CONTENT_VARIANTS[(nextVersion - 1) % AI_CONTENT_VARIANTS.length](p.title);
      const entry = {
        ...variant,
        generatedAt: new Date().toISOString(),
        generatedBy: "产品 Agent",
        version: nextVersion,
      };
      return { ...p, aiContent: entry, aiContentHistory: [entry, ...p.aiContentHistory] };
    })
  );
}

export function bulkSetStatus(productIds, status) {
  return repository.update((products) =>
    products.map((p) => (productIds.includes(p.id) ? { ...p, status } : p))
  );
}

/**
 * 发布工作流：not_configured/draft → publishing（短暂模拟耗时）→
 * published。90% 概率成功，10% 概率 failed 并附带失败原因（演示
 * 失败态和重试，不是每次都乐观成功）。只更新目标平台自己的状态
 * 对象，绝不连带把其它平台标记为已发布。
 */
const FAILURE_REASONS = [
  "商品标题包含平台禁用极限词，请修改后重试",
  "主图不符合平台尺寸要求",
  "类目属性缺失，请补全必填字段",
];

export async function publishProductToPlatform(productId, platformKey) {
  repository.update((products) =>
    products.map((p) =>
      p.id === productId
        ? {
            ...p,
            publishStatus: {
              ...p.publishStatus,
              [platformKey]: { ...p.publishStatus[platformKey], status: "publishing" },
            },
          }
        : p
    )
  );

  await simulateLatency(800, 1600);

  const succeeded = Math.random() > 0.1;

  return repository.update((products) =>
    products.map((p) => {
      if (p.id !== productId) return p;
      const next = succeeded
        ? {
            status: "published",
            publishedAt: new Date().toISOString(),
            platformProductId: `${platformKey.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
            failureReason: null,
          }
        : {
            status: "failed",
            publishedAt: null,
            platformProductId: null,
            failureReason: FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)],
          };
      return { ...p, publishStatus: { ...p.publishStatus, [platformKey]: next } };
    })
  );
}

export function markProductReady(productId, platformKey) {
  return repository.update((products) =>
    products.map((p) =>
      p.id === productId
        ? {
            ...p,
            publishStatus: {
              ...p.publishStatus,
              [platformKey]: { ...p.publishStatus[platformKey], status: "ready" },
            },
          }
        : p
    )
  );
}
