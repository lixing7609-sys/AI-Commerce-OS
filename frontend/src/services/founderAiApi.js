const BASE_URL = "http://127.0.0.1:8000/api/v1";

async function request(path, options, fallback) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) throw new Error(`${fallback}（状态码 ${response.status}）`);
  return response.json();
}

export function createFounderConversation(title) {
  return request("/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }, "创建 Founder Conversation 失败");
}

export function getConversationWorkspace(conversationId) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/workspace`, undefined, "恢复 Sino 讨论失败");
}

export function discussWithSino(conversationId, content, intent) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, intent }),
  }, "发送讨论消息失败");
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

export function buildSystemBlueprint(systemGoal, conversationId) {
  return request("/founder-ai/system-builder/blueprint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_goal: systemGoal, conversation_id: conversationId }),
  }, "创建 AI System Blueprint 失败");
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
