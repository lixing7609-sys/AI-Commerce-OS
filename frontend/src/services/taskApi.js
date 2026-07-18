const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class TaskApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TaskApiError";
    this.status = status;
  }
}

function buildTaskApiError(response, fallbackMessage) {
  // 不读取/展示后端 detail 原文，避免大段内部信息直接呈现给用户；
  // UI 层按 error.status 映射为本轮要求的固定文案。
  return new TaskApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

export async function getRecoveryCandidates({
  status,
  assignedAgent,
  staleAfterMinutes,
  limit = 20,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (assignedAgent) {
    params.set("assigned_agent", assignedAgent);
  }

  if (staleAfterMinutes) {
    params.set("stale_after_minutes", staleAfterMinutes);
  }

  params.set("limit", limit);
  params.set("offset", offset);

  const response = await fetch(
    `${BASE_URL}/tasks/recovery-candidates?${params.toString()}`
  );

  if (!response.ok) {
    throw buildTaskApiError(response, "获取异常任务候选清单失败");
  }

  return response.json();
}

export async function requeueTask(taskId) {
  const response = await fetch(
    `${BASE_URL}/tasks/${encodeURIComponent(taskId)}/requeue`,
    { method: "POST" }
  );

  if (!response.ok) {
    throw buildTaskApiError(response, "重新排队任务失败");
  }

  return response.json();
}

export async function markTaskFailed(taskId, reason) {
  const response = await fetch(
    `${BASE_URL}/tasks/${encodeURIComponent(taskId)}/mark-failed`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!response.ok) {
    throw buildTaskApiError(response, "标记任务失败失败");
  }

  return response.json();
}
