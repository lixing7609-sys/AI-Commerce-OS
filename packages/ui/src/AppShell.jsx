import { useThemeToggle } from "./useThemeToggle.js";

const THEME_LABEL = { system: "跟随系统", dark: "深色", light: "浅色" };

export function AppShell({ appLabel, navItems, activeKey, crossAppLinks, children }) {
  const { theme, toggle } = useThemeToggle();

  return (
    <div className="sf-shell">
      <header className="sf-topbar">
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="sf-brand">
            <strong>SinoFUT</strong>
            <span>AI Commerce OS · 2608·V2</span>
          </div>
          {appLabel ? <span className="sf-app-label">{appLabel}</span> : null}
        </div>

        {navItems && navItems.length > 0 ? (
          <nav className="sf-nav">
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
        ) : null}

        <div className="sf-topbar-actions">
          {crossAppLinks && crossAppLinks.length > 0 ? (
            <div className="sf-cross-app-links">
              {crossAppLinks.map((link) => (
                <a key={link.label} className="sf-icon-button" href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
          <button type="button" className="sf-icon-button" onClick={toggle}>
            {THEME_LABEL[theme]}
          </button>
        </div>
      </header>
      <main className="sf-main">{children}</main>
    </div>
  );
}
