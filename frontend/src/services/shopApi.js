const BASE_URL = "http://127.0.0.1:8000/api/v1";

export class ShopApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ShopApiError";
    this.status = status;
  }
}

function buildError(response, fallbackMessage) {
  return new ShopApiError(
    `${fallbackMessage}（状态码 ${response.status}）`,
    response.status
  );
}

export async function getShops({ platform, status, connectionStatus, keyword } = {}) {
  const params = new URLSearchParams();
  if (platform) params.set("platform", platform);
  if (status) params.set("status", status);
  if (connectionStatus) params.set("connection_status", connectionStatus);
  if (keyword) params.set("keyword", keyword);

  const response = await fetch(`${BASE_URL}/shops?${params.toString()}`);
  if (!response.ok) throw buildError(response, "获取店铺列表失败");
  return response.json();
}

export async function getShop(shopId) {
  const response = await fetch(`${BASE_URL}/shops/${encodeURIComponent(shopId)}`);
  if (!response.ok) throw buildError(response, "获取店铺详情失败");
  return response.json();
}

export async function createShop(payload) {
  const response = await fetch(`${BASE_URL}/shops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw buildError(response, "创建店铺失败");
  return response.json();
}

export async function updateShop(shopId, payload) {
  const response = await fetch(`${BASE_URL}/shops/${encodeURIComponent(shopId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw buildError(response, "更新店铺失败");
  return response.json();
}

export async function enableShop(shopId) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/enable`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, "启用店铺失败");
  return response.json();
}

export async function disableShop(shopId) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/disable`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, "停用店铺失败");
  return response.json();
}

export async function archiveShop(shopId) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/archive`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, "归档店铺失败");
  return response.json();
}

export async function deleteShop(shopId) {
  const response = await fetch(`${BASE_URL}/shops/${encodeURIComponent(shopId)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw buildError(response, "删除店铺失败");
  return response.json();
}

/**
 * fields 只应包含用户本次实际填写的非空 Secret 字段（留空的字段
 * 不要出现在 payload 里，交由后端"未提供即不修改"的语义处理）。
 */
export async function updateShopCredentials(shopId, fields) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/credentials`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }
  );
  if (!response.ok) throw buildError(response, "保存店铺凭据失败");
  return response.json();
}

export async function deleteShopCredential(shopId, credentialType) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/credentials/${encodeURIComponent(
      credentialType
    )}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw buildError(response, "删除凭据失败");
  return response.json();
}

export async function testShopConnection(shopId) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/test-connection`,
    { method: "POST" }
  );
  if (!response.ok) throw buildError(response, "测试连接失败");
  return response.json();
}

export async function startShopOAuth(shopId) {
  const response = await fetch(
    `${BASE_URL}/shops/${encodeURIComponent(shopId)}/oauth/start`
  );
  if (!response.ok) throw buildError(response, "获取 OAuth 授权信息失败");
  return response.json();
}
