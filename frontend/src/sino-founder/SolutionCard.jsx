export function SolutionCard({ solution }) {
  return (
    <article className="sino-card" data-testid="solution-card">
      <span className="sino-card__index">03</span>
      <h2>Technical Solution</h2>
      <p className="sino-card__value">{solution?.summary || "尚未生成"}</p>
      {solution?.approach?.length ? <ol className="sino-card__plan">{solution.approach.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol> : <p>Sino 将生成保持架构边界的技术方案。</p>}
      {solution?.architecture_impact && <small>架构影响 · {solution.architecture_impact}</small>}
    </article>
  );
}
