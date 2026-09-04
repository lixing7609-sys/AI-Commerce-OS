import { CHART_COLORS, computeDonutSegments } from "../../helpers/chartData";

export { CHART_COLORS };

export function DonutChart({ segments, centerValue, centerLabel, valueFormatter }) {
  const format = valueFormatter ?? ((value) => value);
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const parts = computeDonutSegments(segments);

  const gradient =
    total > 0
      ? parts.map((part) => `${part.color} ${part.start.toFixed(2)}% ${part.end.toFixed(2)}%`).join(", ")
      : null;

  return (
    <div className="op-donut-wrap">
      <div
        className="op-donut"
        style={{ background: gradient ? `conic-gradient(${gradient})` : "#eeeef0" }}
        role="img"
        aria-label={centerLabel}
      >
        <div className="op-donut-hole">
          <strong>{format(centerValue)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="op-donut-legend">
        {parts.map((part) => (
          <li key={part.name}>
            <i style={{ background: part.color }} />
            <span className="op-donut-legend-name">{part.name}</span>
            <span className="op-donut-legend-value">
              {format(part.value)} · {part.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarListChart({ rows }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="op-bar-list">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="op-bar-list-label">{row.label}</span>
          <div className="op-bar-list-track">
            <div className="op-bar-list-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="op-bar-list-value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
