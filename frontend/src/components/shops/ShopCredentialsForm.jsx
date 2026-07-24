import { useState } from "react";

import {
  deleteShopCredential,
  updateShopCredentials,
} from "../../services/shopApi";
import { CREDENTIAL_FIELD_ORDER, getCredentialTypeLabel } from "./shopLabels";

const EMPTY_DRAFT = CREDENTIAL_FIELD_ORDER.reduce((acc, key) => {
  acc[key] = "";
  return acc;
}, {});

/**
 * 店铺凭据编辑表单（阶段 8E）。
 *
 * Secret 输入体验安全要求：
 * - 全部使用 type="password"；
 * - 保存成功后立即清空本组件内部草稿 state（不长期保留在前端
 *   状态中，浏览器刷新后组件重新挂载也不会恢复任何值——草稿只
 *   存在于 useState，不写 localStorage/URL/console）；
 * - 已配置的凭据只显示 value_mask（例如 "****abcd"），不显示、
 *   不请求原始值；
 * - 留空的输入框提交时不会出现在请求体里（由 buildPayload 过滤），
 *   代表"不修改"。
 */
function ShopCredentialsForm({ shopId, credentials, onSaved, disabled = false }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deletingType, setDeletingType] = useState(null);
  const [error, setError] = useState(null);

  const configuredByType = new Map(
    credentials.map((item) => [item.credential_type, item])
  );

  function handleFieldChange(fieldName, value) {
    setDraft((prev) => ({ ...prev, [fieldName]: value }));
    setError(null);
  }

  function buildPayload() {
    const payload = {};
    for (const key of CREDENTIAL_FIELD_ORDER) {
      const value = draft[key];
      if (typeof value === "string" && value.trim().length > 0) {
        payload[key] = value;
      }
    }
    return payload;
  }

  async function handleSave(event) {
    event.preventDefault();
    const payload = buildPayload();

    if (Object.keys(payload).length === 0) {
      setError("请至少填写一项凭据后再保存，留空的字段不会被修改。");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateShopCredentials(shopId, payload);
      // 保存成功后立即清空草稿，不在前端状态中保留任何 Secret 原值。
      setDraft(EMPTY_DRAFT);
      onSaved();
    } catch (err) {
      setError(err.status === 503 ? "Secret 加密未配置，无法保存凭据，请联系管理员配置加密密钥。" : "保存凭据失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(credentialType) {
    setDeletingType(credentialType);
    setError(null);

    try {
      await deleteShopCredential(shopId, credentialType);
      onSaved();
    } catch {
      setError("删除凭据失败，请稍后重试。");
    } finally {
      setDeletingType(null);
    }
  }

  return (
    <form className="shop-credentials-form" onSubmit={handleSave}>
      {error && <div className="shop-form-alert error">{error}</div>}

      <div className="shop-credentials-grid">
        {CREDENTIAL_FIELD_ORDER.map((fieldName) => {
          const existing = configuredByType.get(fieldName);

          return (
            <div className="shop-credential-field" key={fieldName}>
              <label htmlFor={`credential-${fieldName}`}>
                {getCredentialTypeLabel(fieldName)}
              </label>

              {existing?.configured ? (
                <p className="shop-credential-configured">
                  已配置：{existing.value_mask}
                  <button
                    type="button"
                    className="shop-credential-delete-button"
                    onClick={() => handleDelete(fieldName)}
                    disabled={disabled || deletingType === fieldName}
                  >
                    {deletingType === fieldName ? "删除中…" : "删除"}
                  </button>
                </p>
              ) : (
                <p className="shop-credential-unset">未配置</p>
              )}

              <input
                id={`credential-${fieldName}`}
                type="password"
                autoComplete="new-password"
                placeholder={existing?.configured ? "留空表示不修改" : "填写后保存"}
                value={draft[fieldName]}
                disabled={disabled || saving}
                onChange={(event) => handleFieldChange(fieldName, event.target.value)}
              />
            </div>
          );
        })}
      </div>

      <button type="submit" className="os-btn primary" disabled={disabled || saving}>
        {saving ? "保存中…" : "保存凭据"}
      </button>
    </form>
  );
}

export default ShopCredentialsForm;
