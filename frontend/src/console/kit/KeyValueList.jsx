/**
 * Label/value pairs (object detail summaries) without a table's row chrome
 * (component-spec.md#keyvaluelist). Semantic <dl>/<dt>/<dd> per
 * accessibility-spec.md.
 */
export function KeyValueList({ items = [] }) {
  return (
    <dl className="fdr-kv-list">
      {items.map((item, i) =>
        item.onClick ? (
          <div
            className="fdr-kv-row"
            key={item.label ?? i}
            role="button"
            tabIndex={0}
            onClick={item.onClick}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                item.onClick();
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <dt className="fdr-kv-row__label">{item.label}</dt>
            <dd className="fdr-kv-row__value">{item.value}</dd>
          </div>
        ) : (
          <div className="fdr-kv-row" key={item.label ?? i}>
            <dt className="fdr-kv-row__label">{item.label}</dt>
            <dd className="fdr-kv-row__value">{item.value}</dd>
          </div>
        )
      )}
    </dl>
  );
}
