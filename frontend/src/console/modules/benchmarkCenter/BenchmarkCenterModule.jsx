import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { ComparisonBarChart } from "../../kit/ChartFrame.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getBenchmarkState, recommendModel, runBenchmark } from "../../mock/benchmarkMock.js";

export function BenchmarkCenterModule() {
  const { entityId, navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getBenchmarkState());
  const [running, setRunning] = useState(false);
  const toast = useToast();

  const selectedSuite = entityId ? state.suites.find((s) => s.id === entityId) : null;

  if (selectedSuite) {
    const runs = state.runs.filter((r) => r.suiteId === selectedSuite.id);
    const best = recommendModel(state.runs, selectedSuite.id);

    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={() => navigate("benchmarkCenter")}>
          ← 返回基准列表
        </button>
        <PageHeader
          title={selectedSuite.name}
          subtitle={best ? `推荐模型：${best.modelLabel}（质量分 ${best.score}）` : "尚无运行记录"}
          actions={
            <Button
              variant="primary"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                setState(await runBenchmark(selectedSuite.id));
                setRunning(false);
                toast("基准测试完成", "success");
              }}
            >
              {running ? "运行中…" : "运行基准测试"}
            </Button>
          }
        />
        <div className="fdr-card">
          <h3 className="fdr-card__title">质量分对比</h3>
          <ComparisonBarChart data={runs} xKey="modelLabel" series={[{ key: "score", label: "质量分" }]} />
        </div>
        <div className="fdr-card">
          <DataTable
            columns={[
              { key: "modelLabel", label: "模型" },
              { key: "score", label: "质量分" },
              { key: "latencyMs", label: "延迟", render: (r) => `${r.latencyMs}ms` },
              { key: "costUsd", label: "成本", render: (r) => `$${r.costUsd}` },
              { key: "successRate", label: "成功率", render: (r) => `${r.successRate}%` },
            ]}
            rows={runs}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="基准测试中心" subtitle="跨模型对比质量、延迟、成本与成功率" actions={<DemoBadge />} />
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "name", label: "基准套件" },
            {
              key: "recommend",
              label: "当前推荐模型",
              render: (r) => {
                const best = recommendModel(state.runs, r.id);
                return best ? <StatusPill tone="success">{best.modelLabel}</StatusPill> : "—";
              },
            },
          ]}
          rows={state.suites}
          onRowClick={(row) => navigate("benchmarkCenter", { entityId: row.id })}
        />
      </div>
    </div>
  );
}
