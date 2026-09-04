import { createLocalRepository, tagDemo } from "../../shared/localRepository.js";

/**
 * 经营者本地 Mac mini 设备与隐私 mock（阶段：三版最终定位）。
 *
 * 与 cloud/mock/cloudMock.js 里的设备记录使用同一个 id 字面量
 * "mac-mini-op-0001"（SHARED_DEMO_DEVICE_ID），演示"经营者本地看到
 * 的这台设备"与"Cloud 后台管理的同一台设备"是现实中同一个东西——
 * 但这里是两份独立的 mock（各自 import 各自的 localRepository
 * 实例），不做跨 Edition import，避免 operator-preview 依赖
 * frontend/src/cloud/（ADR-0002 Edition 边界）。
 *
 * 云端遥测/诊断/数据上传相关的开关都在这里维护，因为这些是"经营者
 * 自己授权"的隐私决策，不是 Cloud 单方面能改的字段。
 */

export const SHARED_DEMO_DEVICE_ID = "mac-mini-op-0001";

function seedDeviceState() {
  const now = Date.now();
  return {
    device: {
      id: SHARED_DEMO_DEVICE_ID,
      model: "Mac mini M4",
      systemVersion: "AI Commerce OS 4.3.0",
      agentRuntimeVersion: "2.1.0",
      evolutionEngineVersion: "1.0.0",
      lastHeartbeatAt: new Date(now - 4 * 60000).toISOString(),
      health: "healthy",
      updateChannel: "stable",
      availableUpdate: { version: "4.3.1", notes: "客服中心会话稳定性修复", status: "ready_to_install" },
    },
    privacy: {
      localFirst: true,
      cloudTelemetryEnabled: true,
      cloudTelemetryScope: "设备心跳 / 版本 / 匿名功能使用 / Token 计量 / 错误摘要",
      diagnosticAuthorized: false,
      diagnosticExpiresAt: null,
      businessDataUploadEnabled: false,
      consentUpdatedAt: new Date(now - 30 * 86400000).toISOString(),
    },
  };
}

const repository = createLocalRepository("operatorPreview.device", seedDeviceState);

export function getDeviceState() {
  return repository.get();
}

export function getDeviceSummary() {
  return tagDemo(repository.get().device);
}

export function getPrivacySummary() {
  return tagDemo(repository.get().privacy);
}

export function approveUpdateWindow() {
  const state = repository.get();
  if (state.device.availableUpdate?.status !== "ready_to_install") {
    return { ok: false, error: "当前没有待安装的更新" };
  }
  repository.update((s) => ({
    ...s,
    device: { ...s.device, availableUpdate: { ...s.device.availableUpdate, status: "scheduled" } },
  }));
  return { ok: true };
}

export function authorizeDiagnostics(hours = 24) {
  const state = repository.get();
  if (state.privacy.diagnosticAuthorized) {
    return { ok: false, error: "远程诊断已处于授权状态", alreadyProcessed: true };
  }
  repository.update((s) => ({
    ...s,
    privacy: {
      ...s.privacy,
      diagnosticAuthorized: true,
      diagnosticExpiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
      consentUpdatedAt: new Date().toISOString(),
    },
  }));
  return { ok: true, expiresInHours: hours };
}

export function revokeDiagnostics() {
  const state = repository.get();
  if (!state.privacy.diagnosticAuthorized) {
    return { ok: false, error: "远程诊断当前未处于授权状态", alreadyProcessed: true };
  }
  repository.update((s) => ({
    ...s,
    privacy: { ...s.privacy, diagnosticAuthorized: false, diagnosticExpiresAt: null, consentUpdatedAt: new Date().toISOString() },
  }));
  return { ok: true };
}

export function setBusinessDataUpload(enabled) {
  repository.update((s) => ({
    ...s,
    privacy: { ...s.privacy, businessDataUploadEnabled: enabled, consentUpdatedAt: new Date().toISOString() },
  }));
  return { ok: true };
}
