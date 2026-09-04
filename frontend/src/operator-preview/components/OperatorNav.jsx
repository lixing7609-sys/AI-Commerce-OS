import { useState } from "react";
import { OPERATOR_NAV_ITEMS } from "../helpers/navigation";
import { SinoFUTBrand } from "../../shared/sinofut/SinoFUTBrand.jsx";

/**
 * 经营者版一级导航（阶段：路由/页面修复 + 品牌统一）。
 *
 * 视觉语言与 Founder 的 console/shell/ConsoleSidebar.jsx 对齐（深色
 * 侧边栏、同一套品牌区块结构"AI Commerce OS + 版本徽章"）——只是
 * 视觉对齐，不是权限对齐：这里的导航项、可见能力完全由
 * OPERATOR_NAV_ITEMS 和 Operator 自己的 Edition Policy 决定，不会
 * 因为视觉像 Founder 就多出 Founder 的权限。桌面端左侧竖排导航；
 * 480px 下改为底部导航（复用同一份 OPERATOR_NAV_ITEMS，不维护第二
 * 份菜单列表）。
 */
function OperatorNav({ activePage, onNavigate, companyName, scopeLabel, statusOk, onBackToLegacy }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleNavigate(key) {
    setDrawerOpen(false);
    onNavigate(key);
  }

  const navButtons = OPERATOR_NAV_ITEMS.map((item) => (
    <button
      type="button"
      key={item.key}
      className={`op-nav-link${activePage === item.key ? " active" : ""}`}
      onClick={() => handleNavigate(item.key)}
    >
      <span className="op-nav-icon">{item.icon}</span>
      {item.label}
      {item.status === "comingSoon" ? <span className="op-nav-soon">即将上线</span> : null}
    </button>
  ));

  return (
    <>
      <aside className="op-sidebar">
        <div className="op-brand">
          <SinoFUTBrand />
          <span className="op-brand-badge">OPERATOR</span>
        </div>

        <nav className="op-nav">{navButtons}</nav>

        <div className="op-sidebar-footer">
          <div className="op-footer-row">
            <span className="op-footer-label">当前公司</span>
            <span className="op-footer-value">{companyName}</span>
          </div>
          <div className="op-footer-row">
            <span className="op-footer-label">当前店铺范围</span>
            <span className="op-footer-value">{scopeLabel}</span>
          </div>
          <div className="op-footer-row">
            <span className={`op-status-dot ${statusOk ? "ok" : "warn"}`} />
            <span className="op-footer-value">{statusOk ? "系统正常" : "需要检查"}</span>
          </div>
          <button type="button" className="op-back-legacy" onClick={onBackToLegacy}>
            返回旧版后台
          </button>
        </div>
      </aside>

      <button
        type="button"
        className="op-mobile-toggle"
        onClick={() => setDrawerOpen(true)}
        aria-label="打开导航菜单"
        aria-expanded={drawerOpen}
      >
        ☰
      </button>

      <nav className="op-bottom-nav" aria-label="主导航">
        {OPERATOR_NAV_ITEMS.slice(0, 5).map((item) => (
          <button
            type="button"
            key={item.key}
            className={`op-bottom-nav-item${activePage === item.key ? " active" : ""}`}
            onClick={() => handleNavigate(item.key)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className="op-bottom-nav-item"
          onClick={() => setDrawerOpen(true)}
          aria-label="更多"
        >
          <span>⋯</span>
          更多
        </button>
      </nav>

      {drawerOpen && (
        <div className="op-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <aside
            className="op-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="op-drawer-header">
              <div className="op-brand op-brand--drawer">
                <SinoFUTBrand />
                <span className="op-brand-badge">OPERATOR</span>
              </div>
              <button
                type="button"
                className="op-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="关闭导航菜单"
              >
                ✕
              </button>
            </div>
            <nav className="op-nav">{navButtons}</nav>
            <div className="op-sidebar-footer">
              <div className="op-footer-row">
                <span className="op-footer-label">当前公司</span>
                <span className="op-footer-value">{companyName}</span>
              </div>
              <div className="op-footer-row">
                <span className="op-footer-label">当前店铺范围</span>
                <span className="op-footer-value">{scopeLabel}</span>
              </div>
              <button type="button" className="op-back-legacy" onClick={onBackToLegacy}>
                返回旧版后台
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default OperatorNav;
