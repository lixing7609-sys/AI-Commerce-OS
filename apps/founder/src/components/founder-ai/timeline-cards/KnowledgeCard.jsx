export function KnowledgeCard({ entry }) {
  const { entry: knowledge } = entry;
  return (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>已沉淀为知识：{knowledge.title}</h4>
        <span className="sf-badge success">已沉淀</span>
      </div>
      <dl className="founder-ai-definition-grid">
        <dt>所属领域</dt>
        <dd>{knowledge.category}</dd>
        <dt>正式结论</dt>
        <dd>{knowledge.summary}</dd>
        <dt>决策原因</dt>
        <dd>{knowledge.reason}</dd>
        <dt>禁止事项</dt>
        <dd>{knowledge.prohibitions.length ? knowledge.prohibitions.join("；") : "无"}</dd>
        <dt>生效时间</dt>
        <dd>{knowledge.effectiveAt}</dd>
      </dl>
      <p className="founder-ai-saved-note">已加入「知识」页面，未来生成任务包时可引用。</p>
    </div>
  );
}
