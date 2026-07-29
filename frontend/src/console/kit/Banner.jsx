export function Banner({ tone = "neutral", children, action }) {
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";

  return (
    <div className={`fdr-banner fdr-banner--${tone}`} role={role}>
      <div className="fdr-banner__text">{children}</div>
      {action}
    </div>
  );
}
