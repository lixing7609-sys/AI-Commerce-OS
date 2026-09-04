/**
 * The primary replacement for equal-weight StatCard grids
 * (see component-spec.md#metric). `variant="primary"` renders at
 * metric-large size and is meant to appear at most once per screen —
 * the one number that matters most; `variant="standard"` is for
 * supporting numbers.
 */
export function Metric({ value, unit, caption, variant = "standard", className = "" }) {
  const classes = ["fdr-metric", `fdr-metric--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="fdr-metric__value-row">
        <span className="fdr-metric__value">{value}</span>
        {unit ? <span className="fdr-metric__unit">{unit}</span> : null}
      </div>
      {caption ? <p className="fdr-metric__caption">{caption}</p> : null}
    </div>
  );
}
