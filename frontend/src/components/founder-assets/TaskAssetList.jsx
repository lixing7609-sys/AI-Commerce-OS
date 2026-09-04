import { useEffect, useState } from "react";
import { getTaskAssets } from "../../services/taskAssetApi.js";
import "./founderAssets.css";

export function TaskAssetList() {
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  useEffect(() => {
    let active = true;
    getTaskAssets()
      .then((items) => active && setState({ loading: false, error: null, items }))
      .catch((error) => active && setState({ loading: false, error, items: [] }));
    return () => { active = false; };
  }, []);

  return (
    <AssetView title="任务资产" subtitle="Founder AI 的 canonical TaskAsset">
      {state.loading ? <AssetState>正在加载任务资产…</AssetState> : null}
      {!state.loading && state.error ? <AssetState error>任务资产加载失败，请稍后重试。</AssetState> : null}
      {!state.loading && !state.error && state.items.length === 0 ? <AssetState>暂无任务资产。</AssetState> : null}
      {!state.loading && !state.error && state.items.length > 0 ? (
        <div className="founder-assets-list" data-testid="task-asset-list">
          {state.items.map((item) => <TaskAssetCard key={item.id} item={item} />)}
        </div>
      ) : null}
    </AssetView>
  );
}

function TaskAssetCard({ item }) {
  return <article className="founder-asset-card"><h2 className="founder-asset-card__title">{item.title}</h2><dl className="founder-asset-card__meta"><div><dt>描述</dt><dd>{item.description || "—"}</dd></div><div><dt>状态</dt><dd>{item.status}</dd></div><div><dt>授权状态</dt><dd>{item.approval_status}</dd></div><div><dt>执行状态</dt><dd>{item.execution_status}</dd></div></dl></article>;
}

export function AssetView({ title, subtitle, children }) {
  return <div className="founder-assets-view"><header className="founder-assets-view__header"><h1 className="founder-assets-view__title">{title}</h1><p className="founder-assets-view__subtitle">{subtitle}</p></header>{children}</div>;
}

export function AssetState({ children, error = false }) {
  return <div className={`founder-assets-view__state${error ? " founder-assets-view__error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
