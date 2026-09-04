import { useEffect, useMemo, useState } from "react";
import { getAssetMemoryCenter, getLifecycleAssets } from "../services/founderAiApi.js";
import { businessAssetName, businessPurpose } from "./assetPresentation.js";

export const LIBRARY_FILTERS = [
  ["all", "全部"], ["agent", "Agent"], ["skill", "Skill"], ["workflow", "Workflow"],
  ["prompt", "Prompt"], ["capability", "Capability"], ["image", "图片"], ["document", "文档"],
];

const CORE_TYPES = new Set(["agent", "skill", "workflow", "prompt", "capability"]);
const imageArtifact = (item) => /image|png|jpe?g|webp|gif/i.test(`${item.artifact_type || ""} ${item.mime_type || ""}`);
const date = (value) => value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "暂无";

export function normalizeLibraryItems(assets = [], artifacts = []) {
  const records = new Map();
  assets.filter((item) => CORE_TYPES.has(item.asset_type)).forEach((item) => records.set(`asset:${item.asset_id}`, {
    id: item.asset_id,
    key: `asset:${item.asset_id}`,
    type: item.asset_type,
    typeLabel: LIBRARY_FILTERS.find(([key]) => key === item.asset_type)?.[1] || item.asset_type,
    name: businessAssetName(item),
    description: businessPurpose(item),
    version: item.version || 1,
    updatedAt: item.updated_at || item.created_at,
    source: item,
  }));
  artifacts.forEach((item) => {
    const type = imageArtifact(item) ? "image" : "document";
    const id = item.artifact_id || item.id;
    records.set(`artifact:${id}`, {
      id,
      key: `artifact:${id}`,
      type,
      typeLabel: type === "image" ? "图片" : "文档",
      name: item.title || item.name || id,
      description: item.summary || item.description || item.artifact_type || "已持久化成果",
      version: item.version || 1,
      updatedAt: item.updated_at || item.created_at,
      source: item,
    });
  });
  return [...records.values()].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

export function LibraryWorkspace() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([getLifecycleAssets("", true), getAssetMemoryCenter()])
      .then(([assets, center]) => { if (active) setItems(normalizeLibraryItems(assets.assets || [], center.artifacts || [])); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  const visible = useMemo(() => filter === "all" ? items : items.filter((item) => item.type === filter), [filter, items]);
  if (selected) return <section className="sino-founder-library-workspace" aria-label="库工作区"><button type="button" className="sino-library-back" onClick={() => setSelected(null)}>返回库</button><article className="sino-library-detail"><span>{selected.typeLabel}</span><h1>{selected.name}</h1><p>{selected.description}</p><dl><div><dt>版本</dt><dd>V{selected.version}</dd></div><div><dt>更新时间</dt><dd>{date(selected.updatedAt)}</dd></div><div><dt>资产 ID</dt><dd>{selected.id}</dd></div></dl></article></section>;
  return <section className="sino-founder-library-workspace" aria-label="库工作区">
    <nav className="sino-library-filters" aria-label="库资产分类">{LIBRARY_FILTERS.map(([key, label]) => <button type="button" key={key} className={filter === key ? "is-active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    {error ? <p role="alert">{error}</p> : null}
    <div className="sino-library-grid" aria-label="资产卡片网格">{visible.length ? visible.map((item) => <button type="button" className="sino-library-card" data-asset-type={item.type} key={item.key} onClick={() => setSelected(item)}><span>{item.typeLabel}</span><strong>{item.name}</strong><p>{item.description}</p><footer><small>V{item.version}</small><time>{date(item.updatedAt)}</time></footer></button>) : <p className="sino-library-empty">暂无相关资产</p>}</div>
  </section>;
}
