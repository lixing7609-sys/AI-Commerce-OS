export function RoadmapPanel({ roadmap }) {
  return (
    <section className="sino-strategy-card" aria-label="长期路线面板">
      <span className="sino-kicker">长期路线</span><h2>长期路线</h2>
      <ol className="sino-roadmap-list">{(roadmap?.milestones || []).map((item) => <li key={item.phase} data-status={item.status}><span /><div><strong>{item.phase}</strong><small>{item.status}</small></div></li>)}</ol>
    </section>
  );
}
