import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getModelCenter, setFounderConversationModel } from "../services/founderAiApi.js";

function configuredConversationModels(center) {
  const providers = Array.isArray(center?.providers) ? center.providers : [];
  return providers.flatMap((provider) => {
    if (!provider.configured || !provider.enabled) return [];
    const models = provider.selected_models?.length ? provider.selected_models : provider.model ? [provider.model] : [];
    return models.map((model) => {
      const metadata = provider.available_models?.find((item) => item.model_id === model);
      const conversationCapable = !metadata || metadata.capability_tags?.includes("对话") || metadata.recommended_for?.includes("Sino 对话") || metadata.capability_tags?.includes("通用");
      if (!conversationCapable) return null;
      return {
        key: `${provider.provider_key}::${model}`,
        providerKey: provider.provider_key,
        providerName: provider.display_name || provider.provider_key,
        model,
        displayName: metadata?.display_name || model,
        available: provider.health_status !== "unhealthy" && provider.generation_availability !== "unavailable",
      };
    }).filter(Boolean);
  });
}

export function SinoModelSelector({ conversation, preselected, onPreselect, onConversationChanged }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [center, setCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0, arrowLeft: 0 });

  useEffect(() => { let live = true; getModelCenter().then((value) => live && setCenter(value)).catch(() => live && setCenter({ providers: [], roles: [] })); return () => { live = false; }; }, []);
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

  const models = useMemo(() => configuredConversationModels(center), [center]);
  const defaultRole = center?.roles?.find((item) => item.role_key === "sino_conversation");
  const defaultKey = defaultRole?.provider_key && defaultRole?.model ? `${defaultRole.provider_key}::${defaultRole.model}` : "";
  const selectedKey = conversation?.conversation_model_provider && conversation?.conversation_model
    ? `${conversation.conversation_model_provider}::${conversation.conversation_model}`
    : preselected?.key || defaultKey;

  async function selectModel(option) {
    if (!option.available || option.key === selectedKey || saving) { setOpen(false); return; }
    setSaving(true); setError("");
    try {
      if (conversation?.id && !String(conversation.id).startsWith("pending-")) {
        const updated = await setFounderConversationModel(conversation.id, option.providerKey, option.model);
        onConversationChanged?.(updated);
      } else {
        onPreselect?.(option);
      }
      setOpen(false);
    } catch {
      setError("模型切换失败，已保持原模型。");
    } finally { setSaving(false); }
  }

  return <div className="sino-model-selector" ref={rootRef}>
    <button ref={triggerRef} type="button" className="sino-model-selector__trigger sino-model-selector__trigger--pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span>Sino AI</span><svg className="sino-model-selector__chevron-right" aria-hidden="true" viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
    </button>
    {open && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="sino-model-selector__menu sino-model-selector__menu--floating" role="menu" aria-label="Conversation Models" style={{ top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px`, "--popover-arrow-left": `${popoverPosition.arrowLeft}px` }}>
      <span className="sino-model-selector__arrow" data-popover-arrow aria-hidden="true" />
      <header><strong>Conversation Model</strong><small>只影响后续对话</small></header>
      {models.map((option) => <button type="button" role="menuitemradio" aria-checked={option.key === selectedKey} key={option.key} disabled={!option.available || saving} onClick={() => selectModel(option)}>
        <span><strong>{option.displayName}</strong><small>{option.providerName} · {option.model}</small></span>
        <i>{option.key === selectedKey ? "✓" : option.available ? "" : "不可用"}</i>
      </button>)}
      {!models.length ? <p>暂无可用 Conversation Model</p> : null}
    </div>, document.body) : null}
    {error ? <div className="sino-model-selector__error" role="status">{error}</div> : null}
  </div>;
}

export { configuredConversationModels };
