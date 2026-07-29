/**
 * Generalized loading placeholder (component-spec.md#skeleton), generalizing
 * the shape ModuleSkeleton hard-codes into a reusable primitive.
 */
export function Skeleton({ variant = "text", width, height, className = "" }) {
  const classes = [
    "fdr-skeleton",
    variant === "text" ? "fdr-skeleton--text" : "",
    variant === "circle" ? "fdr-skeleton--circle" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const style = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;

  return <div className={classes} style={style} aria-hidden="true" />;
}

export function SkeletonGroup({ count = 3, ...skeletonProps }) {
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="text" {...skeletonProps} />
      ))}
    </div>
  );
}
