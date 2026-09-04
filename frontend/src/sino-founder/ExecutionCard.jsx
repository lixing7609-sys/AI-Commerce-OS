export function ExecutionCard({ requirement, executionPackage, risk }) {
  return (
    <article className="sino-card" data-testid="execution-card">
      <span className="sino-card__index">05</span>
      <h2>执行建议</h2>
      <p className="sino-card__value">{requirement?.recommendation || "尚未组装"}</p>
      <p>{executionPackage?.commit_requirement || "执行范围、约束与验证要求将在授权前保持可见。"}</p>
      {requirement && <small>{requirement.executor} · {requirement.approval_required ? "需 Founder 授权" : "无需授权"} · 风险 {risk?.level || "待评估"}</small>}
    </article>
  );
}
