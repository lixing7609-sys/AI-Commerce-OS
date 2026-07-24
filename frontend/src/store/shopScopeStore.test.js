import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALL_SHOPS_SCOPE,
  UNASSIGNED_SHOP_SCOPE,
  getStoredShopScope,
  setStoredShopScope,
  shopScopeToQueryParams,
} from "./shopScopeStore";

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("shopScopeStore", () => {
  let fakeLocalStorage;

  beforeEach(() => {
    fakeLocalStorage = createMemoryLocalStorage();
    vi.stubGlobal("window", { localStorage: fakeLocalStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to ALL_SHOPS_SCOPE when nothing has been stored", () => {
    expect(getStoredShopScope()).toBe(ALL_SHOPS_SCOPE);
  });

  it("persists and reads back the unassigned scope", () => {
    setStoredShopScope(UNASSIGNED_SHOP_SCOPE);
    expect(getStoredShopScope()).toBe(UNASSIGNED_SHOP_SCOPE);
  });

  it("persists and reads back a numeric shop id scope", () => {
    setStoredShopScope(42);
    expect(getStoredShopScope()).toBe(42);
  });

  it("only ever writes the literal scope value, never secret-shaped content", () => {
    setStoredShopScope(7);
    const raw = fakeLocalStorage.getItem("ai-commerce-os:shop-scope");
    expect(raw).toBe("7");
    expect(raw).not.toMatch(/token|secret|key|password/i);
  });

  it("falls back to ALL_SHOPS_SCOPE for corrupted stored values", () => {
    fakeLocalStorage.setItem("ai-commerce-os:shop-scope", "not-a-valid-scope");
    expect(getStoredShopScope()).toBe(ALL_SHOPS_SCOPE);
  });

  it("does not throw when window/localStorage is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(() => getStoredShopScope()).not.toThrow();
    expect(getStoredShopScope()).toBe(ALL_SHOPS_SCOPE);
    expect(() => setStoredShopScope(1)).not.toThrow();
  });
});

describe("shopScopeToQueryParams", () => {
  it("returns no filter for ALL_SHOPS_SCOPE (summary view only)", () => {
    expect(shopScopeToQueryParams(ALL_SHOPS_SCOPE)).toEqual({});
  });

  it("returns unassignedShop=true for UNASSIGNED_SHOP_SCOPE", () => {
    expect(shopScopeToQueryParams(UNASSIGNED_SHOP_SCOPE)).toEqual({
      unassignedShop: true,
    });
  });

  it("returns shopId for a concrete shop scope", () => {
    expect(shopScopeToQueryParams(12)).toEqual({ shopId: 12 });
  });
});
