import { StatusPill } from "./StatusPill.jsx";

/**
 * Live/recent stream of activity items, denser than Timeline
 * (component-spec.md#activityfeed).
 */
export function ActivityFeed({ items = [] }) {
  return (
    <div>
      {items.map((item, i) => (
        <div className="fdr-activity-row" key={i}>
          {item.status ? <StatusPill tone={item.status}>{item.statusLabel ?? item.status}</StatusPill> : null}
          <div className="fdr-activity-row__title">{item.title}</div>
          <div className="fdr-activity-row__meta">{item.meta}</div>
        </div>
      ))}
    </div>
  );
}
