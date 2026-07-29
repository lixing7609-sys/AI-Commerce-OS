import { useState } from "react";
import { getStudioLabState, runPromptTest, runReplay } from "../../../studio/mock/studioAgentMock.js";
import { PageHeader, DataTable, StatusPill, useToast } from "../../kit/index.js";

function FounderStudioLabBadge() {
  return <StatusPill tone="info">Founder · Studio 实验室</StatusPill>;
}

/* ============================ Prompt测试台 ============================ */

export function StudioPromptTestModule() {
  const { agents } = getStudioLabState();
  const [agentId, setAgentId] = useState(agents[0]?.agentId);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const showToast = useToast();

  async function handleRun() {
    setRunning(true);
    try {
      const res = await runPromptTest(agentId, 2);
      setResults(res.results);
      showToast("测试运行完成，可对比结果", "success");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader title="Prompt测试台" subtitle="使用同一项目输入，对比 Prompt V1/V2、不同模型的输出质量/成本/延迟" actions={<FounderStudioLabBadge />} />
      <div className="fdr-filter-bar" style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <select className="fdr-select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.name}</option>)}
        </select>
        <button type="button" className="fdr-btn fdr-btn--primary" disabled={running} onClick={handleRun}>{running ? "运行中…" : "运行测试"}</button>
      </div>
      {results ? (
        <DataTable
          columns={[
            { key: "variant", label: "版本" }, { key: "qualityScore", label: "人工评分" },
            { key: "cost", label: "成本", render: (r) => `¥${r.cost}` }, { key: "latencyMs", label: "延迟", render: (r) => `${r.latencyMs}ms` },
            { key: "adopt", label: "采用", render: (r) => <button type="button" className="fdr-btn" onClick={() => showToast(`已采用版本 ${r.variant}`, "success")}>采用此版本</button> },
          ]}
          rows={results.map((r, idx) => ({ id: idx, ...r }))}
        />
      ) : <p style={{ fontSize: 13, color: "var(--fdr-text-secondary)" }}>点击「运行测试」生成对比结果。</p>}
    </div>
  );
}

/* ============================ 真实任务回放 ============================ */

export function StudioReplayModule() {
  const [state, setState] = useState(() => getStudioLabState());
  const [running, setRunning] = useState(null);
  const showToast = useToast();

  async function handleReplay(replayId) {
    setRunning(replayId);
    try {
      const next = await runReplay(replayId, { newPromptVersion: "最新发布版本" });
      setState((s) => ({ ...s, replayTasks: next.replayTasks }));
      showToast("回放完成（未真实发布），可对比原结果", "success");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <PageHeader title="真实任务回放" subtitle="选择历史任务，使用新 Prompt/Skill/模型重新运行，不真实发布，仅对比与记录评测" actions={<FounderStudioLabBadge />} />
      <DataTable
        columns={[
          { key: "taskSummary", label: "任务" }, { key: "agentId", label: "Agent" },
          { key: "originalInput", label: "原始输入" }, { key: "originalOutput", label: "原始输出" },
          { key: "lastReplayOutput", label: "最新回放结果", render: (r) => r.lastReplayOutput ?? "尚未回放" },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="fdr-btn" disabled={running === r.replayId} onClick={(e) => { e.stopPropagation(); handleReplay(r.replayId); }}>{running === r.replayId ? "运行中…" : "使用新配置重新运行"}</button> },
        ]}
        rows={state.replayTasks}
      />
    </div>
  );
}

/* ============================ A/B评测 ============================ */

export function StudioEvaluationModule() {
  const { evaluationRuns } = getStudioLabState();
  return (
    <div>
      <PageHeader title="A/B评测" subtitle="A版/B版内容质量、模型成本对比，记录最终胜出版本" actions={<FounderStudioLabBadge />} />
      <DataTable
        columns={[
          { key: "agentId", label: "Agent" }, { key: "metric", label: "评测指标" },
          { key: "promptVersionA", label: "A版本", render: (r) => `v${r.promptVersionA}` },
          { key: "scoreA", label: "A得分" }, { key: "costA", label: "A成本", render: (r) => `¥${r.costA}` },
          { key: "promptVersionB", label: "B版本", render: (r) => `v${r.promptVersionB}` },
          { key: "scoreB", label: "B得分" }, { key: "costB", label: "B成本", render: (r) => `¥${r.costB}` },
          { key: "winner", label: "胜出版本", render: (r) => <StatusPill tone="success">{r.winner} 版</StatusPill> },
        ]}
        rows={evaluationRuns}
      />
    </div>
  );
}
