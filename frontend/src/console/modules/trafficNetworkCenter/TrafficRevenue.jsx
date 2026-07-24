import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getTrafficNetworkState } from "../../mock/trafficNetworkMock.js";

export function TrafficRevenue() {
  const { navigate } = useConsoleNavContext();
  const [state] = useState(() => getTrafficNetworkState());
  const total = state.revenueRecords.reduce((sum, r) => sum + r.amountUsd, 0);

  return (
    <div>
      <StatGrid>
        <StatCard label="流量网络总收入（本月演示）" value={`$${total.toLocaleString()}`} />
        <StatCard label="广告收入" value={`$${state.revenueRecords.find((r) => r.category === "广告收入")?.amountUsd ?? 0}`} onClick={() => navigate("adCenter")} />
        <StatCard label="内容授权收入" value={`$${state.revenueRecords.find((r) => r.category === "内容授权收入")?.amountUsd ?? 0}`} />
      </StatGrid>

      <div className="fdr-card">
        <h3 className="fdr-card__title">收入构成</h3>
        <DataTable
          columns={[
            { key: "category", label: "收入类型" },
            { key: "amountUsd", label: "金额", render: (r) => `$${r.amountUsd.toLocaleString()}` },
            { key: "note", label: "说明" },
          ]}
          rows={state.revenueRecords}
        />
      </div>
      <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>以上收入均为演示数据，不构成真实财务记录，与 Token 中心 / 广告中心的真实余额相互独立。</p>
    </div>
  );
}
