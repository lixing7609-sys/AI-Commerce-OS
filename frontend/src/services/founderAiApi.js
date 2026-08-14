const BASE_URL = "http://127.0.0.1:8000/api/v1";

async function request(path, options, fallback) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) {
    let detail = null;
    try { detail = await response.json(); } catch { /* non-JSON error */ }
    const error = new Error(`${fallback}（状态码 ${response.status}）`);
    error.status = response.status;
    error.code = detail?.detail?.code || detail?.code || null;
    throw error;
  }
  return response.json();
}

export function createFounderConversation(title, projectId) {
  return request("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, project_id: projectId || null }),
  }, "创建 Founder Conversation 失败");
}

export function getFounderConversations() {
  return request("/conversations", undefined, "获取 Founder 历史会话失败");
}

export function deleteFounderConversation(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" }, "删除 Conversation 失败");
}

export function bindFounderConversationProject(conversationId, projectId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/project`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId || null }),
  }, "更新 Conversation 项目失败");
}

export function getFounderProjects() {
  return request("/founder-ai/projects", undefined, "获取 Founder 项目失败");
}

export function createFounderProject(payload) {
  return request("/founder-ai/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "创建 Founder 项目失败");
}

export function getProjectIntelligence(projectId) {
  return request(`/founder-ai/projects/${encodeURIComponent(projectId)}/intelligence`, undefined, "获取项目智能失败");
}

export function getConversationWorkspace(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/workspace`, undefined, "恢复 Sino 讨论失败");
}

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

export function discussWithSino(conversationId, content, intent) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, intent }),
  }, "发送讨论消息失败");
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

export function saveModelProvider(providerKey, payload) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, "保存模型配置失败");
}

export function checkModelProvider(providerKey) {
  return request(`/founder-ai/model-center/providers/${encodeURIComponent(providerKey)}/health`, { method: "POST" }, "模型健康检查失败");
}

export function saveModelRoles(assignments) {
  return request("/founder-ai/model-center/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments }) }, "保存模型角色失败");
}

export function saveMultiModelAssignment(models) {
  return request("/founder-ai/model-center/capabilities/multi-model-discussion", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ models }) }, "保存多模型讨论配置失败");
}

export function saveCapabilityAssignment(capabilityKey, providerKey, model) {
  return request(`/founder-ai/model-center/capabilities/${encodeURIComponent(capabilityKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider_key: providerKey || null, model: model || null }) }, "保存能力分配失败");
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
