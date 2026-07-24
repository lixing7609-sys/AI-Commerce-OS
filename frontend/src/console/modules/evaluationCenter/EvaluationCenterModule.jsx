import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { ComparisonBarChart } from "../../kit/ChartFrame.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getEvaluationState, runEvaluation } from "../../mock/evaluationMock.js";

export function EvaluationCenterModule() {
  const { entityId, navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getEvaluationState());
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const selectedRun = entityId ? state.runs.find((r) => r.id === entityId) : null;

  if (selectedRun) {
    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={() => navigate("evaluationCenter")}>
          ← 返回评估列表
        </button>
        <PageHeader title={`${selectedRun.agentName} · v${selectedRun.agentVersion}`} actions={<DemoBadge />} />
        <div className="fdr-card">
          <h3 className="fdr-card__title">分类得分</h3>
          <ComparisonBarChart data={selectedRun.categoryScores} xKey="category" series={[{ key: "score", label: "得分" }]} />
        </div>
        <div className="fdr-card">
          <h3 className="fdr-card__title">失败用例</h3>
          {selectedRun.failingCases.length === 0 ? (
            <EmptyState icon="✓" message="没有失败用例" />
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {selectedRun.failingCases.map((c) => (
                <li key={c.id}>{c.summary}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="评估中心"
        subtitle="评估每个 Agent 的平均质量、耗时、失败率"
        actions={
          <Button
            variant="primary"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              setState(await runEvaluation(state.datasets[0].id, "AI CEO"));
              setRunning(false);
              toast("评估已完成", "success");
            }}
          >
            {running ? "运行中…" : "运行评估"}
          </Button>
        }
      />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "agentName", label: "Agent" },
            { key: "agentVersion", label: "版本", render: (r) => `v${r.agentVersion}` },
            { key: "datasetId", label: "评测集" },
            {
              key: "avgScore",
              label: "平均得分",
              render: (r) => Math.round(r.categoryScores.reduce((sum, c) => sum + c.score, 0) / r.categoryScores.length),
            },
          ]}
          rows={state.runs}
          onRowClick={(row) => navigate("evaluationCenter", { entityId: row.id })}
        />
      </div>
    </div>
  );
}
