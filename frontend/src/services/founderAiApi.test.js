import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeFounderConversation, analyzeWithSinoBrain, buildSystemBlueprint, createFounderConversation, executeFounderExecution, getFounderBriefing, getFounderExecution, getFounderStrategy, resumeFounderExecution } from "./founderAiApi";

afterEach(() => vi.restoreAllMocks());

describe("Founder AI conversation API", () => {
  it("creates a Founder conversation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "conversation-1" }) });
    await createFounderConversation("Build an agent");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/conversations");
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
