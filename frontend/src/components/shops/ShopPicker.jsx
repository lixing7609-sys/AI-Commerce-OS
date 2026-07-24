import { getPlatformLabel } from "./shopLabels";

/**
 * 创建任务 / 基于成果创建任务表单专用的店铺选择器（阶段 8E）。
 *
 * 与 ShopScopeSelector 的关键区别：不提供"全部店铺"选项——任务
 * 必须明确绑定到某个具体（active）店铺，或明确选择"未绑定店铺"，
 * 不允许用模糊的"全部店铺"作为 shop_id 传给后端。
 */
function ShopPicker({ value, onChange, shops = [], disabled = false, id }) {
  const activeShops = shops.filter((shop) => shop.status === "active");

  return (
    <select
      id={id}
      value={value === null || value === undefined ? "" : value}
      disabled={disabled}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
    >
      <option value="">未绑定店铺</option>
      {activeShops.map((shop) => (
        <option key={shop.id} value={shop.id}>
          {shop.shop_name}（{getPlatformLabel(shop.platform)}）
        </option>
      ))}
    </select>
  );
}

export default ShopPicker;
