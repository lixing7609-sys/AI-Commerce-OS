import { useEffect, useState } from "react";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { getGroupKeyForModule, getModuleConfig } from "../nav/navConfig.js";
import { useSinoFUTContextPublisher } from "../../shared/sinofut/sinofutContextStore.js";

/**
 * SinoFUT 面板"当前：X · Y"文案的分组前缀——founderWorkspaceGroup 显示
 * 为"Founder"（不是完整的"Founder 工作台"），其余四组直接复用
 * navConfig.js NAV_GROUPS 的既有中文标签，不重复定义第二份文案。
 */
const SINOFUT_CONTEXT_GROUP_LABEL = {
  founderWorkspaceGroup: "Founder",
  aiCapabilityCenterGroup: "AI 能力中心",
  operatorLabGroup: "Operator 实验室",
  studioLabGroup: "Studio 实验室",
  cloudCenterGroup: "Cloud Center",
};

function formatClock(date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Design DNA v1.1: the store-scope selector, clock, and Founder
 * account display moved into the sidebar's Zone B/D (see
 * ConsoleSidebar.jsx and navigation-shell-spec.md §Application Shell
 * Integration — "review the boundary between sidebar and workspace").
 * The topbar now carries the current route's title, mechanically
 * derived from navConfig.js so every module gets a correct title
 * without each one opting in individually.
 */
export function ConsoleTopBar() {
  const { module } = useConsoleNavContext();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const moduleConfig = getModuleConfig(module);
  const groupKey = getGroupKeyForModule(module);
  const groupLabel = SINOFUT_CONTEXT_GROUP_LABEL[groupKey] ?? "Founder";
  useSinoFUTContextPublisher(`${groupLabel} · ${moduleConfig?.label ?? ""}`);

  return (
    <header className="fdr-topbar">
      <div className="fdr-topbar__left">
        <span className="fdr-topbar__title">{moduleConfig?.label ?? ""}</span>
      </div>
      <div className="fdr-topbar__right">
        <span className="fdr-topbar__clock">{formatClock(now)}</span>
      </div>
    </header>
  );
}
