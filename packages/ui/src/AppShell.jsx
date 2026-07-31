import { useThemeToggle } from "./useThemeToggle.js";

const THEME_LABEL = { system: "跟随系统", dark: "深色", light: "浅色" };

// Navigation V2 — single-row top bar, four groups: Logo | Current workspace nav |
// Product switch | Fullscreen (+ theme toggle). See docs/2608-v2 nav freeze task.
// `navItems` = current workspace's own menu (unchanged content, just regrouped).
// `crossAppLinks` = product switch entries (Studio/Growth/Operator/Operator Cloud),
// rendered as a visually distinct segmented group, not mixed with utility buttons.
export function AppShell({
  appLabel,
  navItems,
  activeKey,
  crossAppLinks,
  onOpenFullScreen,
  showThemeToggle = true,
  children,
}) {
  const { theme, toggle } = useThemeToggle();

  return (
    <div className="sf-shell">
      <header className="sf-topbar">
        <div className="sf-topbar-brand-zone">
          <div className="sf-brand">
            <strong>SinoFUT</strong>
            <span>AI Commerce OS · 2608·V2</span>
          </div>
          {appLabel ? <span className="sf-app-label">{appLabel}</span> : null}
        </div>

        {navItems && navItems.length > 0 ? (
          <>
            <div className="sf-topbar-divider" />
            <nav className="sf-current-nav">
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className={`sf-nav-item${item.key === activeKey ? " is-active" : ""}`}
                  title={item.tagline}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </>
        ) : (
          <div className="sf-current-nav" />
        )}

        {crossAppLinks && crossAppLinks.length > 0 ? (
          <>
            <div className="sf-topbar-divider" />
            <div className="sf-product-switch">
              {crossAppLinks.map((link) => (
                <a key={link.key || link.label} className="sf-product-switch-item" href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          </>
        ) : null}

        <div className="sf-topbar-trailing">
          {showThemeToggle ? (
            <button type="button" className="sf-icon-button" onClick={toggle}>
              {THEME_LABEL[theme]}
            </button>
          ) : null}
          {onOpenFullScreen ? (
            <button type="button" className="sf-icon-button" onClick={onOpenFullScreen} title="进入 SinoFUT 全屏工作模式">
              全屏
            </button>
          ) : null}
        </div>
      </header>
      <main className="sf-main">{children}</main>
    </div>
  );
}
