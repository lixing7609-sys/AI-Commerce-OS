import { useApiState } from "@sinofut/ui";

function Bar({ label, value, max, formatValue }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "var(--text-secondary)" }}>{formatValue ? formatValue(value) : value}</span>
      </div>
      <div style={{ background: "var(--surface-sunken)", borderRadius: 6, overflow: "hidden", height: 10 }}>
        <div style={{ width: `${pct}%`, background: "var(--ai-accent)", height: "100%" }} />
      </div>
    </div>
  );
}

export function DataCenter() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  const statusCounts = state.opportunities.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const maxStatus = Math.max(1, ...Object.values(statusCounts));

  const maxProfit = Math.max(1, ...state.profits.map((p) => Math.abs(p.netProfit)), 1);

  return (
    <div>
      <div className="sf-page-header">
        <h1>数据中心</h1>
        <p>跨主体经营数据与分析（Growth / Studio / Operator 汇总视角）。</p>
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>机会漏斗</h3>
          {Object.entries(statusCounts).map(([status, count]) => (
            <Bar key={status} label={status} value={count} max={maxStatus} />
          ))}
          {Object.keys(statusCounts).length === 0 && <p>暂无数据</p>}
        </div>

        <div className="sf-card">
          <h3>利润归因（按订单）</h3>
          {state.profits.map((p) => (
            <Bar
              key={p.id}
              label={p.orderId}
              value={p.netProfit}
              max={maxProfit}
              formatValue={(v) => `¥${v.toLocaleString("zh-CN")}`}
            />
          ))}
          {state.profits.length === 0 && <p>暂无已结算利润</p>}
        </div>

        <div className="sf-card">
          <h3>能力使用效果</h3>
          {state.capabilities.map((c) => (
            <Bar
              key={c.id}
              label={c.name}
              value={c.internalSettlementValue}
              max={Math.max(1, ...state.capabilities.map((x) => x.internalSettlementValue))}
              formatValue={(v) => `¥${v.toLocaleString("zh-CN")}`}
            />
          ))}
        </div>

        <div className="sf-card">
          <h3>发布效果</h3>
          {state.publishes.map((p) => (
            <Bar
              key={p.id}
              label={p.channel}
              value={p.clicks}
              max={Math.max(1, ...state.publishes.map((x) => x.clicks))}
            />
          ))}
          {state.publishes.length === 0 && <p>暂无发布数据</p>}
        </div>
      </div>
    </div>
  );
}
