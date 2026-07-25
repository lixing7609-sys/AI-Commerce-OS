import { usePreview, ALL_SHOPS_SCOPE, UNASSIGNED_SHOP_SCOPE } from "../helpers/previewContextCore";

function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 经营驾驶舱顶部条：店铺范围切换 + 演示/真实数据切换 + 刷新 +
 * 一键开始运营入口（阶段：产品原型）。
 */
function TopScopeBar({ lastUpdated, onRefresh, onStartOperating }) {
  const { dataMode, setDataMode, shopScope, setShopScope, shops } = usePreview();

  return (
    <div className="op-top-scope-bar">
      <div className="op-top-scope-left">
        <label className="op-scope-field">
          <span>当前经营范围</span>
          <select
            value={shopScope}
            onChange={(event) => setShopScope(event.target.value)}
          >
            <option value={ALL_SHOPS_SCOPE}>全部店铺</option>
            <option value={UNASSIGNED_SHOP_SCOPE}>未绑定店铺</option>
            {shops.map((shop) => (
              <option key={shop.id ?? shop.shop_code} value={shop.id ?? shop.shop_code}>
                {shop.name ?? shop.shop_name}
              </option>
            ))}
          </select>
        </label>

        <div className="op-data-mode-toggle" role="group" aria-label="数据模式">
          <button
            type="button"
            className={dataMode === "demo" ? "active" : ""}
            onClick={() => setDataMode("demo")}
          >
            演示经营数据
          </button>
          <button
            type="button"
            className={dataMode === "real" ? "active" : ""}
            onClick={() => setDataMode("real")}
          >
            真实系统数据
          </button>
        </div>
      </div>

      <div className="op-top-scope-right">
        <span className="op-last-updated">最后更新 {formatTime(lastUpdated)}</span>
        <button type="button" className="op-btn" onClick={onRefresh}>
          刷新
        </button>
        <button type="button" className="op-btn primary" onClick={onStartOperating}>
          一键开始运营
        </button>
      </div>
    </div>
  );
}

export default TopScopeBar;
