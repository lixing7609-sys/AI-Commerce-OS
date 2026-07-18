const BASE_URL = "http://127.0.0.1:8000/api/v1";

async function parseRuntimeResponse(response, failureMessage) {
  if (!response.ok) {
    throw new Error(`${failureMessage}（状态码 ${response.status}）`);
  }

  return response.json();
}

/** @returns {Promise<import("../types/runtime").RuntimeStatusResponse>} */
export async function getRuntimeStatus() {
  const response = await fetch(`${BASE_URL}/runtime/status`);

  return parseRuntimeResponse(response, "获取 Runtime 状态失败");
}

/** @returns {Promise<import("../types/runtime").RuntimeStatusResponse>} */
export async function startRuntime() {
  const response = await fetch(`${BASE_URL}/runtime/start`, {
    method: "POST",
  });

  return parseRuntimeResponse(response, "启动 Runtime 失败");
}

/** @returns {Promise<import("../types/runtime").RuntimeStatusResponse>} */
export async function stopRuntime() {
  const response = await fetch(`${BASE_URL}/runtime/stop`, {
    method: "POST",
  });

  return parseRuntimeResponse(response, "停止 Runtime 失败");
}

/**
 * @param {boolean} enabled
 * @returns {Promise<import("../types/runtime").RuntimeStatusResponse>}
 */
export async function updateAutoResume(enabled) {
  const response = await fetch(`${BASE_URL}/runtime/auto-resume`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled }),
  });

  return parseRuntimeResponse(response, "更新自动恢复设置失败");
}
