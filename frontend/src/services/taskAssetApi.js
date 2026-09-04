const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class TaskAssetApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TaskAssetApiError";
    this.status = status;
  }
}

function buildError(response, fallbackMessage) {
  return new TaskAssetApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

async function request(path, options, fallbackMessage) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) throw buildError(response, fallbackMessage);
  return response.json();
}

/** @returns {Promise<import("../types/taskAsset").TaskAsset[]>} */
export function getTaskAssets() {
  return request("/task-assets", undefined, "获取任务资产列表失败");
}

/** @param {string} taskAssetId */
export function getTaskAsset(taskAssetId) {
  return request(
    `/task-assets/${encodeURIComponent(taskAssetId)}`,
    undefined,
    "获取任务资产详情失败"
  );
}

/** @param {Object} payload */
export function createTaskAsset(payload) {
  return request(
    "/task-assets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "创建任务资产失败"
  );
}
