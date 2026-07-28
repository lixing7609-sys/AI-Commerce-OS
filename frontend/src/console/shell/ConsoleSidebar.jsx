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
                title={item.pendingOperatorParity ? "该模块尚未和 Operator 实验室完成单一真源合并" : undefined}
              >
                <span className="fdr-sidebar__icon">{item.icon}</span>
                {item.label}
                {item.pendingOperatorParity ? (
                  <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6, border: "1px solid currentColor", borderRadius: 4, padding: "0 4px" }}>
                    待同步
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
