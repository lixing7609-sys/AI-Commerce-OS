import { useApiState, PlaceholderCard, StatCard } from "@sinofut/ui";
import { api } from "@sinofut/domain";

function fmtCNY(value) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

export function Cockpit() {
  const { state, refresh } = useApiState();

  if (!state) return <p>加载中…</p>;

  const totalProfit = state.profits.reduce((sum, p) => sum + p.netProfit, 0);
  const pendingApprovals = state.approvals.filter((a) => a.status === "pending");

  const decide = async (id, decision) => {
    await api.decideApproval(id, decision);
    refresh();
  };

  return (
    <div>
      <div className="sf-page-header">
        <h1>经营驾驶舱</h1>
        <p>今天有什么机会？今天生产什么？今天经营什么？流量从哪里来？今天利润是多少？哪些能力需要升级？</p>
      </div>

      <div className="sf-cockpit-grid">
        <div className="sf-card">
          <h3>今日机会</h3>
          <span className="sf-cockpit-question">Opportunity</span>
          {state.opportunities.map((o) => (
            <div key={o.id} className="sf-opportunity-item">
              <h4>{o.title}</h4>
              <div className="sf-opportunity-meta">
                <span>置信度 {(o.confidence * 100).toFixed(0)}%</span>
                <span className="sf-badge">{o.status}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sf-card">
          <h3>今日生产</h3>
          <span className="sf-cockpit-question">Content · Strategy</span>
          {state.content.length === 0 && <p>暂无生产中的内容，前往 Studio 无限画布创建</p>}
          {state.content.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.title}</h4>
              <div className="sf-opportunity-meta">
                <span className="sf-badge">{c.stage}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sf-card">
          <h3>今日经营</h3>
          <span className="sf-cockpit-question">Task · Order</span>
          <p>待办任务 {state.tasks.length} 项，待结算订单 {state.orders.filter((o) => o.status === "unsettled").length} 笔</p>
          {state.tasks.slice(-3).reverse().map((t) => (
            <div key={t.id} className="sf-opportunity-item">
              <h4>{t.title}</h4>
            </div>
          ))}
        </div>

        <PlaceholderCard
          mission="回答「今天流量从哪里来」——汇总 Growth 的 Campaign/Ad 与私域渠道贡献"
          coreObjects={["Campaign", "Ad", "Customer（私域标签）"]}
          upstream="Growth 增长网络的机会评估与渠道建设"
          downstream="Operator 经营中心的广告投放与私域运营"
          sinoActions={["汇总本周流量来源占比", "识别流量成本异常"]}
          status="Campaign/Ad 领域对象尚未建模，当前以发布渠道曝光/点击作为过渡代理指标"
          loopRelation="Growth → Operator 流量交付环节"
          nextSteps={["定义 Campaign/Ad 对象与 API", "接入真实渠道归因"]}
        >
          <div>
            {state.publishes.map((p) => (
              <div key={p.id} className="sf-opportunity-item">
                <h4>{p.channel}</h4>
                <div className="sf-opportunity-meta">
                  <span>曝光 {p.impressions}</span>
                  <span>点击 {p.clicks}</span>
                  <span>询盘 {p.leads}</span>
                </div>
              </div>
            ))}
            {state.publishes.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无发布记录</p>}
          </div>
        </PlaceholderCard>

        <StatCard label="今日利润（内部结算口径）" value={fmtCNY(totalProfit)} hint={`累计 ${state.profits.length} 笔已结算订单`} />

        <div className="sf-card">
          <h3>能力升级</h3>
          <span className="sf-cockpit-question">Capability · Version</span>
          {state.capabilities.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.name}</h4>
              <div className="sf-opportunity-meta">
                <span className={`sf-badge ${c.status === "validated" ? "success" : c.status === "validating" ? "warn" : ""}`}>
                  {c.status}
                </span>
                <span>连续 {c.consecutiveDays} 天</span>
              </div>
              {c.latestSuggestion && <p style={{ fontSize: 13 }}>{c.latestSuggestion}</p>}
            </div>
          ))}
        </div>
      </div>

      <h2 className="sf-section-title">待审批（Human Approval）</h2>
      <div className="sf-grid sf-grid-2">
        {pendingApprovals.length === 0 && <p>暂无待审批事项</p>}
        {pendingApprovals.map((a) => (
          <div key={a.id} className="sf-card">
            <h4>审批 {a.id}</h4>
            <p>{a.aiSuggestion}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="sf-button-primary" onClick={() => decide(a.id, "approved")}>
                通过
              </button>
              <button type="button" className="sf-icon-button" onClick={() => decide(a.id, "rejected")}>
                驳回
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
