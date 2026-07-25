import { useState } from "react";
import "./cloudConsole.css";
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

/**
 * Operator Cloud 控制台（阶段：三版最终定位）——裸 URL
 * （http://localhost:5173/，不带任何 mode 参数）现在渲染这个应用，
 * 取代原来的 Developer 工作台。管理对象是：
 *   Operator → Tenant → Device → License → Package → Token Account
 *   → Runtime Version → OTA → Health → Support
 * 不是店铺经营数据——Cloud 默认不触达任何私有原始业务数据（见
 * shared/editionPolicy.js 的 PRIVATE_BUSINESS_DATA_ACCESS）。
 *
 * 沿用仓库现有惯例：useState("activePage") 做导航，不引入路由库
 * （与 App.jsx / OperatorPreviewApp.jsx 一致）。
 */

const NAV_ITEMS = [
  { key: "overview", label: "总览", icon: "◆" },
  { key: "operators", label: "经营者", icon: "◐" },
  { key: "devices", label: "设备", icon: "▣" },
  { key: "licenses", label: "许可与套餐", icon: "☑" },
  { key: "tokenMetering", label: "Token 计量", icon: "◔" },
  { key: "otaSupport", label: "OTA 与支持", icon: "⟲" },
];

const HEALTH_LABEL = { healthy: "健康", attention: "需关注", offline: "离线" };
const HEALTH_TONE = { healthy: "success", attention: "warning", offline: "danger" };

function Pill({ tone = "neutral", children }) {
  return <span className={`cc-pill cc-pill--${tone}`}>{children}</span>;
}

function StatGrid({ items }) {
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

function Table({ columns, rows, onRowClick, empty = "暂无数据" }) {
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

function OverviewPage({ navigate }) {
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

function OperatorsPage({ navigate }) {
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

function DeviceDetail({ device, onBack }) {
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

function DevicesPage({ filterOperatorId }) {
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

function LicensesPage() {
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

function TokenMeteringPage() {
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

function OtaSupportPage() {
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

function CloudConsoleShell() {
  const [activePage, setActivePage] = useState("overview");
  const [params, setParams] = useState({});

  function navigate(pageKey, opts = {}) {
    setActivePage(pageKey);
    setParams(opts);
  }

  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);

  return (
    <div className="cc-shell">
      <aside className="cc-sidebar">
        <div className="cc-brand">
          <span className="cc-brand-mark">☁</span>
          <div>
            <div className="cc-brand-name">Operator Cloud</div>
            <div className="cc-brand-tag">设备 · 租户 · 许可 · OTA</div>
          </div>
        </div>
        <nav className="cc-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.key} className={`cc-nav-link${activePage === item.key ? " active" : ""}`} onClick={() => navigate(item.key)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="cc-nav-footer">
          演示数据 · 不连接真实设备/OTA/计费系统<br />
          开发工作台：?mode=developer
        </div>
      </aside>
      <main className="cc-main" aria-label={activeItem?.label}>
        <div className="cc-topbar">
          <div>
            <h1 className="cc-title">{activeItem?.label}</h1>
            <p className="cc-subtitle">AI Commerce Operator Cloud —— 管理已售出的 Mac mini 设备群，不是店铺日常经营界面</p>
          </div>
          <span className="cc-badge-demo">演示数据</span>
        </div>
        {activePage === "overview" && <OverviewPage navigate={navigate} />}
        {activePage === "operators" && <OperatorsPage navigate={navigate} />}
        {activePage === "devices" && <DevicesPage filterOperatorId={params.operatorId} />}
        {activePage === "licenses" && <LicensesPage />}
        {activePage === "tokenMetering" && <TokenMeteringPage />}
        {activePage === "otaSupport" && <OtaSupportPage />}
      </main>
    </div>
  );
}

function CloudConsoleApp() {
  return <CloudConsoleShell />;
}

export default CloudConsoleApp;
