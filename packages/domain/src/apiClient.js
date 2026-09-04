import { API_BASE_URL } from "./constants.js";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SinoFUT API ${options.method || "GET"} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getState: () => request("/api/state"),
  reset: () => request("/api/reset", { method: "POST" }),

  createOpportunity: (body) =>
    request("/api/opportunities", { method: "POST", body: JSON.stringify(body) }),
  generateStrategy: (opportunityId) =>
    request(`/api/opportunities/${opportunityId}/strategy`, { method: "POST" }),

  createContent: (strategyId, contentType) =>
    request("/api/content", { method: "POST", body: JSON.stringify({ strategyId, contentType }) }),
  advanceContent: (contentId, stage) =>
    request(`/api/content/${contentId}`, { method: "PATCH", body: JSON.stringify({ stage }) }),
  updateContent: (contentId, patch) =>
    request(`/api/content/${contentId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  incrementReference: (contentId) =>
    request(`/api/content/${contentId}/reference`, { method: "POST" }),
  submitForApproval: (contentId) =>
    request(`/api/content/${contentId}/submit-approval`, { method: "POST" }),
  decideApproval: (approvalId, decision) =>
    request(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  publish: (contentId, channel) =>
    request("/api/publish", { method: "POST", body: JSON.stringify({ contentId, channel }) }),
  recordMetrics: (publishId, metrics) =>
    request(`/api/publish/${publishId}/metrics`, {
      method: "POST",
      body: JSON.stringify(metrics),
    }),
  settleOrder: (orderId) => request(`/api/orders/${orderId}/settle`, { method: "POST" }),

  tickCloudUsage: (amount) =>
    request("/api/cloud/tick", { method: "POST", body: JSON.stringify({ amount }) }),
};
