import { createLocalRepository } from "./mockUtils.js";
import { SHARED_DEMO_DEVICE_ID } from "../../demoData/cloudDemoData.js";

/**
 * 系统监控 / 日志中心的演示数据（Cloud Center Charter §3.5）。
 *
 * 日志/告警条目里的 deviceId / operatorId 直接复用 cloud/mock/
 * cloudMock.js 的设备 id 字面量（mac-mini-op-0001 等），不是另起一套
 * 无关编号——这样日志中心的"关联事件"才能真的对应到设备管理里
 * 同一台设备，而不是两份互相对不上的示例数据。
 */

export function getSystemHardware() {
  return { cpuPct: 34, memPct: 58, diskPct: 41, tempC: 52 };
}

export function getSystemContainers() {
  return [
    { name: "backend-api", status: "running", uptime: "3d 4h" },
    { name: "postgres", status: "running", uptime: "12d 1h" },
    { name: "n8n", status: "running", uptime: "3d 4h" },
  ];
}

/** 请求量 / 错误率——系统监控总览需要，设备群本身的指标（在线率/
 * Token/OTA/工单）已经由 cloudMock 的 getCloudOverviewMetrics 覆盖。 */
export function getSystemRequestMetrics() {
  return { requestsToday: 48210, requestsPerMinute: 34, errorCountToday: 62, errorRatePct: 0.13 };
}

function seedIncidents() {
  const now = Date.now();
  return [
    {
      id: "incident-1", title: "operator-3 设备连续离线超24小时", severity: "critical",
      deviceId: "mac-mini-op-0003", operatorId: "operator-3",
      detectedAt: new Date(now - 20 * 3600000).toISOString(), status: "open",
      detail: "心跳中断触发的自动告警，已关联支持工单 support-1。",
    },
    {
      id: "incident-2", title: "operator-1 Token 消耗环比异常上升 38%", severity: "warning",
      deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1",
      detectedAt: new Date(now - 6 * 3600000).toISOString(), status: "processing",
      detail: "高于历史波动区间，建议核实是否有异常任务循环调用。",
    },
    {
      id: "incident-3", title: "OTA 4.2.2 更新包校验失败并自动回滚", severity: "warning",
      deviceId: "mac-mini-op-0004", operatorId: "operator-4",
      detectedAt: new Date(now - 10 * 86400000).toISOString(), status: "resolved",
      detail: "已回滚到 4.2.1，回滚记录 rollback-1。",
    },
    {
      id: "incident-4", title: "n8n 容器一次性重启", severity: "info",
      deviceId: null, operatorId: null,
      detectedAt: new Date(now - 3 * 3600000).toISOString(), status: "resolved",
      detail: "自动恢复触发的计划内重启，无业务影响。",
    },
  ];
}

const incidentRepository = createLocalRepository("systemCenter.incidents.v1", () => ({ incidents: seedIncidents() }));

export function getSystemIncidents() {
  return incidentRepository.get().incidents;
}

export function resolveIncident(incidentId) {
  const state = incidentRepository.get();
  const incident = state.incidents.find((i) => i.id === incidentId);
  if (!incident) return { ok: false, error: "事件不存在" };
  if (incident.status === "resolved") return { ok: false, error: "该事件已处理" };

  incidentRepository.update((s) => ({
    ...s,
    incidents: s.incidents.map((i) => (i.id === incidentId ? { ...i, status: "resolved" } : i)),
  }));
  return { ok: true };
}

/**
 * 日志中心——8 个分类（系统/设备/OTA/Token/许可证/安全/操作/错误）。
 * 每条日志尽量携带 deviceId/operatorId，供"关联事件"跳转到设备管理
 * 对应设备。分类/级别/来源都是纯展示字段，不驱动任何真实系统行为。
 */
function seedLogs() {
  const now = Date.now();
  const t = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString();
  return [
    { id: "log-001", ts: t(1), level: "info", category: "system", source: "backend-api", message: "Task consumer heartbeat OK", deviceId: null, operatorId: null },
    { id: "log-002", ts: t(5), level: "warning", category: "system", source: "runtime", message: "Auto-resume triggered after restart", deviceId: null, operatorId: null },
    { id: "log-003", ts: t(15), level: "info", category: "system", source: "backend-api", message: "Deliverable auto-generation completed", deviceId: null, operatorId: null },

    { id: "log-010", ts: t(4), level: "info", category: "device", source: "heartbeat", message: `设备 ${SHARED_DEMO_DEVICE_ID} 心跳正常，健康状态：健康`, deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1" },
    { id: "log-011", ts: t(120), level: "warning", category: "device", source: "heartbeat", message: "设备 mac-mini-op-0002 心跳延迟超过预期阈值", deviceId: "mac-mini-op-0002", operatorId: "operator-2" },
    { id: "log-012", ts: t(1560), level: "error", category: "device", source: "heartbeat", message: "设备 mac-mini-op-0003 心跳中断超过 24 小时，已转入告警", deviceId: "mac-mini-op-0003", operatorId: "operator-3" },

    { id: "log-020", ts: t(7200), level: "info", category: "ota", source: "ota-release", message: "更新包 founder-console-v4.3.1.pkg 已完成全量发布（ota-4.3.1）", deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1" },
    { id: "log-021", ts: t(120), level: "info", category: "ota", source: "ota-release", message: "更新包 founder-console-v4.4.0-beta.pkg 灰度发布进行中（ota-4.4.0-beta）", deviceId: null, operatorId: null },
    { id: "log-022", ts: t(14400), level: "error", category: "ota", source: "ota-release", message: "更新包 founder-console-v4.2.2.pkg 校验失败，已自动回滚（ota-4.2.2-failed）", deviceId: "mac-mini-op-0004", operatorId: "operator-4" },

    { id: "log-030", ts: t(360), level: "warning", category: "token", source: "token-metering", message: "operator-1 近24小时 Token 消耗环比上升 38%，高于历史波动区间", deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1" },
    { id: "log-031", ts: t(600), level: "info", category: "token", source: "token-metering", message: "operator-3 Token 余额降至 460，低于套餐额度 10%", deviceId: "mac-mini-op-0003", operatorId: "operator-3" },

    { id: "log-040", ts: t(1440), level: "warning", category: "license", source: "license", message: "operator-4 许可证已暂停（license-4，套餐：标准版）", deviceId: "mac-mini-op-0004", operatorId: "operator-4" },
    { id: "log-041", ts: t(30), level: "info", category: "license", source: "license", message: "operator-1 许可证生效中，到期时间 2027-03-12（license-1）", deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1" },

    { id: "log-050", ts: t(20), level: "info", category: "security", source: "diagnostic-auth", message: "operator-2 设备远程诊断授权已生效（7天，剩3天）", deviceId: "mac-mini-op-0002", operatorId: "operator-2" },
    { id: "log-051", ts: t(2), level: "warning", category: "security", source: "diagnostic-auth", message: `设备 ${SHARED_DEMO_DEVICE_ID} 远程诊断当前未授权，敏感操作已拦截`, deviceId: SHARED_DEMO_DEVICE_ID, operatorId: "operator-1" },

    { id: "log-060", ts: t(50), level: "info", category: "operation", source: "founder-console", message: "Founder 手动授予 Token 20000（ledger grant_credit）", deviceId: null, operatorId: null },
    { id: "log-061", ts: t(80), level: "info", category: "operation", source: "founder-console", message: "Founder 将支持工单 support-3 标记为已解决", deviceId: "mac-mini-op-0004", operatorId: "operator-4" },

    { id: "log-070", ts: t(45), level: "error", category: "error", source: "backend-api", message: "客服会话接口返回超时（重试后恢复）", deviceId: null, operatorId: null },
    { id: "log-071", ts: t(9000), level: "error", category: "error", source: "ota-release", message: "更新包校验签名不匹配，判定为发布失败", deviceId: "mac-mini-op-0004", operatorId: "operator-4" },
  ];
}

export function getSystemLogs() {
  return seedLogs();
}

export const LOG_CATEGORIES = [
  { key: "system", label: "系统日志" },
  { key: "device", label: "设备日志" },
  { key: "ota", label: "OTA 日志" },
  { key: "token", label: "Token 日志" },
  { key: "license", label: "许可证日志" },
  { key: "security", label: "安全日志" },
  { key: "operation", label: "操作日志" },
  { key: "error", label: "错误日志" },
];
