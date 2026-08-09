import { useEffect, useState } from "react";
import { getMemories } from "../../services/memoryApi.js";
import { AssetState, AssetView } from "./TaskAssetList.jsx";
import "./founderAssets.css";

export function MemoryAssetList() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  useEffect(() => {
    let active = true;
    getMemories().then((items) => active && setState({ loading: false, error: null, items })).catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => { active = false; };
  }, []);
  return <AssetView title="记忆资产" subtitle="Founder AI 的 canonical MemoryAsset">{state.loading ? <AssetState>正在加载记忆资产…</AssetState> : null}{!state.loading && state.error ? <AssetState error>记忆资产加载失败，请稍后重试。</AssetState> : null}{!state.loading && !state.error && state.items.length === 0 ? <AssetState>暂无记忆资产。</AssetState> : null}{!state.loading && !state.error && state.items.length > 0 ? <div className="founder-assets-list" data-testid="memory-asset-list">{state.items.map((item) => <article className="founder-asset-card" key={item.id}><h2 className="founder-asset-card__title">{item.title}</h2><dl className="founder-asset-card__meta"><div><dt>类型</dt><dd>{item.memory_type}</dd></div><div><dt>摘要</dt><dd>{item.summary || "—"}</dd></div><div><dt>置信度</dt><dd>{item.confidence ?? "—"}</dd></div><div><dt>状态</dt><dd>{item.status}</dd></div></dl></article>)}</div> : null}</AssetView>;
}
