export function StatCard({ label, value, hint }) {
  return (
    <div className="sf-card sf-stat-card">
      <div className="sf-stat-value">{value}</div>
      <div className="sf-stat-label">{label}</div>
      {hint ? <div className="sf-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function QueueList({ items = [], emptyLabel = "暂无数据", renderBadge }) {
  if (items.length === 0) {
    return <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{emptyLabel}</p>;
  }
  return (
    <div>
      {items.map((item) => (
        <div className="sf-queue-item" key={item.id}>
          <span>{item.label}</span>
          {renderBadge ? renderBadge(item) : null}
        </div>
      ))}
    </div>
  );
}
