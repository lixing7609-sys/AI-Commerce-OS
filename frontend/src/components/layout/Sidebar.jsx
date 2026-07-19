const NAV_ITEMS = [
  { key: "dashboard", icon: "⌂", label: "首页" },
  { key: "overview", icon: "◎", label: "运营概览" },
  { key: "agents", icon: "♙", label: "AI 员工" },
  { key: "tasks", icon: "☑", label: "任务中心" },
  { key: "analytics", icon: "◔", label: "数据分析" },
  { key: "knowledge", icon: "▣", label: "知识库" },
  { key: "settings", icon: "⚙", label: "设置" },
];

/**
 * 管理后台共享侧边栏。
 *
 * activePage 决定高亮项，onNavigate(key) 由外层 App 统一处理页面
 * 切换（沿用既有的单状态 activePage 导航方式，不引入 Router）。
 * statusLabel/statusOk 用于账户区状态灯，由各页面按自身语境传入
 * （例如 Dashboard 传运行时在线状态，任务中心传数据加载是否正常）。
 */
function Sidebar({
  activePage,
  onNavigate = () => {},
  statusLabel = "系统正常",
  statusOk = true,
}) {
  return (
    <aside className="dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">☀</span>
        <strong>AI CEO</strong>
      </div>

      <nav className="sidebar-navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-link${activePage === item.key ? " active" : ""}`}
            onClick={() => onNavigate(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-account">
        <div className="account-status">
          <span
            className="status-light"
            style={{ background: statusOk ? "#26b85d" : "#a7a8ad" }}
          />
          {statusLabel}
        </div>

        <div className="account-plan">
          <span>一人公司</span>
          <small>专业版</small>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
