import { createLocalRepository, simulateLatency, tagDemo } from "../localRepository.js";
import { AccessMode } from "./types.js";

/**
 * MODE_MOCK 的 StorePlatformAdapter 实现——完全不触碰任何真实后端
 * 或平台接口，纯本地演示数据，用于在没有任何真实店铺凭据的情况下
 * 也能把 Founder 的 Store Connection Center / Real Operation
 * Workbench 走通一遍完整流程。所有返回数据都带 `is_demo: true`。
 */

const MOCK_STORE_ID = "mock-store-001";

function seedState() {
  const products = Array.from({ length: 6 }).map((_, i) => ({
    productId: `mock-prod-${i + 1}`,
    storeId: MOCK_STORE_ID,
    title: ["夏季轻薄防晒衣", "LED灯带套装 3米", "便携折叠加湿器", "无线降噪耳机 Pro", "四件套家纺套件", "保湿精华面霜"][i],
    category: ["服饰", "家居", "家电", "3C", "家纺", "美妆"][i],
    price: [129, 45, 89, 399, 199, 219][i],
    cost: [58, 18, 41, 210, 96, 88][i],
    status: i === 5 ? "draft" : "active",
    sourceRecordRef: `mock:product:${i + 1}`,
  }));

  const orders = Array.from({ length: 8 }).map((_, i) => ({
    orderId: `mock-order-${i + 1}`,
    storeId: MOCK_STORE_ID,
    status: ["completed", "shipped", "pending_shipment", "refunding"][i % 4],
    totalAmount: [129, 258, 45, 89, 399, 219, 159, 199][i],
    placedAt: new Date(Date.now() - i * 3600_000 * 7).toISOString(),
  }));

  const customers = Array.from({ length: 4 }).map((_, i) => ({
    customerId: `mock-cust-${i + 1}`,
    storeId: MOCK_STORE_ID,
    displayName: `demo买家***${i + 1}`,
    totalOrders: [3, 1, 5, 2][i],
    totalSpend: [387, 129, 895, 258][i],
  }));

  const drafts = {};

  return { products, orders, customers, drafts };
}

const repo = createLocalRepository("storePlatform:mockAdapter", seedState);

function paginate(items, { cursor } = {}) {
  const pageSize = 5;
  const start = cursor ? Number(cursor) : 0;
  const page = items.slice(start, start + pageSize);
  const nextCursor = start + pageSize < items.length ? String(start + pageSize) : null;
  return { items: tagDemo(page), nextCursor };
}

export const mockAdapter = {
  async connect() {
    await simulateLatency();
    return {
      storeId: MOCK_STORE_ID,
      platform: "mock",
      credentialStatus: "configured",
      authorizedScopes: ["read", "write"],
      expiresAt: null,
      lastVerifiedAt: new Date().toISOString(),
      missingRequirements: [],
    };
  },
  async disconnect() {
    await simulateLatency();
  },
  async validateCredentials() {
    return mockAdapter.connect();
  },
  async refreshAuthorization() {
    return mockAdapter.connect();
  },
  async getStoreProfile() {
    await simulateLatency();
    return tagDemo({
      storeId: MOCK_STORE_ID,
      name: "演示店铺（Mock）",
      platform: "mock",
      platformStoreId: "mock-000001",
      accessMode: AccessMode.MOCK,
      connectionStatus: "connected",
      lastSyncedAt: new Date().toISOString(),
      syncStatus: "idle",
      writeOperationsAllowed: true,
      isRealData: false,
    });
  },
  async listProducts(storeId, opts) {
    await simulateLatency();
    return paginate(repo.get().products, opts);
  },
  async getProduct(storeId, productId) {
    await simulateLatency();
    const found = repo.get().products.find((p) => p.productId === productId);
    return found ? tagDemo(found) : null;
  },
  async listOrders(storeId, opts) {
    await simulateLatency();
    return paginate(repo.get().orders, opts);
  },
  async getOrder(storeId, orderId) {
    await simulateLatency();
    const found = repo.get().orders.find((o) => o.orderId === orderId);
    return found ? tagDemo(found) : null;
  },
  async listCustomers(storeId, opts) {
    await simulateLatency();
    return paginate(repo.get().customers, opts);
  },
  async getCustomer(storeId, customerId) {
    await simulateLatency();
    const found = repo.get().customers.find((c) => c.customerId === customerId);
    return found ? tagDemo(found) : null;
  },
  async getInventory(storeId, productId) {
    await simulateLatency();
    const found = repo.get().products.find((p) => p.productId === productId);
    if (!found) return null;
    return tagDemo({
      productId,
      variantId: null,
      available: 40 + (productId.length % 5) * 7,
      reserved: 2,
      asOf: new Date().toISOString(),
    });
  },
  async getMetrics(storeId, date) {
    await simulateLatency();
    const dayOrders = repo.get().orders;
    return tagDemo({
      storeId,
      date,
      gmv: dayOrders.reduce((sum, o) => sum + o.totalAmount, 0),
      orderCount: dayOrders.length,
      refundAmount: dayOrders.filter((o) => o.status === "refunding").reduce((s, o) => s + o.totalAmount, 0),
    });
  },
  async createProductDraft(storeId, draft) {
    await simulateLatency();
    const draftId = `mock-draft-${Date.now()}`;
    repo.update((state) => {
      state.drafts[draftId] = { ...draft, draftId, status: "draft" };
      return state;
    });
    return { ok: true, requiresApproval: false, draftId };
  },
  async updateProductDraft(storeId, draftId, patch) {
    await simulateLatency();
    if (!repo.get().drafts[draftId]) return { ok: false, error: "草稿不存在" };
    repo.update((state) => {
      state.drafts[draftId] = { ...state.drafts[draftId], ...patch };
      return state;
    });
    return { ok: true };
  },
  async publishProduct(storeId, draftId) {
    await simulateLatency();
    if (!repo.get().drafts[draftId]) return { ok: false, requiresApproval: false, error: "草稿不存在" };
    return { ok: true, requiresApproval: false };
  },
  async updatePrice(storeId, productId, price) {
    await simulateLatency();
    repo.update((state) => {
      const p = state.products.find((item) => item.productId === productId);
      if (p) p.price = price;
      return state;
    });
    return { ok: true, requiresApproval: false };
  },
  async updateInventory() {
    await simulateLatency();
    return { ok: true, requiresApproval: false };
  },
  async createCampaignDraft() {
    await simulateLatency();
    return { ok: true, requiresApproval: false, draftId: `mock-campaign-${Date.now()}` };
  },
};

export { MOCK_STORE_ID };
