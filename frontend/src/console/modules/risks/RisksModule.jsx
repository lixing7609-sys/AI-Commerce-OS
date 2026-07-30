import { PageHeader, StatGrid, StatCard, AIRiskAlert, DemoBadge } from "../../kit/index.js";
import { getRisks } from "../founderWorkspace/workspaceEntities.js";
import { WorkspaceStatusBadge, DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";

const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Founder Workspace · Risks — same entity model as Decisions (Charter
 * §3.1), sourced from Cloud Token balance, Capability Center
 * evaluation regressions, Operator auto-ops thresholds, and Cloud
 * License expiry. Reuses the existing AIRiskAlert primitive rather
 * than inventing a second risk-badge visual language.
 */
export function RisksModule() {
  const risks = [...getRisks()].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return (
    <div>
      <PageHeader title="Risks" subtitle="跨 Founder 四大职能面的风险信号聚合" actions={<DemoBadge />} />
      <StatGrid>
        <StatCard label="高风险" value={risks.filter((r) => r.level === "high").length} />
        <StatCard label="中风险" value={risks.filter((r) => r.level === "medium").length} />
        <StatCard label="低风险" value={risks.filter((r) => r.level === "low").length} />
        <StatCard label="待处理" value={risks.filter((r) => r.status === "pending").length} />
      </StatGrid>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {risks.map((r) => (
          <div className="fdr-card" key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <strong>{r.title}</strong>
                  <WorkspaceStatusBadge status={r.status} />
                </div>
                <AIRiskAlert level={r.level} concern={r.concern} />
                <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>
                  来源：{r.sourceModule} · {r.sourceModuleLabel} · 发现于 {new Date(r.detectedAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <DrillDownLink module={r.linkedModule} subView={r.linkedSubView}>去处理</DrillDownLink>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
