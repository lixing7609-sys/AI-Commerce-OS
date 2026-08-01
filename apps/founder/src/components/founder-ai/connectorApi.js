// Sino Connector 前端客户端 —— 唯一允许调用后端 Connector 接口的
// 模块。任何 API Key、Token、Claude 凭证都不会经过这里——这里只
// 发送/接收业务数据，凭据只存在于 backend 进程内。
// 沿用 frontend/src/services 既有的 fetch + BASE_URL 约定。

const BASE_URL = "http://127.0.0.1:8000/api/v1/connector";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = null;
    try {
      detail = await response.json();
    } catch {
      // 忽略非 JSON 错误体
    }
    const error = new Error(
      (detail && (detail.detail?.message || detail.detail || detail.message)) ||
        `请求失败（状态码 ${response.status}）`
    );
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return response.json();
}

export async function getConnectorHealth() {
  return request("/health");
}

export async function brainComplete({ conversationId, message, sinoState, recentMessages, knowledge = [] }) {
  return request("/brain/complete", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      message,
      sino_state: sinoState,
      recent_messages: recentMessages,
      knowledge,
    }),
  });
}

export async function previewTaskPackage({ conversationId, decisionId, taskPackage }) {
  return request("/task-packages/preview", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      decision_id: decisionId,
      task_package: taskPackage,
    }),
  });
}

export async function startExecution({ conversationId, decisionId, taskPackageId, taskPackage }) {
  return request("/execution/start", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      decision_id: decisionId,
      task_package_id: taskPackageId,
      task_package: taskPackage,
    }),
  });
}

export async function getExecutionStatus(runId) {
  return request(`/execution/${runId}/status`);
}

export async function provideExecutionInput(runId, answer) {
  return request(`/execution/${runId}/input`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

export async function cancelExecution(runId) {
  return request(`/execution/${runId}/cancel`, { method: "POST" });
}

export function screenshotUrl(screenshotPath) {
  if (!screenshotPath) return null;
  const filename = screenshotPath.split("/").pop();
  return `http://127.0.0.1:8000/connector-screenshots/${filename}`;
}
