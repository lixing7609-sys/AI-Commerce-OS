import { useEffect, useState } from "react";
import {
  ALL_SHOPS_SCOPE,
  UNASSIGNED_SHOP_SCOPE,
  getStoredShopScope,
  setStoredShopScope,
} from "../../store/shopScopeStore.js";
import { getShops } from "../../services/shopApi.js";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";

function formatClock(date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConsoleTopBar() {
  const { module } = useConsoleNavContext();
  const [now, setNow] = useState(() => new Date());
  const [shops, setShops] = useState([]);
  const [scope, setScope] = useState(() => getStoredShopScope());
  // AI 秘书是跨全部店铺的 Founder 级经营简报，默认就是全店汇总——
  // 店铺范围选择器在这个页面没有操作意义，故不渲染（阶段 Founder
  // UX Review V3）。其余模块仍然保留选择器。
  const showScopeSelector = module !== "secretary";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getShops()
      .then((data) => {
        if (!cancelled) setShops(Array.isArray(data) ? data : data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setShops([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleScopeChange(event) {
    const raw = event.target.value;
    const next =
      raw === ALL_SHOPS_SCOPE || raw === UNASSIGNED_SHOP_SCOPE ? raw : Number(raw);
    setScope(next);
    setStoredShopScope(next);
  }

  const activeShops = shops.filter((shop) => shop.status === "active");

  return (
    <header className="fdr-topbar">
      <div className="fdr-topbar__left">
        {showScopeSelector ? (
          <select className="fdr-scope-select" value={scope} onChange={handleScopeChange}>
            <option value={ALL_SHOPS_SCOPE}>全部店铺</option>
            <option value={UNASSIGNED_SHOP_SCOPE}>未绑定店铺</option>
            {activeShops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.shop_name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="fdr-topbar__right">
        <span className="fdr-topbar__clock">{formatClock(now)}</span>
        <span className="fdr-topbar__owner">
          <span className="fdr-topbar__owner-avatar">F</span>
          Founder
        </span>
      </div>
    </header>
  );
}
