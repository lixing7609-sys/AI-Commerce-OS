import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { checkModelProvider, discoverProviderModels, getModelCenter, getRuntimeEnvironmentRegistry, installModelProvider, saveCapabilityAssignment, saveModelRoutingPreferred, saveMultiModelAssignment, selectProviderModels, updateModelProviderCredentials } from "../services/founderAiApi.js";

const empty = { provider_catalog: [], providers: [], roles: [], agents: [], health_cost: [], execution_engines: [] };
const modelId = (value) => typeof value === "string" ? value : value?.model_id;
const providerErrorLabels = { invalid_credentials: "认证失败", authentication_failed: "认证失败", insufficient_quota: "账户额度不足", provider_unavailable: "无法连接服务", invalid_response: "服务返回异常", model_unavailable: "模型不可用" };
const failureLabel = (value) => providerErrorLabels[value] || "连接异常";
const actionFailure = (action) => `${action}失败，请检查服务商授权或连接后重试`;
export const MODEL_ASSIGNMENT_STATUS = Object.freeze({ NORMAL: "NORMAL", CONFIG_ERROR: "CONFIG_ERROR", ERROR: "ERROR", UNCONFIGURED: "UNCONFIGURED" });
const assignmentStatusView = {
  [MODEL_ASSIGNMENT_STATUS.NORMAL]: { key: "normal", label: "● 正常" },
  [MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR]: { key: "config-error", label: "● 配置错误" },
  [MODEL_ASSIGNMENT_STATUS.ERROR]: { key: "error", label: "● 异常" },
  [MODEL_ASSIGNMENT_STATUS.UNCONFIGURED]: { key: "unconfigured", label: "● 未配置" },
};

export function resolveModelAssignmentStatus({ value, choices, invalid = false }) {
  if (!value) return MODEL_ASSIGNMENT_STATUS.UNCONFIGURED;
  const model = choices.find((item) => item.value === value);
  if (invalid || !model) return MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR;
  return model.healthy ? MODEL_ASSIGNMENT_STATUS.NORMAL : MODEL_ASSIGNMENT_STATUS.ERROR;
}

export function resolveAssignmentStatus({ primaryStatus, fallbackStatus, fallbackSupported = true }) {
  if (primaryStatus === MODEL_ASSIGNMENT_STATUS.UNCONFIGURED) return MODEL_ASSIGNMENT_STATUS.UNCONFIGURED;
  if (primaryStatus === MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR) return MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR;
  if (primaryStatus === MODEL_ASSIGNMENT_STATUS.NORMAL) return MODEL_ASSIGNMENT_STATUS.NORMAL;
  if (fallbackSupported && fallbackStatus === MODEL_ASSIGNMENT_STATUS.NORMAL) return MODEL_ASSIGNMENT_STATUS.NORMAL;
  return MODEL_ASSIGNMENT_STATUS.ERROR;
}

const assignmentStatusPriority = { [MODEL_ASSIGNMENT_STATUS.UNCONFIGURED]: 0, [MODEL_ASSIGNMENT_STATUS.NORMAL]: 1, [MODEL_ASSIGNMENT_STATUS.ERROR]: 2, [MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR]: 3 };
const referenceKey = (reference) => {
  const provider = reference?.provider_key || reference?.provider_id;
  const model = reference?.model || reference?.model_id;
  return provider && model ? `${provider}::${model}` : "";
};

export function buildAssignedModelEconomics({ roles = [], options = [], registry = {}, modelUsage = [] }) {
  const rows = new Map();
  const registryModels = registry.models || [];
  const visionChoices = registryModels.filter((item) => item.selected && item.enabled && item.capabilities?.supports_vision_understanding?.status === "VERIFIED").map((item) => ({ value: `${item.provider_id}::${item.model_id}`, label: item.display_name, healthy: Boolean(item.healthy), provider: options.find((option) => option.value === `${item.provider_id}::${item.model_id}`)?.provider }));
  const usageByModel = new Map(modelUsage.map((item) => [`${item.provider_id}::${item.model_id}`, item]));
  const merge = (reference, duty, choices = options, invalid = false, discussionTracked = false) => {
    const key = referenceKey(reference);
    if (!key) return;
    const [providerId, modelId] = key.split("::");
    const choice = choices.find((item) => item.value === key);
    const registryModel = registryModels.find((item) => item.provider_id === providerId && item.model_id === modelId);
    const status = resolveModelAssignmentStatus({ value: key, choices, invalid });
    const current = rows.get(key) || { provider_id: providerId, model_id: modelId, display_name: choice?.label || registryModel?.display_name || modelId, provider_name: choice?.provider?.display_name || options.find((item) => item.value === key)?.provider?.display_name || providerId, roles: [], assignment_status: status, discussion_tracked: false };
    if (!current.roles.includes(duty)) current.roles.push(duty);
    if (assignmentStatusPriority[status] > assignmentStatusPriority[current.assignment_status]) current.assignment_status = status;
    current.discussion_tracked ||= discussionTracked;
    rows.set(key, current);
  };
  const addRole = (roleKey, label) => {
    const role = roles.find((item) => item.role_key === roleKey) || {};
    const primary = { provider_key: role.provider_key, model: role.model };
    const fallback = role.fallbacks?.[0];
    const sameModel = Boolean(referenceKey(primary) && referenceKey(primary) === referenceKey(fallback));
    merge(primary, label, options, sameModel);
    merge(fallback, `${label} Fallback`, options, sameModel);
  };
  addRole("sino_conversation", "Sino 主对话");
  addRole("deep_thinking", "深度推理");
  addRole("code_execution", "Coding");
  const vision = (registry.routing_policies || []).find((item) => item.capability === "VISION_UNDERSTANDING") || {};
  const visionPrimary = vision.preferred_primary || vision.active_primary;
  const visionFallback = vision.preferred_fallback;
  const sameVisionModel = Boolean(referenceKey(visionPrimary) && referenceKey(visionPrimary) === referenceKey(visionFallback));
  merge(visionPrimary, "Vision", visionChoices, sameVisionModel);
  merge(visionFallback, "Vision Fallback", visionChoices, sameVisionModel);
  const discussion = roles.find((item) => item.role_key === "multi_model_discussion") || {};
  const slots = discussion.slots?.length ? discussion.slots.slice(0, 5) : (discussion.models || []).slice(0, 5).map((primary) => ({ primary, fallback: null }));
  const primaryKeys = slots.map((slot) => referenceKey(slot.primary)).filter(Boolean);
  slots.forEach((slot, index) => {
    const primaryKey = referenceKey(slot.primary); const fallbackKey = referenceKey(slot.fallback);
    const sameModel = Boolean(primaryKey && primaryKey === fallbackKey);
    merge(slot.primary, `讨论模型 ${index + 1}`, options, sameModel || primaryKeys.filter((key) => key === primaryKey).length > 1, true);
    merge(slot.fallback, `讨论模型 ${index + 1} Fallback`, options, sameModel, true);
  });
  return [...rows.entries()].map(([key, row]) => {
    const usage = usageByModel.get(key);
    const usageAvailable = Boolean(usage || row.discussion_tracked);
    return { ...row, request_count: usage ? Number(usage.request_count || 0) : usageAvailable ? 0 : null, completed_request_count: usage ? Number(usage.completed_request_count || 0) : usageAvailable ? 0 : null, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null, total_tokens: usage?.total_tokens ?? null, cost: usage?.cost ?? null, average_latency_ms: usage?.average_latency_ms ?? null, usage_status: usage ? "recorded" : usageAvailable ? "available_zero" : "not_integrated" };
  });
}

export function ModelCenter({ onHome }) {
  const [center, setCenter] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [featureModal, setFeatureModal] = useState(null);
  const [installStep, setInstallStep] = useState(1);
  const [installProviderKey, setInstallProviderKey] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [install, setInstall] = useState({ provider_type: "openai", api_key: "", base_url: "", display_name: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [providerActionState, setProviderActionState] = useState({});
  const [runtimeRegistry, setRuntimeRegistry] = useState(null);
  const [removalTarget, setRemovalTarget] = useState(null);
  const providerDialogRef = useRef(null);
  const providerTriggerRef = useRef(null);
  const featureDialogRef = useRef(null);
  const featureTriggerRef = useRef(null);
  const installed = useMemo(() => center.providers.filter((item) => item.installed), [center.providers]);

  async function reload() { const value = await getModelCenter(); setCenter(value); return value; }
  useEffect(() => {
    reload().catch((error) => setMessage(error.message));
    getRuntimeEnvironmentRegistry().then(setRuntimeRegistry).catch((error) => setMessage(error.message));
  }, []);

  function providerState(providerKey) { return providerActionState[providerKey] || {}; }
  function updateProviderState(providerKey, patch) { setProviderActionState((current) => ({ ...current, [providerKey]: { ...(current[providerKey] || {}), ...patch } })); }
  function mergeProvider(updated) {
    if (!updated?.provider_key) return;
    setCenter((current) => ({
      ...current,
      providers: current.providers.map((item) => item.provider_key === updated.provider_key ? { ...item, ...updated } : item),
      health_cost: current.health_cost.map((item) => item.provider_key === updated.provider_key ? { ...item, ...updated, usage: item.usage } : item),
    }));
  }
  function beginProviderConnection(providerType) {
    const existing = center.providers.find((item) => item.provider_type === providerType && item.installed);
    setEditing(existing?.provider_key || null);
    setInstall(existing ? { provider_type: existing.provider_type, api_key: "", base_url: existing.base_url, display_name: existing.display_name } : { provider_type: providerType, api_key: "", base_url: "", display_name: "" });
    setInstallStep(2);
  }
  async function restoreProvider(providerKey) {
    const latest = await getModelCenter();
    const updated = latest.providers.find((item) => item.provider_key === providerKey);
    if (updated) mergeProvider(updated);
    return updated;
  }

  async function addProvider(event) {
    event.preventDefault(); setBusy(editing ? "" : "install"); setMessage("");
    if (editing) updateProviderState(editing, { isConnecting: true, error: "", successMessage: "正在连接…" });
    try { const result = editing ? await updateModelProviderCredentials(editing, { api_key: install.api_key || null, base_url: install.base_url || null, display_name: install.display_name || null }) : await installModelProvider({ ...install, base_url: install.base_url || null, display_name: install.display_name || null }); mergeProvider(result); if (!editing) await reload(); setInstallProviderKey(result.provider_key); setEditing(result.provider_key); updateProviderState(result.provider_key, { error: "", successMessage: `连接成功，已发现 ${result.available_models?.length || 0} 个模型` }); setInstallStep(3); }
    catch (error) { if (editing) { const updated = await restoreProvider(editing).catch(() => null); updateProviderState(editing, { error: failureLabel(updated?.health_error), successMessage: "" }); } else setMessage(actionFailure("连接")); }
    finally { if (editing) updateProviderState(editing, { isConnecting: false }); setBusy(""); }
  }
  async function refresh(provider) { const key = provider.provider_key; updateProviderState(key, { isRefreshingModels: true, error: "", successMessage: "正在刷新模型…" }); try { const result = await discoverProviderModels(key); mergeProvider(result); updateProviderState(key, { successMessage: `模型已刷新，共 ${result.available_models?.length || 0} 个`, error: "" }); } catch (error) { updateProviderState(key, { error: failureLabel(provider.health_error), successMessage: "" }); } finally { updateProviderState(key, { isRefreshingModels: false }); } }
  async function choose(provider, model, checked) { const key = provider.provider_key; const id = modelId(model); const next = checked ? [...provider.selected_models, id] : provider.selected_models.filter((item) => item !== id); updateProviderState(key, { isSaving: true, error: "", successMessage: "正在保存…" }); try { const result = await selectProviderModels(key, next); mergeProvider(result); updateProviderState(key, { successMessage: "模型选择已保存" }); } catch (error) { updateProviderState(key, { error: "模型选择保存失败", successMessage: "" }); } finally { updateProviderState(key, { isSaving: false }); } }
  async function removeModel() {
    if (!removalTarget || removalTarget.dependencies.length) return;
    const { provider, model } = removalTarget;
    setBusy(`remove:${provider.provider_key}::${model.model_id}`); setMessage("");
    try {
      const result = await selectProviderModels(provider.provider_key, provider.selected_models.filter((item) => item !== model.model_id));
      mergeProvider(result); setRemovalTarget(null);
      if (editing === provider.provider_key && selectedModel === model.model_id) closeProviderModal();
    } catch (error) { setMessage(error.message || "模型移除失败"); }
    finally { setBusy(""); }
  }
  async function health(provider) { const key = provider.provider_key; updateProviderState(key, { isCheckingHealth: true, error: "", successMessage: "正在检查…" }); try { const result = await checkModelProvider(key); mergeProvider(result.configuration); const feedback = result.status === "healthy" ? "连接正常" : failureLabel(result.configuration?.health_error); updateProviderState(key, { successMessage: result.status === "healthy" ? feedback : "", error: result.status === "healthy" ? "" : feedback }); } catch (error) { updateProviderState(key, { error: failureLabel(provider.health_error), successMessage: "" }); } finally { updateProviderState(key, { isCheckingHealth: false }); } }
  function selectModel(provider, model, trigger) { providerTriggerRef.current = trigger; setAdding(false); setFeatureModal(null); setEditing(provider.provider_key); setSelectedModel(model); }
  function closeProviderModal() { setEditing(null); setSelectedModel(null); requestAnimationFrame(() => providerTriggerRef.current?.focus()); }
  function openFeatureModal(name, trigger) { featureTriggerRef.current = trigger; setAdding(false); setEditing(null); setSelectedModel(null); setFeatureModal(name); }
  function closeFeatureModal() { setFeatureModal(null); requestAnimationFrame(() => featureTriggerRef.current?.focus()); }
  async function updateCredentials(provider, values) { const key = provider.provider_key; updateProviderState(key, { isConnecting: true, error: "", successMessage: "正在保存…" }); try { const result = await updateModelProviderCredentials(key, values); mergeProvider(result); updateProviderState(key, { isConnecting: false, error: "", successMessage: "Provider 配置已保存" }); } catch (error) { updateProviderState(key, { isConnecting: false, error: actionFailure("Provider 配置"), successMessage: "" }); } }
  async function assignCapability(capabilityKey, value, fallbackValue) { const [providerKey, model] = value ? value.split("::") : [null, null]; const [fallbackProvider, fallbackModel] = fallbackValue ? fallbackValue.split("::") : [null, null]; setBusy(`capability:${capabilityKey}`); try { setCenter(await saveCapabilityAssignment(capabilityKey, providerKey, model, fallbackProvider ? [{ provider_key: fallbackProvider, model: fallbackModel }] : [])); setMessage("模型分配已保存并接入 Runtime"); } catch (error) { setMessage(actionFailure("模型分配")); } finally { setBusy(""); } }
  const modelOptions = installed.filter((item) => item.enabled).flatMap((provider) => provider.selected_models.map((model) => ({ value: `${provider.provider_key}::${model}`, provider, model, healthy: provider.health_status === "healthy", label: (provider.available_models.find((item) => modelId(item) === model) || {}).display_name || model })));
  const assignedEconomics = buildAssignedModelEconomics({ roles: center.roles || [], options: modelOptions, registry: center.model_capability_registry || {}, modelUsage: center.model_usage || [] });
  const modelDependencies = (providerKey, model) => {
    const duties = [...(assignedEconomics.find((item) => item.provider_id === providerKey && item.model_id === model)?.roles || [])];
    for (const application of center.applications || []) for (const assignment of application.assignments || []) {
      if (assignment.provider_key !== providerKey || assignment.model !== model || assignment.fixed) continue;
      const label = `${application.label} · ${assignment.label}`;
      if (!duties.includes(label)) duties.push(label);
    }
    return duties;
  };
  async function saveCouncil(slots) { setBusy("multi"); try { setCenter(await saveMultiModelAssignment(slots)); setMessage("多模型讨论配置已保存"); } catch (error) { setMessage(actionFailure("多模型讨论配置")); } finally { setBusy(""); } }
  async function savePreferred(capability, value, fallbackValue) { const [provider_id, model_id] = value ? value.split("::") : [null, null]; const [fallback_provider_id, fallback_model_id] = fallbackValue ? fallbackValue.split("::") : [null, null]; setBusy(`routing:${capability}`); try { const registry = await saveModelRoutingPreferred(capability, value ? { provider_id, model_id } : null, fallbackValue ? { provider_id: fallback_provider_id, model_id: fallback_model_id } : null); setCenter((current) => ({ ...current, model_capability_registry: registry })); setMessage("Vision Primary / Fallback 已保存"); } catch (error) { setMessage(actionFailure("Vision 分配")); } finally { setBusy(""); } }
  const selectedProvider = installed.find((provider) => provider.provider_key === editing);
  const selectedModelMeta = selectedProvider?.available_models.find((model) => modelId(model) === selectedModel) || (selectedModel ? { model_id: selectedModel, display_name: selectedModel } : null);
  const modelRows = installed.flatMap((provider) => provider.selected_models.map((selected) => {
    const meta = provider.available_models.find((item) => modelId(item) === selected) || { model_id: selected, display_name: selected };
    const metrics = center.health_cost.find((item) => item.provider_key === provider.provider_key && (!item.model || item.model === selected || item.selected_models?.includes(selected))) || {};
    return { provider, selected, meta, health: metrics.health_status || provider.health_status, usage: metrics.usage || {} };
  }));
  function modelDuties(providerKey, model) {
    const duties = [];
    const matches = (reference) => (reference?.provider_key || reference?.provider_id) === providerKey && (reference?.model || reference?.model_id) === model;
    const assignedRole = (key, label) => {
      const role = center.roles.find((item) => item.role_key === key);
      if (matches(role)) duties.push(label);
      if (role?.fallbacks?.some(matches)) duties.push(`${label} Fallback`);
    };
    assignedRole("sino_conversation", "Sino 主对话");
    assignedRole("deep_thinking", "深度推理");
    assignedRole("code_execution", "Coding");
    const vision = center.model_capability_registry?.routing_policies?.find((item) => item.capability === "VISION_UNDERSTANDING");
    if (matches(vision?.preferred_primary || vision?.active_primary)) duties.push("Vision");
    if (matches(vision?.preferred_fallback)) duties.push("Vision Fallback");
    const discussion = center.roles.find((item) => item.role_key === "multi_model_discussion");
    if (discussion?.slots?.some((slot) => matches(slot.primary) || matches(slot.fallback)) || discussion?.models?.some(matches)) duties.push("多模型讨论");
    return duties;
  }
  useEffect(() => {
    if (!selectedProvider || !selectedModelMeta) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") closeProviderModal(); };
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => providerDialogRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedProvider?.provider_key, selectedModel]);
  useEffect(() => {
    if (!featureModal) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") closeFeatureModal(); };
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => featureDialogRef.current?.focus());
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [featureModal]);
  const conversationRole = center.roles.find((item) => item.role_key === "sino_conversation");
  const configuredRoles = center.roles.filter((item) => ["sino_conversation", "deep_thinking", "code_execution", "multi_model_discussion"].includes(item.role_key) && (item.model || item.models?.length)).length;
  const localRuntime = runtimeRegistry?.environments?.find((item) => item.environment_type === "LOCAL");
  const activeEngine = center.execution_engines.find((item) => item.engine_id === center.roles.find((role) => role.role_key === "code_execution")?.execution_engine_id);
  return <section className="sino-model-center sino-settings" aria-label="设置">
    <div className="sino-settings-workspace">
    <header className="sino-settings-header"><button type="button" className="sino-settings-home-link" onClick={onHome}>← 返回首页</button><h2>设置</h2></header>
    <div className="sino-settings-content">
    {message && <p className="sino-model-center-message" role="status">{message}</p>}
    <section className="sino-capability-section sino-settings-page sino-settings-page--models" aria-label="模型">
      <section className="sino-model-list-pane"><div className="sino-model-list-heading"><h3>模型</h3><div><span aria-label="模型摘要">{modelRows.length} 个模型 · {modelRows.filter((row) => row.health === "healthy").length} 正常 · {modelRows.filter((row) => row.health === "unhealthy").length} 异常 · {installed.length} Provider</span></div></div><div className="sino-model-card-grid" role="list" aria-label="已接入模型列表">{modelRows.map(({ provider, selected, meta, health: healthState }) => { const active = editing === provider.provider_key && selectedModel === selected; const duties = modelDuties(provider.provider_key, selected); return <article role="listitem" key={`${provider.provider_key}-${selected}`}><button type="button" className={`sino-model-card-button${active ? " is-selected" : ""}`} aria-label={`${meta.display_name} ${provider.display_name}`} aria-pressed={active} onClick={(event) => selectModel(provider, selected, event.currentTarget)}><strong>{meta.display_name}</strong><span>{provider.display_name}</span><span data-health={healthState}>● {healthState === "healthy" ? "正常" : healthState === "unhealthy" ? "异常" : "未测试"}</span><small>{duties.length ? duties.join(" · ") : "未分配"}</small></button><button type="button" className="sino-model-remove-button" aria-label={`移除 ${meta.display_name}`} onClick={(event) => { event.stopPropagation(); setRemovalTarget({ provider, model: meta, dependencies: modelDependencies(provider.provider_key, selected) }); }}>×</button></article>; })}<article role="listitem"><button type="button" className="sino-add-model-card" onClick={() => { setFeatureModal(null); setEditing(null); setSelectedModel(null); setInstallStep(1); setAdding(true); }}>＋ 添加模型</button></article></div></section>
      <div className="sino-settings-control-grid">
        <SettingsFeatureEntry title="Sino AI" description="模型职责分配、Primary / Fallback 与多模型讨论" summary={`${conversationRole?.model || "主对话未配置"} · ${configuredRoles} 个职责`} onClick={(event) => openFeatureModal("sino-ai", event.currentTarget)} />
        <SettingsFeatureEntry title="系统" description="Executor、Runtime 与 System Health" summary={`${activeEngine?.display_name || "Codex"} · ${localRuntime?.status || "LOCAL"}`} onClick={(event) => openFeatureModal("system", event.currentTarget)} />
      </div>
      <ModelEconomics roles={center.roles || []} options={modelOptions} registry={center.model_capability_registry || {}} modelUsage={center.model_usage || []} />
    </section>

    {adding && <AddModelModal step={installStep} center={center} install={install} editing={editing} busy={busy} providerKey={installProviderKey} onSelectProvider={beginProviderConnection} onInstallChange={setInstall} onConnect={addProvider} onChoose={choose} onClose={() => { setAdding(false); setInstallStep(1); setInstallProviderKey(null); }} />}

    {selectedProvider && selectedModelMeta ? <ProviderConfigModal dialogRef={providerDialogRef} provider={selectedProvider} model={selectedModelMeta} action={providerState(selectedProvider.provider_key)} onCredentialSave={(values) => updateCredentials(selectedProvider, values)} onRefresh={() => refresh(selectedProvider)} onHealth={() => health(selectedProvider)} onChoose={(model, checked) => choose(selectedProvider, model, checked)} onClose={closeProviderModal} /> : null}
    {featureModal === "sino-ai" ? <SettingsFeatureModal title="Sino AI" description="模型职责分配、Fallback 与多模型讨论，Primary 失败时有限切换至 Fallback。" inlineDescription dialogRef={featureDialogRef} onClose={closeFeatureModal}><ModelAssignments roles={center.roles || []} options={modelOptions} registry={center.model_capability_registry} busy={busy} onAssign={assignCapability} onVisionAssign={savePreferred} onCouncilSave={saveCouncil} /></SettingsFeatureModal> : null}
    {featureModal === "system" ? <SettingsFeatureModal title="系统" description="Executor、Runtime 与系统健康。" dialogRef={featureDialogRef} onClose={closeFeatureModal}><div className="sino-settings-domain-grid sino-settings-domain-grid--execution"><ExecutorSettings roles={center.roles || []} engines={center.execution_engines || []} /><RuntimeEnvironmentSettings registry={runtimeRegistry} /></div></SettingsFeatureModal> : null}
    {removalTarget ? <ModelRemovalDialog target={removalTarget} busy={busy.startsWith("remove:")} onCancel={() => setRemovalTarget(null)} onRemove={removeModel} onOpenAssignments={() => { setRemovalTarget(null); openFeatureModal("sino-ai", null); }} /> : null}
    </div>
    </div>
  </section>;
}

function ModelRemovalDialog({ target, busy, onCancel, onRemove, onOpenAssignments }) {
  const inUse = target.dependencies.length > 0;
  return <div className="sino-delete-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="sino-delete-confirm sino-model-removal-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-model-title"><h2 id="remove-model-title">{inUse ? "模型正在使用" : "移除模型？"}</h2><strong>{target.model.display_name}</strong>{inUse ? <><p>该模型正在被以下职责使用，请先重新分配后再移除。</p><ul>{target.dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul></> : <p>该模型当前没有被 Sino AI 或 Runtime 使用。Provider 连接和模型目录将继续保留。</p>}<footer><button type="button" onClick={onCancel} disabled={busy}>取消</button>{inUse ? <button type="button" className="is-primary" onClick={onOpenAssignments}>前往 Sino AI</button> : <button type="button" className="is-primary" onClick={onRemove} disabled={busy}>{busy ? "正在移除…" : "移除"}</button>}</footer></section></div>;
}

function SettingsFeatureEntry({ title, description, summary, onClick }) {
  return <section className="sino-settings-feature-section" aria-label={title}><h3>{title}</h3><button type="button" aria-label={`打开${title}`} onClick={onClick}><small>{description}</small><span><small>{summary}</small><b aria-hidden="true">→</b></span></button></section>;
}

function SettingsFeatureModal({ title, description, inlineDescription = false, dialogRef, onClose, children }) {
  const modalClassName = `sino-add-model-modal sino-settings-feature-modal${inlineDescription ? " sino-settings-feature-modal--inline-heading" : ""}`;
  return <div className="sino-add-model-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={modalClassName} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header><div className={inlineDescription ? "sino-settings-modal-heading-inline" : undefined}><h2>{title}</h2><p>{description}</p></div><button type="button" aria-label={`关闭${title}`} onClick={onClose}>×</button></header><div className="sino-settings-feature-modal__content">{children}</div></section></div>;
}

function modelValue(reference) { return reference?.provider_key && reference?.model ? `${reference.provider_key}::${reference.model}` : ""; }
function routingValue(reference) { return reference?.provider_id && reference?.model_id ? `${reference.provider_id}::${reference.model_id}` : ""; }
function ModelAssignments({ roles, options, registry, busy, onAssign, onVisionAssign, onCouncilSave }) {
  const role = (key) => roles.find((item) => item.role_key === key) || {};
  const conversation = role("sino_conversation"); const reasoning = role("deep_thinking"); const coding = role("code_execution"); const council = role("multi_model_discussion");
  const vision = registry?.routing_policies?.find((item) => item.capability === "VISION_UNDERSTANDING") || {};
  const visionOptions = (registry?.models || []).filter((item) => item.selected && item.enabled && item.capabilities?.supports_vision_understanding?.status === "VERIFIED").map((item) => { const match = options.find((option) => option.value === `${item.provider_id}::${item.model_id}`); return { value: `${item.provider_id}::${item.model_id}`, label: item.display_name, provider: match?.provider, healthy: Boolean(item.healthy) }; });
  const renderAssignmentRow = ({ label, assignment, roleKey, choices = options, routing = false, primaryValues = [], onSave }) => {
    const primary = routing ? routingValue(assignment.preferred_primary || assignment.active_primary) : modelValue(assignment);
    const fallback = routing ? routingValue(assignment.preferred_fallback) : modelValue(assignment.fallbacks?.[0]);
    const save = onSave || ((nextPrimary, nextFallback) => routing ? onVisionAssign("VISION_UNDERSTANDING", nextPrimary, nextFallback) : onAssign(roleKey, nextPrimary, nextFallback));
    const duplicate = primary && primaryValues.filter((value) => value === primary).length > 1;
    const sameModel = Boolean(primary && fallback && fallback === primary);
    const primaryStatus = resolveModelAssignmentStatus({ value: primary, choices, invalid: duplicate || sameModel });
    const fallbackStatus = resolveModelAssignmentStatus({ value: fallback, choices, invalid: sameModel });
    const status = resolveAssignmentStatus({ primaryStatus, fallbackStatus, fallbackSupported: true });
    const primaryView = assignmentStatusView[primaryStatus]; const fallbackView = assignmentStatusView[fallbackStatus]; const assignmentView = assignmentStatusView[status];
    const optionLabel = (item) => `${item.label}${item.provider?.display_name ? ` · ${item.provider.display_name}` : ""}`;
    const renderedChoices = [...choices];
    for (const value of [primary, fallback]) if (value && !renderedChoices.some((item) => item.value === value)) { const [providerId, model] = value.split("::"); const known = (registry?.models || []).find((item) => item.provider_id === providerId && item.model_id === model); renderedChoices.push({ value, label: known?.display_name || model, provider: { display_name: options.find((item) => item.value === value)?.provider?.display_name || providerId }, invalid: true }); }
    return <div className="sino-model-assignment-row" key={label}><strong>{label}</strong><label><span>Primary</span><select aria-label={`${label} Primary`} value={primary} disabled={busy.includes(roleKey || "routing")} onChange={(event) => save(event.target.value, fallback === event.target.value ? "" : fallback)}><option value="">未分配</option>{renderedChoices.map((item) => { const usedByOtherSlot = primaryValues.some((value) => value === item.value && value !== primary); return <option key={`${label}-primary-${item.value}`} value={item.value} disabled={item.invalid || usedByOtherSlot}>{optionLabel(item)}{item.invalid ? "（能力不匹配）" : usedByOtherSlot ? "（已用于其他讨论模型）" : ""}</option>; })}</select></label><span className="sino-model-status sino-model-primary-status" data-status={primaryView.key} aria-label={`${label} Primary 状态`}>{primaryView.label}</span><label><span>Fallback</span><select aria-label={`${label} Fallback`} value={fallback} disabled={!primary || busy.includes(roleKey || "routing")} onChange={(event) => save(primary, event.target.value)}><option value="">未配置</option>{renderedChoices.map((item) => <option key={`${label}-fallback-${item.value}`} value={item.value} disabled={item.value === primary || item.invalid}>{optionLabel(item)}{item.invalid ? "（能力不匹配）" : ""}</option>)}</select></label><span className="sino-model-status sino-model-fallback-status" data-status={fallbackView.key} aria-label={`${label} Fallback 状态`}>{fallbackView.label}</span><span className="sino-model-status sino-model-assignment-status" data-status={assignmentView.key} aria-label={`${label} Assignment 状态`}>{assignmentView.label}</span></div>;
  };
  const slots = council.slots?.length ? council.slots : [...(council.models || []).map((primary) => ({ primary, fallback: null })), ...Array.from({ length: Math.max(0, 5 - (council.models || []).length) }, () => ({ primary: null, fallback: null }))];
  const normalizedSlots = [...slots.slice(0, 5), ...Array.from({ length: Math.max(0, 5 - slots.length) }, () => ({ primary: null, fallback: null }))];
  const discussionPrimaries = normalizedSlots.map((slot) => modelValue(slot.primary)).filter(Boolean);
  const saveSlot = (index, nextPrimary, nextFallback) => onCouncilSave(normalizedSlots.map((slot, slotIndex) => slotIndex === index ? { primary: referenceValue(nextPrimary), fallback: referenceValue(nextFallback) } : slot));
  return <section className="sino-model-assignments" aria-label="模型分配"><div className="sino-settings-domain-heading"><h3>模型分配</h3></div><div className="sino-model-assignment-table">{renderAssignmentRow({ label: "Sino 主对话", assignment: conversation, roleKey: "sino_conversation" })}{renderAssignmentRow({ label: "深度推理", assignment: reasoning, roleKey: "deep_thinking" })}{renderAssignmentRow({ label: "Vision", assignment: vision, roleKey: "routing:VISION_UNDERSTANDING", choices: visionOptions, routing: true })}{renderAssignmentRow({ label: "Coding", assignment: coding, roleKey: "code_execution" })}<h4 className="sino-discussion-slots-heading">多模型讨论</h4>{normalizedSlots.map((slot, index) => renderAssignmentRow({ label: `讨论模型 ${index + 1}`, assignment: { provider_key: slot.primary?.provider_key, model: slot.primary?.model, fallbacks: slot.fallback ? [slot.fallback] : [] }, roleKey: "multi", primaryValues: discussionPrimaries, onSave: (primary, fallback) => saveSlot(index, primary, fallback) }))}</div></section>;
}

function referenceValue(value) { if (!value) return null; const [provider_key, model] = value.split("::"); return { provider_key, model }; }

function ModelEconomics({ roles, options, registry, modelUsage }) {
  const rows = buildAssignedModelEconomics({ roles, options, registry, modelUsage });
  const meteredRows = rows.filter((row) => row.request_count !== null);
  const calls = meteredRows.length ? meteredRows.reduce((sum, row) => sum + row.request_count, 0) : null;
  const completedCalls = meteredRows.reduce((sum, row) => sum + row.completed_request_count, 0);
  const averageLatency = completedCalls ? Math.round(meteredRows.reduce((sum, row) => sum + (row.average_latency_ms || 0) * row.completed_request_count, 0) / completedCalls) : null;
  const metric = (value, unavailable) => value === null || value === undefined ? unavailable : value;
  return <section className="sino-usage-cost" aria-label="用量与成本"><div className="sino-settings-domain-heading"><h3>用量与成本</h3><span aria-label="已分配模型摘要">{rows.length} 个已分配模型</span></div><dl><div><dt>调用次数</dt><dd>{metric(calls, "未接入")}</dd></div><div><dt>Token</dt><dd>未接入</dd></div><div><dt>成本</dt><dd>成本未配置</dd></div><div><dt>平均延迟</dt><dd>{averageLatency === null ? "—" : `${averageLatency} ms`}</dd></div></dl><div className="sino-model-economics-table" role="table" aria-label="已分配模型经济账"><div className="sino-model-economics-row sino-model-economics-row--header" role="row"><span role="columnheader">模型</span><span role="columnheader">职责</span><span role="columnheader">状态</span><span role="columnheader">调用</span><span role="columnheader">Token</span><span role="columnheader">成本</span><span role="columnheader">平均延迟</span></div>{rows.map((row) => { const view = assignmentStatusView[row.assignment_status]; return <div className="sino-model-economics-row" role="row" key={`${row.provider_id}::${row.model_id}`}><span role="cell"><strong>{row.display_name}</strong><small>{row.provider_name}</small></span><span role="cell">{row.roles.join(" · ")}</span><span role="cell" className="sino-model-status" data-status={view.key}>{view.label}</span><span role="cell">{metric(row.request_count, "未接入")}</span><span role="cell">{metric(row.total_tokens, "未接入")}</span><span role="cell">{metric(row.cost, "成本未配置")}</span><span role="cell">{row.average_latency_ms === null ? "—" : `${Math.round(row.average_latency_ms)} ms`}</span></div>; })}</div></section>;
}

function RuntimeEnvironmentSettings({ registry }) {
  const [showDetails, setShowDetails] = useState(false);
  if (!registry) return <section className="sino-capability-section sino-settings-domain-panel" aria-label="运行环境"><p className="sino-settings-empty">正在读取运行环境注册表…</p></section>;
  const local = registry.environments.find((item) => item.environment_type === "LOCAL") || {};
  const service = (id) => local.services?.find((item) => item.service_id === id) || {};
  const frontend = service("founder_frontend"); const backend = service("founder_backend");
  const services = [frontend, backend, local.database, local.iam, local.network].filter(Boolean); const healthy = services.filter((item) => ["healthy", "verified", "ACTIVE"].includes(item.health || item.health_status || item.status || item.verification_status || item.connectivity_status)).length;
  return <section className="sino-capability-section sino-settings-domain-panel" aria-label="运行环境"><div className="sino-capability-section-heading"><div><h3>Runtime</h3><p>当前真实注册环境与系统健康。</p></div><button type="button" onClick={() => setShowDetails((value) => !value)}>{showDetails ? "收起详情" : "查看详情"}</button></div><div className="sino-runtime-summary"><strong>LOCAL</strong><span>{local.status}</span><span>{healthy}/{services.length} services healthy</span></div>{showDetails ? <div className="sino-runtime-binding-list">{[["前端", `${frontend.protocol}://${frontend.host}:${frontend.port}`, frontend], ["后端", `${backend.protocol}://${backend.host}:${backend.port}`, backend], ["数据库", `${local.database?.type} / LOCAL`, local.database], ["身份与访问管理", local.iam?.type, local.iam], ["网络", local.network?.boundary, local.network]].map(([label, binding, item]) => <article className="sino-settings-section-card" key={label}><div><strong>{label}</strong><span>{binding}</span></div><dl><div><dt>状态</dt><dd>{item?.status || item?.verification_status || item?.connectivity_status}</dd></div><div><dt>健康状态</dt><dd>{item?.health || item?.health_status || "verified"}</dd></div><div><dt>最近验证</dt><dd>{item?.last_verified_at || "—"}</dd></div></dl></article>)}</div> : null}</section>;
}

export function ProviderConfigModal({ provider, model, action, onCredentialSave, onRefresh, onHealth, onChoose, onClose, dialogRef }) {
  if (!provider || !model) return null;
  return <div className="sino-add-model-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={dialogRef} className="sino-add-model-modal sino-provider-config-modal" role="dialog" aria-modal="true" aria-labelledby="provider-config-title" tabIndex={-1}><header><div><h2 id="provider-config-title">Provider 技术配置</h2><p>连接、模型启用与健康检查。</p></div><button type="button" onClick={onClose} aria-label="关闭 Provider 技术配置">×</button></header><article><ProviderConfigContent provider={provider} model={model} action={action} onCredentialSave={onCredentialSave} onRefresh={onRefresh} onHealth={onHealth} onChoose={onChoose} /></article></section></div>;
}

function ProviderConfigContent({ provider, model, action = {}, onCredentialSave, onRefresh, onHealth, onChoose }) {
  const [editingKey, setEditingKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showAllModels, setShowAllModels] = useState(false);
  const [transientFeedback, setTransientFeedback] = useState(null);
  const lastFeedback = useRef(action.error || action.successMessage);
  useEffect(() => { setEditingKey(false); setApiKey(""); setShowAllModels(false); setTransientFeedback(null); lastFeedback.current = action.error || action.successMessage; }, [provider.provider_key, modelId(model)]);
  const busy = Boolean(action.isConnecting || action.isRefreshingModels || action.isCheckingHealth || action.isSaving);
  useEffect(() => {
    const message = action.error || action.successMessage;
    if (!message || message === lastFeedback.current || busy) return undefined;
    lastFeedback.current = message;
    setTransientFeedback({ message, error: Boolean(action.error) });
    const timeout = window.setTimeout(() => setTransientFeedback(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [action.error, action.successMessage, busy]);
  const availableModels = provider.available_models || [];
  const visibleModels = showAllModels ? availableModels : availableModels.slice(0, 3);
  const showsApiKey = provider.requires_api_key !== false;
  async function saveKey(event) { event.preventDefault(); await onCredentialSave?.({ api_key: apiKey, base_url: null, display_name: null }); setApiKey(""); setEditingKey(false); }
  return <div className="sino-settings-provider-inspector">
    {transientFeedback ? <p className={`sino-provider-feedback ${transientFeedback.error ? "is-error" : "is-success"}`} role={transientFeedback.error ? "alert" : "status"}>{transientFeedback.message}</p> : null}
    <section className="sino-provider-connection-control" aria-labelledby="provider-connection-control-title">
      <h3 id="provider-connection-control-title">Provider 概览与连接控制</h3>
      <div className="sino-provider-summary">
        <div className="sino-provider-summary-row sino-provider-summary-row--identity"><span>当前模型</span><strong>{model?.display_name || modelId(model)}</strong><span>Provider</span><span>{provider.display_name} / {provider.provider_type}</span>{provider.base_url ? <><span>Base URL</span><span>{provider.base_url}</span></> : null}</div>
        <div className={`sino-provider-summary-row sino-provider-summary-row--actions${showsApiKey ? "" : " has-no-key"}`}>{showsApiKey ? editingKey ? <><span>API Key</span><form className="sino-settings-key-editor" onSubmit={saveKey}><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="输入新的 API Key" aria-label="新的 API Key" /><span><button type="submit" disabled={!apiKey || busy}>保存</button><button type="button" onClick={() => { setEditingKey(false); setApiKey(""); }}>取消</button></span></form></> : <><span>API Key</span><span className="sino-provider-key-mask">{provider.api_key_mask || "未配置"}</span><button type="button" onClick={() => setEditingKey(true)}>更新 API Key</button></> : null}<button type="button" onClick={onHealth} disabled={busy}>{action.isCheckingHealth ? "测试中…" : "测试连接"}</button></div>
      </div>
    </section>
    <section className="sino-provider-model-management" aria-labelledby="provider-model-management-title"><div className="sino-provider-section-heading"><h3 id="provider-model-management-title">Provider 模型管理</h3><button type="button" onClick={onRefresh} disabled={busy}>{action.isRefreshingModels ? "正在刷新…" : "刷新模型"}</button></div><ModelChoices models={visibleModels} provider={provider} onChoose={(_, item, checked) => onChoose?.(item, checked)} busy={busy} />{availableModels.length > 3 ? <button type="button" className="sino-settings-models-toggle" aria-expanded={showAllModels} onClick={() => setShowAllModels((value) => !value)}>{showAllModels ? "收起" : `查看全部 ${availableModels.length} 个模型`}<ChevronRight aria-hidden="true" /></button> : null}</section>
  </div>;
}

function ExecutorSettings({ roles, engines }) {
  const execution = roles.find((role) => role.role_key === "code_execution") || {};
  const engine = engines.find((item) => item.engine_id === execution.execution_engine_id);
  return <section className="sino-capability-section sino-settings-domain-panel" aria-label="执行器"><div className="sino-capability-section-heading"><div><h3>Executor</h3><p>当前唯一真实执行器，无无效选择控件。</p></div></div><div className="sino-settings-section-card sino-executor-summary"><span><small>当前执行器</small><strong>{engine?.display_name || "Codex"}</strong></span><span><small>状态</small><strong>{engine?.status === "available" ? "● 可用" : "● 不可用"}</strong></span></div><p className="sino-settings-empty">执行系统模型尚未接入 Runtime，仅作为诊断信息保留。</p></section>;
}

function AddModelModal({ step, center, install, editing, busy, providerKey, onSelectProvider, onInstallChange, onConnect, onChoose, onClose }) {
  const provider = center.providers.find((item) => item.provider_key === (providerKey || editing));
  const catalogProvider = center.provider_catalog.find((item) => item.provider_type === install.provider_type);
  const label = catalogProvider?.display_name || "AI 服务";
  const needsBaseUrl = Boolean(catalogProvider?.requires_base_url && !editing);
  const recommended = (provider?.available_models || []).filter((item) => item.recommendation_score >= 80);
  return <div className="sino-add-model-overlay" role="presentation"><section className="sino-add-model-modal" role="dialog" aria-modal="true" aria-label="添加 AI 模型"><header><div><h2>添加 AI 模型</h2><p>{step === 1 ? "选择你要连接的 AI 服务。" : step === 2 ? `连接 ${label}` : "选择要添加到我的模型的模型。"}</p></div><button type="button" aria-label="关闭添加 AI 模型" onClick={onClose}>×</button></header><div className="sino-add-model-modal__body"><nav aria-label="添加模型步骤"><span className={step >= 1 ? "is-active" : ""}>1 选择服务商</span><span className={step >= 2 ? "is-active" : ""}>2 连接账号</span><span className={step >= 3 ? "is-active" : ""}>3 选择模型</span></nav>{step === 1 && <div className="sino-provider-catalog">{center.provider_catalog.map((item) => { const existing = center.providers.find((entry) => entry.provider_type === item.provider_type && entry.installed); const failed = existing?.health_status === "unhealthy"; return <button type="button" key={item.provider_type} onClick={() => onSelectProvider(item.provider_type)}><strong>{item.display_name}</strong><span>{item.provider_type === "openai" ? "GPT 系列" : item.provider_type === "anthropic" ? "Claude 系列" : item.provider_type === "ofoxai" ? "GPT / Claude 等模型" : "AI 模型服务"}</span><small>{existing ? (failed ? failureLabel(existing.health_error) : "已连接") : "未添加"}</small><b>{existing && failed ? "重新连接" : "选择"}</b></button>; })}</div>}{step === 2 && <form className="sino-add-model-credentials" onSubmit={onConnect}><h3>连接 {label}</h3><label>API Key<input type="password" autoComplete="new-password" value={install.api_key} onChange={(event) => onInstallChange({ ...install, api_key: event.target.value })} placeholder={editing ? "输入新的 API Key" : "请输入 API Key"} /></label><details open={needsBaseUrl || undefined}><summary>高级设置</summary><label>服务地址<input value={install.base_url} onChange={(event) => onInstallChange({ ...install, base_url: event.target.value })} placeholder={needsBaseUrl ? "请输入服务商提供的 Base URL" : "使用服务商默认地址"} /></label></details><button type="submit" disabled={!install.api_key || (needsBaseUrl && !install.base_url.trim()) || busy === "install"}>{busy === "install" ? `正在连接 ${label}…` : editing ? "重新连接" : "连接"}</button></form>}{step === 3 && provider && <div className="sino-add-model-selection"><h3>推荐模型</h3><ModelChoices models={recommended} provider={provider} onChoose={onChoose} busy={false} /><details><summary>查看全部模型</summary><ModelChoices models={provider.available_models} provider={provider} onChoose={onChoose} busy={false} /></details><button type="button" className="is-primary" onClick={onClose}>添加到我的模型</button></div>}</div></section></div>;
}

function ModelChoices({ models, provider, onChoose, busy }) {
  return <div className="sino-model-choices">{models.map((model) => <label key={modelId(model)}><input type="checkbox" checked={provider.selected_models.includes(modelId(model))} onChange={(event) => onChoose(provider, model, event.target.checked)} disabled={Boolean(busy)} /><span><strong>{model.display_name || modelId(model)}</strong><small>{model.recommended_for?.join(" · ") || "通用能力"}</small><em>{modelId(model)}</em></span>{model.recommendation_score >= 80 && <b>推荐</b>}</label>)}</div>;
}
