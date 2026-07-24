import { useMemo } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getAllAgentConfigs } from "../../mock/agentStudioMock.js";
import { getOrCreateReplay } from "../../mock/replayMock.js";

const STEP_TONE = { prompt: "info", tool_call: "warning", model_response: "success" };

export function ReplayCenterModule() {
  const { entityId, navigate } = useConsoleNavContext();

  const allRuns = useMemo(() => {
    const configs = getAllAgentConfigs();
    return Object.entries(configs).flatMap(([agentName, config]) =>
      config.runHistory.map((run) => ({ ...run, agentName }))
    );
  }, []);

  if (entityId) {
    const run = allRuns.find((r) => r.replayId === entityId);
    const replay = getOrCreateReplay(entityId, run?.agentName);

    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={() => navigate("replayCenter")}>
          ← 返回回放列表
        </button>
        <PageHeader title={`回放：${replay.agentName}`} actions={<DemoBadge />} />
        <div className="fdr-card">
          {replay.steps.map((step, idx) => (
            <div key={step.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: idx < replay.steps.length - 1 ? "1px solid var(--border)" : "none" }}>
              <StatusPill tone={STEP_TONE[step.type] ?? "neutral"}>{step.type}</StatusPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{step.label}</div>
                <pre style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(step.payload, null, 2)}
                </pre>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {step.durationMs}ms{step.tokensUsed ? ` · ${step.tokensUsed} tokens` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="回放中心" subtitle="回放历史 Agent 运行，不影响生产数据" actions={<DemoBadge />} />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "agentName", label: "Agent" },
            { key: "startedAt", label: "开始时间", render: (r) => new Date(r.startedAt).toLocaleString("zh-CN") },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={r.status === "completed" ? "success" : "danger"}>{r.status}</StatusPill> },
            { key: "tokensUsed", label: "Token 用量" },
          ]}
          rows={allRuns}
          onRowClick={(row) => navigate("replayCenter", { entityId: row.replayId })}
          emptyMessage={<EmptyState icon="↻" message="暂无可回放的运行记录" />}
        />
      </div>
    </div>
  );
}
