export function CapabilityMapPanel({ capabilityStatus }) {
  return (
    <section className="sino-strategy-card" aria-label="Capability Map Panel">
      <span className="sino-kicker">Capability map</span><h2>AI Application Systems</h2>
      <ul className="sino-capability-map">{(capabilityStatus?.applications || []).map((item) => <li key={item.key}><div><strong>{item.name}</strong><p>{item.role}</p></div><span data-status={item.status}>{item.status}</span></li>)}</ul>
    </section>
  );
}
