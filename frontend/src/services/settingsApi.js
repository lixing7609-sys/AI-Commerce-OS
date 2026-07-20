const BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function getIntegrationStatus() {
  const response = await fetch(`${BASE_URL}/settings/integration-status`);

  if (!response.ok) {
    throw new Error(`获取集成状态失败（状态码 ${response.status}）`);
  }

  return response.json();
}

export async function getLlmStatus() {
  const response = await fetch(`${BASE_URL}/settings/llm-status`);

  if (!response.ok) {
    throw new Error(`获取模型网关状态失败（状态码 ${response.status}）`);
  }

  return response.json();
}

export async function getSystemInfo() {
  const response = await fetch(`${BASE_URL}/settings/system-info`);

  if (!response.ok) {
    throw new Error(`获取系统信息失败（状态码 ${response.status}）`);
  }

  return response.json();
}
