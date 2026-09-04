import { describe, expect, it, vi } from "vitest";

vi.mock("../../services/shopApi.js", () => ({
  getShop: vi.fn(),
  testShopConnection: vi.fn(),
  startShopOAuth: vi.fn(),
}));

const { getShop, testShopConnection } = await import("../../services/shopApi.js");
const { createLiveReadonlyAdapter } = await import("./liveReadonlyAdapter.js");
const { AccessMode } = await import("./types.js");

function shopFixture(overrides = {}) {
  return {
    id: 55,
    platform: "douyin",
    shop_name: "第一家真实店铺",
    auth_type: "oauth",
    connection_status: "disconnected",
    last_connection_test_status: null,
    last_connection_test_at: null,
    last_sync_at: null,
    token_expires_at: null,
    platform_shop_id: "dy-000055",
    credentials: [],
    ...overrides,
  };
}

describe("liveReadonlyAdapter: never fakes a connection", () => {
  it("connect() reports not_configured and never calls testShopConnection when no credentials exist", async () => {
    getShop.mockResolvedValue(shopFixture());
    const adapter = createLiveReadonlyAdapter();
    const auth = await adapter.connect("55");
    expect(auth.credentialStatus).toBe("not_configured");
    expect(testShopConnection).not.toHaveBeenCalled();
  });

  it("getStoreProfile() reports pending_authorization, not connected, when credentials are missing", async () => {
    getShop.mockResolvedValue(shopFixture());
    const adapter = createLiveReadonlyAdapter();
    const profile = await adapter.getStoreProfile("55");
    expect(profile.connectionStatus).toBe("pending_authorization");
    expect(profile.isRealData).toBe(true);
    expect(profile.writeOperationsAllowed).toBe(false);
    expect(profile.accessMode).toBe(AccessMode.LIVE_READONLY);
  });

  it("getStoreProfile() reports connected only when credentials are configured AND backend says connected", async () => {
    getShop.mockResolvedValue(
      shopFixture({
        credentials: [{ credential_type: "access_token", configured: true }],
        connection_status: "connected",
      })
    );
    const adapter = createLiveReadonlyAdapter();
    const profile = await adapter.getStoreProfile("55");
    expect(profile.connectionStatus).toBe("connected");
  });
});

describe("liveReadonlyAdapter: business data reads are honest, never fabricated", () => {
  it("listProducts/listOrders/listCustomers all return empty (no fake data) since no real sync backend exists yet", async () => {
    const adapter = createLiveReadonlyAdapter();
    expect(await adapter.listProducts("55", {})).toEqual({ items: [], nextCursor: null });
    expect(await adapter.listOrders("55", {})).toEqual({ items: [], nextCursor: null });
    expect(await adapter.listCustomers("55", {})).toEqual({ items: [], nextCursor: null });
  });

  it("getProduct/getOrder/getCustomer/getInventory/getMetrics all return null, never synthetic records", async () => {
    const adapter = createLiveReadonlyAdapter();
    expect(await adapter.getProduct("55", "p1")).toBeNull();
    expect(await adapter.getOrder("55", "o1")).toBeNull();
    expect(await adapter.getCustomer("55", "c1")).toBeNull();
    expect(await adapter.getInventory("55", "p1")).toBeNull();
    expect(await adapter.getMetrics("55", "2026-07-27")).toBeNull();
  });
});

describe("liveReadonlyAdapter: writes never fake success", () => {
  it("every write method returns ok:false with an explicit reason", async () => {
    const adapter = createLiveReadonlyAdapter();
    const results = await Promise.all([
      adapter.createProductDraft("55", {}),
      adapter.updateProductDraft("55", "d1", {}),
      adapter.publishProduct("55", "d1"),
      adapter.updatePrice("55", "p1", 100),
      adapter.updateInventory("55", "p1", 10),
      adapter.createCampaignDraft("55", {}),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });
});
