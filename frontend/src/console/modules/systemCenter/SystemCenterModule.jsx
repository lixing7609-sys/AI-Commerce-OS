import "../../../App.css";
import RuntimeStatusPanel from "../../../components/runtime/RuntimeStatusPanel.jsx";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { getSystemContainers, getSystemHardware, getSystemLogs } from "../../mock/systemCenterMock.js";

export function SystemCenterModule() {
  const hardware = getSystemHardware();
  const containers = getSystemContainers();
  const logs = getSystemLogs();

  return (
    <div>
      <PageHeader title="系统中心" subtitle="Mac mini 运行状态" />

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

      <div className="fdr-card">
        <h3 className="fdr-card__title">日志</h3>
        <DataTable
          columns={[
            { key: "ts", label: "时间", render: (r) => new Date(r.ts).toLocaleString("zh-CN") },
            { key: "level", label: "级别", render: (r) => <StatusPill tone={r.level === "warning" ? "warning" : "neutral"}>{r.level}</StatusPill> },
            { key: "source", label: "来源" },
            { key: "message", label: "内容" },
          ]}
          rows={logs}
        />
      </div>
    </div>
  );
}
