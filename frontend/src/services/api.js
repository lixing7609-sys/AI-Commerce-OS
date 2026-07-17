const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function getDashboardSummary() {
  const response = await fetch(`${BASE_URL}/dashboard/summary`);

  if (!response.ok) {
    throw new Error("获取 Dashboard 数据失败");
  }

  return response.json();
}