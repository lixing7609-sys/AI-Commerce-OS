const FILTERS = [["all", "全部"], ["builder", "系统关系"], ["capability-center", "能力"], ["execution", "执行"], ["assets", "演化"]];

export function CapabilityNavigation({ active, workspaceFilter, onWorkspaceFilter }) {
  return <nav className="sino-capability-nav" aria-label="对象工作区筛选">{FILTERS.map(([key, label]) => <button key={key} className={active === "objects" && workspaceFilter === key ? "is-active" : ""} onClick={() => onWorkspaceFilter(key)}>{label}</button>)}</nav>;
}
