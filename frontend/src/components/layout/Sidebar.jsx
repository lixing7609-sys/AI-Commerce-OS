import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { key: "dashboard", icon: "⌂", label: "首页" },
  { key: "overview", icon: "◎", label: "运营概览" },
  { key: "agents", icon: "♙", label: "AI 员工" },
  { key: "tasks", icon: "☑", label: "任务中心" },
  { key: "deliverables", icon: "✔", label: "成果中心" },
  { key: "shops", icon: "⛛", label: "店铺中心" },
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
 *
 * 小于 900px 时桌面侧边栏本身隐藏（既有 CSS），改为顶部汉堡按钮
 * + 左侧滑出抽屉；抽屉复用同一份 NAV_ITEMS 和同一段导航按钮
 * JSX（navContent 变量），不重复维护菜单列表。
 */
function Sidebar({
  activePage,
  onNavigate = () => {},
  statusLabel = "系统正常",
  statusOk = true,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  function handleNavigate(key) {
    setMobileOpen(false);
    onNavigate(key);
  }

  const navContent = (
    <nav className="sidebar-navigation">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`sidebar-link${activePage === item.key ? " active" : ""}`}
          onClick={() => handleNavigate(item.key)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );

  const accountContent = (
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
  );

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileOpen(true)}
        aria-label="打开导航菜单"
        aria-expanded={mobileOpen}
      >
        ☰
      </button>

      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">☀</span>
          <strong>AI CEO</strong>
        </div>

        {navContent}

        {accountContent}
      </aside>

      {mobileOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-nav-header">
              <div className="sidebar-brand">
                <span className="brand-mark">☀</span>
                <strong>AI CEO</strong>
              </div>

              <button
                type="button"
                className="mobile-nav-close"
                onClick={() => setMobileOpen(false)}
                aria-label="关闭导航菜单"
              >
                ✕
              </button>
            </div>

            {navContent}

            {accountContent}
          </aside>
        </div>
      )}
    </>
  );
}

export default Sidebar;
