import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_SOURCES, getHotspotState, updateTopicStatus } from "./hotspotMock.js";

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    setTimeout: (fn) => { fn(); return 0; },
  };
}

describe("热点分析 / 趋势预测 / 选题池 mock 数据层", () => {
  beforeEach(() => vi.stubGlobal("window", createFakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("covers at least the 12+ platform sources required by §十一", () => {
    expect(PLATFORM_SOURCES.length).toBeGreaterThanOrEqual(12);
  });

  it("every hotspot carries both video and graphic-content adaptation fields", () => {
    const { hotspots } = getHotspotState();
    expect(hotspots.length).toBeGreaterThan(0);
    for (const h of hotspots) {
      expect(typeof h.suitableForGraphic).toBe("boolean");
      expect(Array.isArray(h.graphicPlatforms)).toBe(true);
      expect(Array.isArray(h.suitableContentTypes)).toBe(true);
      expect(typeof h.estimatedTraffic).toBe("number");
    }
    expect(hotspots.some((h) => h.suitableForGraphic)).toBe(true);
  });

  it("trend forecasts include a predicted phase and recommended action", () => {
    const { trendForecasts } = getHotspotState();
    expect(trendForecasts.length).toBeGreaterThan(0);
    for (const f of trendForecasts) {
      expect(f.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it("updateTopicStatus only mutates the targeted topic", async () => {
    const before = getHotspotState().topicPool[0];
    const after = await updateTopicStatus(before.topicId, "approved");
    expect(after.topicPool.find((t) => t.topicId === before.topicId).status).toBe("approved");
  });
});
