import { useFounderAI } from "../useFounderAI.js";

export function FavoritesView() {
  const { favorites, toggleFavorite } = useFounderAI();

  return (
    <div className="founder-ai-view-shell">
      <div className="founder-ai-stack">
        {favorites.map((f) => (
          <div key={f.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{f.title}</h3>
              <span className="sf-badge">{f.type}</span>
            </div>
            <div className="founder-ai-actions">
              <button type="button" className="sf-icon-button" onClick={() => toggleFavorite(f)}>
                取消收藏
              </button>
            </div>
          </div>
        ))}
        {favorites.length === 0 && (
          <p className="founder-ai-empty">暂无收藏。可在技术雷达、历史等页面点击"收藏"添加。</p>
        )}
      </div>
    </div>
  );
}
