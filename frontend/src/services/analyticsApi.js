const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function getTaskAnalytics(range = "7d") {
  const params = new URLSearchParams({ range });
  const response = await fetch(`${BASE_URL}/analytics/tasks?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`获取数据分析失败（状态码 ${response.status}）`);
  }

  return response.json();
}
