import { useEffect, useMemo, useState } from "react";
import { getLifecycleAssets } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";
import { businessAssetName, businessPurpose, referenceSummary } from "./assetPresentation.js";

const STRUCTURE = ["project", "agent", "workflow", "skill", "prompt", "knowledge", "capability", "connector"];

export function SystemBuilderPanel({ projectId, onOpenAsset }) {
  const [assets, setAssets] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState("");
  useEffect(() => { getLifecycleAssets().then((data) => setAssets(data.assets || [])).catch((reason) => setError(reason.message)); }, []);
  const scoped = useMemo(() => { const related = projectId ? assets.filter((item) => item.project_id === projectId || item.asset_id === projectId) : assets; return related.length ? related : assets; }, [assets, projectId]);
  const project = scoped.find((item) => item.asset_type === "project");
  return <section className="sino-lifecycle-center sino-system-structure" aria-label="系统构建器">
    <header><div><span className="sino-kicker">System Builder</span><h1>{project ? businessAssetName(project) : "系统构建器"}</h1><p>组织 Project、能力资产与依赖关系，回答“这个系统现在由什么组成”。</p></div></header>
    {error && <p role="alert">{error}</p>}
    <div className="sino-lifecycle-grid"><div className="sino-system-structure__list">{STRUCTURE.map((type) => { const items = scoped.filter((item) => item.asset_type === type); return <section key={type} data-present={Boolean(items.length)}><header><span>{items.length ? "✓" : "Missing"}</span><strong>{objectTypeLabel(type)}</strong><small>{items.length ? `${items.length} 个正式资产` : "当前系统尚未形成"}</small></header>{items.map((item) => <button key={item.asset_id} onClick={() => setSelected(item)}><strong>{businessAssetName(item)}</strong><small>{statusLabel(item.status)} · V{item.version || 1}</small></button>)}</section>; })}</div>
      <aside className="sino-asset-detail">{selected ? <><span className="sino-kicker">系统关系对象</span><h2>{businessAssetName(selected)}</h2><p>{businessPurpose(selected)}</p><dl><div><dt>类型</dt><dd>{objectTypeLabel(selected.asset_type)}</dd></div><div><dt>Project</dt><dd>{selected.project_id || "未关联"}</dd></div><div><dt>依赖</dt><dd>{referenceSummary(selected.dependency_refs)}</dd></div><div><dt>被引用</dt><dd>{referenceSummary(selected.used_by_refs)}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div></dl><button className="sino-inline-action" onClick={() => onOpenAsset?.(selected)}>查看正式资产</button></> : <div className="sino-inspector-empty"><h2>系统结构</h2><p>绿色项目已形成真实资产；Missing 表示当前 Project 仍缺少该组成部分。</p></div>}</aside></div>
  </section>;
}
