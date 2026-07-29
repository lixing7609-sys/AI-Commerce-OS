import { useState } from "react";
import { FOUNDER_MODULES, NAV_GROUPS, getGroupKeyForModule, getModuleConfig } from "../nav/navConfig.js";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { useCapabilities } from "../useCapabilities.js";
import { OPERATOR_V2_NAV_ITEMS } from "../labs/operatorLabV2/navigation.js";
import {
  NAV_GROUPS as STUDIO_NAV_GROUPS,
  DEFAULT_NAV_KEY as STUDIO_DEFAULT_KEY,
  getVisibleNavItemsByGroup as getStudioVisibleNavItemsByGroup,
} from "../../studio/navConfig.js";
import { NAV_ITEMS as CLOUD_NAV_ITEMS } from "../../cloud/navConfig.js";
import { getStoredExpandedGroup, setStoredExpandedGroup } from "../nav/sidebarExpansionStore.js";

/**
 * Founder 唯一左侧导航（阶段 M8c Founder Unified Product Navigation）。
 *
 * 上一版（M8b）"Operator 实验室"/"Studio 实验室"是 FOUNDER_MODULES
 * 里普通的一个按钮，点击后右侧内容区渲染一整套内嵌的 Operator/
 * Studio 侧边栏——owner 看到实际截图后明确否决："Founder 左侧的
 * Operator 实验室下面又出现了一整套 Operator 侧边栏"。修正：
 * Operator 完整导航（`OPERATOR_NAV_ITEMS`）和 Studio 完整导航
 * （`STUDIO_NAV_ITEMS`）现在直接展开在这一个组件里——不手写第二份
 * 导航数组，两份列表都是直接 import 独立 Operator/Studio 自己的
 * 权威 registry；子项点击只把 Founder 自己的 `{module, subView}`
 * 导航状态改成对应值，右侧内容区（见 labs/OperatorLab.jsx /
 * StudioLab.jsx）只渲染那一个页面组件，不再渲染任何嵌套侧边栏。
 *
 * 手风琴（单一展开分组）：`产品研发中心`/`Operator 实验室`/
 * `Studio 实验室`/`Marketplace 中心`/`系统与发布` 五个分组同时只
 * 展开一个，点击父节点区域切换，展开状态经
 * `sidebarExpansionStore.js`（localStorage）持久化，刷新后恢复；
 * 当前激活模块所在分组总是强制展开（即使用户之前手动折叠过），
 * 避免"当前页面所在分组是折叠的、用户看不到自己在哪"这种状态。
 * "Founder 总览"不参与折叠——默认页所在分组需要一直可见。
 */

const GROUP_SELF_MODULE_KEY = {
  operatorLabGroup: "operatorLab",
  studioLabGroup: "studioLab",
  cloudCenterGroup: "cloudCenter",
};

export function ConsoleSidebar() {
  const { module: activeModule, subView, navigate } = useConsoleNavContext();
  const capabilities = useCapabilities();

  const activeGroupKey = getGroupKeyForModule(activeModule);
  const [expandedGroup, setExpandedGroup] = useState(() => activeGroupKey ?? getStoredExpandedGroup());
  const [trackedActiveGroupKey, setTrackedActiveGroupKey] = useState(activeGroupKey);

  // 当前激活模块所在分组永远强制展开——不管用户之前手动折叠过什么。
  // 在渲染期间根据 activeGroupKey 的变化调整 state（React 官方推荐的
  // "根据 prop 变化调整 state"模式，见 https://react.dev/learn/
  // you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes），
  // 不用 useEffect，避免多一次级联渲染。
  if (activeGroupKey && activeGroupKey !== trackedActiveGroupKey) {
    setTrackedActiveGroupKey(activeGroupKey);
    setExpandedGroup(activeGroupKey);
    setStoredExpandedGroup(activeGroupKey);
  }

  function toggleGroup(groupKey, onFirstExpand) {
    if (expandedGroup === groupKey) {
      setExpandedGroup(null);
      setStoredExpandedGroup(null);
      return;
    }
    setExpandedGroup(groupKey);
    setStoredExpandedGroup(groupKey);
    if (activeGroupKey !== groupKey) {
      onFirstExpand?.();
    }
  }

  function renderModuleButton(item) {
    return (
      <button
        key={item.key}
        type="button"
        className={"fdr-sidebar__item" + (item.key === activeModule ? " fdr-sidebar__item--active" : "")}
        onClick={() => navigate(item.key)}
      >
        <span className="fdr-sidebar__icon" aria-hidden="true">{item.icon}</span>
        {item.label}
      </button>
    );
  }

  function renderSubItem({ key, label, icon, directModule }, moduleKey, defaultSubView) {
    // `directModule`：见 labs/operatorLabV2/navigation.js 顶部注释——
    // 这几项底层组件自己占用顶层 `module` 语义读取 subView，不能塞进
    // `operatorLab` 的 subView 里，点击后直接跳到它们自己的顶层模块。
    const isActive = directModule ? activeModule === directModule : activeModule === moduleKey && (subView ?? defaultSubView) === key;
    return (
      <button
        key={key}
        type="button"
        className={"fdr-sidebar__subitem" + (isActive ? " fdr-sidebar__item--active" : "")}
        onClick={() => (directModule ? navigate(directModule) : navigate(moduleKey, { subView: key }))}
      >
        {icon ? <span className="fdr-sidebar__icon" aria-hidden="true">{icon}</span> : null}
        {label}
      </button>
    );
  }

  /**
   * Studio 完整业务导航按 Studio 自己的分组结构（总控/内容策划/
   * AI创作中心/矩阵运营/商业经营/设置）渲染子标题——与独立 Studio
   * 侧边栏（studio/StudioSidebar.jsx）呈现同一份分组信息，只是这里
   * 展开面板本身已经代表"Studio 实验室"这一层，六个 Studio 分组不再
   * 需要各自可折叠，直接平铺展示标题 + 子项即可。
   */
  function renderStudioGroupedItems() {
    return STUDIO_NAV_GROUPS.map((studioGroup) => {
      const groupItems = getStudioVisibleNavItemsByGroup(studioGroup.key);
      if (groupItems.length === 0) return null;
      return (
        <div key={studioGroup.key}>
          <div className="fdr-sidebar__subgroup-label">{studioGroup.label}</div>
          {groupItems.map((navItem) => renderSubItem(navItem, "studioLab", STUDIO_DEFAULT_KEY))}
        </div>
      );
    });
  }

  return (
    <nav className="fdr-sidebar" aria-label="Founder 唯一导航">
      <div className="fdr-sidebar__brand">
        AI Commerce OS
        <span className="fdr-sidebar__brand-badge">FOUNDER</span>
      </div>
      <div className="fdr-sidebar__scroll">
        {NAV_GROUPS.map((group) => {
          const selfModuleKey = GROUP_SELF_MODULE_KEY[group.key];
          const items = FOUNDER_MODULES.filter(
            (item) =>
              item.group === group.key &&
              item.key !== selfModuleKey &&
              !item.hiddenFromSidebar &&
              capabilities[item.requiredCapability]
          );

          if (!group.collapsible) {
            if (items.length === 0) return null;
            return (
              <div key={group.key}>
                <div className="fdr-sidebar__group">{group.label}</div>
                {items.map((item) => renderModuleButton(item))}
              </div>
            );
          }

          // 分组本身（"Operator 实验室"这个概念）挂在一个 FOUNDER_MODULES
          // 条目上，只用来读取 requiredCapability 做权限收口——不再单独
          // 渲染成一个按钮，分组标题本身就是唯一入口。
          const selfModuleConfig = selfModuleKey ? getModuleConfig(selfModuleKey) : null;
          if (selfModuleConfig && !capabilities[selfModuleConfig.requiredCapability]) return null;
          if (!selfModuleConfig && items.length === 0) return null;

          const expanded = expandedGroup === group.key;
          const panelId = `fdr-sidebar-panel-${group.key}`;

          return (
            <div key={group.key} className="fdr-sidebar__accordion">
              <button
                type="button"
                className={"fdr-sidebar__group-toggle" + (expanded ? " expanded" : "")}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() =>
                  toggleGroup(group.key, () => {
                    if (group.key === "operatorLabGroup") navigate("operatorLab", { subView: "workbench" });
                    else if (group.key === "studioLabGroup") navigate("studioLab", { subView: STUDIO_DEFAULT_KEY });
                    else if (group.key === "cloudCenterGroup") navigate("cloudCenter", { subView: "overview" });
                  })
                }
              >
                <span className="fdr-sidebar__group-arrow" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                {group.label}
              </button>
              {expanded ? (
                <div id={panelId} className="fdr-sidebar__panel">
                  {group.externalPosition !== "after" ? (
                    <>
                      {items.map((item) => renderModuleButton(item))}
                      {items.length > 0 && group.external ? <div className="fdr-sidebar__divider" /> : null}
                    </>
                  ) : null}

                  {group.external === "operatorV2"
                    ? OPERATOR_V2_NAV_ITEMS.map((navItem) => renderSubItem(navItem, "operatorLab", "workbench"))
                    : null}
                  {group.external === "studio" ? renderStudioGroupedItems() : null}
                  {group.external === "cloud"
                    ? CLOUD_NAV_ITEMS.map((navItem) => renderSubItem(navItem, "cloudCenter", "overview"))
                    : null}

                  {group.externalPosition === "after" ? (
                    <>
                      {items.length > 0 ? <div className="fdr-sidebar__divider" /> : null}
                      {items.length > 0 ? (
                        <div className="fdr-sidebar__subgroup-label">
                          {group.key === "studioLabGroup" ? "Studio 实验控制层" : "Founder 专属"}
                        </div>
                      ) : null}
                      {items.map((item) => renderModuleButton(item))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
