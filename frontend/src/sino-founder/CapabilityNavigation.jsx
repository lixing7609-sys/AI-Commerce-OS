const NAVIGATION = [["home", "Founder"], ["capability-center", "AI 能力中心"], ["builder", "系统构建器"], ["execution", "执行中心"], ["assets", "资产与记忆"]];

export function CapabilityNavigation({ active, onNavigate }) {
  return <nav className="sino-capability-nav" aria-label="Founder AI 导航">{NAVIGATION.map(([key, label]) => <button key={key} className={active === key || (key === "home" && ["home", "conversation", "project"].includes(active)) ? "is-active" : ""} onClick={() => onNavigate(key)}>{label}</button>)}</nav>;
}
