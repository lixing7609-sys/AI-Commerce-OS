import { DemoBadge } from "../../kit/StatusPill.jsx";
import { AGENT_CATEGORIES, getAgentTemplatesByCategory } from "../../mock/agentTemplatesMock.js";

const CHAIN_STAGES = [
  { key: "trend", label: "热点 / 趋势 Agent", categoryKeys: ["trend"] },
  { key: "content", label: "内容 Agent", categoryKeys: ["content"] },
  { key: "traffic", label: "流量网络 Agent", categoryKeys: ["traffic"] },
  { key: "live", label: "直播 Agent", categoryKeys: ["live"] },
  { key: "advertising", label: "广告 Agent（沿用现有 Agent，如销售 Agent）", categoryKeys: [] },
  { key: "order", label: "订单 Agent（沿用现有 Agent）", categoryKeys: [] },
  { key: "customerService", label: "客服 Agent（日常客服 + 售后客服）", categoryKeys: ["dailyService", "afterSales"] },
];

const EXECUTION_STACK = ["Agent", "Prompt", "Skill", "Knowledge", "Tools", "Model"];

function StageCard({ stage }) {
  const templates = stage.categoryKeys.flatMap((key) => getAgentTemplatesByCategory(key));
  return (
    <div className="fdr-card" style={{ minWidth: 200, background: "var(--bg)", marginBottom: 0 }}>
      <strong style={{ fontSize: 13 }}>{stage.label}</strong>
      {templates.length > 0 ? (
        <ul style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8, paddingLeft: 16 }}>
          {templates.slice(0, 4).map((t) => <li key={t.key}>{t.key}</li>)}
          {templates.length > 4 ? <li>...共 {templates.length} 个</li> : null}
        </ul>
      ) : (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 8 }}>复用现有核心 Agent，不新增模板</p>
      )}
    </div>
  );
}

export function AgentOperatingChain() {
  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>经营闭环：机会发现 → 内容运营 → 直播运营 → 流量与广告 → 订单 → 客服 → 知识反馈</h3>
          <DemoBadge />
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 8, overflowX: "auto", padding: "8px 0" }}>
          {CHAIN_STAGES.map((stage, idx) => (
            <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StageCard stage={stage} />
              {idx < CHAIN_STAGES.length - 1 ? <span style={{ fontSize: 20, color: "var(--text-secondary)" }}>→</span> : null}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 20, color: "var(--text-secondary)" }}>↺</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            售后复盘 / 内容复盘 / 直播复盘的结果会反馈进 Knowledge 资产库与评估中心，用于下一轮 Prompt / Skill / Knowledge 优化——不是一次性流程。
          </span>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">单个 Agent 的内部执行栈</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          每个 Agent 都是"店铺级配置实例"，共用系统标准模板；Prompt / Skill / Knowledge / Tools / Model 都是可绑定的资产，不是写死在 Agent 里的内容。Founder 不能新建任意 Agent 类型。
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {EXECUTION_STACK.map((step, idx) => (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0, padding: "10px 16px" }}>
                <strong style={{ fontSize: 13 }}>{step}</strong>
              </div>
              {idx < EXECUTION_STACK.length - 1 ? <span style={{ fontSize: 18, color: "var(--text-secondary)" }}>→</span> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">分类汇总</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
          {AGENT_CATEGORIES.map((c) => (
            <div key={c.key} className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
              <strong style={{ fontSize: 13 }}>{c.label}</strong>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                对应经营环节：{c.chainStage} · {c.key === "core" ? "来自真实后端" : `${getAgentTemplatesByCategory(c.key).length} 个系统模板`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
