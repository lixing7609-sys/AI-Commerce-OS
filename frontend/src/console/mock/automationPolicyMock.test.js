import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCustomAutomation,
  deleteCustomAutomation,
  duplicateCustomAutomation,
  getAutomationPolicyState,
  toggleCustomAutomationEnabled,
  togglePolicyEnabled,
  updateCustomAutomation,
  updatePolicyThreshold,
} from "./automationPolicyMock.js";

/**
 * 自动化策略数据契约回归测试（阶段 Founder Full-System v3 Batch 2
 * §E）。交办任务点名"自动化策略页面出现 `Cannot read properties of
 * undefined (reading 'length')`"，即使这次没能在当前代码状态下
 * 复现，这组测试专门覆盖会导致这类崩溃的边界状态——仓库损坏/字段
 * 缺失时，`getAutomationPolicyState()` 及所有 mutator 都必须返回
 * 形状完整的对象，而不是让某个 `.length`/`.map` 调用点炸掉。
 */

function createFakeWindow(initial) {
  const store = new Map();
  if (initial !== undefined) {
    store.set("ai-commerce-os:founder:automationPolicy.state", JSON.stringify(initial));
  }
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

describe("automationPolicyMock — golden path", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with 5 system policies and 4 seeded custom automations, all shaped as arrays", () => {
    const state = getAutomationPolicyState();
    expect(Array.isArray(state.policies)).toBe(true);
    expect(Array.isArray(state.customAutomations)).toBe(true);
    expect(Array.isArray(state.runLog)).toBe(true);
    expect(state.policies).toHaveLength(5);
    expect(state.customAutomations).toHaveLength(4);
  });

  it("creating a policy adds it to customAutomations with a well-shaped limits object", () => {
    const before = getAutomationPolicyState().customAutomations.length;
    const state = createCustomAutomation({
      name: "测试自动化",
      trigger: { type: "manual" },
      actions: ["notify_founder"],
      riskLevel: "L1",
    });
    expect(state.customAutomations).toHaveLength(before + 1);
    const created = state.customAutomations[0];
    expect(created.name).toBe("测试自动化");
    expect(created.actions).toEqual(["notify_founder"]);
    expect(created.limits.dailyExecutionLimit).toBe(10);
  });

  it("editing a custom automation updates fields and updatedAt", async () => {
    const created = createCustomAutomation({ name: "待编辑", actions: ["notify_founder"] }).customAutomations[0];
    await new Promise((r) => setTimeout(r, 5));
    const state = updateCustomAutomation(created.id, { name: "已编辑" });
    const updated = state.customAutomations.find((a) => a.id === created.id);
    expect(updated.name).toBe("已编辑");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
  });

  it("editing a system policy threshold works", () => {
    const state = updatePolicyThreshold("policy-ad-budget", 500);
    expect(state.policies.find((p) => p.id === "policy-ad-budget").thresholdValue).toBe(500);
  });

  it("enabling/disabling a system policy toggles enabled", () => {
    const before = getAutomationPolicyState().policies.find((p) => p.id === "policy-refund").enabled;
    const state = togglePolicyEnabled("policy-refund");
    expect(state.policies.find((p) => p.id === "policy-refund").enabled).toBe(!before);
  });

  it("enabling/disabling a custom automation toggles enabled and status together", () => {
    const created = createCustomAutomation({ name: "开关测试", actions: ["notify_founder"], enabled: true, status: "enabled" }).customAutomations[0];
    const state = toggleCustomAutomationEnabled(created.id);
    const toggled = state.customAutomations.find((a) => a.id === created.id);
    expect(toggled.enabled).toBe(false);
    expect(toggled.status).toBe("disabled");
  });

  it("duplicating a custom automation creates a draft, disabled copy", () => {
    const created = createCustomAutomation({ name: "原始", actions: ["notify_founder"] }).customAutomations[0];
    const state = duplicateCustomAutomation(created.id);
    const copy = state.customAutomations.find((a) => a.name === "原始（副本）");
    expect(copy).toBeDefined();
    expect(copy.status).toBe("draft");
    expect(copy.enabled).toBe(false);
  });

  it("deleting a custom automation removes it", () => {
    const created = createCustomAutomation({ name: "待删除", actions: ["notify_founder"] }).customAutomations[0];
    const state = deleteCustomAutomation(created.id);
    expect(state.customAutomations.find((a) => a.id === created.id)).toBeUndefined();
  });

  it("execution log with no records is a well-shaped empty array, not undefined", () => {
    // 种子数据里 runLog 有 2 条，这里断言它至少是数组——真正的"空执行
    // 记录"场景由下面损坏态测试覆盖（runLog 缺失时兜底为 []）。
    const { runLog } = getAutomationPolicyState();
    expect(Array.isArray(runLog)).toBe(true);
  });
});

describe("automationPolicyMock — corrupted/partial repository state (crash-prevention boundary)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getAutomationPolicyState never returns undefined arrays when the stored state is an empty object", () => {
    vi.stubGlobal("window", createFakeWindow({}));
    const state = getAutomationPolicyState();
    expect(Array.isArray(state.policies)).toBe(true);
    expect(Array.isArray(state.customAutomations)).toBe(true);
    expect(Array.isArray(state.runLog)).toBe(true);
    expect(state.customAutomations).toHaveLength(0);
    expect(state.runLog).toHaveLength(0);
  });

  it("getAutomationPolicyState recovers when customAutomations/runLog are missing entirely", () => {
    vi.stubGlobal("window", createFakeWindow({ policies: [] }));
    const state = getAutomationPolicyState();
    expect(state.policies).toEqual([]);
    expect(state.customAutomations).toEqual([]);
    expect(state.runLog).toEqual([]);
    // 空 policies 列表下，.length 读取必须安全，不抛错。
    expect(state.policies.length).toBe(0);
  });

  it("getAutomationPolicyState recovers when a field is the wrong type (string instead of array)", () => {
    vi.stubGlobal("window", createFakeWindow({ policies: "not-an-array", customAutomations: null, runLog: undefined }));
    const state = getAutomationPolicyState();
    expect(Array.isArray(state.policies)).toBe(true);
    expect(Array.isArray(state.customAutomations)).toBe(true);
    expect(Array.isArray(state.runLog)).toBe(true);
  });

  it("mutators do not throw when the underlying state was corrupted", () => {
    vi.stubGlobal("window", createFakeWindow({}));
    expect(() => togglePolicyEnabled("policy-ad-budget")).not.toThrow();
    expect(() => createCustomAutomation({ name: "corrupted-recovery" })).not.toThrow();
  });

  it("createCustomAutomation fills in missing optional fields (trigger/actions/limits) with safe defaults", () => {
    vi.stubGlobal("window", createFakeWindow());
    const state = createCustomAutomation({ name: "缺字段自动化" });
    const created = state.customAutomations[0];
    expect(created.trigger).toBeDefined();
    expect(Array.isArray(created.actions)).toBe(true);
    expect(created.limits).toBeDefined();
    expect(created.limits.dailyExecutionLimit).toBe(10);
    // 关键回归点：即使调用方完全没传 actions，结果里 actions 也是数组
    // 而不是 undefined —— 页面里 `r.actions.length` 这种读取不会崩溃。
    expect(created.actions.length).toBe(0);
  });
});
