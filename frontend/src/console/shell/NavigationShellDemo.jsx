import { useRef, useState } from "react";
import { FOUNDER_MODULES, NAV_GROUPS, NAV_ZONES } from "../nav/navConfig.js";
import { NAV_ICON_MAP, UTILITY_ICONS } from "../nav/navIcons.js";
import { Icon } from "../kit/Icon.jsx";
import { Tooltip } from "../kit/Tooltip.jsx";
import { SegmentedControl } from "../kit/SegmentedControl.jsx";
import { SidebarFlyout } from "./SidebarFlyout.jsx";
import { SinoFUTBrand } from "../../shared/sinofut/SinoFUTBrand.jsx";

/**
 * Live demonstrator for the Design DNA showcase's "Navigation &
 * Application Shell" section — docs/01-foundation/design/
 * navigation-shell-spec.md. Uses the exact same data source
 * (NAV_ZONES/NAV_GROUPS/FOUNDER_MODULES/NAV_ICON_MAP), CSS classes
 * (.fdr-sidebar__*), and tokens (--sidebar-*) as the real
 * ConsoleSidebar — this is a "shared demonstrator" per the spec's own
 * allowance, not a fake static screenshot. It is intentionally NOT
 * the literal ConsoleSidebar instance: that component reads
 * useConsoleNavContext() (would navigate the showcase page itself on
 * click) and window.matchMedia (100vh + position:sticky, which breaks
 * inside a bounded preview pane rather than the real full-height
 * shell). This demo reproduces the same visual system with local,
 * self-contained state instead.
 */

function getCoreGroupModules(groupKey) {
  const items = FOUNDER_MODULES.filter((item) => item.group === groupKey && !item.hiddenFromSidebar);
  const [primary, ...secondaries] = items;
  return { primary, secondaries };
}

const LABS_CLOUD_DEMO_ITEMS = {
  operatorLabGroup: ["店铺", "商品", "订单", "广告投放", "客户"],
  studioLabGroup: ["Studio秘书", "Studio概览", "热点分析", "趋势预测", "选题库", "内容生成", "矩阵账号", "直播", "AI创作"],
  cloudCenterGroup: ["总览", "Token 中心", "Marketplace", "系统中心"],
};

export function NavigationShellDemo() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState("founderWorkbench");
  const [expandedGroup, setExpandedGroup] = useState("studioLabGroup");
  const [flyoutTarget, setFlyoutTarget] = useState(null);
  const [viewport, setViewport] = useState("1440");
  const flyoutAnchorRefs = useRef({});

  const effectiveCollapsed = collapsed || viewport === "1024";

  function toggleFlyout(key, anchorEl) {
    setFlyoutTarget((prev) => (prev?.key === key ? null : { key, rect: anchorEl.getBoundingClientRect() }));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-16)", alignItems: "center", marginBottom: "var(--space-16)" }}>
        <SegmentedControl
          options={[{ value: "1440", label: "1440px" }, { value: "1280", label: "1280px" }, { value: "1024", label: "1024px (forced collapse)" }]}
          value={viewport}
          onChange={setViewport}
        />
        {viewport !== "1024" ? (
          <button
            type="button"
            className="fdr-btn fdr-btn--secondary fdr-btn--sm"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "展开" : "收起"}侧边栏
          </button>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          height: 520,
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <nav
          className="fdr-sidebar"
          data-collapsed={effectiveCollapsed ? "true" : "false"}
          aria-label="Navigation shell demonstrator"
          style={{ position: "relative", height: "100%", top: "auto" }}
        >
          <div className="fdr-sidebar__identity">
            <SinoFUTBrand
              collapsed={effectiveCollapsed}
              className={effectiveCollapsed ? "" : "fdr-sidebar__identity-text"}
            />
          </div>

          {!effectiveCollapsed ? (
            <div className="fdr-sidebar__context">
              <select className="fdr-sidebar__context-select" defaultValue="all" aria-label="演示：当前店铺范围">
                <option value="all">全部店铺</option>
              </select>
            </div>
          ) : null}

          <div className="fdr-sidebar__scroll">
            {NAV_ZONES.map((zone) => (
              <div className="fdr-sidebar__zone" key={zone.key}>
                {!effectiveCollapsed ? <div className="fdr-sidebar__zone-label">{zone.label}</div> : null}
                {zone.key === "core"
                  ? zone.groups.map((groupKey) => {
                      const { primary, secondaries } = getCoreGroupModules(groupKey);
                      if (!primary) return null;
                      const group = NAV_GROUPS.find((g) => g.key === groupKey);
                      const iconName = NAV_ICON_MAP[primary.key];
                      const active = activeKey === primary.key;
                      const row = (
                        <button
                          key={groupKey}
                          type="button"
                          className={"fdr-sidebar__item" + (active ? " fdr-sidebar__item--active" : "")}
                          onClick={() => setActiveKey(primary.key)}
                        >
                          <span className="fdr-sidebar__item-icon"><Icon name={iconName || "Circle"} size={18} /></span>
                          {!effectiveCollapsed ? <span className="fdr-sidebar__item-label">{group.label}</span> : null}
                        </button>
                      );
                      return effectiveCollapsed ? (
                        <Tooltip key={groupKey} content={group.label}>{row}</Tooltip>
                      ) : (
                        <div key={groupKey}>
                          {row}
                          {secondaries.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={"fdr-sidebar__item fdr-sidebar__item--secondary" + (activeKey === item.key ? " fdr-sidebar__item--active" : "")}
                              onClick={() => setActiveKey(item.key)}
                            >
                              <span className="fdr-sidebar__item-label">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })
                  : zone.groups.map((groupKey) => {
                      const group = NAV_GROUPS.find((g) => g.key === groupKey);
                      const selfKey = { operatorLabGroup: "operatorLab", studioLabGroup: "studioLab", cloudCenterGroup: "cloudCenter" }[groupKey];
                      const iconName = NAV_ICON_MAP[selfKey];
                      const expanded = expandedGroup === groupKey;
                      const active = activeKey === selfKey;

                      if (effectiveCollapsed) {
                        return (
                          <div key={groupKey}>
                            <Tooltip content={group.label}>
                              <button
                                ref={(el) => { flyoutAnchorRefs.current[groupKey] = el; }}
                                type="button"
                                className={"fdr-sidebar__item" + (active ? " fdr-sidebar__item--active" : "")}
                                onClick={(event) => { setActiveKey(selfKey); toggleFlyout(groupKey, event.currentTarget); }}
                                aria-label={group.label}
                              >
                                <span className="fdr-sidebar__item-icon"><Icon name={iconName || "Circle"} size={18} /></span>
                              </button>
                            </Tooltip>
                            <SidebarFlyout
                              rect={flyoutTarget?.key === groupKey ? flyoutTarget.rect : null}
                              onClose={() => setFlyoutTarget(null)}
                              getAnchorEl={() => flyoutAnchorRefs.current[groupKey]}
                            >
                              <div className="fdr-sidebar__flyout-title">{group.label}</div>
                              {LABS_CLOUD_DEMO_ITEMS[groupKey].map((label) => (
                                <button key={label} type="button" className="fdr-sidebar__subitem" style={{ paddingLeft: "var(--sidebar-padding-x)" }}>{label}</button>
                              ))}
                            </SidebarFlyout>
                          </div>
                        );
                      }

                      return (
                        <div key={groupKey} className="fdr-sidebar__accordion">
                          <div className={"fdr-sidebar__group-row" + (active ? " fdr-sidebar__group-row--active" : "")}>
                            <button type="button" className="fdr-sidebar__group-label" onClick={() => { setActiveKey(selfKey); setExpandedGroup(groupKey); }}>
                              <Icon name={iconName || "Circle"} size={18} />
                              <span className="fdr-sidebar__group-label-text">{group.label}</span>
                            </button>
                            <button
                              type="button"
                              className="fdr-sidebar__group-chevron"
                              aria-expanded={expanded}
                              aria-label={expanded ? `收起${group.label}` : `展开${group.label}`}
                              onClick={() => setExpandedGroup((p) => (p === groupKey ? null : groupKey))}
                            >
                              <Icon name={expanded ? UTILITY_ICONS.chevronExpanded : UTILITY_ICONS.chevronCollapsed} size={16} />
                            </button>
                          </div>
                          {expanded ? (
                            <div className="fdr-sidebar__panel">
                              {LABS_CLOUD_DEMO_ITEMS[groupKey].map((label, i) => (
                                <button key={label} type="button" className={"fdr-sidebar__subitem" + (i === 1 ? " fdr-sidebar__item--active" : "")}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
              </div>
            ))}
          </div>

          <div className="fdr-sidebar__utilities">
            {["search", "notifications", "settings"].map((key) => (
              <Tooltip key={key} content={{ search: "搜索 / 命令面板", notifications: "活动通知", settings: "设置" }[key]}>
                <button type="button" className="fdr-sidebar__utility">
                  <Icon name={UTILITY_ICONS[key === "search" ? "search" : key === "notifications" ? "notifications" : "settings"]} size={18} />
                  {!effectiveCollapsed ? <span className="fdr-sidebar__utility-label">{{ search: "搜索", notifications: "通知", settings: "设置" }[key]}</span> : null}
                </button>
              </Tooltip>
            ))}
            <div className="fdr-sidebar__account">
              <span className="fdr-sidebar__account-avatar">F</span>
              {!effectiveCollapsed ? (
                <div className="fdr-sidebar__account-text">
                  <div className="fdr-sidebar__account-name">Founder</div>
                  <div className="fdr-sidebar__account-meta">founderOperator</div>
                </div>
              ) : null}
            </div>
          </div>
        </nav>

        <div style={{ flex: 1, background: "var(--canvas)", padding: "var(--space-24)", overflowY: "auto" }}>
          <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>工作区预览（演示，非真实路由）</p>
          <p className="fdr-type-body">当前选中：{FOUNDER_MODULES.find((m) => m.key === activeKey)?.label ?? activeKey}</p>
        </div>
      </div>

      <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)", marginTop: "var(--space-12)" }}>
        1024px 视口下侧边栏强制收起为图标栏；点击 Operator/Studio/Cloud 图标查看浮层导航。真实侧边栏见 Founder工作台 页面左侧。
      </p>
    </div>
  );
}
