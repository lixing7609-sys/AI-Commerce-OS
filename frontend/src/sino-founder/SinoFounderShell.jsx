import { useEffect, useRef, useState } from "react";
import { FounderNavigationPanel } from "./FounderNavigationPanel.jsx";
import { ComposeIcon, PanelWidthIcon, SidebarIcon } from "./FounderWorkspaceIcons.jsx";

const EXECUTION_WIDTH_KEY = "sino-founder-execution-center-width";
const NAV_COLLAPSED_KEY = "sino-founder-sidebar-collapsed";
const NAV_WIDTH_KEY = "sino-founder-navigation-width";
const DEFAULT_NAV_WIDTH = 244;
const MIN_NAV_WIDTH = 210;
const MAX_NAV_WIDTH = 480;
const DEFAULT_EXECUTION_WIDTH = 336;
const MIN_EXECUTION_WIDTH = 280;
const MAX_EXECUTION_WIDTH = 640;
const MIN_CONVERSATION_WIDTH = 420;

const restoredWidth = () => {
  try {
    const value = Number(window.localStorage.getItem(EXECUTION_WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_EXECUTION_WIDTH && value <= MAX_EXECUTION_WIDTH
      ? value
      : DEFAULT_EXECUTION_WIDTH;
  } catch { return DEFAULT_EXECUTION_WIDTH; }
};

const restoredNavWidth = () => {
  try {
    const value = Number(window.localStorage.getItem(NAV_WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_NAV_WIDTH && value <= MAX_NAV_WIDTH ? value : DEFAULT_NAV_WIDTH;
  } catch { return DEFAULT_NAV_WIDTH; }
};

const restoredNavCollapsed = () => {
  try { return window.localStorage.getItem(NAV_COLLAPSED_KEY) === "true"; }
  catch { return false; }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function SinoFounderShell({ active, onNavigate, sidebarProps, main, context, conversationSelector }) {
  const workspaceRef = useRef(null);
  const surfaceRef = useRef(null);
  const [executionWidth, setExecutionWidth] = useState(restoredWidth);
  const [navWidth, setNavWidth] = useState(restoredNavWidth);
  const [navCollapsed, setNavCollapsed] = useState(restoredNavCollapsed);
  const [resizing, setResizing] = useState(false);
  const isWorkspace = active === "conversation";

  useEffect(() => {
    if (surfaceRef.current) surfaceRef.current.scrollTop = 0;
  }, [active]);

  function persistWidth(value) {
    setExecutionWidth(value);
    try { window.localStorage.setItem(EXECUTION_WIDTH_KEY, String(value)); } catch { /* unavailable */ }
  }

  function persistNavWidth(value) {
    setNavWidth(value);
    try { window.localStorage.setItem(NAV_WIDTH_KEY, String(value)); } catch { /* unavailable */ }
  }

  function setNavigationCollapsed(value) {
    setNavCollapsed(value);
    try { window.localStorage.setItem(NAV_COLLAPSED_KEY, String(value)); } catch { /* unavailable */ }
  }

  function resizeNavigation(event) {
    if (navCollapsed || window.matchMedia?.("(max-width: 900px)").matches) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = navWidth;
    setResizing(true);
    const move = (moveEvent) => {
      const workspaceWidth = workspaceRef.current?.clientWidth || window.innerWidth;
      const maxWidth = Math.min(MAX_NAV_WIDTH, Math.floor(workspaceWidth * .35), workspaceWidth - MIN_CONVERSATION_WIDTH - executionWidth - 36);
      persistNavWidth(clamp(startWidth + moveEvent.clientX - startX, MIN_NAV_WIDTH, maxWidth));
    };
    const stop = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizeExecutionCenter(event) {
    if (window.matchMedia?.("(max-width: 900px)").matches) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = executionWidth;
    setResizing(true);
    const move = (moveEvent) => {
      const workspaceWidth = workspaceRef.current?.clientWidth || window.innerWidth;
      const maxWidth = Math.min(MAX_EXECUTION_WIDTH, Math.floor(workspaceWidth * .45), workspaceWidth - MIN_CONVERSATION_WIDTH - 260);
      persistWidth(clamp(startWidth + startX - moveEvent.clientX, MIN_EXECUTION_WIDTH, maxWidth));
    };
    const stop = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  const navResizeHandle = <div className="founder-navigation-resize-handle" role="separator" aria-label="调整左侧导航宽度" aria-orientation="vertical" aria-valuemin={MIN_NAV_WIDTH} aria-valuemax={MAX_NAV_WIDTH} aria-valuenow={navWidth} onPointerDown={resizeNavigation} onDoubleClick={() => persistNavWidth(DEFAULT_NAV_WIDTH)} />;
  const navigation = <FounderNavigationPanel active={active} onNavigate={onNavigate} onCollapse={isWorkspace ? () => setNavigationCollapsed(true) : undefined} resizeHandle={isWorkspace ? navResizeHandle : undefined} {...sidebarProps} />;

  if (!isWorkspace) {
    return <div className="sino-founder-asset-route">
      {navigation}
      <main ref={surfaceRef} className="sino-founder-asset-page" tabIndex={0} aria-label="Founder AI 功能页面">{main}</main>
      {context ? <aside className="sino-founder-asset-inspector" aria-label="功能页详情">{context}</aside> : null}
    </div>;
  }

  return <div
    ref={workspaceRef}
    className={`founder-workspace${navCollapsed ? " is-nav-collapsed" : ""}${resizing ? " is-resizing" : ""}`}
    style={{ "--founder-nav-width": `${navWidth}px`, "--execution-center-width": `${executionWidth}px` }}
    data-workspace-structure={navCollapsed ? "conversation execution" : "navigation conversation execution"}
  >
    {!navCollapsed ? navigation : null}
    <main ref={surfaceRef} className="founder-conversation-surface" tabIndex={0} aria-label="Sino Natural Conversation">
      {navCollapsed ? <div className="founder-collapsed-controls" aria-label="Collapsed navigation controls">
        <button type="button" title="展开侧边栏" aria-label="展开侧边栏" onClick={() => setNavigationCollapsed(false)}><SidebarIcon expanded /></button>
        <button type="button" title="新建讨论" aria-label="新建讨论" onClick={sidebarProps?.onNewConversation}><ComposeIcon /></button>
      </div> : null}
      {conversationSelector}
      <div className="founder-conversation-actions" aria-label="Conversation controls">
        <button type="button" title="重置执行中心宽度" aria-label="重置执行中心宽度" onClick={() => persistWidth(DEFAULT_EXECUTION_WIDTH)}><PanelWidthIcon /></button>
      </div>
      {main}
    </main>
    <aside className="founder-execution-center" aria-label="执行中心">
      <div
        className="founder-execution-resize-handle"
        role="separator"
        aria-label="调整执行中心宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_EXECUTION_WIDTH}
        aria-valuemax={MAX_EXECUTION_WIDTH}
        aria-valuenow={executionWidth}
        onPointerDown={resizeExecutionCenter}
        onDoubleClick={() => persistWidth(DEFAULT_EXECUTION_WIDTH)}
      />
      {context}
    </aside>
  </div>;
}
