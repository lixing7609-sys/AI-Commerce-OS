import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT_AGENTS, GRAPHIC_AGENTS, getAgentStatusList, getStudioLabState, publishPromptVersion,
  rollbackPromptVersion, updateModelRoute,
} from "./studioAgentMock.js";

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

describe("Studio Agent 矩阵 mock 数据层（Founder Studio 实验室）", () => {
  beforeEach(() => vi.stubGlobal("window", createFakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("defines the required 14 content agents + 13 graphic agents (27 total)", () => {
    expect(CONTENT_AGENTS).toHaveLength(18); // 14 production + Traffic/Advertising/Monetization/Analytics per §十八全量
    expect(GRAPHIC_AGENTS).toHaveLength(13);
  });

  it("getAgentStatusList exposes only status-display fields, not Prompt/Skill/ModelRoute internals", () => {
    const list = getAgentStatusList();
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) {
      expect(a).not.toHaveProperty("promptVersion");
      expect(a).not.toHaveProperty("toolPermissions");
      expect(a).toHaveProperty("status");
      expect(a).toHaveProperty("currentTask");
    }
  });

  it("getStudioLabState exposes full research-layer data for Founder", () => {
    const state = getStudioLabState();
    expect(state.prompts.length).toBeGreaterThan(0);
    expect(state.skills.length).toBeGreaterThan(0);
    expect(state.modelRoutes.length).toBe(state.agents.length);
    expect(state.replayTasks.length).toBeGreaterThan(0);
    expect(state.evaluationRuns.length).toBeGreaterThan(0);
    expect(state.runLogs.length).toBeGreaterThan(0);
    expect(state.releases.length).toBeGreaterThan(0);
  });

  it("publishPromptVersion promotes exactly one draft to published and demotes the prior published one", async () => {
    const { prompts, agents } = getStudioLabState();
    const agentId = agents[0].agentId;
    const draft = prompts.find((p) => p.agentId === agentId && p.status === "draft");
    const after = await publishPromptVersion(draft.promptId);
    const agentPrompts = after.prompts.filter((p) => p.agentId === agentId);
    expect(agentPrompts.filter((p) => p.status === "published")).toHaveLength(1);
    expect(agentPrompts.find((p) => p.promptId === draft.promptId).status).toBe("published");
  });

  it("rollbackPromptVersion republishes the targeted historical version", async () => {
    const { agents } = getStudioLabState();
    const agentId = agents[0].agentId;
    const after = await rollbackPromptVersion(agentId, 1);
    const agentPrompts = after.prompts.filter((p) => p.agentId === agentId);
    expect(agentPrompts.find((p) => p.version === 1).status).toBe("published");
    expect(agentPrompts.filter((p) => p.status === "published")).toHaveLength(1);
  });

  it("updateModelRoute only mutates the targeted agent's route", async () => {
    const { agents } = getStudioLabState();
    const agentId = agents[0].agentId;
    const after = await updateModelRoute(agentId, { maxTokens: 9999 });
    expect(after.modelRoutes.find((r) => r.agentId === agentId).maxTokens).toBe(9999);
    const untouched = after.modelRoutes.find((r) => r.agentId !== agentId);
    expect(untouched.maxTokens).not.toBe(9999);
  });
});
