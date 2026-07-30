import { PageHeader, StatGrid, StatCard, DataTable, StatusPill, DemoBadge } from "../../kit/index.js";
import { getContentValidation } from "../founderWorkspace/workspaceEntities.js";
import { DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";

const MODE_LABEL = { real: "已发布", demo: "演示样片", queue: "生产队列中" };
const MODE_TONE = { real: "success", demo: "neutral", queue: "info" };

/**
 * Founder Workspace · Content Validation — the Studio-side mirror of
 * Business Validation (Charter §3.1): is Studio Lab's production
 * actually reaching real audiences, or still demo/queue content?
 */
export function ContentValidationModule() {
  const data = getContentValidation();

  return (
    <div>
      <PageHeader title="Content Validation" subtitle={data.summary} actions={<DemoBadge />} />
      <StatGrid>
        {data.metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} delta={m.delta} />
        ))}
      </StatGrid>

      <div className="fdr-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>近期产出</h3>
        <DataTable
          columns={[
            { key: "title", label: "内容" },
            { key: "type", label: "类型" },
            { key: "mode", label: "状态", render: (r) => <StatusPill tone={MODE_TONE[r.mode]}>{MODE_LABEL[r.mode]}</StatusPill> },
            { key: "engagement", label: "互动/说明" },
            { key: "publishedAt", label: "发布时间" },
          ]}
          rows={data.items}
        />
      </div>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <DrillDownLink module="studioLab">前往 Studio Lab 查看生产详情</DrillDownLink>
      </div>
    </div>
  );
}
