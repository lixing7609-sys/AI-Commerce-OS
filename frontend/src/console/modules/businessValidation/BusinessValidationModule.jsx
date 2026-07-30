import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, DemoBadge } from "../../kit/index.js";
import { getBusinessValidation } from "../founderWorkspace/workspaceEntities.js";
import { DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";

const MODE_LABEL = { real: "真实经营", demo: "演示数据" };
const MODE_TONE = { real: "success", demo: "neutral" };

/**
 * Founder Workspace · Business Validation — is Operator Lab producing
 * real commerce outcomes, not just a convincing demo? Charter §3.1:
 * distinct from Operator Lab itself (which runs the business) — this
 * page is Founder's read-only validation lens on top of it.
 */
export function BusinessValidationModule() {
  const data = getBusinessValidation();

  return (
    <div>
      <PageHeader title="Business Validation" subtitle={data.summary} actions={<DemoBadge />} />
      <StatGrid>
        {data.metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} delta={m.delta} />
        ))}
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>按店铺的真实/演示状态</h3>
        <DataTable
          columns={[
            { key: "name", label: "店铺" },
            { key: "mode", label: "状态", render: (r) => <StatusPill tone={MODE_TONE[r.mode]}>{MODE_LABEL[r.mode]}</StatusPill> },
            { key: "gmv", label: "GMV（30天）", render: (r) => `¥${r.gmv.toLocaleString()}` },
            { key: "orders", label: "订单数" },
            { key: "note", label: "说明" },
          ]}
          rows={data.shops}
        />
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <DrillDownLink module="operatorLab" subView="workbench">前往 Operator Lab 查看经营详情</DrillDownLink>
      </div>
    </div>
  );
}
