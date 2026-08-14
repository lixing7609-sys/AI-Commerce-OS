import { useLayoutEffect, useRef } from "react";
import { sinoStatus } from "./founderStatus.js";

export function GlobalSecretaryComposer({ value, onChange, onSubmit, busy, large = false, healthy, toolbar = null, toolbarIncludesStatus = false, placeholder = "和 Sino 讨论任何想法、问题、战略或设计……", mode = "sino", onModeChange, disabledModes = [] }) {
  const textareaRef = useRef(null);
  const statusValue = sinoStatus(healthy, busy);
  const status = typeof healthy === "boolean" ? <span className="sino-composer-status"><span className={`sino-workspace-status ${statusValue.className}`} title={`Sino ${statusValue.label}`} aria-label={`Sino ${statusValue.label}`} /><span>Sino {statusValue.label}</span></span> : "与 Sino 讨论";
  const inputId = large ? "sino-home-input" : "sino-discussion-input";
  const modeControl = onModeChange ? <div className="sino-council-mode" aria-label="讨论模式"><button type="button" className={mode === "sino" ? "is-active" : ""} onClick={() => onModeChange("sino")}>Sino</button><button type="button" className={mode === "council" ? "is-active" : ""} onClick={() => onModeChange("council")}>多模型讨论</button><button type="button" disabled={disabledModes.includes("auto")} title={disabledModes.includes("auto") ? "自动多轮只用于 Strategy Workspace" : undefined} className={mode === "auto" ? "is-active" : ""} onClick={() => onModeChange("auto")}>自动多轮</button></div> : null;
  function handleKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (!busy && value.trim()) event.currentTarget.form?.requestSubmit();
  }
  useLayoutEffect(() => {
    if (large || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "52px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 180)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [large, value]);
  if (!toolbar) return <form className={`sino-composer sino-global-composer${large ? " sino-global-composer--large" : ""}`} onSubmit={onSubmit}>
    {modeControl || <label htmlFor={inputId}>{status}</label>}
    <div>
      <textarea ref={textareaRef} id={inputId} aria-label="讨论内容" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} rows={large ? 5 : 2} />
      <button className="sino-button" disabled={busy || !value.trim()}>{busy ? "处理中…" : "发送"}</button>
    </div>
  </form>;
  return <form className={`sino-composer sino-global-composer sino-global-composer--toolbar${large ? " sino-global-composer--large" : ""}`} onSubmit={onSubmit}>
    <div className="sino-composer__input-area">
      {modeControl || <label htmlFor={inputId}>{status}</label>}
      <textarea ref={textareaRef} id={inputId} aria-label="讨论内容" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} rows={large ? 5 : 2} />
    </div>
    <div className="sino-composer__toolbar"><div className="sino-composer__toolbar-left">{typeof healthy === "boolean" && !toolbarIncludesStatus ? status : null}{toolbar}</div><button className="sino-button" disabled={busy || !value.trim()}>{busy ? "处理中…" : "发送"}</button></div>
  </form>;
}
