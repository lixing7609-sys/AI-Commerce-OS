import * as LucideIcons from "lucide-react";

const ALLOWED_SIZES = [14, 16, 18, 20, 24, 32];
const DEFAULT_STROKE_WIDTH = 1.75;

/**
 * Single entry point for icons in the Founder console. Design DNA v1.0
 * mandates one icon library (Lucide) at a fixed set of sizes/stroke
 * width — see docs/01-foundation/design/component-spec.md#icon-system.
 * `name` is a Lucide component name (e.g. "Gauge", "Bot", "Plug").
 */
export function Icon({ name, size = 16, className, "aria-label": ariaLabel, ...rest }) {
  const resolvedSize = ALLOWED_SIZES.includes(size) ? size : 16;
  const LucideIcon = LucideIcons[name];

  if (!LucideIcon) {
    if (import.meta.env.DEV) {

      console.warn(`Icon: unknown lucide-react icon "${name}"`);
    }
    return null;
  }

  return (
    <LucideIcon
      size={resolvedSize}
      strokeWidth={DEFAULT_STROKE_WIDTH}
      className={className ? `fdr-icon ${className}` : "fdr-icon"}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      {...rest}
    />
  );
}

export const ICON_SIZES = ALLOWED_SIZES;
