export function TaskDraftCard({ draft }) {
  return (
    <article className="sino-card" data-testid="task-draft-card">
      <span className="sino-card__index">02</span>
      <h2>Task Draft</h2>
      <p className="sino-card__value">{draft?.title || "尚未生成"}</p>
      <p>{draft?.description || "分析完成后生成可审核的 TaskAsset 草稿。"}</p>
    </article>
  );
}
