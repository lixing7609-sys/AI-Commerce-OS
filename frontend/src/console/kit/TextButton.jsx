export function TextButton({
  variant = "default",
  href,
  children,
  className = "",
  ...rest
}) {
  const classes = [
    "fdr-text-btn",
    variant === "muted" ? "fdr-text-btn--muted" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
