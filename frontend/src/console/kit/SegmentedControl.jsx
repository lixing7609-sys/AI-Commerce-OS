export function SegmentedControl({ options = [], value, onChange, className = "" }) {
  const classes = ["fdr-segmented", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        const itemClasses = [
          "fdr-segmented__item",
          active ? "fdr-segmented__item--active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={itemClasses}
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
