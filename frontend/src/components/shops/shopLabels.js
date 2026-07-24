export const PLATFORM_LABELS = {
  douyin: "抖音",
  kuaishou: "快手",
  taobao: "淘宝",
  tmall: "天猫",
  jd: "京东",
  pinduoduo: "拼多多",
  xiaohongshu: "小红书",
  wechat_shop: "视频号小店",
  amazon: "亚马逊",
  shopee: "Shopee",
  other: "其他平台",
};

export function getPlatformLabel(platform) {
  return PLATFORM_LABELS[platform] ?? platform;
}

export const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS).map(
  ([value, label]) => ({ value, label })
);

export const SHOP_STATUS_LABELS = {
  active: "正常",
  disabled: "已停用",
  archived: "已归档",
};

export function getShopStatusLabel(status) {
  return SHOP_STATUS_LABELS[status] ?? status;
}

export const CONNECTION_STATUS_LABELS = {
  not_configured: "未配置",
  configured: "已配置凭据",
  testing: "测试中",
  connected: "已连接",
  expired: "已过期",
  error: "连接异常",
};

export function getConnectionStatusLabel(status) {
  return CONNECTION_STATUS_LABELS[status] ?? status;
}

export const AUTH_TYPE_LABELS = {
  none: "未设置",
  manual: "手动填写凭据",
  oauth: "OAuth 授权",
};

export function getAuthTypeLabel(authType) {
  return AUTH_TYPE_LABELS[authType] ?? authType;
}

export const CREDENTIAL_TYPE_LABELS = {
  app_key: "App Key",
  app_secret: "App Secret",
  access_token: "Access Token",
  refresh_token: "Refresh Token",
  merchant_id: "商户号",
  seller_id: "卖家 ID",
  client_id: "Client ID",
  client_secret: "Client Secret",
  webhook_secret: "Webhook Secret",
  other: "其他凭据",
};

export function getCredentialTypeLabel(credentialType) {
  return CREDENTIAL_TYPE_LABELS[credentialType] ?? credentialType;
}

export const CREDENTIAL_FIELD_ORDER = [
  "app_key",
  "app_secret",
  "access_token",
  "refresh_token",
  "merchant_id",
  "seller_id",
  "client_id",
  "client_secret",
  "webhook_secret",
];

export const CONNECTION_TEST_RESULT_LABELS = {
  not_configured: "尚未配置凭据，无法测试连接。",
  not_implemented: "平台连接器框架已就绪，尚未接入真实开放平台接口。",
};

export function getConnectionTestResultMessage(status, fallbackMessage) {
  return CONNECTION_TEST_RESULT_LABELS[status] ?? fallbackMessage ?? status;
}
