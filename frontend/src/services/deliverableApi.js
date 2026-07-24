const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class DeliverableApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DeliverableApiError";
    this.status = status;
  }
}

function buildError(response, fallbackMessage) {
  return new DeliverableApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

export async function getDeliverables({
  status,
  deliverableType,
  agentName,
  shopId,
  unassignedShop,
  keyword,
  limit = 20,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (deliverableType) params.set("deliverable_type", deliverableType);
  if (agentName) params.set("agent_name", agentName);
  if (shopId !== undefined && shopId !== null) params.set("shop_id", shopId);
  if (unassignedShop) params.set("unassigned_shop", "true");
  if (keyword) params.set("keyword", keyword);
  params.set("limit", limit);
  params.set("offset", offset);

  const response = await fetch(`${BASE_URL}/deliverables?${params.toString()}`);
  if (!response.ok) throw buildError(response, "获取成果列表失败");
  return response.json();
}

export async function getDeliverable(deliverableId) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(deliverableId)}`
  );
  if (!response.ok) throw buildError(response, "获取成果详情失败");
  return response.json();
}

export async function createDeliverableFromTask(taskId) {
  const response = await fetch(
    `${BASE_URL}/deliverables/from-task/${encodeURIComponent(taskId)}`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, "从任务生成成果失败");
  return response.json();
}

async function postAction(deliverableId, action) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(deliverableId)}/${action}`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, `成果${action}操作失败`);
  return response.json();
}

export const approveDeliverable = (id) => postAction(id, "approve");
export const rejectDeliverable = (id) => postAction(id, "reject");
export const archiveDeliverable = (id) => postAction(id, "archive");
export const restoreDeliverable = (id) => postAction(id, "restore");

export async function createFollowUpTask(deliverableId, payload) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(deliverableId)}/create-follow-up-task`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) throw buildError(response, "基于成果创建任务失败");
  return response.json();
}

export async function getDeliverableVersions(deliverableId) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(deliverableId)}/versions`
  );
  if (!response.ok) throw buildError(response, "获取成果版本列表失败");
  return response.json();
}

export async function getDeliverableVersion(deliverableId, versionNumber) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(
      deliverableId
    )}/versions/${encodeURIComponent(versionNumber)}`
  );
  if (!response.ok) throw buildError(response, "获取成果版本内容失败");
  return response.json();
}

/**
 * 导出成果文件。返回 { blob, filename }，filename 从
 * Content-Disposition 中解析（优先 UTF-8 文件名，取不到则退回
 * ASCII fallback），供调用方触发浏览器下载。
 */
export async function exportDeliverable(deliverableId, format) {
  const response = await fetch(
    `${BASE_URL}/deliverables/${encodeURIComponent(deliverableId)}/export?format=${encodeURIComponent(
      format
    )}`
  );
  if (!response.ok) throw buildError(response, "导出成果失败");

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = parseFilenameFromDisposition(disposition) || `deliverable.${format}`;

  return { blob, filename };
}

export function parseFilenameFromDisposition(disposition) {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // 解码失败时继续尝试 ASCII fallback。
    }
  }

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch) {
    return asciiMatch[1];
  }

  return null;
}
