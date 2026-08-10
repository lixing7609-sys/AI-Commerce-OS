export function AnalysisCard({ analysis }) {
  return (
    <article className="sino-card" data-testid="analysis-card">
      <span className="sino-card__index">01</span>
      <h2>Analysis</h2>
      <p className="sino-card__value">{analysis?.interpretation || "等待目标"}</p>
      <p>{analysis?.current_state || "Sino 将结合项目状态与历史上下文分析能力缺口。"}</p>
      {analysis?.gap && <small>能力差距 · {analysis.gap}</small>}
    </article>
  );
}
