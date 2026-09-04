/**
 * Studio 页面共用的最小展示组件——不是完整的 kit 库，只是把
 * StatGrid/Table/Pill 这类在多个页面里反复出现的结构抽出来，
 * 避免每个页面各自重写一遍。样式全部来自 studioConsole.css 的
 * st- 前缀类名。
 */
export function Pill({ tone = "neutral", children }) {
  return <span className={`st-pill st-pill--${tone}`}>{children}</span>;
}

export function DemoBadge() {
  return <span className="st-demo-badge">演示数据</span>;
}

export function StatGrid({ items }) {
  return (
    <div className="st-grid">
      {items.map((item) => (
        <div key={item.label} className={`st-stat${item.onClick ? " clickable" : ""}`} onClick={item.onClick}>
          <p className="st-stat-label">{item.label}</p>
          <p className="st-stat-value">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function Table({ columns, rows, onRowClick, empty = "暂无数据" }) {
  if (!rows || rows.length === 0) return <div className="st-empty"><div className="st-empty__message">{empty}</div></div>;
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id ?? idx} data-clickable={onRowClick ? "true" : "false"} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Card({ title, action, children }) {
  return (
    <div className="st-card">
      {title ? (
        <div className="st-card-header">
          <h3 className="st-card-title" style={{ margin: 0 }}>{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function EmptyState({ icon = "○", message, action }) {
  return (
    <div className="st-empty">
      <div className="st-empty__icon">{icon}</div>
      <div className="st-empty__message">{message}</div>
      {action}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="st-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`st-tab${active === tab.key ? " active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, onClose, children, width = 640 }) {
  if (!open) return null;
  return (
    <div className="st-modal-overlay" onClick={onClose}>
      <div className="st-modal-box" style={{ width }} onClick={(e) => e.stopPropagation()}>
        <div className="st-modal-head">
          <b>{title}</b>
          <button type="button" className="st-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="st-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="st-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

