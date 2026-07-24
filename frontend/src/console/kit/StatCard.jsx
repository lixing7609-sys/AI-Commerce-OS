function DeltaBadge({ delta }) {
  if (delta === undefined || delta === null) return null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`fdr-stat-card__delta fdr-stat-card__delta--${direction}`}>
      {sign}
      {delta}%
    </span>
  );
}

export function StatCard({ label, value, delta, onClick }) {
  return (
    <div
      className="fdr-stat-card"
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <p className="fdr-stat-card__label">{label}</p>
      <div className="fdr-stat-card__value">{value}</div>
      <DeltaBadge delta={delta} />
    </div>
  );
}

export function StatGrid({ children }) {
  return <div className="fdr-stat-grid">{children}</div>;
}
