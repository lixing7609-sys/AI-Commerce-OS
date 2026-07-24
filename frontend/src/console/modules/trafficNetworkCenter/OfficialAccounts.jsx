import { useState } from "react";
import { getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";
import { AccountsTable } from "./AccountsTable.jsx";

export function OfficialAccounts() {
  const [state] = useState(() => getTrafficNetworkState());
  const accounts = state.accounts.filter((a) => a.accountType === "official_brand");

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        品牌官方账号——代表 AI Commerce OS / 店铺品牌本身发声的账号，是流量网络的锚点。
      </p>
      <div className="fdr-card">
        <AccountsTable accounts={accounts} emptyMessage="暂无官方账号" />
      </div>
    </div>
  );
}
