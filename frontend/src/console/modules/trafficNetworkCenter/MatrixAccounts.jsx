import { useState } from "react";
import { ACCOUNT_TYPES, getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";
import { AccountsTable } from "./AccountsTable.jsx";

const MATRIX_TYPES = ACCOUNT_TYPES.filter((t) => t.group === "matrix");

export function MatrixAccounts() {
  const [state] = useState(() => getTrafficNetworkState());
  const [typeFilter, setTypeFilter] = useState("");

  const accounts = state.accounts.filter((a) => {
    if (a.accountType === "official_brand" || a.accountType === "koc" || a.accountType === "creator") return false;
    if (typeFilter && a.accountType !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        矩阵账号——行业账号、类目账号、运营者账号、短剧账号、AI教育账号、直播账号，共同组成流量网络的分发层。
      </p>
      <div className="fdr-card">
        <div className="fdr-field" style={{ margin: 0, maxWidth: 220 }}>
          <label className="fdr-field__label">按类型筛选</label>
          <select className="fdr-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部矩阵类型</option>
            {MATRIX_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="fdr-card">
        <AccountsTable accounts={accounts} emptyMessage="当前筛选条件下暂无矩阵账号" />
      </div>
    </div>
  );
}
