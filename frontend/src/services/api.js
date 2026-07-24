const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function getDashboardSummary() {
  const response = await fetch(`${BASE_URL}/dashboard/summary`);

  if (!response.ok) {
    throw new Error("获取 Dashboard 数据失败");
  }

  return response.json();
}

export async function getTasks({
  status,
  assignedAgent,
  shopId,
  unassignedShop,
  limit = 50,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (assignedAgent) {
    params.set("assigned_agent", assignedAgent);
  }

  if (shopId !== undefined && shopId !== null) {
    params.set("shop_id", shopId);
  }

  if (unassignedShop) {
    params.set("unassigned_shop", "true");
  }

  params.set("limit", limit);
  params.set("offset", offset);

  const response = await fetch(`${BASE_URL}/tasks?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`获取任务列表失败（状态码 ${response.status}）`);
  }

  return response.json();
}

export async function getTaskStats() {
  const response = await fetch(`${BASE_URL}/tasks/stats`);

  if (!response.ok) {
    throw new Error(`获取任务统计失败（状态码 ${response.status}）`);
  }

  return response.json();
}

export async function getTaskDetail(taskId) {
  const response = await fetch(`${BASE_URL}/tasks/${taskId}`);

  if (!response.ok) {
    throw new Error(`获取任务详情失败（状态码 ${response.status}）`);
  }

  return response.json();
}