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
  selectWorkspace: (workspaceId) => request("/developer/workspaces/active", {
    method: "PUT", body: JSON.stringify({ workspace_id: workspaceId }),
  }),
  currentPlan: (workspaceId) => request(`/developer/bridge/state?workspace_id=${encodeURIComponent(workspaceId)}`),
  requestMission: (workspaceId, goal) => request("/developer/bridge/commands", {
    method: "POST", body: JSON.stringify({
      command_type: "request_today_mission",
      workspace_id: workspaceId,
      plan_id: null,
      idempotency_key: `request_today_mission:${workspaceId}:${commandKey(goal)}`,
      contract_version: 1,
      goal,
    }),
  }),
  currentRun: () => request("/developer/run-state"),
  execution: (planId) => request(`/developer/planning/${planId}/execution`),
  approveExecution: (planId) => request("/developer/bridge/commands", {
    method: "POST",
    body: JSON.stringify({
      command_type: "approve_execution",
      workspace_id: "ai-commerce-os",
      plan_id: planId,
      idempotency_key: `approve_execution:${planId}`,
      contract_version: 1,
    }),
  }),
  cancelExecution: (planId) => request(`/developer/planning/${planId}/execution/cancel`, { method: "POST" }),
  approveCommit: (planId) => request(`/developer/planning/${planId}/commit/approve`, { method: "POST" }),
  rejectCommit: (planId) => request(`/developer/planning/${planId}/commit/reject`, { method: "POST" }),
};
