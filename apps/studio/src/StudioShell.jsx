import { Link, useLocation } from "react-router-dom";
import { STUDIO_NAV } from "@sinofut/domain";
import { SinoFUTWidget, useThemeToggle } from "@sinofut/ui";

const THEME_LABEL = { system: "跟随系统", dark: "深色", light: "浅色" };

const CROSS_APP_LINKS = [
  { label: "Founder", href: "http://localhost:5180" },
  { label: "Operator", href: "http://localhost:5181" },
  { label: "Operator Cloud", href: "http://localhost:5183" },
];

export function StudioShell({ onOpenFullScreen, children }) {
  const { pathname } = useLocation();
  const { theme, toggle } = useThemeToggle();

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="sf-brand">
          <strong>SinoFUT</strong>
          <span>AI Commerce OS · 2608·V2</span>
        </div>
        <span className="sf-app-label">Studio · 内容生产网络</span>
        <div className="sf-topbar-actions">
          <div className="sf-cross-app-links">
            {CROSS_APP_LINKS.map((link) => (
              <a key={link.label} className="sf-icon-button" href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
          <button type="button" className="sf-icon-button" onClick={toggle}>
            {THEME_LABEL[theme]}
          </button>
          <button type="button" className="sf-icon-button" onClick={onOpenFullScreen}>
            ⛶ 全屏
          </button>
        </div>
      </header>

      <div className="studio-body">
        <nav className="studio-sidebar">
          {STUDIO_NAV.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className={`studio-sidebar-item${pathname === item.path ? " is-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className={`studio-main${pathname === "/canvas" ? " is-canvas-page" : ""}`}>{children}</main>
      </div>

      <SinoFUTWidget onOpen={onOpenFullScreen} />
    </div>
  );
}
