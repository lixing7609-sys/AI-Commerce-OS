import { useState } from "react";
import "../../../App.css";
import RuntimeStatusPanel from "../../../components/runtime/RuntimeStatusPanel.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { StatCard, StatGrid, DataTable, StatusPill, DemoBadge } from "../../kit/index.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getSystemHardware, getSystemContainers } from "../../mock/systemCenterMock.js";
import { OverviewPage } from "../../../cloud/cloudPages.jsx";

const TABS = [
  { key: "overview", label: "总览" },
  { key: "services", label: "服务状态" },
];

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
  const { navigate } = useConsoleNavContext();
  const hardware = getSystemHardware();
  const containers = getSystemContainers();

  function cloudNavigate(key, opts = {}) {
    navigate("cloudCenter", { subView: key, entityId: opts.operatorId ?? null });
  }

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "overview" ? <OverviewPage navigate={cloudNavigate} /> : null}
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
                { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "running" ? "success" : "danger"}>{r.status}</StatusPill> },
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
