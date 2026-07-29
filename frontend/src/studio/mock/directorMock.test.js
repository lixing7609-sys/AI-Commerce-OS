import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIRECTOR_STAGES, getDirectorProjectState, addShot, removeShot, reorderShot, regenerateShot, lockShot,
  lockStageAndContinue, regenerateStage,
} from "./directorMock.js";

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

describe("AI导演工作台 mock 数据层", () => {
  beforeEach(() => vi.stubGlobal("window", createFakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("has all 10 director stages", () => {
    expect(DIRECTOR_STAGES).toHaveLength(10);
  });

  it("proj-7 (旗舰演示项目) has 18 shots matching the V3 prototype", () => {
    const { shots } = getDirectorProjectState("proj-7");
    expect(shots).toHaveLength(18);
  });

  it("falls back to a real, editable skeleton for a project with no seeded director data", () => {
    const { stages, shots } = getDirectorProjectState("proj-8");
    expect(stages).toHaveLength(10);
    expect(shots.length).toBeGreaterThan(0);
  });

  it("addShot appends a new shot and renumbers order sequentially", async () => {
    const before = getDirectorProjectState("proj-7").shots.length;
    await addShot("proj-7", before);
    const after = getDirectorProjectState("proj-7").shots;
    expect(after).toHaveLength(before + 1);
    expect(after.map((s) => s.order)).toEqual(after.map((_, i) => i + 1));
  });

  it("removeShot removes only the targeted shot and renumbers order", async () => {
    const before = getDirectorProjectState("proj-7");
    const target = before.shots[3];
    await removeShot("proj-7", target.shotId);
    const after = getDirectorProjectState("proj-7").shots;
    expect(after.find((s) => s.shotId === target.shotId)).toBeUndefined();
    expect(after.map((s) => s.order)).toEqual(after.map((_, i) => i + 1));
  });

  it("reorderShot swaps adjacent shots", async () => {
    const before = getDirectorProjectState("proj-7").shots;
    const first = before[0];
    const second = before[1];
    await reorderShot("proj-7", second.shotId, "up");
    const after = getDirectorProjectState("proj-7").shots;
    expect(after[0].shotId).toBe(second.shotId);
    expect(after[1].shotId).toBe(first.shotId);
  });

  it("regenerateShot marks the shot generated and increases cost", async () => {
    const before = getDirectorProjectState("proj-7").shots.find((s) => s.status === "draft");
    await regenerateShot("proj-7", before.shotId);
    const updated = getDirectorProjectState("proj-7").shots.find((s) => s.shotId === before.shotId);
    expect(updated.status).toBe("generated");
    expect(updated.cost).toBeGreaterThan(before.cost);
  });

  it("lockShot locks only the targeted shot", async () => {
    const target = getDirectorProjectState("proj-7").shots[0];
    await lockShot("proj-7", target.shotId);
    expect(getDirectorProjectState("proj-7").shots.find((s) => s.shotId === target.shotId).status).toBe("locked");
  });

  it("lockStageAndContinue locks the current stage and activates the next pending one", async () => {
    await lockStageAndContinue("proj-7", "trend");
    const trendStage = getDirectorProjectState("proj-7").stages.find((s) => s.stageKey === "trend");
    expect(trendStage.status).toBe("locked");
  });

  it("regenerateStage increases token cost and appends a run log entry", async () => {
    const before = getDirectorProjectState("proj-7").stages.find((s) => s.stageKey === "script");
    await regenerateStage("proj-7", "script");
    const updated = getDirectorProjectState("proj-7").stages.find((s) => s.stageKey === "script");
    expect(updated.tokenCost).toBeGreaterThan(before.tokenCost);
    expect(updated.runLog.length).toBeGreaterThan(before.runLog.length);
  });
});
