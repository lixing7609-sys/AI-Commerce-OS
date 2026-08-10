export function TaskPlanCard({ plan = [], draft }) {
  return (
    <article className="sino-card" data-testid="task-plan-card">
      <span className="sino-card__index">04</span>
      <h2>Task Plan</h2>
      <p className="sino-card__value">{draft?.title || "尚未生成"}</p>
      {plan.length ? <ol className="sino-card__plan">{plan.map((item, index) => <li key={`${item.title}-${index}`}><strong>{item.title}</strong>{item.reason && <span>{item.reason}</span>}</li>)}</ol> : <p>推理完成后生成有优先级和审批边界的 TaskAsset 计划。</p>}
    </article>
  );
}
