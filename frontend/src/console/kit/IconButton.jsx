import { Icon } from "./Icon.jsx";

export function IconButton({
  icon,
  size = 16,
  variant = "ghost",
  className = "",
  "aria-label": ariaLabel,
  ...rest
}) {
  if (import.meta.env.DEV && !ariaLabel) {
     
    console.warn("IconButton: aria-label is required");
  }

  const classes = [
    "fdr-icon-btn",
    variant === "subtle" ? "fdr-icon-btn--subtle" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} aria-label={ariaLabel} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
