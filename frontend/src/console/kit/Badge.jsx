export function Badge({ tone = "neutral", children }) {
  return <span className={`fdr-pill fdr-pill--${tone}`}>{children}</span>;
}
