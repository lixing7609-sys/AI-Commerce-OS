import { useState } from "react";
import {
  authorizeDiagnostic,
  getCloudOverviewMetrics,
  getCloudState,
  getDevicesForOperator,
  getLicenseForOperator,
  getOperator,
  pauseOtaRelease,
  resolveSupportCase,
  retryOtaRelease,
} from "./mock/cloudMock.js";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../shared/editionPolicy.js";
import {
  COMPUTE_TASK_PRIORITIES,
  COMPUTE_TASK_TYPES,
  cancelComputeTask,
  getComputeOverview,
  getDistributedComputeState,
  isDistributedComputeEnabled,
  setGlobalPause,
} from "../shared/distributedCompute/mockComputeRepository.js";

/**
 * Cloud 页面组件，从 CloudConsoleApp.jsx 抽出（阶段 Founder
 * Full-System v3 Batch 2 §2）——和 operator-preview/pages/ 同一个
 * 原则拆分：这个文件只导出组件（满足 react-refresh 的 Fast Refresh
 * 要求），key -> 组件的映射在 pageRegistry.jsx。既让独立 `/cloud`
 * 应用继续用它渲染自己的壳，也让 Founder 的 Cloud Center
 * （console/labs/CloudCenterConnected.jsx）能 contentOnly 复用同一份
 * 页面实现，不需要在 Founder 里重新实现一遍"设备/租户/许可/Token
 * 计量/OTA/分布式调度"。纯粹的代码搬移，页面逻辑本身一行未改，独立
 * `/cloud` 行为不变。
 */

const HEALTH_LABEL = { healthy: "健康", attention: "需关注", offline: "离线" };
const HEALTH_TONE = { healthy: "success", attention: "warning", offline: "danger" };

export function Pill({ tone = "neutral", children }) {
  return <span className={`cc-pill cc-pill--${tone}`}>{children}</span>;
}

export function StatGrid({ items }) {
  return (
    <div className="cc-grid">
      {items.map((item) => (
        <div key={item.label} className={`cc-stat${item.onClick ? " clickable" : ""}`} onClick={item.onClick}>
          <p className="cc-stat-label">{item.label}</p>
          <p className="cc-stat-value">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function Table({ columns, rows, onRowClick, empty = "暂无数据" }) {
  if (!rows || rows.length === 0) return <div className="cc-empty">{empty}</div>;
  return (
    <table className="cc-table">
      <thead>
        <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.id ?? idx} data-clickable={onRowClick ? "true" : "false"} onClick={onRowClick ? () => onRowClick(row) : undefined}>
            {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OverviewPage({ navigate }) {
  const metrics = getCloudOverviewMetrics();
  const canSeePrivateBusinessData = hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.PRIVATE_BUSINESS_DATA_ACCESS);
  return (
    <div>
      <div className="cc-privacy-banner">
        {canSeePrivateBusinessData
          ? "隐私边界：本控制台当前配置为可访问私有业务数据（非默认状态）。"
          : "✓ 隐私边界：本控制台默认只接收设备健康/心跳/版本/Token计量/错误摘要等聚合遥测，不获取客户会话、订单明细、店铺密钥或详细业务记忆等私有数据。"}
      </div>
      <StatGrid
        items={[
          { label: "经营者总数", value: metrics.totalOperators, onClick: () => navigate("operators") },
          { label: "在线设备", value: metrics.activeDevices, onClick: () => navigate("devices") },
          { label: "离线设备", value: metrics.offlineDevices, onClick: () => navigate("devices") },
          { label: "健康设备", value: metrics.healthyDevices, onClick: () => navigate("devices") },
          { label: "待更新设备", value: metrics.devicesRequiringUpdate, onClick: () => navigate("otaSupport") },
          { label: "有效许可", value: metrics.licenseActive, onClick: () => navigate("licenses") },
          { label: "已暂停许可", value: metrics.licenseSuspended, onClick: () => navigate("licenses") },
          { label: "今日 Token 消耗", value: metrics.tokenConsumptionToday.toLocaleString(), onClick: () => navigate("tokenMetering") },
          { label: "OTA 进行中", value: metrics.otaInProgress, onClick: () => navigate("otaSupport") },
          { label: "OTA 失败", value: metrics.otaFailed, onClick: () => navigate("otaSupport") },
          { label: "回滚次数", value: metrics.rollbackCount, onClick: () => navigate("otaSupport") },
          { label: "待处理支持工单", value: metrics.openSupportCases, onClick: () => navigate("otaSupport") },
        ]}
      />
      {metrics.abnormalCostGrowth ? (
        <div className="cc-card">
          <h3 className="cc-card-title">异常成本增长告警</h3>
          <p style={{ margin: 0, fontSize: 13 }}>
            <Pill tone="warning">{metrics.abnormalCostGrowth.severity}</Pill>{" "}
            经营者 {getOperator(metrics.abnormalCostGrowth.operatorId)?.name}：{metrics.abnormalCostGrowth.detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function OperatorsPage({ navigate }) {
  const { operators } = getCloudState();
  return (
    <div className="cc-card">
      <h3 className="cc-card-title">经营者 / 租户</h3>
      <Table
        columns={[
          { key: "name", label: "经营者" },
          { key: "tenantId", label: "租户ID" },
          { key: "contact", label: "联系人" },
          { key: "joinedAt", label: "入驻时间" },
          { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "active" ? "success" : "danger"}>{r.status === "active" ? "正常" : "已暂停"}</Pill> },
          { key: "devices", label: "设备数", render: (r) => getDevicesForOperator(r.id).length },
        ]}
        rows={operators}
        onRowClick={(row) => navigate("devices", { operatorId: row.id })}
      />
    </div>
  );
}

export function DeviceDetail({ device, onBack }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const operator = getOperator(device.operatorId);
  const license = getLicenseForOperator(device.operatorId);

  function handleAuthorize() {
    setBusy(true);
    const result = authorizeDiagnostic(device.id, 24);
    setBusy(false);
    setMsg(result.ok ? `已授权远程诊断（${result.expiresInHours}小时）` : result.error);
  }

  return (
    <div>
      <button className="cc-btn" style={{ marginBottom: 12 }} onClick={onBack}>← 返回设备列表</button>
      <div className="cc-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="cc-card-title" style={{ margin: 0 }}>{device.id}</h3>
          <Pill tone={HEALTH_TONE[device.health]}>{HEALTH_LABEL[device.health]}</Pill>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 14, fontSize: 13 }}>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>绑定经营者</dt><dd>{operator?.name}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>绑定租户</dt><dd>{device.tenantId}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>设备型号</dt><dd>{device.model}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>系统版本</dt><dd>{device.systemVersion}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>Agent Runtime 版本</dt><dd>{device.agentRuntimeVersion}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>Evolution Engine 版本</dt><dd>{device.evolutionEngineVersion}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>记忆 Schema 版本</dt><dd>{device.memorySchemaVersion}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>最近心跳</dt><dd>{new Date(device.lastHeartbeatAt).toLocaleString("zh-CN")}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>更新通道</dt><dd>{device.updateChannel}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>许可状态</dt><dd>{device.licenseState}（{license?.package}）</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>Token 余额</dt><dd>{device.tokenBalance.toLocaleString()}</dd></div>
          <div><dt style={{ color: "#94a3b8", fontSize: 11 }}>远程诊断权限</dt><dd>{device.diagnosticPermission}</dd></div>
          <div style={{ gridColumn: "1/-1" }}><dt style={{ color: "#94a3b8", fontSize: 11 }}>本地数据策略</dt><dd>{device.localDataPolicy}</dd></div>
        </dl>
        <div style={{ marginTop: 12 }}>
          {hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.DIAGNOSTICS_FULL) ? (
            <button className="cc-btn cc-btn--primary" disabled={busy} onClick={handleAuthorize}>申请远程诊断授权（演示）</button>
          ) : (
            <p style={{ fontSize: 12, color: "#94a3b8" }}>当前 Edition 无远程诊断授权权限。</p>
          )}
          {msg ? <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function DevicesPage({ filterOperatorId }) {
  const { devices } = getCloudState();
  const [selectedId, setSelectedId] = useState(null);
  const rows = filterOperatorId ? devices.filter((d) => d.operatorId === filterOperatorId) : devices;
  const selected = selectedId ? devices.find((d) => d.id === selectedId) : null;

  if (selected) return <DeviceDetail device={selected} onBack={() => setSelectedId(null)} />;

  return (
    <div className="cc-card">
      <h3 className="cc-card-title">设备{filterOperatorId ? `（经营者：${getOperator(filterOperatorId)?.name}）` : ""}</h3>
      <Table
        columns={[
          { key: "id", label: "设备ID" },
          { key: "operator", label: "经营者", render: (r) => getOperator(r.operatorId)?.name },
          { key: "systemVersion", label: "系统版本" },
          { key: "agentRuntimeVersion", label: "Runtime版本" },
          { key: "lastHeartbeatAt", label: "最近心跳", render: (r) => new Date(r.lastHeartbeatAt).toLocaleString("zh-CN") },
          { key: "health", label: "健康状态", render: (r) => <Pill tone={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health]}</Pill> },
          { key: "updateChannel", label: "更新通道" },
          { key: "tokenBalance", label: "Token余额", render: (r) => r.tokenBalance.toLocaleString() },
        ]}
        rows={rows}
        onRowClick={(row) => setSelectedId(row.id)}
      />
    </div>
  );
}

export function LicensesPage() {
  const { licenses } = getCloudState();
  return (
    <div className="cc-card">
      <h3 className="cc-card-title">许可与套餐权益</h3>
      <Table
        columns={[
          { key: "operator", label: "经营者", render: (r) => getOperator(r.operatorId)?.name },
          { key: "package", label: "套餐" },
          { key: "entitlements", label: "权益", render: (r) => r.entitlements.join("、") },
          { key: "expiresAt", label: "到期时间" },
          { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "active" ? "success" : "danger"}>{r.status === "active" ? "有效" : "已暂停"}</Pill> },
        ]}
        rows={licenses}
      />
    </div>
  );
}

export function TokenMeteringPage() {
  const { tokenMetering } = getCloudState();
  return (
    <div>
      <div className="cc-card">
        <h3 className="cc-card-title">近7日 Token 消耗趋势（平台汇总）</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
          {tokenMetering.trend.map((d) => (
            <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ background: "#6366f1", height: `${(d.tokens / 65000) * 80}px`, borderRadius: 4, marginBottom: 4 }} />
              <span style={{ fontSize: 10, color: "#64748b" }}>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cc-card">
        <h3 className="cc-card-title">按经营者用量</h3>
        <Table
          columns={[
            { key: "operator", label: "经营者", render: (r) => getOperator(r.operatorId)?.name },
            { key: "tokensUsed", label: "已用", render: (r) => r.tokensUsed.toLocaleString() },
            { key: "packageAllowance", label: "套餐额度", render: (r) => r.packageAllowance.toLocaleString() },
            { key: "usage", label: "使用率", render: (r) => `${Math.round((r.tokensUsed / r.packageAllowance) * 100)}%` },
          ]}
          rows={tokenMetering.byOperator}
        />
      </div>
      {tokenMetering.abnormalGrowth ? (
        <div className="cc-card">
          <h3 className="cc-card-title">异常用量告警</h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            <Pill tone="warning">{tokenMetering.abnormalGrowth.severity}</Pill>{" "}
            {getOperator(tokenMetering.abnormalGrowth.operatorId)?.name}：{tokenMetering.abnormalGrowth.detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function OtaSupportPage() {
  const [, forceRerender] = useState(0);
  const { otaReleases, rollbacks, supportCases } = getCloudState();
  const refresh = () => forceRerender((n) => n + 1);

  return (
    <div>
      <div className="cc-card">
        <h3 className="cc-card-title">OTA 发布</h3>
        <Table
          columns={[
            { key: "version", label: "版本" },
            { key: "channel", label: "通道" },
            { key: "targetGroup", label: "目标分组" },
            { key: "rolloutProgress", label: "进度", render: (r) => `${r.rolloutProgress}%` },
            { key: "status", label: "状态", render: (r) => (
              <Pill tone={r.status === "rolled_out" ? "success" : r.status === "failed" ? "danger" : r.status === "paused" ? "neutral" : "info"}>
                {{ rolled_out: "已完成", in_progress: "进行中", failed: "失败", paused: "已暂停" }[r.status]}
              </Pill>
            ) },
            { key: "notes", label: "说明" },
            {
              key: "actions", label: "操作", render: (r) => (
                <div style={{ display: "flex", gap: 6 }}>
                  {hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.OTA_RELEASE_MANAGE) && r.status === "failed" ? <button className="cc-btn" onClick={() => { retryOtaRelease(r.id); refresh(); }}>重试</button> : null}
                  {hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.OTA_RELEASE_MANAGE) && r.status === "in_progress" ? <button className="cc-btn" onClick={() => { pauseOtaRelease(r.id); refresh(); }}>暂停</button> : null}
                </div>
              ),
            },
          ]}
          rows={otaReleases}
        />
      </div>
      <div className="cc-card">
        <h3 className="cc-card-title">回滚记录</h3>
        <Table
          columns={[
            { key: "deviceId", label: "设备" },
            { key: "fromVersion", label: "回滚前" },
            { key: "toVersion", label: "回滚后" },
            { key: "rolledBackAt", label: "时间", render: (r) => new Date(r.rolledBackAt).toLocaleString("zh-CN") },
            { key: "reason", label: "原因" },
          ]}
          rows={rollbacks}
          empty="暂无回滚记录"
        />
      </div>
      <div className="cc-card">
        <h3 className="cc-card-title">支持工单</h3>
        <Table
          columns={[
            { key: "subject", label: "主题" },
            { key: "operator", label: "经营者", render: (r) => getOperator(r.operatorId)?.name },
            { key: "priority", label: "优先级", render: (r) => <Pill tone={r.priority === "high" ? "danger" : "neutral"}>{r.priority}</Pill> },
            { key: "diagnosticAuthorized", label: "诊断授权", render: (r) => (r.diagnosticAuthorized ? "已授权" : "未授权") },
            { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "resolved" ? "success" : r.status === "in_progress" ? "info" : "warning"}>{{ open: "待处理", in_progress: "处理中", resolved: "已解决" }[r.status]}</Pill> },
            {
              key: "actions", label: "操作", render: (r) => (
                r.status !== "resolved" ? <button className="cc-btn" onClick={() => { resolveSupportCase(r.id); refresh(); }}>标记已解决</button> : null
              ),
            },
          ]}
          rows={supportCases}
        />
      </div>
    </div>
  );
}

const TASK_TYPE_LABEL = Object.fromEntries(COMPUTE_TASK_TYPES.map((t) => [t.key, t.label]));
const TASK_PRIORITY_LABEL = Object.fromEntries(COMPUTE_TASK_PRIORITIES.map((p) => [p.key, p.label]));
const COMPUTE_TASK_STATUS_LABEL = { queued: "排队中", assigned: "已分配", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消" };
const COMPUTE_TASK_STATUS_TONE = { queued: "neutral", assigned: "info", running: "info", completed: "success", failed: "danger", cancelled: "neutral" };
const NETWORK_STATE_LABEL = { online: "在线", offline: "离线", unstable: "不稳定" };
const NETWORK_STATE_TONE = { online: "success", offline: "danger", unstable: "warning" };
const THERMAL_LABEL = { normal: "正常", warm: "偏热", throttling: "降频中" };

export function DistributedSchedulingPage() {
  const [, forceRerender] = useState(0);
  const refresh = () => forceRerender((n) => n + 1);
  const enabled = isDistributedComputeEnabled();
  const overview = getComputeOverview();
  const { devicePool, participationPolicies, computeTasks, globalPauseActive } = getDistributedComputeState();

  async function handleTogglePause() {
    await setGlobalPause(!globalPauseActive);
    refresh();
  }

  async function handleCancelTask(taskId) {
    await cancelComputeTask(taskId);
    refresh();
  }

  return (
    <div>
      <div className="cc-card" style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,.08)" }}>
        <Pill tone="warning">架构预留</Pill>{" "}
        <span style={{ fontSize: 13 }}>
          分布式算力尚未启用，当前为架构预留状态。distributedCompute.enabled = {String(enabled)}。
        </span>
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">算力总览</h3>
        <StatGrid
          items={[
            { label: "注册设备数", value: overview.registeredDevices },
            { label: "在线设备数", value: overview.onlineDevices },
            { label: "当前可调度设备数", value: overview.schedulableDevices },
            { label: "可用 CPU 核心", value: overview.availableCpuCores },
            { label: "可用内存 (MB)", value: overview.availableMemoryMB.toLocaleString() },
            { label: "当前任务", value: overview.activeTasks },
            { label: "今日完成任务", value: overview.completedTasksToday },
            { label: "异常任务", value: overview.failedTasks },
            { label: "预计节省云端算力成本", value: `¥${overview.estimatedCloudCostSavedRmb}` },
          ]}
        />
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">设备资源池</h3>
        <Table
          columns={[
            { key: "deviceId", label: "设备名称" },
            { key: "operatorName", label: "所属经营者" },
            { key: "region", label: "地区" },
            { key: "networkState", label: "当前在线状态", render: (r) => <Pill tone={NETWORK_STATE_TONE[r.networkState]}>{NETWORK_STATE_LABEL[r.networkState]}</Pill> },
            { key: "currentLoad", label: "本地经营负载", render: (r) => `${Math.round(r.currentLoad * 100)}%` },
            { key: "cpuCores", label: "可用 CPU", render: (r) => `${(r.cpuCores * (1 - r.currentLoad)).toFixed(1)} / ${r.cpuCores} 核` },
            { key: "memoryAvailable", label: "可用内存", render: (r) => `${r.memoryAvailable.toLocaleString()} MB` },
            { key: "thermalState", label: "温度状态", render: (r) => THERMAL_LABEL[r.thermalState] },
            { key: "currentTask", label: "当前平台任务", render: () => "无（尚未启用）" },
            { key: "scheduleStatus", label: "调度状态", render: () => <Pill tone="neutral">未参与调度</Pill> },
            { key: "lastReportedAt", label: "最后心跳", render: (r) => new Date(r.lastReportedAt).toLocaleString("zh-CN") },
          ]}
          rows={devicePool}
        />
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">调度任务</h3>
        <Table
          columns={[
            { key: "taskId", label: "任务名称" },
            { key: "taskType", label: "任务类型", render: (r) => TASK_TYPE_LABEL[r.taskType] ?? r.taskType },
            { key: "source", label: "来源" },
            { key: "priority", label: "优先级", render: (r) => TASK_PRIORITY_LABEL[r.priority] ?? r.priority },
            { key: "requiredCpu", label: "预计 CPU 用量", render: (r) => `${r.requiredCpu} 核` },
            { key: "requiredMemory", label: "预计内存用量", render: (r) => `${r.requiredMemory.toLocaleString()} MB` },
            { key: "estimatedDuration", label: "预计运行时间", render: (r) => `${Math.round(r.estimatedDuration / 60)} 分钟` },
            { key: "status", label: "状态", render: (r) => <Pill tone={COMPUTE_TASK_STATUS_TONE[r.status]}>{COMPUTE_TASK_STATUS_LABEL[r.status]}</Pill> },
            { key: "sandboxed", label: "沙箱", render: (r) => (r.sandboxed ? <Pill tone="success">已启用</Pill> : <Pill tone="danger">未启用</Pill>) },
            {
              key: "actions", label: "操作", render: (r) => (
                r.status === "queued" ? <button className="cc-btn" onClick={() => handleCancelTask(r.taskId)}>取消任务</button> : "—"
              ),
            },
          ]}
          rows={computeTasks}
        />
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">任务分配</h3>
        <div className="cc-empty">尚无任务分配记录——分布式算力未启用，任务不会被分配到任何设备。</div>
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">资源策略</h3>
        <Table
          columns={[
            { key: "deviceId", label: "设备" },
            { key: "maxCpuPercent", label: "最大 CPU 占用", render: (r) => `${r.maxCpuPercent}%` },
            { key: "maxMemoryMB", label: "最大内存占用", render: (r) => `${r.maxMemoryMB.toLocaleString()} MB` },
            { key: "allowedTaskTypes", label: "允许任务类型", render: (r) => (r.allowedTaskTypes.length ? r.allowedTaskTypes.map((k) => TASK_TYPE_LABEL[k] ?? k).join("、") : "无") },
            { key: "pauseWhenBusinessBusy", label: "经营繁忙时暂停", render: (r) => (r.pauseWhenBusinessBusy ? "是" : "否") },
            { key: "pauseWhenThermalHigh", label: "高温暂停", render: (r) => (r.pauseWhenThermalHigh ? "是" : "否") },
            { key: "pauseWhenOnBattery", label: "网络异常/电池供电暂停", render: (r) => (r.pauseWhenOnBattery ? "是" : "否") },
            { key: "policyStatus", label: "策略状态", render: (r) => <Pill tone="neutral">{{ active: "生效中", paused: "已暂停", disabled: "未启用" }[r.policyStatus]}</Pill> },
          ]}
          rows={participationPolicies}
        />
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">异常与暂停</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Pill tone={globalPauseActive ? "danger" : "success"}>{globalPauseActive ? "全局 Kill Switch：已启用（暂停中）" : "全局 Kill Switch：未启用"}</Pill>
          <button className="cc-btn" onClick={handleTogglePause}>
            {globalPauseActive ? "模拟解除全局暂停" : "模拟触发全局暂停"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
          分布式算力总开关（distributedCompute.enabled）恒为 false 期间，全局 Kill Switch 的实际效果不变——不会有任何真实任务被派发，此开关仅用于演示未来的紧急暂停机制。
        </p>
        <Table
          columns={[
            { key: "taskId", label: "任务" },
            { key: "status", label: "状态", render: (r) => <Pill tone={COMPUTE_TASK_STATUS_TONE[r.status]}>{COMPUTE_TASK_STATUS_LABEL[r.status]}</Pill> },
          ]}
          rows={computeTasks.filter((t) => t.status === "failed" || t.status === "cancelled")}
          empty="暂无异常或已取消的任务"
        />
      </div>

      <div className="cc-card">
        <h3 className="cc-card-title">成本节省统计</h3>
        <p style={{ fontSize: 13, margin: 0 }}>
          预计节省云端算力成本：<strong>¥{overview.estimatedCloudCostSavedRmb}</strong>
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
          该数值恒为 0，直到分布式算力真正启用并产生真实执行记录——不编造任何节省成本数字。
        </p>
      </div>
    </div>
  );
}
