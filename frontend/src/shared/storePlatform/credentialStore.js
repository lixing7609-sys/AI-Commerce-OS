/**
 * 凭证状态边界层。真实的店铺凭据（app_key/app_secret/access_token/
 * refresh_token/merchant_id/seller_id/client_id/client_secret/
 * webhook_secret）已经由后端 Stage 8E 的店铺服务加密存储和管理
 * （`backend/app/models/shop_api.py` 的 `ShopCredentialsUpdateRequest`
 * / `ShopCredentialSummary`），前端从未见过、也不应该重新实现一套
 * 凭据存储——这里只做"把后端返回的安全摘要，翻译成本模块的
 * PlatformAuthorization 形状"，绝不缓存、绝不落 localStorage、绝不
 * 打印明文。
 *
 * 任何时候这个文件里出现要保存密钥字符串的冲动，都是设计错误的
 * 信号——真实凭据只应该经 `services/shopApi.js` 的
 * `updateShopCredentials`/`startShopOAuth` 直接发给后端。
 */

/**
 * @param {import("../../services/shopApi.js").ShopItemResponse} shop 来自 getShop()/getShops() 的真实后端数据
 * @returns {import("./types.js").PlatformAuthorization}
 */
export function toPlatformAuthorization(shop) {
  const credentials = Array.isArray(shop?.credentials) ? shop.credentials : [];
  const configuredTypes = new Set(
    credentials.filter((c) => c.configured).map((c) => c.credential_type)
  );

  let credentialStatus = "not_configured";
  if (configuredTypes.size > 0) {
    credentialStatus =
      shop.connection_status === "error" || shop.last_connection_test_status === "failed"
        ? "invalid"
        : "configured";
  }
  if (shop?.token_expires_at && new Date(shop.token_expires_at).getTime() < Date.now()) {
    credentialStatus = "expired";
  }

  return {
    storeId: String(shop?.id ?? ""),
    platform: shop?.platform ?? "",
    credentialStatus,
    authorizedScopes: [...configuredTypes],
    expiresAt: shop?.token_expires_at ?? null,
    lastVerifiedAt: shop?.last_connection_test_at ?? null,
    missingRequirements: describeMissingRequirements(shop, configuredTypes),
  };
}

const OAUTH_REQUIRED = ["access_token"];
const MANUAL_REQUIRED = ["app_key", "app_secret"];

function describeMissingRequirements(shop, configuredTypes) {
  if (!shop) return ["尚未创建店铺档案"];
  const requiredSet = shop.auth_type === "oauth" ? OAUTH_REQUIRED : MANUAL_REQUIRED;
  const missing = requiredSet.filter((key) => !configuredTypes.has(key));
  if (shop.auth_type === "oauth" && missing.length > 0) {
    return ["需要通过官方开放平台 OAuth 授权完成接入（“店铺中心”→发起授权）"];
  }
  if (missing.length > 0) {
    return missing.map((key) => `需要在“店铺中心”配置 ${key}`);
  }
  return [];
}

/**
 * 真实店铺是否已经具备可以尝试只读同步的凭据条件——不代表平台侧
 * 一定验证通过，只代表前端能看到"已配置"。真正是否可用以
 * `testShopConnection()`/`connect()` 的实时结果为准。
 */
export function hasConfiguredCredentials(authorization) {
  return authorization?.credentialStatus === "configured";
}
