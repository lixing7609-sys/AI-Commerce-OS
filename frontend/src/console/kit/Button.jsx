export function Button({
  variant = "secondary",
  size,
  children,
  className = "",
  ...rest
}) {
  const classes = [
    "fdr-btn",
    `fdr-btn--${variant}`,
    size === "sm" ? "fdr-btn--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
