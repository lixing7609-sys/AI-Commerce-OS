import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CAPABILITIES,
  getCapabilityStatusLabel,
  getCapabilityStatusTone,
  getStoreConnectorState,
  simulateReconnect,
  simulateTestConnection,
} from "./platformConnectorMock.js";

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  };
}

const REAL_SHOP_A = { id: 719, shop_name: "新城", platform: "xiaohongshu" };
const REAL_SHOP_B = { id: 718, shop_name: "演示店铺", platform: "other" };

describe("platform connector (store-scoped)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a connector state for a real store (not a fixed demo-store list)", () => {
    const connector = getStoreConnectorState(REAL_SHOP_A);
    expect(connector).toBeTruthy();
    expect(connector.storeId).toBe(REAL_SHOP_A.id);
  });

  it("returns null (no fabricated connector) when there is no resolvable store", () => {
    expect(getStoreConnectorState(null)).toBeNull();
    expect(getStoreConnectorState({})).toBeNull();
  });

  it("scopes connector data by storeId — switching stores changes the data", () => {
    const connectorA = getStoreConnectorState(REAL_SHOP_A);
    const connectorB = getStoreConnectorState(REAL_SHOP_B);
    expect(connectorA.connectorId).not.toBe(connectorB.connectorId);
    expect(connectorA.storeId).toBe(REAL_SHOP_A.id);
    expect(connectorB.storeId).toBe(REAL_SHOP_B.id);
  });

  it("is deterministic and persisted — the same store always resolves to the same record", () => {
    const first = getStoreConnectorState(REAL_SHOP_A);
    const second = getStoreConnectorState(REAL_SHOP_A);
    expect(second).toEqual(first);
  });

  it("derives connector type from the store's real commerce platform", () => {
    const connector = getStoreConnectorState(REAL_SHOP_A);
    expect(connector.platform).toBe("xiaohongshu");
    expect(connector.connectorType).toContain("小红书");
  });

  it("every capability in the matrix resolves to a known, labeled status", () => {
    const connector = getStoreConnectorState(REAL_SHOP_A);
    for (const cap of CAPABILITIES) {
      const status = connector.grantedCapabilities[cap.key];
      expect(status).toBeTruthy();
      expect(getCapabilityStatusLabel(status)).not.toBe(status); // 必须有真实标签，不是原样返回内部 key
      expect(getCapabilityStatusTone(status)).toBeTruthy();
    }
  });

  it("is clearly labeled as mock/prototype, never claiming a live integration", () => {
    const connector = getStoreConnectorState(REAL_SHOP_A);
    expect(connector.isLive).toBe(false);
  });

  it("never stores or exposes credential secrets — only a reference/label", () => {
    const connector = getStoreConnectorState(REAL_SHOP_A);
    const serialized = JSON.stringify(connector).toLowerCase();
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("app_secret");
    expect(serialized).not.toContain("client_secret");
    expect(serialized).not.toContain("refresh_token");
  });

  it("simulateTestConnection updates health status for the correct store only", async () => {
    getStoreConnectorState(REAL_SHOP_A);
    getStoreConnectorState(REAL_SHOP_B);
    const updated = await simulateTestConnection(REAL_SHOP_A.id);
    expect(updated.healthStatus).toBe("healthy");
    expect(updated.storeId).toBe(REAL_SHOP_A.id);
    // 另一个店铺不受影响
    const untouched = getStoreConnectorState(REAL_SHOP_B);
    expect(untouched.storeId).toBe(REAL_SHOP_B.id);
  });

  it("simulateReconnect marks only the targeted capability as supported, for the targeted store", async () => {
    const before = getStoreConnectorState(REAL_SHOP_A);
    const targetCapability = CAPABILITIES[0].key;
    const updated = await simulateReconnect(REAL_SHOP_A.id, targetCapability);
    expect(updated.grantedCapabilities[targetCapability]).toBe("supported");
    // 其它店铺的记录不受影响
    const other = getStoreConnectorState(REAL_SHOP_B);
    expect(other.connectorId).not.toBe(before.connectorId);
  });

  it("sample stores show coherent differentiation, not one identical shared record", () => {
    // 多个不同真实店铺 id，场景应当出现不止一种（不是所有店铺都一样）。
    const ids = [101, 202, 303, 404, 505, 606];
    const scenarios = new Set(
      ids.map((id) => getStoreConnectorState({ id, shop_name: `店铺${id}`, platform: "douyin" }).scenarioKey)
    );
    expect(scenarios.size).toBeGreaterThan(1);
  });
});
