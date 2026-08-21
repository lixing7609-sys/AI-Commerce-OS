import { useEffect, useMemo, useRef, useState } from "react";
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
  const [center, setCenter] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { let live = true; getModelCenter().then((value) => live && setCenter(value)).catch(() => live && setCenter({ providers: [], roles: [] })); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
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
    <button type="button" className="sino-model-selector__trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span>Sino AI</span><i aria-hidden="true">⌄</i>
    </button>
    {open ? <div className="sino-model-selector__menu" role="menu" aria-label="Conversation Models">
      <header><strong>Conversation Model</strong><small>只影响后续对话</small></header>
      {models.map((option) => <button type="button" role="menuitemradio" aria-checked={option.key === selectedKey} key={option.key} disabled={!option.available || saving} onClick={() => selectModel(option)}>
        <span><strong>{option.displayName}</strong><small>{option.providerName} · {option.model}</small></span>
        <i>{option.key === selectedKey ? "✓" : option.available ? "" : "不可用"}</i>
      </button>)}
      {!models.length ? <p>暂无可用 Conversation Model</p> : null}
    </div> : null}
    {error ? <div className="sino-model-selector__error" role="status">{error}</div> : null}
  </div>;
}

export { configuredConversationModels };
