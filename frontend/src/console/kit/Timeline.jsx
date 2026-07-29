/**
 * Chronological sequence of discrete events (audit trail, execution steps)
 * (component-spec.md#timeline). Ordered-list semantics per
 * accessibility-spec.md.
 */
export function Timeline({ items = [] }) {
  return (
    <ol className="fdr-timeline">
      {items.map((item, i) => (
        <li className="fdr-timeline__item" key={i}>
          <div className="fdr-timeline__rail">
            <div className="fdr-timeline__marker" />
            {i !== items.length - 1 ? <div className="fdr-timeline__line" /> : null}
          </div>
          <div>
            <div className="fdr-timeline__title">{item.title}</div>
            {item.description ? <div className="fdr-timeline__desc">{item.description}</div> : null}
            <div className="fdr-timeline__time">{item.timestamp}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
