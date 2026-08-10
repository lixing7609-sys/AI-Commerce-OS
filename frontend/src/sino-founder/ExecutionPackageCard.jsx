export function ExecutionPackageCard({ executionPackage }) {
  return (
    <article className="sino-card" data-testid="execution-package-card">
      <span className="sino-card__index">03</span>
      <h2>Execution Package</h2>
      <p className="sino-card__value">{executionPackage?.commit_requirement || "尚未组装"}</p>
      <p>执行范围、约束与交付要求将在授权前保持可见。</p>
    </article>
  );
}
