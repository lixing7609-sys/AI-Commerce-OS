export function RecommendedActionsPanel({ actions = [] }) {
  return (
    <section className="sino-briefing" aria-label="Recommended Actions Panel">
      <span className="sino-kicker">Next actions</span><h2>建议动作</h2>
      {actions.length === 0 ? <p>暂无待处理建议。</p> : <ol className="sino-action-list">{actions.map((action, index) => <li key={`${action.title}-${index}`}><div><strong>{action.title}</strong><p>{action.reason}</p></div><span data-priority={action.priority}>{action.priority} · {action.requires_approval ? "需授权" : "无需授权"}</span></li>)}</ol>}
    </section>
  );
}
