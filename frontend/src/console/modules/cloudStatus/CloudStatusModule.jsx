import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, DemoBadge } from "../../kit/index.js";
import { getCloudStatusSummary } from "../founderWorkspace/workspaceEntities.js";
import { DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";

/**
 * Founder Workspace · Cloud Status — read-only summary pulled from
 * Cloud Center's own data (Charter §3.1); does not re-implement fleet
 * management, only surfaces it with a drill-down.
 */
export function CloudStatusModule() {
  const data = getCloudStatusSummary();

  return (
    <div>
      <PageHeader title="Cloud Status" subtitle={data.summary} actions={<DemoBadge />} />
      <StatGrid>
        {data.metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} />
        ))}
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>服务状态</h3>
        <DataTable
          columns={[
            { key: "name", label: "服务" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status.includes("run") || r.status === "运行中" ? "success" : "neutral"}>{r.status}</StatusPill> },
            { key: "detail", label: "详情" },
          ]}
          rows={data.services.map((s, i) => ({ id: i, ...s }))}
        />
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <DrillDownLink module="cloudCenter" subView="overview">前往 Cloud Center 查看完整状态</DrillDownLink>
      </div>
    </div>
  );
}
