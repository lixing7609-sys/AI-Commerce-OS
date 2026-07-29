import { useEffect, useState } from "react";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { getModuleConfig } from "../nav/navConfig.js";

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
