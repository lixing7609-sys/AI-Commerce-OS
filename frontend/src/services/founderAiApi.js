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

export function analyzeFounderConversation(conversationId, message, context) {
  return request(`/founder-ai/conversations/${encodeURIComponent(conversationId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, context }),
  }, "Founder AI 分析失败");
}

export function createFounderExecution(taskAssetId, executionPackage) {
  return request("/founder-ai/executions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_asset_id: taskAssetId, execution_package: executionPackage }),
  }, "创建执行会话失败");
}

export function approveFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/approve`, { method: "POST" }, "授权执行失败");
}

export function executeFounderExecution(executionId) {
  return request(`/founder-ai/executions/${encodeURIComponent(executionId)}/execute`, { method: "POST" }, "执行 Founder 任务失败");
}
