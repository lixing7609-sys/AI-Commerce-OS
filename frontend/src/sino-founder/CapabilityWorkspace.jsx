import { useEffect, useMemo, useState } from "react";
import { getLifecycleAsset, getLifecycleAssets } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";
import { businessAssetName, businessPurpose, referenceSummary } from "./assetPresentation.js";
import { FounderWorkspaceInspector } from "./FounderWorkspaceInspector.jsx";

const TYPES = [["", "全部"], ["agent", "Agent"], ["skill", "Skill"], ["workflow", "Workflow"], ["prompt", "Prompt"], ["capability", "Capability"], ["connector", "Connector"]];
const CAPABILITY_TYPES = new Set(TYPES.slice(1).map(([type]) => type));
const date = (value) => value ? new Date(value).toLocaleDateString("zh-CN") : "暂无";

export function CapabilityCenter({ selected, onSelect }) {
  const [assets, setAssets] = useState([]); const [type, setType] = useState(""); const [error, setError] = useState("");
  useEffect(() => { getLifecycleAssets().then((data) => setAssets((data.assets || []).filter((item) => CAPABILITY_TYPES.has(item.asset_type)))).catch((reason) => setError(reason.message)); }, []);
  const visible = useMemo(() => assets.filter((item) => !type || item.asset_type === type), [assets, type]);
  async function choose(item) { onSelect?.(item); try { onSelect?.(await getLifecycleAsset(item.asset_id)); } catch (reason) { setError(reason.message); } }
  return <section className="sino-lifecycle-center sino-primary-center" aria-label="AI 能力中心">
    <header><div><span className="sino-kicker">AI Capability Center</span><h1>AI 能力中心</h1><p>创建、编辑、组合和测试正式 AI 能力；这里不保存 Conversation、Decision 或 Execution Result。</p></div></header>
    <nav aria-label="能力类型筛选">{TYPES.map(([key, label]) => <button key={key || "all"} className={type === key ? "is-active" : ""} onClick={() => setType(key)}>{label}</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div className="sino-primary-list sino-asset-list">{visible.length ? visible.map((item) => <button type="button" key={item.asset_id} className={selected?.asset_id === item.asset_id ? "is-active" : ""} onClick={() => choose(item)}><span>{objectTypeLabel(item.asset_type)}</span><strong>{businessAssetName(item)}</strong><p>{businessPurpose(item)}</p><small>{statusLabel(item.status)} · V{item.version || 1} · Used By {item.used_by_refs?.length || 0} · {date(item.updated_at)}</small></button>) : <div className="sino-business-empty"><strong>暂无{type ? objectTypeLabel(type) : "AI 能力"}</strong><p>从 Founder 与 Sino 讨论创建一个能力，批准成果包后会进入这里。</p></div>}</div>
  </section>;
}

export function CapabilityContext({ selected, onContinue, onNavigateBuilder, onNavigateExecution, onNavigateAsset }) {
  if (!selected) return <FounderWorkspaceInspector title="能力详情" description="选择一个能力查看上下文。" />;
  return <FounderWorkspaceInspector><section className="sino-asset-detail"><span className="sino-kicker">Capability Context</span><h2>{businessAssetName(selected)}</h2><p>{businessPurpose(selected)}</p><dl><div><dt>Type</dt><dd>{objectTypeLabel(selected.asset_type)}</dd></div><div><dt>Status / Version</dt><dd>{statusLabel(selected.status)} · V{selected.version || 1}</dd></div><div><dt>Dependencies</dt><dd>{referenceSummary(selected.dependency_refs)}</dd></div><div><dt>Used By</dt><dd>{referenceSummary(selected.used_by_refs)}</dd></div><div><dt>Source</dt><dd>{selected.source_conversation_id || "历史来源不可用"}</dd></div><div><dt>Learning</dt><dd>{selected.learning_refs?.at?.(-1)?.summary || "暂无"}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div></dl><div className="sino-lifecycle-actions"><button onClick={() => onContinue?.(selected)}>继续讨论</button><button onClick={() => onNavigateBuilder?.(selected)}>进入系统构建器</button><button onClick={() => onNavigateExecution?.(selected)}>进入执行</button><button className="is-primary" onClick={() => onNavigateAsset?.(selected)}>查看资产记录</button></div></section></FounderWorkspaceInspector>;
}

export function CapabilityObjectWorkspace({ object, onContinue, onOpenExecution }) {
  if (!object) return <section className="sino-lifecycle-center"><div className="sino-business-empty"><strong>未选择能力</strong></div></section>;
  return <section className="sino-lifecycle-center"><header><div><span className="sino-kicker">{objectTypeLabel(object.object_type || object.asset_type)}</span><h1>{businessAssetName(object)}</h1><p>{businessPurpose(object)}</p></div></header><div className="sino-lifecycle-actions"><button onClick={() => onContinue?.(object)}>继续讨论</button><button className="is-primary" onClick={() => onOpenExecution?.(object)}>进入执行</button></div></section>;
}
