import { ALL_SHOPS_SCOPE, UNASSIGNED_SHOP_SCOPE } from "../../store/shopScopeStore";
import { getPlatformLabel } from "./shopLabels";

/**
 * 全局店铺范围选择器（阶段 8E）。
 *
 * 只是一个受控下拉框：当前值和变更完全由父组件通过 props 驱动，
 * 组件本身不发起请求、不直接读写 localStorage（持久化由使用方
 * 调用 setStoredShopScope 完成），避免多处重复实现同步逻辑。
 *
 * "全部店铺"仅用于经营者查看跨店汇总，创建任务时不能选择此项
 * 作为 shop_id——需要具体店铺或"未绑定店铺"的场景应使用
 * ShopPicker（任务创建/成果继续派工表单专用），不是本组件。
 */
function ShopScopeSelector({ value, onChange, shops = [], disabled = false }) {
  const activeShops = shops.filter((shop) => shop.status === "active");

  return (
    <label className="shop-scope-selector">
      <span className="shop-scope-selector-label">当前店铺范围</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === ALL_SHOPS_SCOPE || raw === UNASSIGNED_SHOP_SCOPE) {
            onChange(raw);
          } else {
            onChange(Number(raw));
          }
        }}
      >
        <option value={ALL_SHOPS_SCOPE}>全部店铺（仅查看汇总）</option>
        <option value={UNASSIGNED_SHOP_SCOPE}>未绑定店铺</option>
        {activeShops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.shop_name}（{getPlatformLabel(shop.platform)}）
          </option>
        ))}
      </select>
    </label>
  );
}

export default ShopScopeSelector;
