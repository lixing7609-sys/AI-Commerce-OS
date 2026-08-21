import { useEffect, useRef, useState } from "react";
import { FounderNavigationPanel } from "./FounderNavigationPanel.jsx";
import { ComposeIcon, SidebarIcon } from "./FounderWorkspaceIcons.jsx";

const EXECUTION_WIDTH_KEY = "sino-founder-execution-center-width";
const NAV_COLLAPSED_KEY = "sino-founder-sidebar-collapsed";
const NAV_WIDTH_KEY = "sino-founder-navigation-width";
const SETTINGS_INSPECTOR_WIDTH_KEY = "sino-founder-settings-inspector-width";
const DEFAULT_NAV_WIDTH = 244;
const MIN_NAV_WIDTH = 210;
const MAX_NAV_WIDTH = 480;
const DEFAULT_EXECUTION_WIDTH = 336;
const MIN_EXECUTION_WIDTH = 280;
const MAX_EXECUTION_WIDTH = 640;
const DEFAULT_SETTINGS_INSPECTOR_WIDTH = 340;
const MIN_SETTINGS_INSPECTOR_WIDTH = 300;
const MAX_SETTINGS_INSPECTOR_WIDTH = 640;
const MIN_SETTINGS_MAIN_WIDTH = 680;
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

const restoredSettingsInspectorWidth = () => {
  try {
    const value = Number(window.localStorage.getItem(SETTINGS_INSPECTOR_WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_SETTINGS_INSPECTOR_WIDTH && value <= MAX_SETTINGS_INSPECTOR_WIDTH
      ? value
      : DEFAULT_SETTINGS_INSPECTOR_WIDTH;
  } catch { return DEFAULT_SETTINGS_INSPECTOR_WIDTH; }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function SinoFounderShell({ active, onNavigate, sidebarProps, main, context, conversationSelector }) {
  const workspaceRef = useRef(null);
  const surfaceRef = useRef(null);
  const [executionWidth, setExecutionWidth] = useState(restoredWidth);
  const [navWidth, setNavWidth] = useState(restoredNavWidth);
  const [navCollapsed, setNavCollapsed] = useState(restoredNavCollapsed);
  const [settingsInspectorWidth, setSettingsInspectorWidth] = useState(restoredSettingsInspectorWidth);
  const [resizing, setResizing] = useState(false);
  const isWorkspace = active === "conversation";
  const isLibrary = active === "library";
  const isSettings = active === "settings";

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

  function persistSettingsInspectorWidth(value) {
    setSettingsInspectorWidth(value);
    try { window.localStorage.setItem(SETTINGS_INSPECTOR_WIDTH_KEY, String(value)); } catch { /* unavailable */ }
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

  function resizeSettingsInspector(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = settingsInspectorWidth;
    setResizing(true);
    const move = (moveEvent) => {
      const maxWidth = Math.min(MAX_SETTINGS_INSPECTOR_WIDTH, Math.floor(window.innerWidth * .48), window.innerWidth - MIN_SETTINGS_MAIN_WIDTH - 24);
      persistSettingsInspectorWidth(clamp(startWidth + startX - moveEvent.clientX, MIN_SETTINGS_INSPECTOR_WIDTH, maxWidth));
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
  const navigation = <FounderNavigationPanel active={active} onNavigate={onNavigate} onCollapse={isWorkspace || isLibrary ? () => setNavigationCollapsed(true) : undefined} resizeHandle={isWorkspace || isLibrary ? navResizeHandle : undefined} {...sidebarProps} />;

  if (!isWorkspace && !isLibrary) {
    return <div className={`sino-founder-asset-route${isSettings ? " is-settings" : ""}${resizing ? " is-resizing" : ""}`} style={isSettings ? { "--settings-inspector-width": `${settingsInspectorWidth}px` } : undefined}>
      {!isSettings ? navigation : null}
      <main ref={surfaceRef} className={`sino-founder-asset-page${isSettings ? " sino-scrollbar-hidden" : ""}`} tabIndex={0} aria-label="Founder AI 功能页面">{main}</main>
      {context ? <aside className={`sino-founder-asset-inspector${isSettings ? " sino-settings-floating-inspector sino-scrollbar-hidden" : ""}`} aria-label="功能页详情">
        {isSettings ? <div className="sino-settings-inspector-resize-handle" role="separator" aria-label="调整系统配置面板宽度" aria-orientation="vertical" aria-valuemin={MIN_SETTINGS_INSPECTOR_WIDTH} aria-valuemax={MAX_SETTINGS_INSPECTOR_WIDTH} aria-valuenow={settingsInspectorWidth} onPointerDown={resizeSettingsInspector} /> : null}
        {context}
      </aside> : null}
    </div>;
  }

  return <div
    ref={workspaceRef}
    className={`founder-workspace${isLibrary ? " is-library" : ""}${navCollapsed ? " is-nav-collapsed" : ""}${resizing ? " is-resizing" : ""}`}
    style={{ "--founder-nav-width": `${navWidth}px`, "--execution-center-width": `${executionWidth}px` }}
    data-workspace-structure={isLibrary ? navCollapsed ? "library" : "navigation library" : navCollapsed ? "conversation execution" : "navigation conversation execution"}
  >
    {!navCollapsed ? navigation : null}
    <header className="founder-workspace-topbar" aria-label="Workspace top bar">
      <div className="founder-workspace-topbar__main">
      {navCollapsed ? <div className="founder-collapsed-controls" aria-label="Collapsed navigation controls">
        <button type="button" title="展开侧边栏" aria-label="展开侧边栏" onClick={() => setNavigationCollapsed(false)}><SidebarIcon expanded /></button>
        <button type="button" title="新建讨论" aria-label="新建讨论" onClick={sidebarProps?.onNewConversation}><ComposeIcon /></button>
      </div> : null}
      {!isLibrary ? conversationSelector : null}
      </div>
    </header>
    <main ref={surfaceRef} className={isLibrary ? "founder-library-surface" : "founder-conversation-surface"} tabIndex={0} aria-label={isLibrary ? "Sino Library Workspace" : "Sino Natural Conversation"}>
      {main}
    </main>
    {!isLibrary ? <aside className="founder-execution-center" aria-label="执行中心">
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
    </aside> : null}
  </div>;
}
