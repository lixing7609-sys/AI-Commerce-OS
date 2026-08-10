export function RoadmapPanel({ roadmap }) {
  return (
    <section className="sino-strategy-card" aria-label="Roadmap Panel">
      <span className="sino-kicker">Roadmap</span><h2>长期路线</h2>
      <ol className="sino-roadmap-list">{(roadmap?.milestones || []).map((item) => <li key={item.phase} data-status={item.status}><span /><div><strong>{item.phase}</strong><small>{item.status}</small></div></li>)}</ol>
    </section>
  );
}
