const BASE_URL = "/developer-os/api";

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
  currentPlan: (workspaceId) => request(`/developer/planning/current?workspace_id=${encodeURIComponent(workspaceId)}`),
  requestMission: (workspaceId, goal) => request("/developer/planning", {
    method: "POST", body: JSON.stringify({ workspace_id: workspaceId, goal }),
  }),
  currentRun: () => request("/developer/run-state"),
  execution: (planId) => request(`/developer/planning/${planId}/execution`),
  approveExecution: (planId) => request(`/developer/planning/${planId}/approve`, { method: "POST" }),
  cancelExecution: (planId) => request(`/developer/planning/${planId}/execution/cancel`, { method: "POST" }),
  approveCommit: (planId) => request(`/developer/planning/${planId}/commit/approve`, { method: "POST" }),
  rejectCommit: (planId) => request(`/developer/planning/${planId}/commit/reject`, { method: "POST" }),
};
