import { useEffect, useMemo, useState } from "react";
import { getCapabilityDomains, getCapabilityRepositoryAssets, getLifecycleAsset, performConversationCapabilityAction } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";
import { businessAssetName, businessPurpose, referenceSummary } from "./assetPresentation.js";
import { FounderWorkspaceInspector } from "./FounderWorkspaceInspector.jsx";

const TYPES = [["", "全部"], ["agent", "Agent"], ["skill", "Skill"], ["workflow", "Workflow"], ["prompt", "Prompt"], ["capability", "Capability"], ["knowledge", "Knowledge"], ["connector", "Connector"]];
const STATUSES = [["", "全部"], ["candidate", "候选"], ["developing", "开发中"], ["testing", "测试中"], ["ready", "可引用"], ["deprecated", "已弃用"]];
const CAPABILITY_TYPES = new Set(TYPES.slice(1).map(([type]) => type));
const date = (value) => value ? new Date(value).toLocaleDateString("zh-CN") : "暂无";

export function CapabilityCenter({ selected, onSelect }) {
  const [domains, setDomains] = useState([]); const [domain, setDomain] = useState(""); const [assets, setAssets] = useState([]); const [type, setType] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  useEffect(() => { getCapabilityDomains().then((data) => setDomains(data.domains || [])).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => { if (!domain) return; getCapabilityRepositoryAssets(domain, type, status).then((data) => setAssets((data.assets || []).filter((item) => CAPABILITY_TYPES.has(item.asset_type) || item.asset_type === "knowledge"))).catch((reason) => setError(reason.message)); }, [domain, type, status]);
  const visible = useMemo(() => assets, [assets]);
  async function choose(item) { onSelect?.(item); try { onSelect?.(await getLifecycleAsset(item.asset_id)); } catch (reason) { setError(reason.message); } }
  return <section className="sino-lifecycle-center sino-primary-center" aria-label="能力仓库">
    <header><div><span className="sino-kicker">Capability Repository</span><h1>{domain ? domains.find((item) => item.domain_id === domain)?.name || domain : "能力仓库"}</h1><p>按业务 Domain 保存 Candidate、Developing、Testing 与 Ready 能力；只有 Ready 可以正式引用。</p></div>{domain ? <button onClick={() => { setDomain(""); setAssets([]); onSelect?.(null); }}>返回 Domain</button> : null}</header>
    {!domain ? <div className="sino-domain-grid">{domains.map((item) => <button key={item.domain_id} onClick={() => setDomain(item.domain_id)}><strong>{item.name}</strong><dl>{STATUSES.slice(1, 5).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{item.counts?.[key] || 0}</dd></div>)}</dl></button>)}</div> : <><nav aria-label="能力类型筛选">{TYPES.map(([key, label]) => <button key={key || "all"} className={type === key ? "is-active" : ""} onClick={() => setType(key)}>{label}</button>)}</nav><nav aria-label="能力状态筛选">{STATUSES.map(([key, label]) => <button key={key || "all"} className={status === key ? "is-active" : ""} onClick={() => setStatus(key)}>{label}</button>)}</nav></>}
    {error && <p role="alert">{error}</p>}
    {domain ? <div className="sino-primary-list sino-asset-list">{visible.length ? visible.map((item) => <button type="button" key={item.asset_id} className={`sino-workspace-row${selected?.asset_id === item.asset_id ? " is-active" : ""}`} onClick={() => choose(item)}><div className="sino-workspace-row__identity"><span>{objectTypeLabel(item.asset_type)}</span><strong>{businessAssetName(item)}</strong><p>{businessPurpose(item)}</p></div><dl className="sino-workspace-row__metrics"><div><dt>状态</dt><dd>{statusLabel(item.status)}</dd></div><div><dt>版本</dt><dd>V{item.version || 1}</dd></div><div><dt>Used By</dt><dd>{item.used_by_refs?.length || 0}</dd></div><div><dt>更新时间</dt><dd>{date(item.updated_at)}</dd></div></dl><i aria-hidden="true">›</i></button>) : <div className="sino-business-empty"><strong>当前筛选下没有能力</strong><p>Discussion Package 批准后，候选能力会按 Domain 进入这里。</p></div>}</div> : null}
  </section>;
}

export function CapabilityContext({ selected, onContinue, onChanged, conversationId }) {
  if (!selected) return <FounderWorkspaceInspector title="能力详情" description="选择一个能力查看上下文。" />;
  async function action(actionId) {
    const result = await performConversationCapabilityAction(conversationId || selected.source_conversation_id, { action: actionId, target_asset_id: selected.asset_id });
    onChanged?.(result?.asset || result);
  }
  const actions = selected.available_actions || [];
  return <FounderWorkspaceInspector><section className="sino-asset-detail"><span className="sino-kicker">Capability Repository</span><h2>{businessAssetName(selected)}</h2><p>{businessPurpose(selected)}</p><dl><div><dt>Domain</dt><dd>{selected.domain_id}</dd></div><div><dt>Type</dt><dd>{objectTypeLabel(selected.asset_type)}</dd></div><div><dt>Status / Version</dt><dd>{statusLabel(selected.status)} · V{selected.version || 1}</dd></div><div><dt>Source Conversation</dt><dd>{selected.source_conversation_id || "历史来源不可用"}</dd></div><div><dt>Source Package</dt><dd>{selected.source_package_id || "暂无"}</dd></div><div><dt>Test Result</dt><dd>{selected.test_run_refs?.at?.(-1)?.status || "尚未测试"}</dd></div><div><dt>Dependencies</dt><dd>{referenceSummary(selected.dependency_refs)}</dd></div><div><dt>Used By / Reuse</dt><dd>{selected.used_by_refs?.length || 0} / {selected.reference_count || 0}</dd></div><div><dt>Available Actions</dt><dd>{actions.join(" · ") || "暂无"}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div></dl><div className="sino-lifecycle-actions">{actions.includes("develop") ? <button className="is-primary" onClick={() => action("develop")}>开发</button> : null}{actions.includes("complete_development") ? <button className="is-primary" onClick={() => action("complete_development")}>完成开发并进入测试</button> : null}{actions.includes("run_test") || actions.includes("retest") ? <button onClick={() => action(actions.includes("retest") ? "retest" : "run_test")}>运行真实测试</button> : null}{actions.includes("approve_ready") ? <button className="is-primary" onClick={() => action("approve_ready")}>批准为可引用能力</button> : null}<button onClick={() => onContinue?.(selected)}>继续讨论</button></div></section></FounderWorkspaceInspector>;
}

export function CapabilityObjectWorkspace({ object, onContinue, onOpenExecution }) {
  if (!object) return <section className="sino-lifecycle-center"><div className="sino-business-empty"><strong>未选择能力</strong></div></section>;
  return <section className="sino-lifecycle-center"><header><div><span className="sino-kicker">{objectTypeLabel(object.object_type || object.asset_type)}</span><h1>{businessAssetName(object)}</h1><p>{businessPurpose(object)}</p></div></header><div className="sino-lifecycle-actions"><button onClick={() => onContinue?.(object)}>继续讨论</button><button className="is-primary" onClick={() => onOpenExecution?.(object)}>进入执行</button></div></section>;
}
