import { createLocalRepository, tagDemo } from "../../shared/localRepository.js";

/**
 * Operator Cloud mock 数据（阶段：三版最终定位 + Agent Evolution）。
 *
 * Cloud 管理的是"设备群"，不是"某一家店铺的经营数据"——所有数据
 * 都是聚合遥测层面的（设备健康/心跳/版本/Token计量/OTA/支持工单），
 * 默认不包含任何私有原始业务数据（客户会话、订单明细、店铺密钥、
 * 商品策略、完整Knowledge、Prompt正文、详细业务记忆）。这是
 * shared/editionPolicy.js 的 PRIVATE_BUSINESS_DATA_ACCESS 在 Cloud
 * 档位下为 false 的具体体现，不只是文档声明。
 *
 * 共享标识：SHARED_DEMO_DEVICE_ID 与
 * operator-preview/deviceMock.js 使用同一个设备 id 字面量（不跨
 * Edition import，只是各自 mock 里用同一个 id 值），演示"Operator
 * 本地看到的设备"与"Cloud 里管理的同一台设备"是同一个东西，但不
 * 共享任何私有业务字段。
 */

export const SHARED_DEMO_DEVICE_ID = "mac-mini-op-0001";

const OPERATOR_NAMES = ["星辰家居贸易", "海纳日用百货", "简屋生活馆", "云上鲜果铺"];

function seedOperators() {
  return [
    { id: "operator-1", name: OPERATOR_NAMES[0], contact: "张经理", joinedAt: "2026-03-12", tenantId: "tenant-1", status: "active" },
    { id: "operator-2", name: OPERATOR_NAMES[1], contact: "李经理", joinedAt: "2026-04-02", tenantId: "tenant-2", status: "active" },
    { id: "operator-3", name: OPERATOR_NAMES[2], contact: "王经理", joinedAt: "2026-05-20", tenantId: "tenant-3", status: "active" },
    { id: "operator-4", name: OPERATOR_NAMES[3], contact: "赵经理", joinedAt: "2026-06-15", tenantId: "tenant-4", status: "suspended" },
  ];
}

function seedDevices() {
  const now = Date.now();
  return [
    {
      id: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1", tenantId: "tenant-1",
      model: "Mac mini M4", systemVersion: "AI Commerce OS 4.3.0", agentRuntimeVersion: "2.1.0",
      evolutionEngineVersion: "1.0.0", memorySchemaVersion: "1.0",
      lastHeartbeatAt: new Date(now - 4 * 60000).toISOString(), health: "healthy",
      updateChannel: "stable", licenseState: "active", tokenBalance: 8600,
      diagnosticPermission: "未授权", localDataPolicy: "本地优先，未开启云端遥测以外的上传",
    },
    {
      id: "mac-mini-op-0002", operatorId: "operator-2", tenantId: "tenant-2",
      model: "Mac mini M4", systemVersion: "AI Commerce OS 4.2.1", agentRuntimeVersion: "2.0.3",
      evolutionEngineVersion: "1.0.0", memorySchemaVersion: "1.0",
      lastHeartbeatAt: new Date(now - 2 * 3600000).toISOString(), health: "attention",
      updateChannel: "stable", licenseState: "active", tokenBalance: 2100,
      diagnosticPermission: "已授权（7天，剩3天）", localDataPolicy: "本地优先",
    },
    {
      id: "mac-mini-op-0003", operatorId: "operator-3", tenantId: "tenant-3",
      model: "Mac mini M2", systemVersion: "AI Commerce OS 4.0.0", agentRuntimeVersion: "1.8.0",
      evolutionEngineVersion: "0.9.0", memorySchemaVersion: "1.0",
      lastHeartbeatAt: new Date(now - 26 * 3600000).toISOString(), health: "offline",
      updateChannel: "beta", licenseState: "active", tokenBalance: 460,
      diagnosticPermission: "未授权", localDataPolicy: "本地优先",
    },
    {
      id: "mac-mini-op-0004", operatorId: "operator-4", tenantId: "tenant-4",
      model: "Mac mini M4", systemVersion: "AI Commerce OS 3.9.2", agentRuntimeVersion: "1.6.0",
      evolutionEngineVersion: "0.8.0", memorySchemaVersion: "0.9",
      lastHeartbeatAt: new Date(now - 5 * 86400000).toISOString(), health: "offline",
      updateChannel: "stable", licenseState: "suspended", tokenBalance: 0,
      diagnosticPermission: "未授权", localDataPolicy: "本地优先",
    },
  ];
}

function seedLicenses() {
  return [
    { id: "license-1", operatorId: "operator-1", package: "标准版", entitlements: ["内容生成", "客服自动化", "Agent 演化(受限)"], effectiveAt: "2026-03-12", expiresAt: "2027-03-12", status: "active" },
    { id: "license-2", operatorId: "operator-2", package: "标准版", entitlements: ["内容生成", "客服自动化", "Agent 演化(受限)"], effectiveAt: "2026-04-02", expiresAt: "2027-04-02", status: "active" },
    { id: "license-3", operatorId: "operator-3", package: "基础版", entitlements: ["内容生成"], effectiveAt: "2026-05-20", expiresAt: "2027-05-20", status: "active" },
    { id: "license-4", operatorId: "operator-4", package: "标准版", entitlements: ["内容生成", "客服自动化"], effectiveAt: "2026-06-15", expiresAt: "2026-12-15", status: "suspended" },
  ];
}

function seedTokenMetering() {
  return {
    trend: [
      { date: "2026-07-19", tokens: 42000 }, { date: "2026-07-20", tokens: 45500 },
      { date: "2026-07-21", tokens: 41200 }, { date: "2026-07-22", tokens: 48900 },
      { date: "2026-07-23", tokens: 52300 }, { date: "2026-07-24", tokens: 61800 },
      { date: "2026-07-25", tokens: 58200 },
    ],
    byOperator: [
      { operatorId: "operator-1", tokensUsed: 21400, packageAllowance: 30000 },
      { operatorId: "operator-2", tokensUsed: 8900, packageAllowance: 30000 },
      { operatorId: "operator-3", tokensUsed: 4200, packageAllowance: 10000 },
      { operatorId: "operator-4", tokensUsed: 0, packageAllowance: 30000 },
    ],
    abnormalGrowth: { operatorId: "operator-1", detail: "近24小时 Token 消耗环比上升 38%，高于历史波动区间", severity: "warning" },
  };
}

function seedOtaReleases() {
  const now = Date.now();
  return [
    {
      id: "ota-4.3.1", packageName: "founder-console-v4.3.1.pkg", version: "4.3.1", channel: "stable", status: "rolled_out",
      targetGroup: "全部稳定通道设备", scheduledAt: new Date(now - 5 * 86400000).toISOString(),
      grayPercentage: 100, rolloutProgress: 100, failures: 0, notes: "客服中心会话稳定性修复",
    },
    {
      id: "ota-4.4.0-beta", packageName: "founder-console-v4.4.0-beta.pkg", version: "4.4.0", channel: "beta", status: "in_progress",
      targetGroup: "beta 通道设备（1台）", scheduledAt: new Date(now - 2 * 3600000).toISOString(),
      grayPercentage: 25, rolloutProgress: 60, failures: 0, notes: "Agent Evolution 基础能力灰度",
    },
    {
      id: "ota-4.2.2-failed", packageName: "founder-console-v4.2.2.pkg", version: "4.2.2", channel: "stable", status: "failed",
      targetGroup: "operator-4 设备", scheduledAt: new Date(now - 10 * 86400000).toISOString(),
      grayPercentage: 100, rolloutProgress: 40, failures: 1, notes: "更新包校验失败，已自动回滚",
    },
  ];
}

function seedRollbacks() {
  const now = Date.now();
  return [
    {
      id: "rollback-1", deviceId: "mac-mini-op-0004", otaReleaseId: "ota-4.2.2-failed",
      fromVersion: "4.2.2", toVersion: "4.2.1", rolledBackAt: new Date(now - 10 * 86400000 + 1800000).toISOString(),
      reason: "更新包校验失败，自动触发回滚保护",
    },
  ];
}

function seedSupportCases() {
  const now = Date.now();
  return [
    {
      id: "support-1", operatorId: "operator-3", deviceId: "mac-mini-op-0003",
      subject: "设备连续离线超24小时", status: "open", priority: "high",
      createdAt: new Date(now - 20 * 3600000).toISOString(), diagnosticAuthorized: false,
    },
    {
      id: "support-2", operatorId: "operator-2", deviceId: "mac-mini-op-0002",
      subject: "Token 消耗异常增长咨询", status: "in_progress", priority: "medium",
      createdAt: new Date(now - 6 * 3600000).toISOString(), diagnosticAuthorized: true,
    },
    {
      id: "support-3", operatorId: "operator-4", deviceId: "mac-mini-op-0004",
      subject: "4.2.2 更新失败后续处理", status: "resolved", priority: "high",
      createdAt: new Date(now - 10 * 86400000).toISOString(), diagnosticAuthorized: false,
    },
  ];
}

const repository = createLocalRepository("cloud.state", () => ({
  operators: seedOperators(),
  devices: seedDevices(),
  licenses: seedLicenses(),
  tokenMetering: seedTokenMetering(),
  otaReleases: seedOtaReleases(),
  rollbacks: seedRollbacks(),
  supportCases: seedSupportCases(),
}));

export function getCloudState() {
  return repository.get();
}

export function getOperator(id) {
  return repository.get().operators.find((o) => o.id === id) ?? null;
}
export function getDevice(id) {
  return repository.get().devices.find((d) => d.id === id) ?? null;
}
export function getDevicesForOperator(operatorId) {
  return repository.get().devices.filter((d) => d.operatorId === operatorId);
}
export function getLicenseForOperator(operatorId) {
  return repository.get().licenses.find((l) => l.operatorId === operatorId) ?? null;
}

export function getCloudOverviewMetrics() {
  const state = repository.get();
  const devices = state.devices;
  return tagDemo({
    totalOperators: state.operators.length,
    activeDevices: devices.filter((d) => d.health !== "offline").length,
    offlineDevices: devices.filter((d) => d.health === "offline").length,
    healthyDevices: devices.filter((d) => d.health === "healthy").length,
    devicesRequiringUpdate: devices.filter((d) => d.systemVersion < "AI Commerce OS 4.3.0").length,
    licenseActive: state.licenses.filter((l) => l.status === "active").length,
    licenseSuspended: state.licenses.filter((l) => l.status === "suspended").length,
    tokenConsumptionToday: state.tokenMetering.trend[state.tokenMetering.trend.length - 1]?.tokens ?? 0,
    abnormalCostGrowth: state.tokenMetering.abnormalGrowth,
    otaInProgress: state.otaReleases.filter((r) => r.status === "in_progress").length,
    otaFailed: state.otaReleases.filter((r) => r.status === "failed").length,
    rollbackCount: state.rollbacks.length,
    openSupportCases: state.supportCases.filter((c) => c.status !== "resolved").length,
  });
}

// ---------------------------------------------------------------
// 受控操作——重试/暂停/回滚都是幂等、可审计的，不做真实 OTA 分发。
// ---------------------------------------------------------------

export function retryOtaRelease(releaseId) {
  const state = repository.get();
  const release = state.otaReleases.find((r) => r.id === releaseId);
  if (!release) return { ok: false, error: "发布记录不存在" };
  if (release.status !== "failed") return { ok: false, error: "该发布不是失败状态，无需重试" };

  repository.update((s) => ({
    ...s,
    otaReleases: s.otaReleases.map((r) => (r.id === releaseId ? { ...r, status: "in_progress", rolloutProgress: 0, failures: r.failures } : r)),
  }));
  return { ok: true };
}

export function pauseOtaRelease(releaseId) {
  const state = repository.get();
  const release = state.otaReleases.find((r) => r.id === releaseId);
  if (!release) return { ok: false, error: "发布记录不存在" };
  if (release.status !== "in_progress") return { ok: false, error: "只能暂停进行中的发布" };

  repository.update((s) => ({
    ...s,
    otaReleases: s.otaReleases.map((r) => (r.id === releaseId ? { ...r, status: "paused" } : r)),
  }));
  return { ok: true };
}

export function resumeOtaRelease(releaseId) {
  const state = repository.get();
  const release = state.otaReleases.find((r) => r.id === releaseId);
  if (!release) return { ok: false, error: "发布记录不存在" };
  if (release.status !== "paused") return { ok: false, error: "只能继续已暂停的发布" };

  repository.update((s) => ({
    ...s,
    otaReleases: s.otaReleases.map((r) => (r.id === releaseId ? { ...r, status: "in_progress" } : r)),
  }));
  return { ok: true };
}

/**
 * 回滚发布——把该发布标记为已回滚，并为其目标设备群里第一台已知设备
 * 追加一条回滚记录（演示：不真实下发任何指令）。
 */
export function rollbackOtaRelease(releaseId) {
  const state = repository.get();
  const release = state.otaReleases.find((r) => r.id === releaseId);
  if (!release) return { ok: false, error: "发布记录不存在" };
  if (release.status === "rolled_back") return { ok: false, error: "该发布已回滚" };

  const priorRelease = state.otaReleases.find((r) => r.channel === release.channel && r.status === "rolled_out" && r.id !== release.id);
  const toVersion = priorRelease?.version ?? "上一稳定版本";
  const targetDevice = state.devices.find((d) => d.updateChannel === release.channel) ?? state.devices[0];

  repository.update((s) => ({
    ...s,
    otaReleases: s.otaReleases.map((r) => (r.id === releaseId ? { ...r, status: "rolled_back", rolloutProgress: 0 } : r)),
    rollbacks: [
      {
        id: `rollback-${releaseId}-${Date.now()}`,
        deviceId: targetDevice?.id ?? "unknown-device",
        otaReleaseId: releaseId,
        fromVersion: release.version,
        toVersion,
        rolledBackAt: new Date().toISOString(),
        reason: "Founder 手动触发回滚（演示）",
      },
      ...s.rollbacks,
    ],
  }));
  return { ok: true };
}

export function authorizeDiagnostic(deviceId, hours = 24) {
  const state = repository.get();
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return { ok: false, error: "设备不存在" };

  repository.update((s) => ({
    ...s,
    devices: s.devices.map((d) => (d.id === deviceId ? { ...d, diagnosticPermission: `已授权（${hours}小时，刚刚生效）` } : d)),
  }));
  return { ok: true, expiresInHours: hours };
}

// ---------------------------------------------------------------
// 许可证操作——暂停/续期/转移都是本地演示状态变更，不触发真实计费
// 或真实权益下发。
// ---------------------------------------------------------------

export function suspendLicense(licenseId) {
  const state = repository.get();
  const license = state.licenses.find((l) => l.id === licenseId);
  if (!license) return { ok: false, error: "许可证不存在" };
  if (license.status === "suspended") return { ok: false, error: "该许可证已是暂停状态" };

  repository.update((s) => ({
    ...s,
    licenses: s.licenses.map((l) => (l.id === licenseId ? { ...l, status: "suspended" } : l)),
  }));
  return { ok: true };
}

export function renewLicense(licenseId, extendDays = 365) {
  const state = repository.get();
  const license = state.licenses.find((l) => l.id === licenseId);
  if (!license) return { ok: false, error: "许可证不存在" };

  const base = new Date(license.expiresAt).getTime();
  const from = Number.isFinite(base) ? Math.max(base, Date.now()) : Date.now();
  const nextExpiresAt = new Date(from + extendDays * 86400000).toISOString().slice(0, 10);

  repository.update((s) => ({
    ...s,
    licenses: s.licenses.map((l) => (l.id === licenseId ? { ...l, status: "active", expiresAt: nextExpiresAt } : l)),
  }));
  return { ok: true, expiresAt: nextExpiresAt };
}

export function transferLicense(licenseId, targetOperatorId) {
  const state = repository.get();
  const license = state.licenses.find((l) => l.id === licenseId);
  if (!license) return { ok: false, error: "许可证不存在" };
  const target = state.operators.find((o) => o.id === targetOperatorId);
  if (!target) return { ok: false, error: "目标经营者不存在" };
  if (target.id === license.operatorId) return { ok: false, error: "目标经营者与当前持有者相同" };

  repository.update((s) => ({
    ...s,
    licenses: s.licenses.map((l) => (l.id === licenseId ? { ...l, operatorId: targetOperatorId } : l)),
  }));
  return { ok: true, targetName: target.name };
}

export function resolveSupportCase(caseId) {
  const state = repository.get();
  const item = state.supportCases.find((c) => c.id === caseId);
  if (!item) return { ok: false, error: "工单不存在" };
  if (item.status === "resolved") return { ok: false, error: "该工单已解决", alreadyProcessed: true };

  repository.update((s) => ({
    ...s,
    supportCases: s.supportCases.map((c) => (c.id === caseId ? { ...c, status: "resolved" } : c)),
  }));
  return { ok: true };
}
