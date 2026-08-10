export function GoalAnalysisCard({ analysis }) {
  return (
    <article className="sino-card" data-testid="goal-analysis-card">
      <span className="sino-card__index">01</span>
      <h2>Goal Analysis</h2>
      <p className="sino-card__value">{analysis?.goal_type || "等待目标"}</p>
      <p>{analysis?.objective || (analysis ? "Sino 已完成目标识别与边界分析。" : "提交目标后，Sino 将判断目标类型与执行边界。")}</p>
      {analysis?.current_phase && <small>当前阶段 · {analysis.current_phase}</small>}
    </article>
  );
}
