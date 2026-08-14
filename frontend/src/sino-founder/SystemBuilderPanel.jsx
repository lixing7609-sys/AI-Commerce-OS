import { useEffect, useMemo, useState } from "react";
import { getLifecycleAssets } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";
import { businessAssetName, businessPurpose, referenceSummary } from "./assetPresentation.js";
import { FounderWorkspaceInspector } from "./FounderWorkspaceInspector.jsx";

const STRUCTURE = ["project", "agent", "workflow", "skill", "prompt", "knowledge", "capability", "connector"];

export function SystemBuilderPanel({ projectId, selected, onSelect }) {
  const [assets, setAssets] = useState([]); const [error, setError] = useState("");
  useEffect(() => { getLifecycleAssets().then((data) => setAssets(data.assets || [])).catch((reason) => setError(reason.message)); }, []);
  const scoped = useMemo(() => { const related = projectId ? assets.filter((item) => item.project_id === projectId || item.asset_id === projectId) : assets; return related.length ? related : assets; }, [assets, projectId]);
  const project = scoped.find((item) => item.asset_type === "project");
  return <section className="sino-lifecycle-center sino-system-structure" aria-label="系统构建器">
    <header><div><span className="sino-kicker">System Builder</span><h1>{project ? businessAssetName(project) : "系统构建器"}</h1><p>组织 Project、能力资产与依赖关系，回答“这个系统现在由什么组成”。</p></div></header>
    {error && <p role="alert">{error}</p>}
    <div className="sino-system-structure__list sino-primary-list">{STRUCTURE.map((type) => { const items = scoped.filter((item) => item.asset_type === type); return <section key={type} data-present={Boolean(items.length)}><header><span>{items.length ? "✓" : "Missing"}</span><strong>{objectTypeLabel(type)}</strong><small>{items.length ? `${items.length} 个正式资产` : "当前系统尚未形成"}</small></header>{items.length ? items.map((item) => <button className={`sino-workspace-row${selected?.asset_id === item.asset_id ? " is-active" : ""}`} key={item.asset_id} onClick={() => onSelect?.(item)}><div className="sino-workspace-row__identity"><strong>{businessAssetName(item)}</strong><p>{businessPurpose(item)}</p></div><dl className="sino-workspace-row__metrics"><div><dt>状态</dt><dd>{statusLabel(item.status)}</dd></div><div><dt>版本</dt><dd>V{item.version || 1}</dd></div><div><dt>依赖</dt><dd>{referenceSummary(item.dependency_refs)}</dd></div><div><dt>Used By</dt><dd>{referenceSummary(item.used_by_refs)}</dd></div></dl><i aria-hidden="true">›</i></button>) : <p className="sino-system-structure__missing">当前系统尚未形成 {objectTypeLabel(type)}。可从 Founder 与 Sino 的讨论中创建并提交正式资产。</p>}</section>; })}</div>
  </section>;
}

export function SystemContext({ selected, onOpenAsset }) {
  if (!selected) return <FounderWorkspaceInspector title="系统上下文" description="选择一个系统对象查看关系与资产信息。" />;
  return <FounderWorkspaceInspector><section className="sino-asset-detail"><span className="sino-kicker">System Context</span><h2>{businessAssetName(selected)}</h2><p>{businessPurpose(selected)}</p><dl><div><dt>Type</dt><dd>{objectTypeLabel(selected.asset_type)}</dd></div><div><dt>Status / Version</dt><dd>{statusLabel(selected.status)} · V{selected.version || 1}</dd></div><div><dt>Project</dt><dd>{selected.project_id || "未关联"}</dd></div><div><dt>Dependencies</dt><dd>{referenceSummary(selected.dependency_refs)}</dd></div><div><dt>Used By</dt><dd>{referenceSummary(selected.used_by_refs)}</dd></div><div><dt>Related Objects</dt><dd>{referenceSummary(selected.related_object_ids || selected.related_refs)}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div></dl><div className="sino-lifecycle-actions"><button className="is-primary" onClick={() => onOpenAsset?.(selected)}>查看正式资产</button></div></section></FounderWorkspaceInspector>;
}
