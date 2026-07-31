import { useState } from "react";
import { NAV_GROUPS, NEW_MENU_ITEMS } from "./navConfig.js";
import { NavIcon } from "./icons.jsx";

export function FounderAISidebar({ activeView, onSelectView }) {
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  return (
    <aside className="founder-ai-sidebar">
      <div className="founder-ai-new-wrap">
        <button type="button" className="founder-ai-new-button" onClick={() => setNewMenuOpen((v) => !v)}>
          <NavIcon name="plus" />
          新建
        </button>
        {newMenuOpen && (
          <div className="founder-ai-new-menu">
            {NEW_MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onSelectView(item.key);
                  setNewMenuOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="founder-ai-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="founder-ai-nav-group">
            <div className="founder-ai-nav-group-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`founder-ai-nav-item${item.key === activeView ? " is-active" : ""}`}
                onClick={() => onSelectView(item.key)}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
