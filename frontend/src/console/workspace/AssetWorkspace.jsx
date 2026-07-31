import "./workspace.css";

/**
 * Asset Workspace — 图片/视频/音频/角色/品牌/知识/Prompt/Skill 等
 * 资产管理。语法：左侧 facet 筛选 + 中央缩略图网格（视觉优先，不是
 * 表格行）+ 右侧详情栏（选中资产时出现）。
 */
export function AssetWorkspace({ title, subtitle, actions, facets, assets, activeAssetId, onSelectAsset, inspector }) {
  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      <div className="ws-body">
        {facets ? <div className="ws-asset__facets">{facets}</div> : null}
        <div className="ws-asset__grid">
          {(assets ?? []).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={"ws-asset__tile" + (asset.id === activeAssetId ? " ws-asset__tile--active" : "")}
              onClick={() => onSelectAsset?.(asset.id)}
            >
              <div className="ws-asset__tile-thumb">{asset.icon ?? "▤"}</div>
              <div className="ws-asset__tile-meta">
                <div className="ws-asset__tile-title">{asset.title}</div>
                <div className="ws-asset__tile-sub">{asset.sub}</div>
              </div>
            </button>
          ))}
        </div>
        {inspector ? <div className="ws-asset__inspector">{inspector}</div> : null}
      </div>
    </div>
  );
}

export function AssetFacetGroup({ label, options, activeValue, onChange }) {
  return (
    <div className="ws-asset__facet-group">
      <div className="ws-asset__facet-label">{label}</div>
      {options.map((opt) => (
        <div
          key={opt.value}
          className={"ws-asset__facet-option" + (opt.value === activeValue ? " ws-asset__facet-option--active" : "")}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
