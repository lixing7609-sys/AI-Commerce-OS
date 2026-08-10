export function TaskDraftCard({ draft, plan = [] }) {
  return (
    <article className="sino-card" data-testid="task-draft-card">
      <span className="sino-card__index">02</span>
      <h2>Task Plan</h2>
      <p className="sino-card__value">{draft?.title || "尚未生成"}</p>
      <p>{draft?.description || "分析完成后生成可审核的 TaskAsset 草稿。"}</p>
      {plan.length > 0 && <ol className="sino-card__plan">{plan.map((item, index) => <li key={`${item.title}-${index}`}>{item.title}</li>)}</ol>}
    </article>
  );
}
