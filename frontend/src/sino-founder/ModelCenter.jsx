import { useEffect, useMemo, useState } from "react";
import { Activity, Box, ChevronRight, Globe2, Link2, List } from "lucide-react";
import { checkModelProvider, deleteModelProvider, discoverProviderModels, getModelCenter, getRuntimeEnvironmentRegistry, installModelProvider, saveCapabilityAssignment, saveExecutionEngine, saveModelRoutingPreferred, saveMultiModelAssignment, selectProviderModels, setModelProviderEnabled, updateModelProviderCredentials } from "../services/founderAiApi.js";

const empty = { provider_catalog: [], providers: [], roles: [], agents: [], health_cost: [], execution_engines: [] };
const MODEL_TASK_LABELS = { sino_conversation: "默认对话模型", deep_thinking: "深度思考模型", goal_reasoning: "目标推理模型", project_analysis: "项目分析模型", system_builder: "系统构建模型", solution_review: "方案评审模型" };
const stateLabel = (value) => ({ healthy: "正常", unhealthy: "异常", disabled: "已停用", pending_check: "待检查", pending_selection: "待选择模型", not_configured: "未配置" }[value] || "未检查");
const modelId = (value) => typeof value === "string" ? value : value?.model_id;
const failureLabel = (value) => ({ invalid_credentials: "认证失败", authentication_failed: "认证失败", insufficient_quota: "账户额度不足", provider_unavailable: "无法连接服务", invalid_response: "服务返回异常", model_unavailable: "模型不可用" }[value] || "连接异常");
const actionFailure = (action) => `${action}失败，请检查服务商授权或连接后重试`;

export function ModelCenter({ onContextChange }) {
  const [center, setCenter] = useState(empty);
  const [section, setSection] = useState("models");
  const [modelSection, setModelSection] = useState("list");
  const [adding, setAdding] = useState(false);
  const [installStep, setInstallStep] = useState(1);
  const [installProviderKey, setInstallProviderKey] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [install, setInstall] = useState({ provider_type: "openai", api_key: "", base_url: "", display_name: "" });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [providerActionState, setProviderActionState] = useState({});
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [runtimeRegistry, setRuntimeRegistry] = useState(null);
  const installed = useMemo(() => center.providers.filter((item) => item.installed), [center.providers]);

  async function reload() { const value = await getModelCenter(); setCenter(value); return value; }
  useEffect(() => {
    reload().then((value) => {
      const provider = value.providers.find((item) => item.installed && item.selected_models?.length);
      if (provider) { setEditing(provider.provider_key); setSelectedModel(provider.selected_models[0]); }
    }).catch((error) => setMessage(error.message));
    getRuntimeEnvironmentRegistry().then(setRuntimeRegistry).catch((error) => setMessage(error.message));
    onContextChange?.({ section: "models" });
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
  async function toggle(provider) { const key = provider.provider_key; updateProviderState(key, { isSaving: true, error: "", successMessage: "正在保存…" }); try { const result = await setModelProviderEnabled(key, !provider.enabled); mergeProvider(result); updateProviderState(key, { successMessage: provider.enabled ? "服务已停用" : "服务已启用" }); } catch (error) { updateProviderState(key, { error: "服务状态保存失败", successMessage: "" }); } finally { updateProviderState(key, { isSaving: false }); } }
  async function health(provider) { const key = provider.provider_key; updateProviderState(key, { isCheckingHealth: true, error: "", successMessage: "正在检查…" }); try { const result = await checkModelProvider(key); mergeProvider(result.configuration); const feedback = result.status === "healthy" ? "连接正常" : failureLabel(result.configuration?.health_error); updateProviderState(key, { successMessage: result.status === "healthy" ? feedback : "", error: result.status === "healthy" ? "" : feedback }); } catch (error) { updateProviderState(key, { error: failureLabel(provider.health_error), successMessage: "" }); } finally { updateProviderState(key, { isCheckingHealth: false }); } }
  async function remove(provider) { setBusy(`delete:${provider.provider_key}`); try { await deleteModelProvider(provider.provider_key); setPendingRemoval(null); setEditing(null); setMessage("服务已移除"); await reload(); } catch (error) { setMessage(actionFailure("移除服务")); } finally { setBusy(""); } }
  function selectModel(provider, model) { setEditing(provider.provider_key); setSelectedModel(model); }
  async function updateCredentials(provider, values) { const key = provider.provider_key; updateProviderState(key, { isConnecting: true, error: "", successMessage: "正在保存…" }); try { const result = await updateModelProviderCredentials(key, values); mergeProvider(result); updateProviderState(key, { isConnecting: false, error: "", successMessage: "Provider 配置已保存" }); } catch (error) { updateProviderState(key, { isConnecting: false, error: actionFailure("Provider 配置"), successMessage: "" }); } }
  async function assignCapability(capabilityKey, value) { const [providerKey, model] = value ? value.split("::") : [null, null]; setBusy(`capability:${capabilityKey}`); try { setCenter(await saveCapabilityAssignment(capabilityKey, providerKey, model)); setMessage("Sino 模型配置已保存"); } catch (error) { setMessage(actionFailure("Sino 模型配置")); } finally { setBusy(""); } }
  async function assignExecutionEngine(engineId) { setBusy("execution-engine"); try { setCenter(await saveExecutionEngine(engineId)); setMessage("执行引擎已保存"); } catch (error) { setMessage(actionFailure("执行引擎")); } finally { setBusy(""); } }
  const modelOptions = installed.filter((item) => item.enabled && item.health_status === "healthy").flatMap((provider) => provider.selected_models.map((model) => ({ value: `${provider.provider_key}::${model}`, provider, model, label: (provider.available_models.find((item) => modelId(item) === model) || {}).display_name || model })));
  async function saveCouncil(models) { setBusy("multi"); try { setCenter(await saveMultiModelAssignment(models)); setMessage("多模型讨论配置已保存"); } catch (error) { setMessage(actionFailure("多模型讨论配置")); } finally { setBusy(""); } }
  async function savePreferred(capability, value) { const [provider_id, model_id] = value ? value.split("::") : [null, null]; setBusy(`routing:${capability}`); try { const registry = await saveModelRoutingPreferred(capability, value ? { provider_id, model_id } : null); setCenter((current) => ({ ...current, model_capability_registry: registry })); setMessage("Preferred Primary 已保存；Active 仍只使用 verified + healthy 模型"); } catch (error) { setMessage(actionFailure("模型路由策略")); } finally { setBusy(""); } }
  const selectedProvider = installed.find((provider) => provider.provider_key === editing);
  const selectedModelMeta = selectedProvider?.available_models.find((model) => modelId(model) === selectedModel) || (selectedModel ? { model_id: selectedModel, display_name: selectedModel } : null);
  const modelRows = installed.flatMap((provider) => provider.selected_models.map((selected) => {
    const meta = provider.available_models.find((item) => modelId(item) === selected) || { model_id: selected, display_name: selected };
    const metrics = center.health_cost.find((item) => item.provider_key === provider.provider_key && (!item.model || item.model === selected || item.selected_models?.includes(selected))) || {};
    return { provider, selected, meta, health: metrics.health_status || provider.health_status, usage: metrics.usage || {} };
  }));
  const conversationRole = center.roles.find((role) => role.role_key === "sino_conversation");
  const imageRoute = center.model_capability_registry?.routing_policies?.find((policy) => policy.capability === "IMAGE_GENERATION");
  const fallbackRoute = center.model_capability_registry?.routing_policies?.find((policy) => policy.configured_fallback);
  const modelSummary = [
    ["已配置模型", modelRows.length],
    ["正常模型", modelRows.filter((row) => row.health === "healthy").length],
    ["异常模型", modelRows.filter((row) => row.health === "unhealthy").length],
    ["服务商", installed.length],
    ["主对话模型", conversationRole?.model || "未分配"],
    ["图像模型", imageRoute?.active_primary?.display_name || imageRoute?.active_primary?.model_id || "未分配"],
    ["Fallback", fallbackRoute?.configured_fallback?.display_name || fallbackRoute?.configured_fallback?.model_id || "未配置"],
  ];
  useEffect(() => {
    if (section === "models" && selectedProvider && selectedModelMeta) onContextChange?.({ section, provider: selectedProvider, model: selectedModelMeta, action: providerState(selectedProvider.provider_key), onCredentialSave: (values) => updateCredentials(selectedProvider, values), onRefresh: () => refresh(selectedProvider), onHealth: () => health(selectedProvider), onChoose: (model, checked) => choose(selectedProvider, model, checked) });
    else onContextChange?.({ section });
  }, [section, editing, selectedModel, center, providerActionState]);
  return <section className="sino-model-center sino-settings" aria-label="设置">
    <header><div><span className="sino-kicker">设置</span><h2>设置</h2></div></header>
    <nav className="sino-settings-tabs" aria-label="设置分类">{[["models", "模型与 API"], ["sino", "Sino AI"], ["executor", "执行器"], ["discussion", "讨论配置"], ["runtime", "运行环境"]].map(([key, label]) => <button type="button" key={key} className={section === key ? "is-active" : ""} onClick={() => { setSection(key); setEditing(null); setSelectedModel(null); }}>{label}</button>)}</nav>
    <div className="sino-settings-content">
    {message && <p className="sino-model-center-message" role="status">{message}</p>}
    {section === "models" && <section className="sino-capability-section sino-settings-page sino-settings-page--models" aria-label="模型与 API">
      <nav className="sino-model-section-tabs" aria-label="模型与 API 内容">{[["list", "我的模型"], ["capabilities", "模型能力"], ["routing", "模型路由策略"]].map(([key, label]) => <button type="button" key={key} className={modelSection === key ? "is-active" : ""} aria-pressed={modelSection === key} onClick={() => setModelSection(key)}>{label}</button>)}</nav>
      {modelSection === "list" ? <div className="sino-model-section-panel sino-model-workspace" data-model-section="list"><section className="sino-model-list-pane"><div className="sino-model-list-heading"><div><h3>我的模型</h3><p>管理已接入的模型与服务。</p></div><button type="button" onClick={() => { setEditing(null); setInstallStep(1); setAdding(true); }}>＋ 添加模型</button></div><div className="sino-my-models" role="table" aria-label="模型状态列表"><div className="sino-my-models__header" role="row"><strong>模型</strong><strong>服务商</strong><strong>健康状态</strong><strong>调用</strong><strong>Token</strong><strong>成本</strong><strong>延迟</strong><strong>额度</strong></div>{modelRows.map(({ provider, selected, meta, health: healthState, usage }) => { const active = editing === provider.provider_key && selectedModel === selected; return <button type="button" className={active ? "is-selected" : ""} aria-label={`${meta.display_name} ${provider.display_name}`} aria-pressed={active} key={`${provider.provider_key}-${selected}`} onClick={() => selectModel(provider, selected)}><strong>{meta.display_name}</strong><span>{provider.display_name}</span><span data-health={healthState}>● {healthState === "healthy" ? "正常" : healthState === "unhealthy" ? "异常" : "未测试"}</span><span>{usage.calls ?? "—"}</span><span>{usage.tokens ?? "—"}</span><span>{usage.cost ?? "—"}</span><span>{usage.average_latency_ms == null ? "—" : `${usage.average_latency_ms} ms`}</span><span>{usage.quota ?? "—"}</span></button>; })}</div></section><aside className="sino-model-summary" aria-label="模型概览"><h3>模型概览</h3><dl>{modelSummary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={String(value)}>{value}</dd></div>)}</dl></aside></div> : null}
      {modelSection === "capabilities" ? <ModelCapabilities registry={center.model_capability_registry} /> : null}
      {modelSection === "routing" ? <RoutingPolicies registry={center.model_capability_registry} models={center.model_capability_registry?.models || []} busy={busy} onSave={savePreferred} /> : null}
    </section>}

    {adding && <AddModelModal step={installStep} center={center} install={install} editing={editing} busy={busy} providerKey={installProviderKey} onSelectProvider={beginProviderConnection} onInstallChange={setInstall} onConnect={addProvider} onChoose={choose} onClose={() => { setAdding(false); setInstallStep(1); setInstallProviderKey(null); }} />}

    {section === "sino" && <SinoSettings roles={center.roles || []} onSelect={(role) => onContextChange?.({ section: "sino", role, options: modelOptions, busy, onAssign: assignCapability })} />}
    {section === "executor" && <ExecutorSettings roles={center.roles || []} engines={center.execution_engines || []} onSelect={() => onContextChange?.({ section: "executor", roles: center.roles || [], engines: center.execution_engines || [], options: modelOptions, busy, onAssign: assignCapability, onEngineAssign: assignExecutionEngine })} />}
    {section === "discussion" && <DiscussionSettings roles={center.roles || []} onSelect={() => onContextChange?.({ section: "discussion", roles: center.roles || [], options: modelOptions, onSave: saveCouncil })} />}
    {section === "runtime" && <RuntimeEnvironmentSettings registry={runtimeRegistry} />}
    </div>
  </section>;
}

const CAPABILITY_LABELS = { TEXT_REASONING: "Sino 默认推理", VISION_UNDERSTANDING: "视觉理解", IMAGE_GENERATION: "图像生成", TOOL_USE: "工具调用", STRUCTURED_OUTPUT: "结构化输出" };
const capabilityStatus = (value) => ({ VERIFIED: "已验证", UNVERIFIED: "未验证", BLOCKED: "已阻止", UNSUPPORTED: "不支持" }[value] || value);
function ModelCapabilities({ registry }) {
  if (!registry) return null;
  const fields = [["supports_text_reasoning", "文本"], ["supports_vision_understanding", "视觉"], ["supports_image_generation", "图像生成"], ["supports_tool_use", "工具调用"], ["supports_structured_output", "结构化输出"]];
  return <section className="sino-model-capabilities sino-model-section-panel" aria-label="模型能力"><p className="sino-model-section-description">只有服务商元数据、真实探测或人工配置可进入启用路由。</p><div>{registry.models.filter((model) => model.selected).map((model) => <article key={`${model.provider_id}:${model.model_id}`}><header><strong>{model.display_name}</strong><span>{model.healthy ? "正常" : "不可用"}</span></header><div>{fields.map(([field, label]) => <span key={field} data-status={model.capabilities[field].status}><b>{label}</b>{capabilityStatus(model.capabilities[field].status)}</span>)}</div></article>)}</div></section>;
}
function RoutingPolicies({ registry, models, busy, onSave }) {
  if (!registry) return null;
  const options = models.filter((model) => model.enabled && model.selected);
  const name = (ref) => ref?.display_name || ref?.model_id || "无";
  return <section className="sino-routing-policies sino-model-section-panel" aria-label="模型路由策略"><p className="sino-model-section-description">首选项表达偏好；当前启用模型始终由已验证且健康的约束决定。</p><div>{registry.routing_policies.map((policy) => <article key={policy.capability}><header><strong>{CAPABILITY_LABELS[policy.capability]}</strong><span data-status={policy.status}>{policy.status === "MISSING" ? "缺失" : "已启用"}</span></header><label><span>首选模型</span><select aria-label={`${CAPABILITY_LABELS[policy.capability]} 首选模型`} value={policy.preferred_primary ? `${policy.preferred_primary.provider_id}::${policy.preferred_primary.model_id}` : ""} disabled={busy === `routing:${policy.capability}`} onChange={(event) => onSave(policy.capability, event.target.value)}><option value="">自动</option>{options.map((model) => <option key={`${policy.capability}-${model.provider_id}:${model.model_id}`} value={`${model.provider_id}::${model.model_id}`}>{model.display_name}</option>)}</select></label><dl><div><dt>当前启用</dt><dd>{name(policy.active_primary)}</dd></div><div><dt>回退模型</dt><dd>{name(policy.configured_fallback)}</dd></div><div><dt>首选状态</dt><dd>{policy.preferred_status}</dd></div></dl></article>)}</div></section>;
}

function RuntimeEnvironmentSettings({ registry }) {
  if (!registry) return <section className="sino-capability-section sino-settings-page" aria-label="运行环境"><p className="sino-settings-empty">正在读取运行环境注册表…</p></section>;
  const local = registry.environments.find((item) => item.environment_type === "LOCAL") || {};
  const nas = registry.environments.find((item) => item.environment_type === "NAS") || {};
  const cloud = registry.environments.find((item) => item.environment_type === "COMMERCIAL_CLOUD") || {};
  const service = (id) => local.services?.find((item) => item.service_id === id) || {};
  const frontend = service("founder_frontend"); const backend = service("founder_backend");
  return <section className="sino-capability-section sino-settings-page" aria-label="运行环境"><div className="sino-capability-section-heading"><div><h3>环境概览</h3><p>当前运行环境及后续部署阶段。</p></div></div><div className="sino-runtime-stage-grid"><article className="sino-settings-section-card"><small>当前环境</small><strong>LOCAL</strong><span>● {local.status}</span></article><article className="sino-settings-section-card"><small>下一阶段规划</small><strong>NAS</strong><span>● {nas.status}</span></article><article className="sino-settings-section-card"><small>商业云</small><strong>未配置</strong><span>● {cloud.status}</span></article></div><div className="sino-capability-section-heading sino-settings-subsection-heading"><div><h3>本地服务与基础设施</h3><p>已注册服务、端口与基础设施状态。</p></div></div><div className="sino-runtime-binding-list">{[["前端", `${frontend.protocol}://${frontend.host}:${frontend.port}`, frontend], ["后端", `${backend.protocol}://${backend.host}:${backend.port}`, backend], ["数据库", `${local.database?.type} / LOCAL`, local.database], ["身份与访问管理", local.iam?.type, local.iam], ["网络", local.network?.boundary, local.network]].map(([label, binding, item]) => <article className="sino-settings-section-card" key={label}><div><strong>{label}</strong><span>{binding}</span></div><dl><div><dt>状态</dt><dd>{item?.status || item?.verification_status || item?.connectivity_status}</dd></div><div><dt>健康状态</dt><dd>{item?.health || item?.health_status || "verified"}</dd></div><div><dt>最近验证</dt><dd>{item?.last_verified_at || "—"}</dd></div>{label === "数据库" ? <div><dt>凭据</dt><dd>{item?.credential_reference_exists ? "已配置 / 引用存在" : "未配置"}</dd></div> : null}</dl></article>)}</div></section>;
}

export function SettingsContext({ detail, onClose }) {
  const provider = detail?.provider;
  return <div className="sino-context-summary sino-settings-context"><header className="sino-settings-context-header"><div><h3>Sino Founder AI 系统配置</h3><p>配置当前模型及相关连接参数。</p></div><button type="button" onClick={onClose} aria-label="关闭设置并返回 Sino 首页">×</button></header><article>{provider ? <ProviderSettingsContext detail={detail} /> : detail?.role ? <RoleSettingsContext detail={detail} /> : detail?.section === "executor" && detail.engines ? <ExecutorSettingsContext detail={detail} /> : detail?.section === "discussion" && detail.roles ? <DiscussionSettingsContext detail={detail} /> : <div className="sino-settings-provider-inspector"><section className="sino-settings-inspector-card"><span className="sino-kicker">设置上下文</span><h4>设置详情</h4><p className="sino-settings-provider-name">选择一个服务商、模型或配置项查看详情。</p></section></div>}</article></div>;
}

function ProviderSettingsContext({ detail }) {
  const { provider, model, action = {}, onCredentialSave, onRefresh, onHealth, onChoose } = detail;
  const [editingKey, setEditingKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showAllModels, setShowAllModels] = useState(false);
  useEffect(() => { setEditingKey(false); setApiKey(""); setShowAllModels(false); }, [provider.provider_key, modelId(model)]);
  const busy = Boolean(action.isConnecting || action.isRefreshingModels || action.isCheckingHealth || action.isSaving);
  const availableModels = provider.available_models || [];
  const visibleModels = showAllModels ? availableModels : availableModels.slice(0, 3);
  async function saveKey(event) { event.preventDefault(); await onCredentialSave?.({ api_key: apiKey, base_url: null, display_name: null }); setApiKey(""); setEditingKey(false); }
  return <div className="sino-settings-provider-inspector">
    {action.error ? <p className="sino-provider-result is-error" role="status">{action.error}</p> : action.successMessage ? <p className="sino-provider-result is-success" role="status">{action.successMessage}</p> : null}
    <section className="sino-settings-inspector-card" aria-labelledby="settings-inspector-model"><h4 id="settings-inspector-model"><Box aria-hidden="true" />模型</h4><dl className="sino-settings-inspector-facts"><div><dt>模型名称</dt><dd>{model?.display_name || modelId(model)}</dd></div><div><dt>服务商</dt><dd>{provider.display_name} / {provider.provider_type}</dd></div><div><dt>模型 ID</dt><dd>{modelId(model)}</dd></div></dl></section>
    <section className="sino-settings-inspector-card" aria-labelledby="settings-inspector-connection"><h4 id="settings-inspector-connection"><Link2 aria-hidden="true" />连接状态</h4><dl className="sino-settings-inspector-facts"><div><dt>状态</dt><dd className="sino-settings-health-value" data-health={provider.health_status}>{stateLabel(provider.health_status)}</dd></div><div><dt>API Key</dt><dd>{provider.api_key_mask || "未配置"}</dd></div></dl>{editingKey ? <form className="sino-settings-key-editor" onSubmit={saveKey}><input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="输入新的 API Key" aria-label="新的 API Key" /><div><button type="submit" disabled={!apiKey || busy}>保存</button><button type="button" onClick={() => { setEditingKey(false); setApiKey(""); }}>取消</button></div></form> : <button type="button" className="sino-settings-context-action" onClick={() => setEditingKey(true)}>更新 API Key</button>}</section>
    <section className="sino-settings-inspector-card" aria-labelledby="settings-inspector-models"><div className="sino-settings-context-heading"><h4 id="settings-inspector-models"><List aria-hidden="true" />可用模型</h4><button type="button" onClick={onRefresh} disabled={busy}>{action.isRefreshingModels ? "正在刷新…" : "刷新模型"}</button></div><ModelChoices models={visibleModels} provider={provider} onChoose={(_, item, checked) => onChoose?.(item, checked)} busy={busy} />{availableModels.length > 3 ? <button type="button" className="sino-settings-models-toggle" aria-expanded={showAllModels} onClick={() => setShowAllModels((value) => !value)}>{showAllModels ? "收起" : `查看全部 ${availableModels.length} 个模型`}<ChevronRight aria-hidden="true" /></button> : null}</section>
    <section className="sino-settings-inspector-card" aria-labelledby="settings-inspector-config"><h4 id="settings-inspector-config"><Globe2 aria-hidden="true" />连接配置</h4><dl className="sino-settings-inspector-facts sino-settings-inspector-facts--stacked"><div><dt>基础地址</dt><dd>{provider.base_url || "默认"}</dd></div><div><dt>当前启用模型</dt><dd>{provider.selected_models?.join(" · ") || "未选择"}</dd></div></dl></section>
    <section className="sino-settings-inspector-card sino-settings-connection-test" aria-labelledby="settings-inspector-test"><h4 id="settings-inspector-test"><Activity aria-hidden="true" />连接测试</h4><div><span className="sino-settings-health-value" data-health={provider.health_status}>{stateLabel(provider.health_status)}</span><button type="button" onClick={onHealth} disabled={busy}>{action.isCheckingHealth ? "正在测试…" : "测试连接"}</button></div></section>
  </div>;
}

function RoleSettingsContext({ detail }) {
  const { role, options = [], busy, onAssign } = detail;
  return <div className="sino-settings-provider-inspector"><section className="sino-settings-inspector-card"><span className="sino-kicker">Sino AI</span><h4>{MODEL_TASK_LABELS[role.role_key] || role.label}</h4><p className="sino-settings-provider-name">配置当前智能任务使用的模型。</p><label className="sino-settings-context-select"><span>当前模型</span><select value={role.provider_key && role.model ? `${role.provider_key}::${role.model}` : ""} onChange={(event) => onAssign?.(role.role_key, event.target.value)} disabled={busy === `capability:${role.role_key}`}><option value="">未分配</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></section></div>;
}

function ExecutorSettingsContext({ detail }) {
  const execution = detail.roles.find((role) => role.role_key === "code_execution") || {};
  return <div className="sino-settings-provider-inspector"><section className="sino-settings-inspector-card"><span className="sino-kicker">执行器</span><h4>{detail.engines.find((engine) => engine.engine_id === execution.execution_engine_id)?.display_name || "执行引擎"}</h4><label className="sino-settings-context-select"><span>系统模型</span><select value={execution.provider_key && execution.model ? `${execution.provider_key}::${execution.model}` : ""} onChange={(event) => detail.onAssign?.("code_execution", event.target.value)} disabled={detail.busy === "capability:code_execution"}><option value="">未分配</option>{detail.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="sino-settings-context-select"><span>执行引擎</span><select aria-label="执行引擎" value={execution.execution_engine_id || ""} onChange={(event) => detail.onEngineAssign?.(event.target.value)} disabled={detail.busy === "execution-engine"}>{detail.engines.filter((engine) => engine.status === "available").map((engine) => <option key={engine.engine_id} value={engine.engine_id}>{engine.display_name}</option>)}</select></label></section></div>;
}

function DiscussionSettingsContext({ detail }) {
  const council = detail.roles.find((role) => role.role_key === "multi_model_discussion") || { models: [] };
  return <div className="sino-settings-provider-inspector"><section className="sino-settings-inspector-card"><span className="sino-kicker">讨论配置</span><h4>参与模型</h4><p className="sino-settings-provider-name">多模型讨论与自动多轮共用参与模型。</p><MultiModelSelect role={council} options={detail.options} onSave={detail.onSave} /></section></div>;
}

function SinoSettings({ roles, onSelect }) {
  const keys = ["sino_conversation", "deep_thinking", "goal_reasoning", "project_analysis", "system_builder", "solution_review"];
  return <section className="sino-capability-section sino-settings-page" aria-label="Sino AI"><div className="sino-capability-section-heading"><div><h3>模型职责</h3><p>为 Sino 的真实智能任务选择默认模型。</p></div></div><div className="sino-settings-object-grid">{keys.map((key) => roles.find((role) => role.role_key === key)).filter(Boolean).map((role) => <button type="button" className="sino-settings-section-card" key={role.role_key} onClick={() => onSelect(role)}><strong>{MODEL_TASK_LABELS[role.role_key] || role.label}</strong><span>{role.model || "未分配"}</span></button>)}</div></section>;
}

function ExecutorSettings({ roles, engines, onSelect }) {
  const execution = roles.find((role) => role.role_key === "code_execution") || {};
  const engine = engines.find((item) => item.engine_id === execution.execution_engine_id);
  return <section className="sino-capability-section sino-settings-page" aria-label="执行器"><div className="sino-capability-section-heading"><div><h3>执行配置</h3><p>当前执行引擎与系统模型。</p></div></div><button type="button" className="sino-settings-section-card sino-executor-summary" onClick={onSelect}><span><small>执行引擎</small><strong>{engine?.display_name || "执行引擎"}</strong></span><span><small>系统模型</small><strong>{execution.model || "未分配系统模型"}</strong></span></button></section>;
}

function DiscussionSettings({ roles, onSelect }) {
  const council = roles.find((role) => role.role_key === "multi_model_discussion") || { models: [] };
  return <section className="sino-capability-section sino-settings-page" aria-label="讨论配置"><div className="sino-capability-section-heading"><div><h3>讨论模式</h3><p>管理现有多模型讨论与自动多轮配置。</p></div></div><div className="sino-settings-object-grid sino-settings-object-grid--discussion"><button type="button" className="sino-settings-section-card" onClick={onSelect}><strong>多模型讨论</strong><span>{council.models?.length || 0} 个参与模型</span></button><button type="button" className="sino-settings-section-card" onClick={onSelect}><strong>自动多轮</strong><span>策略工作区中可用</span></button></div></section>;
}

function AddModelModal({ step, center, install, editing, busy, providerKey, onSelectProvider, onInstallChange, onConnect, onChoose, onClose }) {
  const provider = center.providers.find((item) => item.provider_key === (providerKey || editing));
  const catalogProvider = center.provider_catalog.find((item) => item.provider_type === install.provider_type);
  const label = catalogProvider?.display_name || "AI 服务";
  const needsBaseUrl = Boolean(catalogProvider?.requires_base_url && !editing);
  const recommended = (provider?.available_models || []).filter((item) => item.recommendation_score >= 80);
  return <div className="sino-add-model-overlay" role="presentation"><section className="sino-add-model-modal" role="dialog" aria-modal="true" aria-label="添加 AI 模型"><header><div><h2>添加 AI 模型</h2><p>{step === 1 ? "选择你要连接的 AI 服务。" : step === 2 ? `连接 ${label}` : "选择要添加到我的模型的模型。"}</p></div><button type="button" aria-label="关闭添加 AI 模型" onClick={onClose}>×</button></header><nav aria-label="添加模型步骤"><span className={step >= 1 ? "is-active" : ""}>1 选择服务商</span><span className={step >= 2 ? "is-active" : ""}>2 连接账号</span><span className={step >= 3 ? "is-active" : ""}>3 选择模型</span></nav>{step === 1 && <div className="sino-provider-catalog">{center.provider_catalog.map((item) => { const existing = center.providers.find((entry) => entry.provider_type === item.provider_type && entry.installed); const failed = existing?.health_status === "unhealthy"; return <button type="button" key={item.provider_type} onClick={() => onSelectProvider(item.provider_type)}><strong>{item.display_name}</strong><span>{item.provider_type === "openai" ? "GPT 系列" : item.provider_type === "anthropic" ? "Claude 系列" : item.provider_type === "ofoxai" ? "GPT / Claude 等模型" : "AI 模型服务"}</span><small>{existing ? (failed ? failureLabel(existing.health_error) : "已连接") : "未添加"}</small><b>{existing && failed ? "重新连接" : "选择"}</b></button>; })}</div>}{step === 2 && <form className="sino-add-model-credentials" onSubmit={onConnect}><h3>连接 {label}</h3><label>API Key<input type="password" autoComplete="new-password" value={install.api_key} onChange={(event) => onInstallChange({ ...install, api_key: event.target.value })} placeholder={editing ? "输入新的 API Key" : "请输入 API Key"} /></label><details open={needsBaseUrl || undefined}><summary>高级设置</summary><label>服务地址<input value={install.base_url} onChange={(event) => onInstallChange({ ...install, base_url: event.target.value })} placeholder={needsBaseUrl ? "请输入服务商提供的 Base URL" : "使用服务商默认地址"} /></label></details><button type="submit" disabled={!install.api_key || (needsBaseUrl && !install.base_url.trim()) || busy === "install"}>{busy === "install" ? `正在连接 ${label}…` : editing ? "重新连接" : "连接"}</button></form>}{step === 3 && provider && <div className="sino-add-model-selection"><h3>推荐模型</h3><ModelChoices models={recommended} provider={provider} onChoose={onChoose} busy={false} /><details><summary>查看全部模型</summary><ModelChoices models={provider.available_models} provider={provider} onChoose={onChoose} busy={false} /></details><button type="button" className="is-primary" onClick={onClose}>添加到我的模型</button></div>}</section></div>;
}

function ModelChoices({ models, provider, onChoose, busy }) {
  return <div className="sino-model-choices">{models.map((model) => <label key={modelId(model)}><input type="checkbox" checked={provider.selected_models.includes(modelId(model))} onChange={(event) => onChoose(provider, model, event.target.checked)} disabled={Boolean(busy)} /><span><strong>{model.display_name || modelId(model)}</strong><small>{model.recommended_for?.join(" · ") || "通用能力"}</small><em>{modelId(model)}</em></span>{model.recommendation_score >= 80 && <b>推荐</b>}</label>)}</div>;
}

function AgentHome({ agents, onManage }) {
  return <section className="sino-capability-section sino-agent-home" aria-label="AI Agent"><div className="sino-capability-section-heading"><div><h3>AI Agent</h3><p>当前只显示 Founder AI 已真实创建并接通的 Agent。</p></div><button type="button" disabled title="即将开放">＋ 添加 Agent</button></div><div className="sino-agent-list">{agents.map((agent) => <article key={agent.agent_id}><div><strong>{agent.display_name}</strong><span>● {agent.status === "running" ? "运行中" : "不可用"}</span></div><p>{agent.description}</p><button type="button" onClick={() => onManage(agent.agent_id)}>管理</button></article>)}</div><p className="sino-agent-coming-soon">添加 Agent 即将开放</p></section>;
}

function MultiModelSelect({ role, options, onSave }) {
  const selected = new Set((role.models || []).map((item) => `${item.provider_key}::${item.model}`));
  function toggle(value) { const next = new Set(selected); if (next.has(value)) next.delete(value); else next.add(value); onSave([...next].map((item) => { const [provider_key, model] = item.split("::"); return { provider_key, model }; })); }
  return <><div className="sino-council-heading"><p>选择参与重要讨论的 AI 模型。</p><span>已选择 {selected.size} 个模型</span></div>{selected.size < 2 && <p className="sino-council-warning">至少选择 2 个模型才能进行多模型讨论。</p>}<div className="sino-multi-model-select">{options.map((option) => <button type="button" key={option.value} className={selected.has(option.value) ? "is-selected" : ""} aria-pressed={selected.has(option.value)} onClick={() => toggle(option.value)}><strong>{option.label}</strong><small>{option.provider.display_name}</small><span>{selected.has(option.value) ? "✓ 已参与" : "选择"}</span></button>)}</div></>;
}

function SinoAgentDetail({ agent, skills, roles, options, engines, busy, onBack, onAssign, onEngineAssign, onCouncilSave }) {
  const [managedSkillId, setManagedSkillId] = useState(null);
  const ordinaryKeys = ["sino_conversation", "deep_thinking", "goal_reasoning", "project_analysis", "system_builder", "solution_review"];
  const ordinary = ordinaryKeys.map((key) => roles.find((role) => role.role_key === key)).filter(Boolean);
  const council = roles.find((role) => role.role_key === "multi_model_discussion") || { models: [] };
  const execution = roles.find((role) => role.role_key === "code_execution") || {};
  const availableEngines = engines.filter((engine) => engine.status === "available");
  const managedSkill = skills.find((skill) => skill.skill_id === managedSkillId);
  const modelName = (skill) => skill.model_assignments?.length ? `${skill.model_assignments.length} 个参与模型` : options.find((option) => option.value === `${skill.model_assignment?.provider_key}::${skill.model_assignment?.model}`)?.label || skill.model_assignment?.model || "未配置";
  if (!agent) return null;
  return <section className="sino-capability-section sino-ai-roles sino-agent-detail" aria-label="Sino AI 秘书详情"><button type="button" className="sino-agent-back" onClick={onBack}>返回 Agent</button><div className="sino-agent-overview"><div><h3>{agent.display_name}</h3><p>{agent.description}</p></div><dl><div><dt>状态</dt><dd>运行中</dd></div><div><dt>所属</dt><dd>Founder AI</dd></div></dl></div><section className="sino-agent-models"><h4>模型</h4><p>为 Sino 不同智能任务选择默认模型。</p><div className="sino-standard-capabilities">{ordinary.map((role) => <label key={role.role_key}><span>{MODEL_TASK_LABELS[role.role_key] || role.label}</span><select value={role.provider_key && role.model ? `${role.provider_key}::${role.model}` : ""} onChange={(event) => onAssign(role.role_key, event.target.value)} disabled={busy === `capability:${role.role_key}`}><option value="">未分配</option>{options.map((option) => <option key={`${role.role_key}-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>)}</div><section className="sino-council-assignment"><h4>多模型讨论模型</h4><MultiModelSelect role={council} options={options} onSave={onCouncilSave} /></section></section><section className="sino-agent-skills"><h4>技能</h4><p>决定 Sino AI 秘书当前会什么。</p><div className="sino-skill-grid">{skills.map((skill) => <article key={skill.skill_id}><header><strong>{skill.display_name}</strong><span data-status={skill.status}>{skill.status === "running" ? "运行中" : skill.status === "unconfigured" ? "未配置" : "异常"}</span></header><p>{skill.description}</p><dl><dt>当前模型</dt><dd>{modelName(skill)}</dd></dl><button type="button" onClick={() => setManagedSkillId(skill.skill_id)}>管理</button></article>)}</div>{managedSkill && <section className="sino-skill-detail" aria-label={`${managedSkill.display_name}技能详情`}><header><div><h5>{managedSkill.display_name}</h5><p>{managedSkill.description}</p></div><button type="button" onClick={() => setManagedSkillId(null)}>关闭</button></header><dl><div><dt>状态</dt><dd>{managedSkill.status === "running" ? "运行中" : "未配置"}</dd></div><div><dt>当前模型</dt><dd>{modelName(managedSkill)}</dd></div><div><dt>关联 Prompt</dt><dd>{managedSkill.prompt_refs?.length ? managedSkill.prompt_refs.join(" · ") : "尚未配置"}</dd></div><div><dt>关联工作流</dt><dd>{managedSkill.workflow_refs?.length ? managedSkill.workflow_refs.join(" · ") : "尚未配置"}</dd></div><div><dt>关联工具</dt><dd>{managedSkill.tool_refs?.length ? managedSkill.tool_refs.join(" · ") : "尚未配置"}</dd></div></dl></section>}</section><AgentEmptySection title="工作流" description="尚未配置工作流" action="未来管理入口" /><AgentEmptySection title="工具" description="当前暂无可管理工具" /><section className="sino-agent-memory"><h4>记忆</h4><p>显示 Sino 当前长期沉淀与恢复能力，不复制资产与记忆内容。</p><div>{["Conversation Memory", "Project Context", "Knowledge", "Decision", "Living Prompt"].map((item) => <article key={item}><strong>{item}</strong><span>运行中</span></article>)}</div></section><section className="sino-execution-assignment"><h4>执行</h4><label><span>系统模型</span><select value={execution.provider_key && execution.model ? `${execution.provider_key}::${execution.model}` : ""} onChange={(event) => onAssign("code_execution", event.target.value)} disabled={busy === "capability:code_execution"}><option value="">未分配</option>{options.map((option) => <option key={`execution-${option.value}`} value={option.value}>{option.label}</option>)}</select></label><label><span>执行引擎</span><select aria-label="执行引擎" value={execution.execution_engine_id || ""} onChange={(event) => onEngineAssign(event.target.value)} disabled={busy === "execution-engine"}>{availableEngines.map((engine) => <option key={engine.engine_id} value={engine.engine_id}>{engine.display_name}</option>)}</select></label></section></section>;
}

function AgentEmptySection({ title, description, action }) {
  return <section className="sino-agent-empty"><h4>{title}</h4><p>{description}</p>{action && <button type="button" disabled>{action}</button>}</section>;
}
