const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class MemoryApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MemoryApiError";
    this.status = status;
  }
}

function buildError(response, fallbackMessage) {
  return new MemoryApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

async function request(path, options, fallbackMessage) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) throw buildError(response, fallbackMessage);
  return response.json();
}

/** @returns {Promise<import("../types/memoryAsset").MemoryAsset[]>} */
export function getMemories() {
  return request("/memories", undefined, "获取记忆资产列表失败");
}

/** @param {string} memoryId */
export function getMemory(memoryId) {
  return request(
    `/memories/${encodeURIComponent(memoryId)}`,
    undefined,
    "获取记忆资产详情失败"
  );
}

/** @param {Object} payload */
export function createMemory(payload) {
  return request(
    "/memories",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "创建记忆资产失败"
  );
}
