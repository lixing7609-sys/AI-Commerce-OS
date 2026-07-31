import { useApiState, PlaceholderCard } from "@sinofut/ui";

export function Marketplace() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  const validated = state.capabilities.filter((c) => c.status === "validated");
  const validating = state.capabilities.filter((c) => c.status !== "validated");

  return (
    <div>
      <div className="sf-page-header">
        <h1>Marketplace</h1>
        <p>已验证能力/内容/流量/服务的交易市场。Operator 在此采购能力、流量、内容与第三方服务。</p>
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>已验证能力（可上架）</h3>
          {validated.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无已验证能力</p>}
          {validated.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.name}</h4>
              <span className="sf-badge success">已验证 · 内部结算净值 ¥{c.internalSettlementValue.toLocaleString("zh-CN")}</span>
            </div>
          ))}
        </div>
        <div className="sf-card">
          <h3>待验证能力</h3>
          {validating.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.name}</h4>
              <span className="sf-badge warn">连续 {c.consecutiveDays} 天</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="sf-section-title">交易分区</h2>
      <div className="sf-grid sf-grid-2">
        <PlaceholderCard
          mission="Agent 能力上架与采购"
          coreObjects={["Agent", "Capability"]}
          upstream="能力中心的已验证 Agent"
          downstream="Operator 采购"
          sinoActions={["推荐适合 Operator 当前场景的 Agent"]}
          status="待建模：定价/授权模型"
          loopRelation="能力流转 → Marketplace"
          nextSteps={["定义定价模型（一次性/订阅/分成）"]}
        />
        <PlaceholderCard
          mission="Workflow 能力包上架与采购"
          coreObjects={["Workflow", "Capability"]}
          upstream="能力中心"
          downstream="Operator 采购"
          sinoActions={["展示 Workflow 历史执行成功率"]}
          status="待建模"
          loopRelation="能力流转 → Marketplace"
          nextSteps={["定义 Workflow 包装粒度"]}
        />
        <PlaceholderCard
          mission="内容与流量服务市场（原 Operator Cloud 职责并入于此，见 07-foundation-review.md）"
          coreObjects={["Content", "Campaign"]}
          upstream="Studio / Growth"
          downstream="Operator 采购"
          sinoActions={["按内部结算价推荐性价比最高的内容/流量包"]}
          status="待建模：定价与授权状态"
          loopRelation="Studio/Growth → Operator"
          nextSteps={["定义内容授权模型", "定义流量包定价"]}
        />
        <PlaceholderCard
          mission="第三方服务市场（未来外部买家/服务商）"
          coreObjects={["Connector", "Capability"]}
          upstream="外部服务商"
          downstream="Operator 采购"
          sinoActions={["校验第三方服务的 Connector 鉴权状态"]}
          status="待建模：外部交易佣金机制"
          loopRelation="生态层对外开放边界"
          nextSteps={["定义外部交易佣金与结算流程"]}
        />
      </div>
    </div>
  );
}
