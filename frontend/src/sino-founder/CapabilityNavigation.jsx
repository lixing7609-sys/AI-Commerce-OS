const NAVIGATION = [["capability-center", "能力仓库"]];

export function CapabilityNavigation({ active, onNavigate }) {
  return <nav className="sino-capability-nav" aria-label="Founder AI 导航">{NAVIGATION.map(([key, label]) => <button key={key} className={active === key ? "is-active" : ""} onClick={() => onNavigate(key)}>{label}</button>)}</nav>;
}
