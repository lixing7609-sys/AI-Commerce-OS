import { useState } from "react";
import { NAV_GROUPS, getVisibleNavItemsByGroup, getGroupKeyForNavItem } from "./navConfig.js";
import { getStoredExpandedGroup, setStoredExpandedGroup } from "./navExpansionStore.js";
import { SinoFUTBrand } from "../shared/sinofut/SinoFUTBrand.jsx";

/**
 * 独立 Studio 的左侧导航（阶段：Studio V3 Integration §六）——可展开/
 * 收起的产品导航树，单一展开手风琴，与 Founder ConsoleSidebar.jsx
 * 同一套机制（当前激活页面所在分组渲染期间强制展开，见
 * console/shell/ConsoleSidebar.jsx 的同款"根据 prop 变化调整 state"
 * 模式说明）。"总控"分组不参与折叠。
 */
export function StudioSidebar({ activePage, onNavigate }) {
  const activeGroupKey = getGroupKeyForNavItem(activePage);
  const [expandedGroup, setExpandedGroup] = useState(() => activeGroupKey ?? getStoredExpandedGroup() ?? "control");
  const [trackedActiveGroupKey, setTrackedActiveGroupKey] = useState(activeGroupKey);

  if (activeGroupKey && activeGroupKey !== trackedActiveGroupKey) {
    setTrackedActiveGroupKey(activeGroupKey);
    setExpandedGroup(activeGroupKey);
    setStoredExpandedGroup(activeGroupKey);
  }

  function toggleGroup(groupKey) {
    const next = expandedGroup === groupKey ? null : groupKey;
    setExpandedGroup(next);
    setStoredExpandedGroup(next);
  }

  return (
    <aside className="st-sidebar">
      <div className="st-brand">
        <SinoFUTBrand />
        <span className="st-brand-badge">STUDIO</span>
      </div>
      <div className="st-sidebar-scroll">
        {NAV_GROUPS.map((group) => {
          const items = getVisibleNavItemsByGroup(group.key);
          if (items.length === 0) return null;

          if (!group.collapsible) {
            return (
              <div key={group.key} className="st-nav-section">
                <div className="st-nav-group-label">{group.label}</div>
                <nav className="st-nav">
                  {items.map((item) => renderNavButton(item, activePage, onNavigate))}
                </nav>
              </div>
            );
          }

          const expanded = expandedGroup === group.key;
          const panelId = `st-sidebar-panel-${group.key}`;
          return (
            <div key={group.key} className="st-sidebar-accordion">
              <button
                type="button"
                className={`st-sidebar-group-toggle${expanded ? " expanded" : ""}`}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.key)}
              >
                <span className="st-sidebar-group-arrow" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {group.label}
              </button>
              {expanded ? (
                <nav id={panelId} className="st-nav st-nav--panel">
                  {items.map((item) => renderNavButton(item, activePage, onNavigate))}
                </nav>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="st-sidebar-footer">
        演示数据 · AI内容公司操作系统
        <br />
        经营者工作台：/operator
      </div>
    </aside>
  );
}

function renderNavButton(item, activePage, onNavigate) {
  return (
    <button
      key={item.key}
      type="button"
      className={`st-nav-link${activePage === item.key ? " active" : ""}`}
      onClick={() => onNavigate(item.key)}
    >
      <span className="st-nav-icon" aria-hidden="true">{item.icon}</span>
      {item.label}
    </button>
  );
}
