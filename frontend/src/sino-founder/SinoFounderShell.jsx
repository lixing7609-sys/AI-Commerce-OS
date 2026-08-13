import { useEffect, useRef, useState } from "react";
import { CapabilityNavigation } from "./CapabilityNavigation.jsx";
import { SecretarySidebar } from "./SecretarySidebar.jsx";

const SIDEBAR_KEY = "sino-founder-sidebar-width";
const CONTEXT_KEY = "sino-founder-context-width";
const DEFAULT_SIDEBAR = 244;
const DEFAULT_CONTEXT = 320;
const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 320;
const MIN_CONTEXT = 260;
const MAX_CONTEXT = 520;
const MIN_MAIN = 420;

const restoredWidth = (key, fallback, min, max) => {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  } catch { return fallback; }
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function SinoFounderShell({ active, onNavigate, sidebarProps, main, context }) {
  const shellRef = useRef(null);
  const mainRef = useRef(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => restoredWidth(SIDEBAR_KEY, DEFAULT_SIDEBAR, MIN_SIDEBAR, MAX_SIDEBAR));
  const [contextWidth, setContextWidth] = useState(() => restoredWidth(CONTEXT_KEY, DEFAULT_CONTEXT, MIN_CONTEXT, MAX_CONTEXT));
  const [dragging, setDragging] = useState("");

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [active]);

  function persist(key, value, setter) {
    setter(value);
    try { window.localStorage.setItem(key, String(value)); } catch { /* unavailable */ }
  }

  function startResize(side, event) {
    if (window.matchMedia?.("(max-width: 900px)").matches) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "sidebar" ? sidebarWidth : contextWidth;
    setDragging(side);
    const move = (moveEvent) => {
      const shellWidth = shellRef.current?.clientWidth || window.innerWidth;
      if (side === "sidebar") {
        const maximum = Math.min(MAX_SIDEBAR, shellWidth - contextWidth - MIN_MAIN - 8);
        persist(SIDEBAR_KEY, clamp(startWidth + moveEvent.clientX - startX, MIN_SIDEBAR, maximum), setSidebarWidth);
      } else {
        const maximum = Math.min(MAX_CONTEXT, shellWidth - sidebarWidth - MIN_MAIN - 8);
        persist(CONTEXT_KEY, clamp(startWidth - moveEvent.clientX + startX, MIN_CONTEXT, maximum), setContextWidth);
      }
    };
    const stop = () => {
      setDragging("");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }

  function reset(side) {
    if (side === "sidebar") persist(SIDEBAR_KEY, DEFAULT_SIDEBAR, setSidebarWidth);
    else persist(CONTEXT_KEY, DEFAULT_CONTEXT, setContextWidth);
  }

  return <div ref={shellRef} className={`sino-founder-shell${dragging ? " is-resizing" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px`, "--context-width": `${contextWidth}px` }}>
    <SecretarySidebar active={active} onNavigate={onNavigate} {...sidebarProps} />
    <div className={`sino-shell-divider sino-shell-divider--left${dragging === "sidebar" ? " is-active" : ""}`} role="separator" aria-label="调整左侧栏宽度" aria-orientation="vertical" aria-valuemin={MIN_SIDEBAR} aria-valuemax={MAX_SIDEBAR} aria-valuenow={sidebarWidth} onMouseDown={(event) => startResize("sidebar", event)} onDoubleClick={() => reset("sidebar")} />
    <header className="sino-founder-topbar">
      <CapabilityNavigation active={active} onNavigate={onNavigate} />
    </header>
    <main ref={mainRef} className={`sino-founder-main${["conversation", "project"].includes(active) ? " sino-founder-main--fixed-workspace" : ""}`} tabIndex={0} aria-label="Founder AI 工作区内容">{main}</main>
    <div className={`sino-shell-divider sino-shell-divider--right${dragging === "context" ? " is-active" : ""}`} role="separator" aria-label="调整右侧上下文宽度" aria-orientation="vertical" aria-valuemin={MIN_CONTEXT} aria-valuemax={MAX_CONTEXT} aria-valuenow={contextWidth} onMouseDown={(event) => startResize("context", event)} onDoubleClick={() => reset("context")} />
    <aside className="sino-founder-context" aria-label="当前上下文">{context}</aside>
  </div>;
}
