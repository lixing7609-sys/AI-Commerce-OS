export function ProgressBar({ value, max = 100, tone = "primary", label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="fdr-progress">
      <div className="fdr-progress__track">
        <div className={`fdr-progress__fill fdr-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {label ? <span className="fdr-progress__label">{label}</span> : null}
    </div>
  );
}
