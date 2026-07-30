import { PageHeader, StatGrid, StatCard, AIActionApproval, DemoBadge } from "../../kit/index.js";
import { getDecisions } from "../founderWorkspace/workspaceEntities.js";
import { WorkspaceStatusBadge, DrillDownLink } from "../founderWorkspace/WorkspaceKit.jsx";
import { useToast } from "../../kit/useToast.js";

/**
 * Founder Workspace · Decisions — aggregates every pending/in-review
 * item across Founder's four identities (Operator approvals, Studio
 * content review, Capability Center evaluate/approve, Cloud Token/
 * Marketplace) into one queue, per Charter §3.1. Each card drills back
 * into the module that actually owns the decision — this page does
 * not duplicate approval logic, only surfaces it.
 */
export function DecisionsModule() {
  const decisions = getDecisions();
  const pending = decisions.filter((d) => d.status === "pending" || d.status === "blocked");
  const showToast = useToast();

  return (
    <div>
      <PageHeader
        title="Decisions"
        subtitle="跨 Operator / Studio / AI Capability Center / Cloud 的待决策队列"
        actions={<DemoBadge />}
      />
      <StatGrid>
        <StatCard label="待决策" value={pending.length} />
        <StatCard label="审核中" value={decisions.filter((d) => d.status === "in-review").length} />
        <StatCard label="本周已批准" value={decisions.filter((d) => d.status === "approved").length} />
        <StatCard label="P0 优先级" value={decisions.filter((d) => d.priority === "P0").length} />
      </StatGrid>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {decisions.map((d) => (
          <div className="fdr-card" key={d.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <strong>{d.title}</strong>
                  <WorkspaceStatusBadge status={d.status} />
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0" }}>{d.summary}</p>
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  来源：{d.sourceModule} · {d.sourceModuleLabel} · {new Date(d.createdAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <DrillDownLink module={d.linkedModule} subView={d.linkedSubView}>去处理</DrillDownLink>
            </div>
            {d.status === "pending" ? (
              <div style={{ marginTop: 8 }}>
                <AIActionApproval
                  onApprove={() => showToast(`已批准「${d.title}」`, "success")}
                  onReject={() => showToast(`已驳回「${d.title}」`, "default")}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
