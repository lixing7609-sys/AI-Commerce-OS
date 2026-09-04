export function CapabilityMapPanel({ capabilityStatus }) {
  return (
    <section className="sino-strategy-card" aria-label="能力地图面板">
      <span className="sino-kicker">能力地图</span><h2>AI 应用系统</h2>
      <ul className="sino-capability-map">{(capabilityStatus?.applications || []).map((item) => <li key={item.key}><div><strong>{item.name}</strong><p>{item.role}</p></div><span data-status={item.status}>{item.status}</span></li>)}</ul>
    </section>
  );
}
