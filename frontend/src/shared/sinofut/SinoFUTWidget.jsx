import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SINOFUT_DEMO_DATA, getSinoFUTStatus } from "./sinofutDemoData.js";
import { getSinoFUTContext, subscribeSinoFUTContext } from "./sinofutContextStore.js";
import "./sinofut.css";

const STATUS_LABEL = {
  normal: "正常",
  suggestion: "建议",
  alert: "紧急",
};

function SinoFUTSection({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="sinofut-panel__section">
      <div className="sinofut-panel__section-title">{title}</div>
      <ul className="sinofut-panel__section-list">
        {items.map((item) => (
          <li key={item.id} className={tone ? `sinofut-panel__section-item sinofut-panel__section-item--${tone}` : "sinofut-panel__section-item"}>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SinoFUT 全局悬浮示意入口——唯一共享实现，挂载在 main.jsx 顶层（见
 * 该文件注释），四套独立 Edition 的 React 树都自动获得同一个入口，
 * 不逐页/逐 Shell 复制。当前仅为前端示意骨架，不接入任何真实
 * 大模型 / 语音 / Agent / Workflow 后端——见
 * docs/sinofut-ui-foundation.md。
 */
export function SinoFUTWidget({ stacked = false }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [input, setInput] = useState("");
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const hintTimerRef = useRef(null);

  const currentContext = useSyncExternalStore(subscribeSinoFUTContext, getSinoFUTContext);
  const { focusToday, alerts, suggestions, approvals } = SINOFUT_DEMO_DATA;
  const { status, unreadCount } = getSinoFUTStatus(SINOFUT_DEMO_DATA);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(hintTimerRef.current), []);

  function showHint(text) {
    setHint(text);
    window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHint(""), 4000);
  }

  function handleVoiceClick() {
    showHint("语音能力将在 SinoFUT Core 中接入，默认唤醒词为 Sino。");
  }

  function handleSend(event) {
    event.preventDefault();
    if (!input.trim()) return;
    showHint("SinoFUT Core 尚未接入，暂时无法处理该指令（演示状态）。");
    setInput("");
  }

  return (
    <div className="sinofut-root" data-stacked={stacked ? "true" : "false"}>
      <button
        ref={triggerRef}
        type="button"
        className="sinofut-orb"
        data-status={status}
        aria-label={`打开 SinoFUT 智能中枢${unreadCount > 0 ? `，${unreadCount} 项待关注` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sinofut-orb__mark">Sino</span>
        <span className="sinofut-orb__dot" data-status={status} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="sinofut-orb__badge" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panelRef}
          className="sinofut-panel"
          role="dialog"
          aria-modal="false"
          aria-label="SinoFUT 智能中枢面板"
        >
          <div className="sinofut-panel__header">
            <div className="sinofut-panel__header-text">
              <div className="sinofut-panel__title">SinoFUT</div>
              <div className="sinofut-panel__subtitle">AI Commerce OS 智能中枢</div>
            </div>
            <button
              type="button"
              className="sinofut-panel__close"
              aria-label="关闭 SinoFUT 面板"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="sinofut-panel__context">
            <span className="sinofut-panel__context-dot" data-status={status} aria-hidden="true" />
            当前：{currentContext}
            <span className="sinofut-panel__context-status">{STATUS_LABEL[status]}</span>
          </div>

          <div className="sinofut-panel__body">
            <SinoFUTSection title="今日关注" items={focusToday} />
            <SinoFUTSection title="风险提醒" items={alerts} tone="alert" />
            <SinoFUTSection title="AI 建议" items={suggestions} />
            <SinoFUTSection title="待审批" items={approvals} />
          </div>

          <div className="sinofut-panel__footer">
            <div className="sinofut-panel__demo-badge">演示状态 · SinoFUT Core 尚未接入</div>
            {hint ? <div className="sinofut-panel__hint" role="status">{hint}</div> : null}
            <form className="sinofut-panel__input-row" onSubmit={handleSend}>
              <input
                type="text"
                className="sinofut-panel__input"
                placeholder="问 SinoFUT，或输入操作指令……"
                aria-label="向 SinoFUT 提问或输入操作指令"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <button
                type="button"
                className="sinofut-panel__voice"
                aria-label="语音输入（示意）"
                onClick={handleVoiceClick}
              >
                🎙
              </button>
              <button type="submit" className="sinofut-panel__send" aria-label="发送">
                ➤
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
