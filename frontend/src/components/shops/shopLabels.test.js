import { describe, expect, it } from "vitest";

import {
  getAuthTypeLabel,
  getConnectionStatusLabel,
  getConnectionTestResultMessage,
  getCredentialTypeLabel,
  getPlatformLabel,
  getShopStatusLabel,
  PLATFORM_OPTIONS,
} from "./shopLabels";

describe("getPlatformLabel", () => {
  it("maps every supported platform to a Chinese label", () => {
    expect(getPlatformLabel("douyin")).toBe("抖音");
    expect(getPlatformLabel("taobao")).toBe("淘宝");
    expect(getPlatformLabel("tmall")).toBe("天猫");
    expect(getPlatformLabel("jd")).toBe("京东");
    expect(getPlatformLabel("pinduoduo")).toBe("拼多多");
    expect(getPlatformLabel("xiaohongshu")).toBe("小红书");
    expect(getPlatformLabel("wechat_shop")).toBe("视频号小店");
    expect(getPlatformLabel("amazon")).toBe("亚马逊");
    expect(getPlatformLabel("shopee")).toBe("Shopee");
    expect(getPlatformLabel("other")).toBe("其他平台");
  });

  it("falls back to the raw value for unknown platforms", () => {
    expect(getPlatformLabel("unknown_platform")).toBe("unknown_platform");
  });
});

describe("PLATFORM_OPTIONS", () => {
  it("contains one option per known platform with matching labels", () => {
    expect(PLATFORM_OPTIONS.length).toBeGreaterThanOrEqual(10);
    for (const option of PLATFORM_OPTIONS) {
      expect(option.label).toBe(getPlatformLabel(option.value));
    }
  });
});

describe("getShopStatusLabel", () => {
  it("maps shop statuses", () => {
    expect(getShopStatusLabel("active")).toBe("正常");
    expect(getShopStatusLabel("disabled")).toBe("已停用");
    expect(getShopStatusLabel("archived")).toBe("已归档");
  });
});

describe("getConnectionStatusLabel", () => {
  it("never labels anything as connected unless status is literally connected", () => {
    expect(getConnectionStatusLabel("not_configured")).toBe("未配置");
    expect(getConnectionStatusLabel("configured")).toBe("已配置凭据");
    expect(getConnectionStatusLabel("connected")).toBe("已连接");
    expect(getConnectionStatusLabel("error")).toBe("连接异常");
  });
});

describe("getAuthTypeLabel", () => {
  it("maps auth types", () => {
    expect(getAuthTypeLabel("none")).toBe("未设置");
    expect(getAuthTypeLabel("manual")).toBe("手动填写凭据");
    expect(getAuthTypeLabel("oauth")).toBe("OAuth 授权");
  });
});

describe("getCredentialTypeLabel", () => {
  it("maps every credential field name used by the credentials form", () => {
    expect(getCredentialTypeLabel("app_key")).toBe("App Key");
    expect(getCredentialTypeLabel("app_secret")).toBe("App Secret");
    expect(getCredentialTypeLabel("access_token")).toBe("Access Token");
    expect(getCredentialTypeLabel("refresh_token")).toBe("Refresh Token");
    expect(getCredentialTypeLabel("webhook_secret")).toBe("Webhook Secret");
  });
});

describe("getConnectionTestResultMessage", () => {
  it("returns the fixed safe message for not_configured/not_implemented", () => {
    expect(getConnectionTestResultMessage("not_configured")).toContain("尚未配置凭据");
    expect(getConnectionTestResultMessage("not_implemented")).toContain("尚未接入真实开放平台接口");
  });

  it("falls back to the provided message for other statuses", () => {
    expect(getConnectionTestResultMessage("error", "连接失败")).toBe("连接失败");
  });
});
