import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeFounderConversation, analyzeWithSinoBrain, buildSystemBlueprint, confirmCandidateGoal, createFounderConversation, decideExecutionDelta, discussWithSino, executeFounderExecution, getAssetMemoryCenter, getConversationWorkspace, getFounderBriefing, getFounderExecution, getFounderStrategy, reasonConfirmedGoal, resumeFounderExecution, submitExecutionDelta } from "./founderAiApi";

afterEach(() => vi.restoreAllMocks());

describe("Founder AI conversation API", () => {
  it("creates a Founder conversation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "conversation-1" }) });
    await createFounderConversation("Build an agent");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/conversations");
  });

  it("persists discussion messages and restores the workspace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ conversation: { id: "conv-1" } }) });
    await discussWithSino("conv/1", "继续讨论", "discussion");
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/conversations/conv%2F1/messages");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "继续讨论", intent: "discussion" });
    await getConversationWorkspace("conv/1");
    expect(fetchMock.mock.calls[1][0]).toContain("/founder-ai/conversations/conv%2F1/workspace");
  });

  it("confirms a candidate before Goal reasoning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ goal_id: "goal-1" }) });
    await confirmCandidateGoal("conv-1", "candidate-1");
    await reasonConfirmedGoal("goal-1");
    expect(fetchMock.mock.calls[0][0]).toContain("/candidate-goals/candidate-1/confirm");
    expect(fetchMock.mock.calls[1][0]).toContain("/goals/goal-1/reason");
  });

  it("submits and decides an Execution Delta", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ delta_id: "delta-1" }) });
    await submitExecutionDelta("execution-1", { conversation_id: "conv-1", goal_id: "goal-1", task_id: "task-1", content: "补充标题" });
    await decideExecutionDelta("execution-1", "delta-1", "confirm_adjustment");
    expect(fetchMock.mock.calls[0][0]).toContain("/executions/execution-1/deltas");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: "confirm_adjustment" });
  });

  it("loads the Founder self-management briefing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "ready" }) });
    await getFounderBriefing();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/briefing");
  });

  it("loads the Founder autonomous strategy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ current_phase: "AI System Builder" }) });
    await getFounderStrategy();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/strategy");
  });

  it("loads the durable asset and memory center", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ artifacts: [], memories: [] }) });
    await getAssetMemoryCenter();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/asset-memory-center");
  });

  it("requests an approval-gated system blueprint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ system_blueprint: {} }) });
    await buildSystemBlueprint("创建 Operator AI", "conv-1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/system-builder/blueprint");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ system_goal: "创建 Operator AI", conversation_id: "conv-1" });
  });

  it("analyzes a goal in the same conversation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ execution_package: { execution_allowed: false } }) });
    await analyzeFounderConversation("conversation/1", "开发 Agent", { constraints: ["review"] });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/conversations/conversation%2F1/analyze");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).message).toBe("开发 Agent");
  });

  it("sends goals to the Sino Brain endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ task_plan: [] }) });
    await analyzeWithSinoBrain("conversation/1", "继续推进", { decisions: [] }, { current_phase: "execution" });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/brain/conversations/conversation%2F1/analyze");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      user_goal: "继续推进",
      conversation_context: { decisions: [] },
      project_context: { current_phase: "execution" },
    });
  });

  it("calls the approved execution endpoint explicitly", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "completed" }) });
    await executeFounderExecution("execution/1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/executions/execution%2F1/execute");
  });

  it("polls the canonical execution status endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "testing" }) });
    await getFounderExecution("execution/1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/executions/execution%2F1/status");
  });

  it("resumes a paused execution through the recovery endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "queued" }) });
    await resumeFounderExecution("execution/1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/executions/execution%2F1/resume");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
});
