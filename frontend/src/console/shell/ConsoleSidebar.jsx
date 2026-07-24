import { FOUNDER_MODULES, NAV_GROUPS } from "../nav/navConfig.js";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { useCapabilities } from "../useCapabilities.js";

export function ConsoleSidebar() {
  const { module: activeModule, navigate } = useConsoleNavContext();
  const capabilities = useCapabilities();

  return (
    <nav className="fdr-sidebar" aria-label="Founder Operator 导航">
      <div className="fdr-sidebar__brand">
        AI Commerce OS
        <span className="fdr-sidebar__brand-badge">FOUNDER</span>
      </div>

      {NAV_GROUPS.map((group) => {
        const items = FOUNDER_MODULES.filter(
          (item) => item.group === group.key && capabilities[item.requiredCapability]
        );
        if (items.length === 0) return null;

        return (
          <div key={group.key}>
            <div className="fdr-sidebar__group">{group.label}</div>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "fdr-sidebar__item" +
                  (item.key === activeModule ? " fdr-sidebar__item--active" : "")
                }
                onClick={() => navigate(item.key)}
              >
                <span className="fdr-sidebar__icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
