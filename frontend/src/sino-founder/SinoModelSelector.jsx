import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getModelCenter, getSinoAssignedModels, setFounderConversationModel } from "../services/founderAiApi.js";

function configuredConversationModels(assigned) {
  return [...new Map((assigned?.models || []).map((model) => [model.identity, {
    key: model.identity,
    providerKey: model.provider_id,
    providerName: model.provider_name,
    model: model.model_id,
    displayName: model.display_name,
    available: Boolean(model.selectable ?? model.conversation_eligible),
    selected: Boolean(model.conversation_selected),
    unavailableReason: model.eligibility_reason || model.health_classification || "unavailable",
  }])).values()];
}

export function SinoModelSelector({ conversation, preselected, onPreselect, onConversationChanged }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const liveRef = useRef(true);
  const savingRef = useRef(false);
  const refreshRequestRef = useRef(0);
  const [center, setCenter] = useState(null);
  const [assigned, setAssigned] = useState(null);
  const [loadState, setLoadState] = useState("LOADING");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, arrowLeft: 0 });

  async function refreshCandidates() {
    const requestId = ++refreshRequestRef.current;
    setLoadState("LOADING");
    try {
      const activeConversationId = conversation?.id && !String(conversation.id).startsWith("pending-") ? conversation.id : null;
      const [value, candidates] = await Promise.all([getModelCenter(), getSinoAssignedModels(activeConversationId)]);
      if (!liveRef.current || requestId !== refreshRequestRef.current) return false;
      setCenter(value); setAssigned(candidates);
      setLoadState((candidates?.models || []).length ? "LOADED_AVAILABLE" : "LOADED_EMPTY");
      return true;
    } catch {
      // Transport failure is not authoritative empty data. Retain any previous
      // model/binding projection and expose a retryable load failure instead.
      if (liveRef.current && requestId === refreshRequestRef.current) setLoadState("LOAD_FAILED");
      return false;
    }
  }

  useEffect(() => {
    liveRef.current = true;
    Promise.resolve().then(refreshCandidates);
    return () => { liveRef.current = false; };
  }, [conversation?.id]);
  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const anchorCenter = bounds.left + bounds.width / 2;
      const menuWidth = menuRef.current?.getBoundingClientRect().width || Math.min(340, window.innerWidth - 24);
      const menuLeft = Math.max(12, Math.min(anchorCenter - menuWidth / 2, window.innerWidth - menuWidth - 12));
      setPopoverPosition({ top: bounds.bottom + 12, left: menuLeft, arrowLeft: anchorCenter - menuLeft });
    };
    const close = (event) => { if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    position();
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const models = useMemo(() => configuredConversationModels(assigned), [assigned]);
  const defaultRole = center?.roles?.find((item) => item.role_key === "sino_conversation");
  const defaultKey = defaultRole?.provider_key && defaultRole?.model ? `${defaultRole.provider_key}::${defaultRole.model}` : "";
  const selectedKey = conversation?.conversation_model_provider && conversation?.conversation_model
    ? `${conversation.conversation_model_provider}::${conversation.conversation_model}`
    : preselected?.key || defaultKey;
  const triggerLabel = conversation?.id && !String(conversation.id).startsWith("pending-") && conversation?.title
    ? conversation.title
    : "Sino AI";

  async function selectModel(option) {
    if (!option.available || option.key === selectedKey || savingRef.current) { setOpen(false); return; }
    savingRef.current = true;
    setSaving(true); setError("");
    try {
      if (conversation?.id && !String(conversation.id).startsWith("pending-")) {
        const updated = await setFounderConversationModel(conversation.id, option.providerKey, option.model);
        onConversationChanged?.(updated);
      } else {
        onPreselect?.(option);
      }
      setOpen(false);
    } catch (switchError) {
      if (switchError?.status === 422 && /Conversation model is unavailable/i.test(switchError.message || "")) {
        await refreshCandidates();
        setError("该模型当前已不可用于此会话，候选列表已刷新，原模型保持不变。");
      } else {
        setError("模型切换失败，已保持原模型。");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function toggleMenu() {
    if (open) { setOpen(false); return; }
    if (!open) {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (bounds) {
        const anchorCenter = bounds.left + bounds.width / 2;
        const menuWidth = Math.min(340, window.innerWidth - 24);
        const menuLeft = Math.max(12, Math.min(anchorCenter - menuWidth / 2, window.innerWidth - menuWidth - 12));
        setPopoverPosition({ top: bounds.bottom + 12, left: menuLeft, arrowLeft: anchorCenter - menuLeft });
      }
    }
    await refreshCandidates();
    if (liveRef.current) setOpen(true);
  }

  return <div className="sino-model-selector" ref={rootRef}>
    <button ref={triggerRef} type="button" className="sino-model-selector__trigger sino-model-selector__trigger--pill" aria-label={`${triggerLabel} · 选择模型`} title={triggerLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggleMenu}>
      <span>{triggerLabel}</span><svg className="sino-model-selector__chevron-right" aria-hidden="true" viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
    </button>
    {open && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="sino-model-selector__menu sino-model-selector__menu--floating" role="menu" aria-label="Conversation Models" style={{ top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px`, "--popover-arrow-left": `${popoverPosition.arrowLeft}px` }}>
      <span className="sino-model-selector__arrow" data-popover-arrow aria-hidden="true" />
      {models.map((option) => <button type="button" role="menuitemradio" aria-checked={option.key === selectedKey} key={option.key} disabled={!option.available || saving} onClick={() => selectModel(option)}>
        <span><strong>{option.displayName}</strong><small>Provider：{option.providerName} · {option.model}</small></span>
        <i>{option.key === selectedKey ? option.available ? "✓" : "当前不可用" : option.available ? "" : "不可用"}</i>
      </button>)}
      {loadState === "LOADING" ? <p role="status">正在加载 Conversation Model…</p> : null}
      {loadState === "LOADED_EMPTY" ? <p>暂无可用 Conversation Model</p> : null}
      {loadState === "LOAD_FAILED" ? <p role="status">模型状态暂时无法加载，已保留当前模型。</p> : null}
    </div>, document.body) : null}
    {error ? <div className="sino-model-selector__error" role="status">{error}</div> : null}
  </div>;
}

export { configuredConversationModels };
