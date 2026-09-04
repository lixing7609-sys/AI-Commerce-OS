import { AppShell, SinoFUTWidget, SinoWorkspace, PlaceholderCard, StatCard, useApiState, useSinoFullScreen } from "@sinofut/ui";
import { api, SINO_PERSONAS } from "@sinofut/domain";
import "./app.css";

const CROSS_APP_LINKS = [
  { label: "Founder", href: "http://localhost:5180" },
  { label: "Studio", href: "http://localhost:5182" },
  { label: "Operator Cloud", href: "http://localhost:5183" },
];

function fmtCNY(v) {
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

export default function App() {
  const { state, refresh } = useApiState();
  const { isFullScreenOpen, openFullScreen, closeFullScreen } = useSinoFullScreen();

  if (isFullScreenOpen) {
    return <SinoWorkspace persona={SINO_PERSONAS.operator} variant="overlay" onExit={closeFullScreen} />;
  }

  if (!state) {
    return (
      <AppShell appLabel="Operator" crossAppLinks={CROSS_APP_LINKS} onOpenFullScreen={openFullScreen}>
        <p>加载中…</p>
      </AppShell>
    );
  }

  const readyContent = state.content.filter((c) => c.stage === "ready");
  const unsettledOrders = state.orders.filter((o) => o.status === "unsettled");
  const totalRevenue = state.profits.reduce((s, p) => s + p.revenue, 0);
  const totalCost = state.profits.reduce((s, p) => s + p.contentCost + p.adCost + p.aiQuotaCost, 0);
  const totalProfit = state.profits.reduce((s, p) => s + p.netProfit, 0);

  const publish = async (contentId) => {
    await api.publish(contentId, "抖音（模拟渠道）");
    refresh();
  };

  const simulateConversion = async (publishId) => {
    await api.recordMetrics(publishId, {
      impressions: 8200,
      clicks: 340,
      leads: 21,
      adSpend: 260,
      orderValue: 1980,
    });
    refresh();
  };

  const settle = async (orderId) => {
    await api.settleOrder(orderId);
    refresh();
  };

  return (
    <AppShell appLabel="Operator · 经营中心" crossAppLinks={CROSS_APP_LINKS} onOpenFullScreen={openFullScreen}>
      <div className="sf-page-header">
        <h1>经营中心</h1>
        <p>店铺/商品/客户/广告/订单/客服/利润的真实经营执行层。</p>
      </div>

      <div className="sf-grid sf-grid-3" style={{ marginBottom: "var(--space-3)" }}>
        <StatCard label="收入" value={fmtCNY(totalRevenue)} />
        <StatCard label="成本（内容+广告+AI额度）" value={fmtCNY(totalCost)} />
        <StatCard label="利润" value={fmtCNY(totalProfit)} />
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>待发布内容</h3>
          {readyContent.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无待发布内容</p>}
          {readyContent.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.title}</h4>
              <button type="button" className="sf-button-primary" onClick={() => publish(c.id)}>
                发布到渠道
              </button>
            </div>
          ))}
        </div>

        <div className="sf-card">
          <h3>广告执行 / 发布中</h3>
          {state.publishes.map((p) => {
            const hasOrder = state.orders.some((o) => o.publishId === p.id);
            return (
              <div key={p.id} className="sf-opportunity-item">
                <h4>{p.channel}</h4>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  曝光 {p.impressions} · 点击 {p.clicks} · 询盘 {p.leads}
                </p>
                {!hasOrder && (
                  <button type="button" className="sf-button-primary" onClick={() => simulateConversion(p.id)}>
                    模拟询盘转化为订单
                  </button>
                )}
              </div>
            );
          })}
          {state.publishes.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无发布记录</p>}
        </div>

        <div className="sf-card">
          <h3>待处理订单</h3>
          {unsettledOrders.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无待结算订单</p>}
          {unsettledOrders.map((o) => (
            <div key={o.id} className="sf-opportunity-item">
              <h4>{o.id}</h4>
              <p style={{ fontSize: 13 }}>金额 {fmtCNY(o.revenue)}</p>
              <button type="button" className="sf-button-primary" onClick={() => settle(o.id)}>
                结算利润
              </button>
            </div>
          ))}
        </div>

        <div className="sf-card">
          <h3>已结算利润</h3>
          {state.profits.map((p) => (
            <div key={p.id} className="sf-opportunity-item">
              <h4>{p.orderId}</h4>
              <p style={{ fontSize: 13 }}>
                收入 {fmtCNY(p.revenue)} － 成本 {fmtCNY(p.contentCost + p.adCost + p.aiQuotaCost)} ＝
                净利 {fmtCNY(p.netProfit)}
              </p>
            </div>
          ))}
          {state.profits.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无已结算记录</p>}
        </div>

        <PlaceholderCard
          mission="管理店铺经营状态（在售/暂停/异常）"
          coreObjects={["Store"]}
          upstream="Founder/Operator 开店决策"
          downstream="商品上架、客户运营"
          sinoActions={["检测店铺异常（限流/违规）"]}
          status="待建模"
          loopRelation="经营执行基础对象"
          nextSteps={["定义 Store 对象与状态机"]}
        />
        <PlaceholderCard
          mission="管理商品上下架状态"
          coreObjects={["Product"]}
          upstream="Growth 选品机会"
          downstream="发布渠道"
          sinoActions={["检测滞销/断货风险"]}
          status="待建模"
          loopRelation="选品 → 上架 → 经营"
          nextSteps={["定义 Product 对象"]}
        />
        <PlaceholderCard
          mission="管理客服任务队列"
          coreObjects={["Customer", "Task"]}
          upstream="终端客户咨询"
          downstream="客户满意度/复购"
          sinoActions={["自动分类客服工单优先级"]}
          status="待建模"
          loopRelation="经营执行"
          nextSteps={["定义客服工单对象"]}
        />
        <PlaceholderCard
          mission="展示经营异常提醒（库存/资金/合规）"
          coreObjects={["Task", "Approval"]}
          upstream="全部经营对象的状态变化"
          downstream="Founder 驾驶舱风险提醒"
          sinoActions={["按风险等级排序异常"]}
          status="待建模"
          loopRelation="经营执行 → Founder 验证"
          nextSteps={["定义异常检测规则"]}
        />
      </div>

      <SinoFUTWidget onOpen={openFullScreen} />
    </AppShell>
  );
}
