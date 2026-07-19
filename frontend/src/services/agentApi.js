const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function getAgents() {
  const response = await fetch(`${BASE_URL}/agents`);

  if (!response.ok) {
    throw new Error(`获取 AI 员工列表失败（状态码 ${response.status}）`);
  }

  return response.json();
}
