export function EmptyState({ icon = "○", message, action }) {
  return (
    <div className="fdr-empty">
      <div className="fdr-empty__icon">{icon}</div>
      <div className="fdr-empty__message">{message}</div>
      {action}
    </div>
  );
}
