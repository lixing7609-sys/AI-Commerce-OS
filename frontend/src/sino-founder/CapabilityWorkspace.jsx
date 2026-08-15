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
    {domain ? <div className="sino-primary-list sino-asset-list">{visible.length ? visible.map((item) => <button type="button" key={item.asset_id} className={`sino-workspace-row${selected?.asset_id === item.asset_id ? " is-active" : ""}`} onClick={() => choose(item)}><div className="sino-workspace-row__identity"><span>{objectTypeLabel(item.asset_type)}</span><strong>{businessAssetName(item)}</strong><p>{businessPurpose(item)}</p><small>来源 {item.source_conversation_id || "历史会话不可用"}</small></div><dl className="sino-workspace-row__metrics"><div><dt>状态</dt><dd>{statusLabel(item.status)}</dd></div><div><dt>版本</dt><dd>V{item.version || 1}</dd></div><div><dt>Reuse</dt><dd>{item.reference_count || 0}</dd></div><div><dt>更新时间</dt><dd>{date(item.updated_at)}</dd></div></dl><i aria-hidden="true">›</i></button>) : <div className="sino-business-empty"><strong>当前筛选下没有能力</strong><p>Discussion Package 批准后，候选能力会按 Domain 进入这里。</p></div>}</div> : null}
  </section>;
}

export function CapabilityContext({ selected, onContinue, onChanged, conversationId }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!selected) return <FounderWorkspaceInspector title="能力详情" description="选择一个能力查看上下文。" />;
  async function action(actionId) {
    setBusy(true); setError("");
    try {
      if (actionId === "view_development") { onChanged?.(await getLifecycleAsset(selected.asset_id)); return; }
      const targetConversationId = conversationId || selected.source_conversation_id;
      const payload = { action: actionId, target_asset_id: selected.asset_id };
      if (actionId === "reuse") Object.assign(payload, { target_type: "conversation", target_id: targetConversationId, note: "Founder 从能力仓库引用到当前 Conversation" });
      const result = await performConversationCapabilityAction(targetConversationId, payload); onChanged?.(result?.asset || result);
    }
    catch (reason) { setError(reason.message); try { onChanged?.(await getLifecycleAsset(reason.lifecycle?.asset_id || selected.asset_id)); } catch { /* retain business error */ } }
    finally { setBusy(false); }
  }
  const actions = selected.available_actions || [];
  const development = selected.development_run_refs?.at?.(-1); const test = selected.test_run_refs?.at?.(-1);
  return <FounderWorkspaceInspector><section className="sino-asset-detail"><span className="sino-kicker">Capability Repository</span><h2>{businessAssetName(selected)}</h2><p>{businessPurpose(selected)}</p><dl><div><dt>Domain</dt><dd>{selected.domain_id}</dd></div><div><dt>Type</dt><dd>{objectTypeLabel(selected.asset_type)}</dd></div><div><dt>Status / Version</dt><dd>{statusLabel(selected.status)} · V{selected.version || 1}</dd></div><div><dt>Source Conversation</dt><dd>{selected.source_conversation_id || "历史来源不可用"}</dd></div><div><dt>Source Package</dt><dd>{selected.source_package_id || "暂无"}</dd></div><div><dt>Development Run</dt><dd>{development?.development_run_id || development?.run_id || "尚未开发"}</dd></div><div><dt>Test Run</dt><dd>{test?.test_run_id || test?.run_id || "尚未测试"}</dd></div><div><dt>Test Result</dt><dd>{test?.status || "尚未测试"}{test?.failure_reason ? ` · ${test.failure_reason}` : ""}</dd></div><div><dt>Evidence</dt><dd>{Array.isArray(test?.evidence) ? test.evidence.join(" · ") : test?.evidence || "暂无"}</dd></div><div><dt>Ready Approved At</dt><dd>{selected.ready_approved_at || "尚未批准"}</dd></div><div><dt>Dependencies</dt><dd>{referenceSummary(selected.dependency_refs)}</dd></div><div><dt>Used By / Reuse</dt><dd>{selected.used_by_refs?.length || 0} / {selected.reference_count || 0}</dd></div><div><dt>Latest Learning</dt><dd>{selected.learning_refs?.at?.(-1)?.summary || "暂无"}</dd></div><div><dt>Available Actions</dt><dd>{actions.join(" · ") || "暂无"}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div></dl>{error ? <p role="alert">{error}</p> : null}<div className="sino-lifecycle-actions">{actions.includes("develop") ? <button disabled={busy} className="is-primary" onClick={() => action("develop")}>开发</button> : null}{actions.includes("view_development") ? <button disabled={busy} onClick={() => action("view_development")}>查看开发状态</button> : null}{actions.includes("complete_development") ? <button disabled={busy} className="is-primary" onClick={() => action("complete_development")}>完成开发并进入测试</button> : null}{actions.includes("run_test") || actions.includes("retest") ? <button disabled={busy} onClick={() => action(actions.includes("retest") ? "retest" : "run_test")}>运行真实测试</button> : null}{actions.includes("approve_ready") ? <button disabled={busy} className="is-primary" onClick={() => action("approve_ready")}>批准为可引用能力</button> : null}{actions.includes("return_to_development") ? <button disabled={busy} onClick={() => action("return_to_development")}>退回开发</button> : null}{actions.includes("reuse") ? <button disabled={busy || !conversationId} className="is-primary" onClick={() => action("reuse")}>引用</button> : null}{actions.includes("archive") ? <button disabled={busy} onClick={() => action("archive")}>归档</button> : null}{actions.includes("upgrade") ? <button disabled={busy} onClick={() => action("upgrade")}>升级</button> : null}{actions.includes("deprecate") ? <button disabled={busy} onClick={() => action("deprecate")}>弃用</button> : null}<button disabled={busy} onClick={() => onContinue?.(selected)}>继续讨论</button></div></section></FounderWorkspaceInspector>;
}

export function CapabilityObjectWorkspace({ object, onContinue, onOpenExecution }) {
  if (!object) return <section className="sino-lifecycle-center"><div className="sino-business-empty"><strong>未选择能力</strong></div></section>;
  return <section className="sino-lifecycle-center"><header><div><span className="sino-kicker">{objectTypeLabel(object.object_type || object.asset_type)}</span><h1>{businessAssetName(object)}</h1><p>{businessPurpose(object)}</p></div></header><div className="sino-lifecycle-actions"><button onClick={() => onContinue?.(object)}>继续讨论</button><button className="is-primary" onClick={() => onOpenExecution?.(object)}>进入执行</button></div></section>;
}
