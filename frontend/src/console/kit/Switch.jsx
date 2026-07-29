export function Switch({ checked, onChange, label, disabled, className = "", ...rest }) {
  const classes = [
    "fdr-switch",
    disabled ? "fdr-switch--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const trackClasses = [
    "fdr-switch__track",
    checked ? "fdr-switch__track--on" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={classes}
      onClick={() => onChange?.(!checked)}
      {...rest}
    >
      <span className={trackClasses}>
        <span className="fdr-switch__thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
