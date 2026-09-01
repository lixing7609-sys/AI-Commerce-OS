import { afterEach, describe, expect, it, vi } from "vitest";
import { bindFounderConversationProject } from "./founderAiApi";

import { analyzeFounderConversation, analyzeWithSinoBrain, approveCapabilityReady, buildSystemBlueprint, checkModelProvider, completeCapabilityDevelopment, confirmCandidateGoal, createArtifactVersion, createFounderConversation, createFounderProject, createIntelligenceReference, createMemoryRevision, decideExecutionDelta, deleteFounderConversation, deleteFounderProject, discoverProviderModels, discussWithCouncil, discussWithSino, executeFounderExecution, getAssetMemoryCenter, getCapabilityDomains, getCapabilityRepositoryAssets, getConversationWorkspace, getFounderActionQueue, getFounderBriefing, getFounderConversations, getFounderExecution, getFounderProjects, getFounderStrategy, getLibraryArtifact, getLibraryMemory, getLifecycleReuseSuggestions, getModelCenter, getProjectIntelligence, installModelProvider, performConversationCapabilityAction, reasonConfirmedGoal, reuseLifecycleAsset, resumeFounderExecution, runCapabilityTest, saveApplicationModelAssignments, saveExecutionEngine, saveModelProvider, saveModelRoles, selectProviderModels, startCapabilityDevelopment, startTaskExecution, submitExecutionDelta, updateArtifactStatus, updateFounderProject, updateMemoryStatus } from "./founderAiApi";

afterEach(() => vi.restoreAllMocks());

describe("Founder AI conversation API", () => {
  it("creates a Founder conversation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "conversation-1" }) });
    await createFounderConversation("Build an agent", "project-1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/conversations");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Build an agent", project_id: "project-1" });
  });

  it("lists authoritative Founder conversation history", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [{ id: "conversation-1" }] });
    expect(await getFounderConversations()).toEqual([{ id: "conversation-1" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/conversations");
  });

  it("lists global and conversation-scoped Founder Action Queue items", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] });
    await getFounderActionQueue();
    await getFounderActionQueue("conv/1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/action-queue");
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/action-queue?conversation_id=conv%2F1");
  });

  it("deletes a Founder Conversation through the real API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ deleted: true }) });
    await deleteFounderConversation("conversation/1");
    expect(fetchMock.mock.calls[0][0]).toContain("/conversations/conversation%2F1");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("persists and clears a Conversation project binding", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "conversation-1" }) });
    await bindFounderConversationProject("conversation-1", "project-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ project_id: "project-1" });
    await bindFounderConversationProject("conversation-1", null);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ project_id: null });
  });

  it("lists and creates real Founder projects", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] });
    await getFounderProjects();
    await createFounderProject({ name: "New Project", description: null });
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/projects");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });

  it("updates and deletes a Founder Project through the canonical API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ id: "project/1" }) });
    await updateFounderProject("project/1", { name: "AI电商系统" });
    await deleteFounderProject("project/1");
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/projects/project%2F1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("loads the selected Project Intelligence package", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ project_id: "project-1", prompt_version: 2 }) });
    await getProjectIntelligence("project/1");
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/projects/project%2F1/intelligence");
  });

  it("persists discussion messages and restores the workspace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ conversation: { id: "conv-1" } }) });
    await discussWithSino("conv/1", "继续讨论", "discussion");
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/conversations/conv%2F1/messages");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "继续讨论", intent: "discussion" });
    await getConversationWorkspace("conv/1");
    expect(fetchMock.mock.calls[1][0]).toContain("/founder-ai/conversations/conv%2F1/workspace");
  });

  it("sends selected Constitution Work Item context with a semantic refresh message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await discussWithSino("conv-1", "基于新证据重新判断", undefined, { active_surface: "constitution_review", selected_constitution_work_item_id: "work-1" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "基于新证据重新判断", interaction_context: { active_surface: "constitution_review", selected_constitution_work_item_id: "work-1" } });
  });

  it("sends a client message id for an idempotent Founder exchange", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await discussWithSino("conv-1", "只发送一次", undefined, undefined, [], "client-message-123");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "只发送一次", client_message_id: "client-message-123" });
  });

  it("uses the persisted Capability Repository lifecycle and reuse contracts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await getCapabilityDomains();
    await getCapabilityRepositoryAssets("commerce", "skill", "candidate");
    await startCapabilityDevelopment("asset/1");
    await completeCapabilityDevelopment("asset/1");
    await runCapabilityTest("asset/1", { product_name: "咖啡机" });
    await approveCapabilityReady("asset/1");
    await performConversationCapabilityAction("conv/1", { action: "develop", target_asset_id: "asset/1" });
    await getLifecycleReuseSuggestions("conv/1");
    await reuseLifecycleAsset("asset/1", "conversation", "conv/1", "复用");
    expect(fetchMock.mock.calls[0][0]).toContain("/capability-repository/domains");
    expect(fetchMock.mock.calls[1][0]).toContain("domain_id=commerce&asset_type=skill&status=candidate");
    expect(fetchMock.mock.calls[2][0]).toContain("/capability-repository/assets/asset%2F1/development");
    expect(fetchMock.mock.calls[3][0]).toContain("/development/complete");
    expect(JSON.parse(fetchMock.mock.calls[4][1].body).test_input.product_name).toBe("咖啡机");
    expect(fetchMock.mock.calls[5][0]).toContain("/ready-approval");
    expect(fetchMock.mock.calls[6][0]).toContain("/conversations/conv%2F1/capability-action");
    expect(JSON.parse(fetchMock.mock.calls[6][1].body).target_asset_id).toBe("asset/1");
    expect(fetchMock.mock.calls[7][0]).toContain("/conversations/conv%2F1/reuse-suggestions");
    expect(JSON.parse(fetchMock.mock.calls[8][1].body)).toEqual({ target_type: "conversation", target_id: "conv/1", note: "复用" });
  });

  it("surfaces an actionable lifecycle conflict instead of a generic 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: { code: "capability_lifecycle_conflict", message: "当前能力尚未进入 Testing", current_status: "candidate", available_actions: ["develop"] } }) });
    await expect(performConversationCapabilityAction("conv-1", { action: "run_test", target_asset_id: "skill-1" })).rejects.toMatchObject({
      message: "执行能力生命周期动作失败：当前能力尚未进入 Testing",
      status: 409,
      code: "capability_lifecycle_conflict",
      lifecycle: expect.objectContaining({ current_status: "candidate", available_actions: ["develop"] }),
    });
  });

  it("starts Council mode without adding Codex to selected models", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ council_runs: [] }) });
    await discussWithCouncil("conv/1", "Council 还是 Builder？", ["deepseek", "gpt", "claude"]);
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/conversations/conv%2F1/council");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: "Council 还是 Builder？", models: ["deepseek", "gpt", "claude"] });
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

  it("uses the reusable intelligence library contracts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await getLibraryArtifact("artifact/1");
    await createArtifactVersion("artifact/1", { revision_reason: "Update" });
    await updateArtifactStatus("artifact/1", "invalid");
    await getLibraryMemory("memory/1");
    await createMemoryRevision("memory/1", { revision_reason: "Update" });
    await updateMemoryStatus("memory/1", "outdated");
    await createIntelligenceReference({ source_type: "artifact", source_id: "artifact/1", target_type: "goal", target_id: "goal-1" });
    expect(fetchMock.mock.calls[0][0]).toContain("/library/artifacts/artifact%2F1");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[3][0]).toContain("/library/memories/memory%2F1");
    expect(JSON.parse(fetchMock.mock.calls[6][1].body).target_type).toBe("goal");
  });

  it("requests an approval-gated system blueprint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ system_blueprint: {} }) });
    await buildSystemBlueprint("创建 Operator AI", "conv-1", "project-1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/system-builder/blueprint");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ system_goal: "创建 Operator AI", conversation_id: "conv-1", project_id: "project-1" });
  });

  it("reads and updates Model Center through one runtime contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ providers: [], roles: [] }) });
    await getModelCenter();
    await saveModelProvider("gpt", { base_url: "https://api.openai.com/v1", model: "runtime-model", api_key: "secret", enabled: true });
    await checkModelProvider("gpt");
    await saveModelRoles({ reasoner: "gpt" });
    expect(fetchMock.mock.calls[0][0]).toContain("/founder-ai/model-center");
    expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[2][0]).toContain("/providers/gpt/health");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ assignments: { reasoner: "gpt" } });
  });

  it("installs, discovers, selects and assigns AI capabilities", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ providers: [], roles: [] }) });
    await installModelProvider({ provider_type: "openai", api_key: "secret", base_url: null });
    await discoverProviderModels("openai-1");
    await selectProviderModels("openai-1", ["model-a"]);
    await saveApplicationModelAssignments("founder_ai", { sino_conversation: { provider_key: "openai-1", model: "model-a" } });
    expect(fetchMock.mock.calls[0][0]).toContain("/model-center/providers");
    expect(fetchMock.mock.calls[1][0]).toContain("/discover");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ models: ["model-a"] });
    expect(fetchMock.mock.calls[3][0]).toContain("/applications/founder_ai/assignments");
  });

  it("persists the selected execution engine through the registry endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ execution_engines: [] }) });
    await saveExecutionEngine("codex");
    expect(fetchMock.mock.calls[0][0]).toContain("/model-center/execution-engine");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ engine_id: "codex" });
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

  it("starts TaskAsset execution through the explicit start endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ execution_id: "execution-1", execution_status: "queued" }) });
    await startTaskExecution("task/1");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/founder-ai/task-assets/task%2F1/start-execution");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
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
