export function StatusPill({ tone = "neutral", children }) {
  return (
    <span className={`fdr-pill fdr-pill--${tone}`}>
      <span className="fdr-pill__dot" />
      {children}
    </span>
  );
}

export function DemoBadge() {
  return <span className="fdr-demo-badge">演示数据</span>;
}
