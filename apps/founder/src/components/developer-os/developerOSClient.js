const BASE_URL = "/developer-os/api";

function commandKey(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON response */ }
    const detail = body?.detail;
    const message = detail?.message || detail || body?.message || `研发服务请求失败（${response.status}）`;
    const error = new Error(typeof message === "string" ? message : "研发服务暂时不可用");
    error.status = response.status;
    error.code = detail?.code || body?.code || "developer_os_unavailable";
    throw error;
  }
  return response.json();
}

export const developerOSClient = {
  listWorkspaces: () => request("/developer/workspaces"),
  setActiveConversation: (workspaceId, conversationId) => request("/developer/conversation/active", {
    method: "PUT",
    body: JSON.stringify({ workspace_id: workspaceId, conversation_id: conversationId || null }),
  }),
  selectWorkspace: (workspaceId) => request("/developer/workspaces/active", {
    method: "PUT", body: JSON.stringify({ workspace_id: workspaceId }),
  }),
  currentPlan: (workspaceId, conversationId = null) => request(`/developer/bridge/state?workspace_id=${encodeURIComponent(workspaceId)}${conversationId ? `&conversation_id=${encodeURIComponent(conversationId)}` : ""}`),
  requestMission: (workspaceId, goal, conversationId = null) => request("/developer/bridge/commands", {
    method: "POST", body: JSON.stringify({
      command_type: "request_today_mission",
      workspace_id: workspaceId,
      plan_id: null,
      idempotency_key: `request_today_mission:${workspaceId}:${conversationId || "global"}:${commandKey(goal)}`,
      contract_version: 1,
      goal,
      conversation_id: conversationId,
    }),
  }),
  currentRun: (workspaceId = "ai-commerce-os", conversationId = null) => request(`/developer/run-state?workspace_id=${encodeURIComponent(workspaceId)}${conversationId ? `&conversation_id=${encodeURIComponent(conversationId)}` : ""}`),
  execution: (planId) => request(`/developer/planning/${planId}/execution`),
  approveExecution: (planId, approvalId, conversationId = null) => request("/developer/bridge/commands", {
    method: "POST",
    body: JSON.stringify({
      command_type: "approve_execution",
      workspace_id: "ai-commerce-os",
      plan_id: planId,
      approval_id: approvalId,
      idempotency_key: `approve_execution:${planId}:${approvalId}`,
      contract_version: 1,
      conversation_id: conversationId,
    }),
  }),
  reviseCommitMessage: (planId, suggestedCommitMessage, conversationId = null) => request("/developer/bridge/commands", {
    method: "POST",
    body: JSON.stringify({
      command_type: "revise_commit_message",
      workspace_id: "ai-commerce-os",
      plan_id: planId,
      suggested_commit_message: suggestedCommitMessage,
      idempotency_key: `revise_commit_message:${planId}:${commandKey(suggestedCommitMessage)}`,
      contract_version: 1,
      conversation_id: conversationId,
    }),
  }),
  cancelExecution: (planId) => request(`/developer/planning/${planId}/execution/cancel`, { method: "POST" }),
  approveCommit: (planId) => request(`/developer/planning/${planId}/commit/approve`, { method: "POST" }),
  rejectCommit: (planId) => request(`/developer/planning/${planId}/commit/reject`, { method: "POST" }),
};
