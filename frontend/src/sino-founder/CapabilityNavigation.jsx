export function CapabilityNavigation({ active, onNavigate }) {
  const items = [["home", "Sino Founder AI"], ["objects", "Object Workspace"]];
  const selected = ["home", "conversation", "project"].includes(active) ? "home" : active;
  return <nav className="sino-capability-nav" aria-label="Founder AI 能力入口">{items.map(([view, label]) => <button key={view} className={selected === view ? "is-active" : ""} onClick={() => onNavigate(view)}>{label}</button>)}</nav>;
}
