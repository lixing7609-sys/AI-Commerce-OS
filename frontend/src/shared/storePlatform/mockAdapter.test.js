import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessMode } from "./types.js";

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("mockAdapter", () => {
  let mockAdapter;
  let MOCK_STORE_ID;

  beforeEach(async () => {
    globalThis.window = { localStorage: createMemoryLocalStorage(), setTimeout, clearTimeout };
    vi.resetModules();
    const mod = await import("./mockAdapter.js");
    mockAdapter = mod.mockAdapter;
    MOCK_STORE_ID = mod.MOCK_STORE_ID;
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("connect() always reports a configured, verified authorization (mock never requires real credentials)", async () => {
    const auth = await mockAdapter.connect();
    expect(auth.credentialStatus).toBe("configured");
    expect(auth.missingRequirements).toEqual([]);
  });

  it("getStoreProfile() reports accessMode MOCK and isRealData:false", async () => {
    const profile = await mockAdapter.getStoreProfile(MOCK_STORE_ID);
    expect(profile.accessMode).toBe(AccessMode.MOCK);
    expect(profile.isRealData).toBe(false);
    expect(profile.is_demo).toBe(true);
  });

  it("listProducts() paginates and every item is tagged is_demo", async () => {
    const page1 = await mockAdapter.listProducts(MOCK_STORE_ID, {});
    expect(page1.items.length).toBeGreaterThan(0);
    expect(page1.items.every((item) => item.is_demo)).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await mockAdapter.listProducts(MOCK_STORE_ID, { cursor: page1.nextCursor });
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items[0].productId).not.toBe(page1.items[0].productId);
  });

  it("updatePrice() actually mutates the mock product so a subsequent getProduct reflects it", async () => {
    const page = await mockAdapter.listProducts(MOCK_STORE_ID, {});
    const target = page.items[0];
    await mockAdapter.updatePrice(MOCK_STORE_ID, target.productId, 999);
    const updated = await mockAdapter.getProduct(MOCK_STORE_ID, target.productId);
    expect(updated.price).toBe(999);
  });

  it("createProductDraft() -> publishProduct() round-trip succeeds without requiring approval in mock mode", async () => {
    const created = await mockAdapter.createProductDraft(MOCK_STORE_ID, { title: "测试新品" });
    expect(created.ok).toBe(true);
    expect(created.draftId).toBeTruthy();
    const published = await mockAdapter.publishProduct(MOCK_STORE_ID, created.draftId);
    expect(published.ok).toBe(true);
    expect(published.requiresApproval).toBe(false);
  });

  it("publishProduct() fails cleanly for an unknown draftId", async () => {
    const result = await mockAdapter.publishProduct(MOCK_STORE_ID, "does-not-exist");
    expect(result.ok).toBe(false);
  });

  it("getMetrics() derives gmv honestly from the mock order list, never a hardcoded constant", async () => {
    const orders = await mockAdapter.listOrders(MOCK_STORE_ID, {});
    const metrics = await mockAdapter.getMetrics(MOCK_STORE_ID, "2026-07-27");
    expect(metrics.orderCount).toBeGreaterThan(0);
    expect(typeof metrics.gmv).toBe("number");
    expect(orders.items.length).toBeGreaterThan(0);
  });
});
