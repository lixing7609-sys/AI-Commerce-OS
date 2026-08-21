import { useEffect, useRef, useState } from "react";
import { FounderNavigationPanel } from "./FounderNavigationPanel.jsx";

const EXECUTION_WIDTH_KEY = "sino-founder-execution-center-width";
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

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export function SinoFounderShell({ active, onNavigate, sidebarProps, main, context, conversationSelector }) {
  const workspaceRef = useRef(null);
  const surfaceRef = useRef(null);
  const [executionWidth, setExecutionWidth] = useState(restoredWidth);
  const [resizing, setResizing] = useState(false);
  const isWorkspace = active === "conversation";

  useEffect(() => {
    if (surfaceRef.current) surfaceRef.current.scrollTop = 0;
  }, [active]);

  function persistWidth(value) {
    setExecutionWidth(value);
    try { window.localStorage.setItem(EXECUTION_WIDTH_KEY, String(value)); } catch { /* unavailable */ }
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

  const navigation = <FounderNavigationPanel active={active} onNavigate={onNavigate} {...sidebarProps} />;

  if (!isWorkspace) {
    return <div className="sino-founder-asset-route">
      {navigation}
      <main ref={surfaceRef} className="sino-founder-asset-page" tabIndex={0} aria-label="Founder AI 功能页面">{main}</main>
      {context ? <aside className="sino-founder-asset-inspector" aria-label="功能页详情">{context}</aside> : null}
    </div>;
  }

  return <div
    ref={workspaceRef}
    className={`founder-workspace${resizing ? " is-resizing" : ""}`}
    style={{ "--execution-center-width": `${executionWidth}px` }}
    data-workspace-structure="navigation conversation execution"
  >
    {navigation}
    <main ref={surfaceRef} className="founder-conversation-surface" tabIndex={0} aria-label="Sino Natural Conversation">
      {conversationSelector}
      <div className="founder-conversation-actions" aria-label="Conversation controls">
        <button type="button" title="重置执行中心宽度" aria-label="重置执行中心宽度" onClick={() => persistWidth(DEFAULT_EXECUTION_WIDTH)}>↔</button>
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
