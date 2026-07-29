export function AIExplanation({ reason, expectedEffect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-secondary)" }}>原因</div>
        <div className="fdr-type-body">{reason}</div>
      </div>
      <div>
        <div className="fdr-type-caption" style={{ color: "var(--text-secondary)" }}>预期效果</div>
        <div className="fdr-type-body">{expectedEffect}</div>
      </div>
    </div>
  );
}
