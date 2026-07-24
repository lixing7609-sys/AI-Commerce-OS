import { useState } from "react";

import { createShop, updateShop } from "../../services/shopApi";
import { PLATFORM_OPTIONS } from "./shopLabels";

const AUTH_TYPE_OPTIONS = [
  { value: "manual", label: "手动填写凭据" },
  { value: "oauth", label: "OAuth 授权（尚未接入）" },
  { value: "none", label: "暂不设置" },
];

/**
 * 新增/编辑店铺资料表单（阶段 8E）。
 *
 * 不在本表单中处理 Secret——凭据填写是保存店铺资料成功之后的
 * 独立步骤（ShopCredentialsForm），与"店铺资料"完全解耦，符合
 * "缺少加密密钥时普通店铺资料仍可保存"的要求。
 */
function ShopFormDialog({ mode, initialShop = null, onSaved, onCancel }) {
  const isEdit = mode === "edit";

  const [platform, setPlatform] = useState(initialShop?.platform ?? "other");
  const [shopName, setShopName] = useState(initialShop?.shop_name ?? "");
  const [platformShopId, setPlatformShopId] = useState(
    initialShop?.platform_shop_id ?? ""
  );
  const [legalEntityName, setLegalEntityName] = useState(
    initialShop?.legal_entity_name ?? ""
  );
  const [region, setRegion] = useState(initialShop?.region ?? "");
  const [currency, setCurrency] = useState(initialShop?.currency ?? "");
  const [timezone, setTimezone] = useState(initialShop?.timezone ?? "");
  const [authType, setAuthType] = useState(initialShop?.auth_type ?? "manual");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const trimmedShopName = shopName.trim();
  const canSubmit = trimmedShopName.length > 0 && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      if (isEdit) {
        const updated = await updateShop(initialShop.id, {
          shop_name: trimmedShopName,
          platform_shop_id: platformShopId || null,
          legal_entity_name: legalEntityName || null,
          region: region || null,
          currency: currency || null,
          timezone: timezone || null,
        });
        onSaved(updated);
      } else {
        const created = await createShop({
          platform,
          shop_name: trimmedShopName,
          platform_shop_id: platformShopId || null,
          legal_entity_name: legalEntityName || null,
          region: region || null,
          currency: currency || null,
          timezone: timezone || null,
          auth_type: authType,
        });
        onSaved(created);
      }
    } catch (err) {
      setError(
        err.status === 409
          ? "该平台下的店铺编号已存在，请检查平台店铺 ID 是否重复。"
          : "保存店铺失败，请检查填写内容后重试。"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="shop-form" onSubmit={handleSubmit}>
      {error && <div className="shop-form-alert error">{error}</div>}

      {!isEdit && (
        <div className="shop-form-field">
          <label htmlFor="shop-platform">平台</label>
          <select
            id="shop-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            disabled={saving}
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="shop-form-field">
        <label htmlFor="shop-name">店铺名称</label>
        <input
          id="shop-name"
          value={shopName}
          maxLength={255}
          disabled={saving}
          onChange={(event) => setShopName(event.target.value)}
          placeholder="例如：星辰家居抖音旗舰店"
        />
      </div>

      <div className="shop-form-field">
        <label htmlFor="shop-platform-id">平台店铺 ID（可选）</label>
        <input
          id="shop-platform-id"
          value={platformShopId}
          maxLength={255}
          disabled={saving}
          onChange={(event) => setPlatformShopId(event.target.value)}
        />
      </div>

      <div className="shop-form-field">
        <label htmlFor="shop-legal-entity">主体公司（可选）</label>
        <input
          id="shop-legal-entity"
          value={legalEntityName}
          maxLength={255}
          disabled={saving}
          onChange={(event) => setLegalEntityName(event.target.value)}
        />
      </div>

      <div className="shop-form-row">
        <div className="shop-form-field">
          <label htmlFor="shop-region">地区</label>
          <input
            id="shop-region"
            value={region}
            maxLength={100}
            disabled={saving}
            onChange={(event) => setRegion(event.target.value)}
          />
        </div>

        <div className="shop-form-field">
          <label htmlFor="shop-currency">币种</label>
          <input
            id="shop-currency"
            value={currency}
            maxLength={10}
            disabled={saving}
            onChange={(event) => setCurrency(event.target.value)}
            placeholder="CNY"
          />
        </div>

        <div className="shop-form-field">
          <label htmlFor="shop-timezone">时区</label>
          <input
            id="shop-timezone"
            value={timezone}
            maxLength={50}
            disabled={saving}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Asia/Shanghai"
          />
        </div>
      </div>

      {!isEdit && (
        <div className="shop-form-field">
          <label htmlFor="shop-auth-type">授权方式</label>
          <select
            id="shop-auth-type"
            value={authType}
            disabled={saving}
            onChange={(event) => setAuthType(event.target.value)}
          >
            {AUTH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {authType === "oauth" && (
            <p className="shop-form-hint">当前平台 OAuth 连接器尚未接入。</p>
          )}
          {authType === "manual" && (
            <p className="shop-form-hint">
              保存店铺后，可在详情页"连接与授权"标签中填写凭据（可选）。
            </p>
          )}
        </div>
      )}

      <div className="shop-form-actions">
        <button type="button" className="os-btn" onClick={onCancel} disabled={saving}>
          取消
        </button>
        <button type="submit" className="os-btn primary" disabled={!canSubmit}>
          {saving ? "保存中…" : "保存店铺"}
        </button>
      </div>
    </form>
  );
}

export default ShopFormDialog;
