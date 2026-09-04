import { Icon } from "./Icon.jsx";
import { TextButton } from "./TextButton.jsx";

export function FilterBar({ children, activeFilters = [], onClearAll, className = "" }) {
  const classes = ["fdr-filter-bar", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {children}
      {activeFilters.map((filter) => (
        <span className="fdr-filter-bar__chip" key={filter.key}>
          {filter.label}
          {filter.onRemove ? (
            <button
              type="button"
              onClick={filter.onRemove}
              aria-label={`移除筛选 ${filter.label}`}
              style={{
                display: "inline-flex",
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <Icon name="X" size={14} />
            </button>
          ) : null}
        </span>
      ))}
      {activeFilters.length > 0 && onClearAll ? (
        <TextButton variant="muted" onClick={onClearAll}>
          清除全部
        </TextButton>
      ) : null}
    </div>
  );
}
