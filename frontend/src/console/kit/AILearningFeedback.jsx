export function AILearningFeedback({ outcome, predicted, actual }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <div className="fdr-type-body">{outcome}</div>
      <div style={{ display: "flex", gap: "var(--space-16)" }}>
        <div>
          <div className="fdr-type-caption" style={{ color: "var(--text-secondary)" }}>预测</div>
          <div className="fdr-type-body">{predicted}</div>
        </div>
        <div>
          <div className="fdr-type-caption" style={{ color: "var(--text-secondary)" }}>实际</div>
          <div className="fdr-type-body">{actual}</div>
        </div>
      </div>
    </div>
  );
}
