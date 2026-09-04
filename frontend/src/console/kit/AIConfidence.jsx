function labelFor(value) {
  if (value >= 80) return "高置信度";
  if (value >= 50) return "中等置信度";
  return "低置信度";
}

export function AIConfidence({ value }) {
  const label = labelFor(value);

  return (
    <span className="fdr-ai-confidence">
      <span className="fdr-ai-confidence__bar">
        <span className="fdr-ai-confidence__fill" style={{ width: `${value}%` }} />
      </span>
      {label} · {value}%
    </span>
  );
}
