const BASE_URL = "http://127.0.0.1:8000/api/v1";

async function request(path, options, fallback) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    let detail = null;
    try { detail = await response.json(); } catch { /* non-JSON error */ }
    const payload = detail?.detail && typeof detail.detail === "object" ? detail.detail : detail;
    const actionable = payload?.message || (typeof detail?.detail === "string" ? detail.detail : null);
    const error = new Error(actionable ? `${fallback}：${actionable}` : `${fallback}（状态码 ${response.status}）`);
    error.status = response.status;
    error.code = payload?.code || null;
    error.lifecycle = payload || null;
    throw error;
  }
  return response.json();
}

export function createFounderConversation(title, projectId, governance = {}) {
  return request("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, project_id: projectId || null, ...governance }),
  }, "创建 Founder Conversation 失败");
}

export function getFounderConversations() {
  return request("/conversations", undefined, "获取 Founder 历史会话失败");
}

export function deleteFounderConversation(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" }, "删除 Conversation 失败");
}

export function activateFounderConversation(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/activate`, { method: "POST" }, "激活 Founder Conversation 失败");
}

export function bindFounderConversationProject(conversationId, projectId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/project`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId || null }),
  }, "更新 Conversation 项目失败");
}

export function setFounderConversationModel(conversationId, providerKey, model) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/conversation-model`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_key: providerKey, model }),
  }, "切换 Conversation Model 失败");
}

export function getFounderProjects() {
  return request("/founder-ai/projects", undefined, "获取 Founder 项目失败");
}

export function createFounderProject(payload) {
  return request("/founder-ai/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "创建 Founder 项目失败");
}
export function updateFounderProject(projectId, payload) { return request(`/founder-ai/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "更新 Founder 项目失败"); }
export function deleteFounderProject(projectId) { return request(`/founder-ai/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }, "删除 Founder 项目失败"); }

export function getProjectIntelligence(projectId) {
  return request(`/founder-ai/projects/${encodeURIComponent(projectId)}/intelligence`, undefined, "获取项目智能失败");
}

export function getFounderDrafts(projectId) {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return request(`/founder-ai/drafts${query}`, undefined, "获取草案中心失败");
}

export function getFounderDraft(draftId) {
  return request(`/founder-ai/drafts/${encodeURIComponent(draftId)}`, undefined, "获取草案详情失败");
}

export function getConversationWorkspace(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/workspace`, undefined, "恢复 Sino 讨论失败");
}
export function cancelFounderExecution(executionId) { return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/cancel`, { method: "POST" }, "停止任务失败"); }
export function acceptFounderTaskResult(conversationId) { return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/tasks/current/accept`, { method: "POST" }, "验收任务失败"); }
export function decideFounderClarification(conversationId, action) { return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/clarification/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "处理任务理解确认失败"); }
export function decideFounderTaskCandidate(conversationId, candidateId, action) { return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/task-candidate/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId, action }) }, "处理待确认任务失败"); }
export function focusFounderTask(conversationId, taskRef) { return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/tasks/focus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_ref: taskRef }) }, "切换任务失败"); }

export function getFounderObject(objectId) { return request(`/founder-ai/objects/${encodeURIComponent(objectId)}`, undefined, "获取 Founder Object 失败"); }
export function getFounderObjects() { return request("/founder-ai/objects", undefined, "获取 Founder Object Workspace 失败"); }
export function continueFounderObjectDiscussion(objectId, conversationId) { return request(`/founder-ai/objects/${encodeURIComponent(objectId)}/continue-discussion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversationId }) }, "挂载 Founder Object 失败"); }
export async function clearFounderObjectDiscussion(conversationId) {
  const response = await fetch(`${BASE_URL}/founder-ai/conversations/${encodeURIComponent(conversationId)}/context-object`, { method: "DELETE" });
  if (!response.ok) throw new Error(`退出对象讨论失败（状态码 ${response.status}）`);
}
export function approveFounderObject(objectId) { return request(`/founder-ai/objects/${encodeURIComponent(objectId)}/approve`, { method: "POST" }, "批准 Founder Object 失败"); }
export function archiveFounderObject(objectId) { return request(`/founder-ai/objects/${encodeURIComponent(objectId)}/archive`, { method: "POST" }, "归档 Founder Object 失败"); }
export function reviewFounderCandidate(candidateId, action) { return request(`/founder-ai/candidates/${encodeURIComponent(candidateId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核候选变更失败"); }
export function continueFounderCandidateDiscussion(candidateId, conversationId) { return request(`/founder-ai/candidates/${encodeURIComponent(candidateId)}/continue-discussion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversation_id: conversationId }) }, "继续讨论候选变更失败"); }

export function discussWithSino(conversationId, content, intent, interactionContext, attachmentIds = [], clientMessageId) {
  const payload = { content, intent, interaction_context: interactionContext };
  if (attachmentIds.length) payload.attachment_ids = attachmentIds;
  if (clientMessageId) payload.client_message_id = clientMessageId;
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }, "发送讨论消息失败");
}

export async function discussWithSinoStream(conversationId, content, intent, interactionContext, attachmentIds = [], clientMessageId, onChunk) {
  const payload = { content, intent, interaction_context: interactionContext, client_message_id: clientMessageId };
  if (attachmentIds.length) payload.attachment_ids = attachmentIds;
  const response = await fetch(`${BASE_URL}/founder-ai/conversations/${encodeURIComponent(conversationId)}/messages/stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!response.ok || !response.body) {
    if (!response.ok) throw new Error(`发送讨论消息失败（状态码 ${response.status}）`);
    return discussWithSino(conversationId, content, intent, interactionContext, attachmentIds, clientMessageId);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalSnapshot = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "chunk" && event.client_message_id === clientMessageId) onChunk?.(event.content);
      if (event.type === "final" && event.client_message_id === clientMessageId) finalSnapshot = event.snapshot;
      if (event.type === "error") throw new Error(event.message || "Sino 回复失败");
    }
    if (done) break;
  }
  if (!finalSnapshot) throw new Error("Sino 回复流未完成");
  return finalSnapshot;
}

export function uploadFounderImage(conversationId, file) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/attachments`, { method: "POST", headers: { "Content-Type": file.type, "X-Original-Filename": encodeURIComponent(file.name || "image") }, body: file }, "上传截图失败");
}
export function founderImageUrl(conversationId, attachmentId) {
  return `${BASE_URL}/founder-ai/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function discussWithCouncil(conversationId, content, models) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/council`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, models: models || null }),
  }, "发起多模型讨论失败");
}

export function discussWithAutoDeliberation(conversationId, content, models) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/auto-deliberation`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, models: models || null }),
  }, "发起自动多轮讨论失败");
}

export function confirmSinoBrainGoal(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/goal/confirm`, { method: "POST" }, "确认 Goal Brief 失败");
}

export function forceSinoBrainGoalReview(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/goal/force-review`, { method: "POST" }, "进入目标确认失败");
}

export function reviewConstitutionUnderstanding(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/constitution/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核 Constitution Understanding 失败");
}

export function reviewProjectOutcome(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/project-outcome/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核 Project Planning 成果失败");
}

export function reviewImplementationPlan(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/implementation-plan/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核实施方案失败");
}

export function ensureFounderGateProposal(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/founder-gate-proposal/ensure`, { method: "POST" }, "准备 Founder Gate Proposal 失败");
}

export function reviewFounderGateProposal(conversationId, proposalId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/founder-gate-proposals/${encodeURIComponent(proposalId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核 Founder Gate Proposal 失败");
}

export function decideImageModelProbeGate(conversationId, action, boundary) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/image-model-probe-gate/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, boundary }) }, "记录 Image Model Probe Founder Decision 失败");
}

export function decideExternalModelProbeGate(conversationId, action, boundary) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/external-model-probe-gate/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, boundary }) }, "记录 External Model Probe Founder Decision 失败");
}

export function decideArchitectureProposal(conversationId, proposalId, action, proposalVersion, founderFeedback) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/architecture-proposals/${encodeURIComponent(proposalId)}/decision`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, proposal_version: proposalVersion, founder_feedback: founderFeedback || null }),
  }, "记录 Architecture Proposal Founder Decision 失败");
}

export function continueProjectPlanningAnalysis(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/project-planning/continue`, { method: "POST" }, "继续自主分析失败");
}

export function reviewConstitutionWorkItem(conversationId, workItemId, decision) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/constitution/work-items/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId, decision }) }, "记录建议工作项决定失败");
}

export function understandConstitutionWorkItem(conversationId, workItemId, refresh = false) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/constitution/work-items/understand`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId, refresh }) }, "理解建议工作项失败");
}

export function reviewConstitutionWorkItemRouting(conversationId, workItemId, decision) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/constitution/work-items/routing/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId, decision }) }, "审核 Sino Routing Recommendation 失败");
}

export function confirmFormalObjectProposal(conversationId, workItemId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/constitution/work-items/formal-object/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId }) }, "创建 System Project 失败");
}

export function startSinoBrainStrategy(conversationId, models) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/strategy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "基于已确认 Goal Brief 开始策略会议", models: models || null }) }, "启动 Strategy Meeting 失败");
}

export function reviewSinoBrainPackage(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/package/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "审核 Discussion Package 失败");
}

export function advanceSinoBrainStage(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/brain/stage/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "推进 Sino Brain 阶段失败");
}

export function retryCouncil(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/council/retry`, { method: "POST" }, "重试多模型讨论失败");
}

export function retrySinoReply(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/reply/retry`, { method: "POST" }, "重试 Sino 回复失败");
}

export function confirmCandidateGoal(conversationId, candidateGoalId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/candidate-goals/${encodeURIComponent(candidateGoalId)}/confirm`, { method: "POST" }, "确认目标失败");
}

export function reasonConfirmedGoal(goalId) {
  return request(`/founder-ai/goals/${encodeURIComponent(goalId)}/reason`, { method: "POST" }, "目标推理失败");
}

export function getFounderBriefing() {
  return request("/founder-ai/briefing", undefined, "获取 Sino 项目简报失败");
}

export function getFounderStrategy() {
  return request("/founder-ai/strategy", undefined, "获取 Sino 战略规划失败");
}

export function getAssetMemoryCenter() {
  return request("/founder-ai/asset-memory-center", undefined, "获取资产与记忆历史失败");
}

export function getLibraryArtifact(artifactId) {
  return request(`/founder-ai/library/artifacts/${encodeURIComponent(artifactId)}`, undefined, "获取成果详情失败");
}

export function createArtifactVersion(artifactId, payload) {
  return request(`/founder-ai/library/artifacts/${encodeURIComponent(artifactId)}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "创建成果版本失败");
}

export function updateArtifactStatus(artifactId, status) {
  return request(`/founder-ai/library/artifacts/${encodeURIComponent(artifactId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }, "更新成果状态失败");
}

export function getLibraryMemory(memoryId) {
  return request(`/founder-ai/library/memories/${encodeURIComponent(memoryId)}`, undefined, "获取记忆详情失败");
}

export function createMemoryRevision(memoryId, payload) {
  return request(`/founder-ai/library/memories/${encodeURIComponent(memoryId)}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "创建记忆修订失败");
}

export function updateMemoryStatus(memoryId, status) {
  return request(`/founder-ai/library/memories/${encodeURIComponent(memoryId)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }, "更新记忆状态失败");
}

export function mergeLibraryMemories(payload) {
  return request("/founder-ai/library/memories/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "合并记忆失败");
}

export function createIntelligenceReference(payload) {
  return request("/founder-ai/library/references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "引用资产失败");
}

export function buildSystemBlueprint(systemGoal, conversationId, projectId) {
  return request("/founder-ai/system-builder/blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_goal: systemGoal, conversation_id: conversationId, project_id: projectId || null }),
  }, "创建 AI System Blueprint 失败");
}

export function getModelCenter() {
  return request("/founder-ai/model-center", undefined, "获取模型中心失败");
}

export function getRuntimeEnvironmentRegistry() {
  return request("/founder-ai/runtime-environments", undefined, "获取运行环境注册表失败");
}

export function saveModelProvider(providerKey, payload) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "保存模型配置失败");
}

export function checkModelProvider(providerKey) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/health`, { method: "POST" }, "模型健康检查失败");
}

export function saveModelRoles(assignments) {
  return request("/founder-ai/model-center/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments }) }, "保存模型角色失败");
}

export function saveMultiModelAssignment(slots) {
  return request("/founder-ai/model-center/capabilities/multi-model-discussion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slots }) }, "保存多模型讨论配置失败");
}

export function saveCapabilityAssignment(capabilityKey, providerKey, model, fallbacks = []) {
  return request(`/founder-ai/model-center/capabilities/${encodeURIComponent(capabilityKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider_key: providerKey || null, model: model || null, fallbacks }) }, "保存能力分配失败");
}

export function saveModelRoutingPreferred(capability, preferredPrimary, preferredFallback = null) {
  return request(`/founder-ai/model-center/routing-policies/${encodeURIComponent(capability)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferred_primary: preferredPrimary, preferred_fallback: preferredFallback }) }, "保存模型路由策略失败");
}

export function saveExecutionEngine(engineId) {
  return request("/founder-ai/model-center/execution-engine", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engine_id: engineId }) }, "保存执行引擎失败");
}

export function installModelProvider(payload) {
  return request("/founder-ai/model-center/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "添加模型 Provider 失败");
}

export function discoverProviderModels(providerKey) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/discover`, { method: "POST" }, "发现可用模型失败");
}

export function updateModelProviderCredentials(providerKey, payload) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/credentials`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "更新 Provider 配置失败");
}

export function selectProviderModels(providerKey, models) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/models`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ models }) }, "保存模型选择失败");
}

export function setModelProviderEnabled(providerKey, enabled) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/enabled`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }, "更新模型状态失败");
}

export async function deleteModelProvider(providerKey) {
  const response = await fetch(`${BASE_URL}/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`删除模型 Provider 失败（状态码 ${response.status}）`);
}

export function saveApplicationModelAssignments(applicationKey, assignments) {
  return request(`/founder-ai/model-center/applications/${encodeURIComponent(applicationKey)}/assignments`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments }) }, "保存应用绑定失败");
}

export function analyzeFounderConversation(conversationId, message, context) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
  }, "Founder AI 分析失败");
}

export function analyzeWithSinoBrain(conversationId, userGoal, conversationContext, projectContext) {
  return request(`/founder-ai/brain/conversations/${encodeURIComponent(conversationId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_goal: userGoal, conversation_context: conversationContext, project_context: projectContext }),
  }, "Sino Brain 分析失败");
}

export function createFounderExecution(taskAssetId, executionPackage, goalId) {
  return request("/founder-ai/executions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_asset_id: taskAssetId, execution_package: executionPackage, goal_id: goalId }),
  }, "创建执行会话失败");
}

export function submitExecutionDelta(executionId, payload) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/deltas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "发送执行补充失败");
}

export function decideExecutionDelta(executionId, deltaId, action) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/deltas/${encodeURIComponent(deltaId)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }, "处理执行补充失败");
}

export function approveFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/approve`, { method: "POST" }, "授权执行失败");
}

export function executeFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/execute`, { method: "POST" }, "执行 Founder 任务失败");
}

export function getFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/status`, undefined, "获取执行状态失败");
}

export function resumeFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/resume`, { method: "POST" }, "恢复执行失败");
}

export function decideCodexAuthorization(executionId, action, approvedScope = {}) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/codex-authorization/decision`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, approved_scope: approvedScope }),
  }, "处理 Codex 授权边界失败");
}

export function getLifecycleAssets(assetType, includeLegacy = false) {
  const query = new URLSearchParams();
  if (assetType) query.set("asset_type", assetType);
  if (includeLegacy) query.set("include_legacy", "true");
  return request(`/founder-ai/asset-lifecycle/assets${query.size ? `?${query}` : ""}`, undefined, "获取正式资产失败");
}

export function getLifecycleAsset(assetId) {
  return request(`/founder-ai/asset-lifecycle/assets/${encodeURIComponent(assetId)}`, undefined, "获取资产详情失败");
}

export function startLifecycleExecution(assetId) {
  return request(`/founder-ai/asset-lifecycle/assets/${encodeURIComponent(assetId)}/execution`, { method: "POST" }, "创建资产执行失败");
}

export function getLifecycleExecutions() {
  return request("/founder-ai/asset-lifecycle/executions", undefined, "获取执行中心失败");
}

export function createExecutionLearning(executionId) {
  return request(`/founder-ai/asset-lifecycle/executions/${encodeURIComponent(executionId)}/learning`, { method: "POST" }, "提炼执行学习失败");
}

export function getLifecycleLearnings() {
  return request("/founder-ai/asset-lifecycle/learnings", undefined, "获取 Learning 失败");
}

export function reuseLifecycleAsset(assetId, targetType, targetId, note) {
  return request(`/founder-ai/asset-lifecycle/assets/${encodeURIComponent(assetId)}/reuse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_type: targetType, target_id: targetId, note: note || null }) }, "引用资产失败");
}

export function getLifecycleReuseSuggestions(conversationId) {
  return request(`/founder-ai/asset-lifecycle/conversations/${encodeURIComponent(conversationId)}/reuse-suggestions`, undefined, "获取可复用资产失败");
}

export function getCapabilityDomains() {
  return request("/founder-ai/capability-repository/domains", undefined, "获取能力领域失败");
}

export function getCapabilityRepositoryAssets(domainId, assetType, status) {
  const query = new URLSearchParams();
  if (domainId) query.set("domain_id", domainId);
  if (assetType) query.set("asset_type", assetType);
  if (status) query.set("status", status);
  return request(`/founder-ai/capability-repository/assets${query.size ? `?${query}` : ""}`, undefined, "获取能力仓库失败");
}

export function startCapabilityDevelopment(assetId) {
  return request(`/founder-ai/capability-repository/assets/${encodeURIComponent(assetId)}/development`, { method: "POST" }, "启动能力开发失败");
}

export function completeCapabilityDevelopment(assetId) {
  return request(`/founder-ai/capability-repository/assets/${encodeURIComponent(assetId)}/development/complete`, { method: "POST" }, "完成能力开发失败");
}

export function runCapabilityTest(assetId, testInput) {
  return request(`/founder-ai/capability-repository/assets/${encodeURIComponent(assetId)}/tests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test_input: testInput || null }) }, "运行能力测试失败");
}

export function approveCapabilityReady(assetId) {
  return request(`/founder-ai/capability-repository/assets/${encodeURIComponent(assetId)}/ready-approval`, { method: "POST" }, "批准可引用能力失败");
}

export function performConversationCapabilityAction(conversationId, action) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/capability-action`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
  }, "执行能力生命周期动作失败");
}
