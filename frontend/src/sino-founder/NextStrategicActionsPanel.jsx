export function NextStrategicActionsPanel({ actions = [] }) {
  return (
    <section className="sino-strategy-card" aria-label="下一步战略行动面板">
      <span className="sino-kicker">战略决策</span><h2>下一步战略动作</h2>
      <ol className="sino-strategic-actions">{actions.map((action) => <li key={action.priority}><span>{action.priority}</span><div><strong>{action.title}</strong><p>{action.reason}</p><small>{action.requires_approval ? "等待 Founder 授权" : "无需授权"}</small></div></li>)}</ol>
    </section>
  );
}
