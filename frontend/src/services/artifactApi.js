const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class ArtifactApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ArtifactApiError";
    this.status = status;
  }
}

function buildError(response, fallbackMessage) {
  return new ArtifactApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

async function request(path, options, fallbackMessage) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (!response.ok) throw buildError(response, fallbackMessage);
  return response.json();
}

/** @returns {Promise<import("../types/artifactAsset").ArtifactAsset[]>} */
export function getArtifacts() {
  return request("/artifacts", undefined, "获取成果资产列表失败");
}

/** @param {string} artifactId */
export function getArtifact(artifactId) {
  return request(
    `/artifacts/${encodeURIComponent(artifactId)}`,
    undefined,
    "获取成果资产详情失败"
  );
}

/** @param {Object} payload */
export function createArtifact(payload) {
  return request(
    "/artifacts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "创建成果资产失败"
  );
}
