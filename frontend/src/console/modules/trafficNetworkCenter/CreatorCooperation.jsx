import { useState } from "react";
import { useToast } from "../../kit/useToast.js";
import { getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";
import { AccountsTable } from "./AccountsTable.jsx";
import { Button } from "../../kit/Button.jsx";

export function CreatorCooperation() {
  const toast = useToast();
  const [state] = useState(() => getTrafficNetworkState());
  const accounts = state.accounts.filter((a) => a.accountType === "koc" || a.accountType === "creator");

  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: -8 }}>
        达人 / KOC 合作——外部创作者是流量网络的重要节点，通过带货分成、内容共创等方式接入网络。
      </p>
      <div className="fdr-card">
        <AccountsTable accounts={accounts} emptyMessage="暂无达人 / KOC 合作" />
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">合作动作（演示）</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => toast("已发起合作邀约（演示）", "success")}>发起合作邀约</Button>
          <Button variant="secondary" onClick={() => toast("已生成合作简报（演示）", "success")}>生成合作简报</Button>
          <Button variant="secondary" onClick={() => toast("已同步分成规则（演示）", "success")}>同步分成规则</Button>
        </div>
      </div>
    </div>
  );
}
