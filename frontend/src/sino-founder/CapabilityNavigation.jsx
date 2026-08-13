export function CapabilityNavigation({ active, onNavigate }) {
  const items = [["builder", "系统构建器"], ["capability-center", "能力中心"], ["execution", "执行中心"], ["assets", "资产与记忆"]];
  return <nav className="sino-capability-nav" aria-label="Founder AI 能力入口">{items.map(([view, label]) => <button key={view} className={active === view ? "is-active" : ""} onClick={() => onNavigate(view)}>{label}</button>)}</nav>;
}
