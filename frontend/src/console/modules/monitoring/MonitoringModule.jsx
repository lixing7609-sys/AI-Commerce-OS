import { useState } from "react";
import "../../../App.css";
import RuntimeStatusPanel from "../../../components/runtime/RuntimeStatusPanel.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { PageHeader, StatCard, StatGrid, DataTable, StatusPill, Button, DemoBadge } from "../../kit/index.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getSystemHardware, getSystemContainers, getSystemRequestMetrics, getSystemIncidents, resolveIncident } from "../../mock/systemCenterMock.js";
import { getCloudOverviewMetrics } from "../../../demoData/cloudDemoData.js";
import { getComputeOverview, getDistributedComputeState } from "../../../shared/distributedCompute/mockComputeRepository.js";
import { OverviewPage } from "../../../cloud/cloudPages.jsx";

const TABS = [
  { key: "overview", label: "总览" },
  { key: "services", label: "服务状态" },
];

const SEVERITY_TONE = { critical: "danger", warning: "warning", info: "neutral" };
const SEVERITY_LABEL = { critical: "严重", warning: "警告", info: "提示" };
const INCIDENT_STATUS_TONE = { open: "danger", processing: "warning", resolved: "success" };
const INCIDENT_STATUS_LABEL = { open: "未处理", processing: "处理中", resolved: "已处理" };

/**
 * Cloud Center · Monitoring (Charter §3.5) — folds the shared cloud
 * package's OverviewPage (fleet-wide metrics) and the Founder-only
 * SystemCenterModule's hardware/runtime half (this Mac mini's own
 * health) into one tab set. The log half of the former SystemCenter
 * moved to its own "Logs" item (see LogsModule.jsx) — status and logs
 * are different jobs, not one page.
 */
export function MonitoringModule() {
  const [tab, setTab] = useState("overview");
  const [, forceRerender] = useState(0);
  const { navigate } = useConsoleNavContext();
  const hardware = getSystemHardware();
  const containers = getSystemContainers();
  const requestMetrics = getSystemRequestMetrics();
  const incidents = getSystemIncidents();
  const cloudMetrics = getCloudOverviewMetrics();
  const computeOverview = getComputeOverview();
  const { devicePool } = getDistributedComputeState();
  const onlineRatePct = cloudMetrics.totalOperators > 0 ? Math.round((cloudMetrics.activeDevices / (cloudMetrics.activeDevices + cloudMetrics.offlineDevices)) * 100) : 0;
  const avgNodeLoadPct = devicePool.length > 0 ? Math.round((devicePool.reduce((sum, d) => sum + d.currentLoad, 0) / devicePool.length) * 100) : 0;

  function cloudNavigate(key, opts = {}) {
    navigate("cloudCenter", { subView: key, entityId: opts.operatorId ?? null });
  }

  function handleResolve(id) {
    resolveIncident(id);
    forceRerender((n) => n + 1);
  }

  return (
    <div>
      <PageHeader title="系统监控" subtitle="设备群健康度、请求量/错误率、节点负载与事件告警——是否健康，一眼看清" actions={<DemoBadge />} />
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "overview" ? (
        <div>
          <div className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 className="fdr-card__title" style={{ margin: 0 }}>服务与请求指标</h3>
              <DemoBadge />
            </div>
            <StatGrid>
              <StatCard label="设备在线率" value={`${onlineRatePct}%`} onClick={() => navigate("cloudCenter", { subView: "devices" })} />
              <StatCard label="今日请求量" value={requestMetrics.requestsToday.toLocaleString()} />
              <StatCard label="错误率" value={`${requestMetrics.errorRatePct}%`} />
              <StatCard label="任务队列（当前）" value={computeOverview.activeTasks} onClick={() => navigate("cloudCenter", { subView: "distributedScheduling" })} />
              <StatCard label="节点平均负载" value={`${avgNodeLoadPct}%`} onClick={() => navigate("cloudCenter", { subView: "distributedScheduling" })} />
              <StatCard label="Token 使用（今日）" value={cloudMetrics.tokenConsumptionToday.toLocaleString()} onClick={() => navigate("cloudToken")} />
            </StatGrid>
          </div>
          <OverviewPage navigate={cloudNavigate} />
          <div className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="fdr-card__title" style={{ margin: 0 }}>告警与事件</h3>
              <DemoBadge />
            </div>
            <DataTable
              columns={[
                { key: "title", label: "事件" },
                { key: "severity", label: "级别", render: (r) => <StatusPill tone={SEVERITY_TONE[r.severity]}>{SEVERITY_LABEL[r.severity]}</StatusPill> },
                { key: "deviceId", label: "关联设备", render: (r) => r.deviceId ?? "—" },
                { key: "detectedAt", label: "发现时间", render: (r) => new Date(r.detectedAt).toLocaleString("zh-CN") },
                { key: "status", label: "处理状态", render: (r) => <StatusPill tone={INCIDENT_STATUS_TONE[r.status]}>{INCIDENT_STATUS_LABEL[r.status]}</StatusPill> },
                {
                  key: "actions", label: "操作", render: (r) => (
                    r.status !== "resolved" ? <Button size="sm" variant="secondary" onClick={() => handleResolve(r.id)}>标记已处理</Button> : null
                  ),
                },
              ]}
              rows={incidents}
              emptyMessage="暂无告警与事件"
            />
          </div>
        </div>
      ) : null}
      {tab === "services" ? (
        <div>
          <div className="fdr-card">
            <h3 className="fdr-card__title">AI 运营系统（真实数据）</h3>
            <RuntimeStatusPanel />
          </div>
          <div className="fdr-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 className="fdr-card__title" style={{ margin: 0 }}>硬件资源</h3>
              <DemoBadge />
            </div>
            <StatGrid>
              <StatCard label="CPU" value={`${hardware.cpuPct}%`} />
              <StatCard label="内存" value={`${hardware.memPct}%`} />
              <StatCard label="磁盘" value={`${hardware.diskPct}%`} />
              <StatCard label="温度" value={`${hardware.tempC}°C`} />
            </StatGrid>
          </div>
          <div className="fdr-card">
            <h3 className="fdr-card__title">容器</h3>
            <DataTable
              columns={[
                { key: "name", label: "名称" },
                { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "running" ? "success" : "danger"}>{r.status === "running" ? "运行中" : "已停止"}</StatusPill> },
                { key: "uptime", label: "运行时长" },
              ]}
              rows={containers}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
