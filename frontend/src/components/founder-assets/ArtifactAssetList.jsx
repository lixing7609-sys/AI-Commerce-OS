import { useEffect, useState } from "react";
import { getArtifacts } from "../../services/artifactApi.js";
import { AssetState, AssetView } from "./TaskAssetList.jsx";
import "./founderAssets.css";

export function ArtifactAssetList() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  useEffect(() => {
    let active = true;
    getArtifacts().then((items) => active && setState({ loading: false, error: null, items })).catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => { active = false; };
  }, []);
  return <AssetView title="成果资产" subtitle="Founder AI 的 canonical ArtifactAsset">{state.loading ? <AssetState>正在加载成果资产…</AssetState> : null}{!state.loading && state.error ? <AssetState error>成果资产加载失败，请稍后重试。</AssetState> : null}{!state.loading && !state.error && state.items.length === 0 ? <AssetState>暂无成果资产。</AssetState> : null}{!state.loading && !state.error && state.items.length > 0 ? <div className="founder-assets-list" data-testid="artifact-asset-list">{state.items.map((item) => <article className="founder-asset-card" key={item.id}><h2 className="founder-asset-card__title">{item.title}</h2><dl className="founder-asset-card__meta"><div><dt>类型</dt><dd>{item.artifact_type}</dd></div><div><dt>版本</dt><dd>{item.version}</dd></div><div><dt>状态</dt><dd>{item.status}</dd></div><div><dt>位置</dt><dd>{item.location || "—"}</dd></div></dl></article>)}</div> : null}</AssetView>;
}
