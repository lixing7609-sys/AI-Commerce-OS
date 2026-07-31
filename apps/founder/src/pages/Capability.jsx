import { useApiState, PlaceholderCard } from "@sinofut/ui";
import { VALIDATION_CRITERIA } from "@sinofut/domain";

export function Capability() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  return (
    <div>
      <div className="sf-page-header">
        <h1>能力中心</h1>
        <p>
          验证通过标准：连续 ≥{VALIDATION_CRITERIA.minConsecutiveDays} 天真实使用、内部结算净利为正、
          人工介入率 &lt; {(VALIDATION_CRITERIA.maxManualOverrideRate * 100).toFixed(0)}%、跨场景可复现。
        </p>
      </div>

      <h2 className="sf-section-title">Capability（验证闸门）</h2>
      <div className="sf-grid sf-grid-2">
        {state.capabilities.map((c) => (
          <div className="sf-card" key={c.id}>
            <h3>{c.name}</h3>
            <p>
              连续验证 {c.consecutiveDays} 天 · 人工介入率{" "}
              {c.manualOverrideRate === null ? "—" : `${(c.manualOverrideRate * 100).toFixed(0)}%`} ·
              内部结算净值 ¥{c.internalSettlementValue.toLocaleString("zh-CN")}
            </p>
            <span
              className={`sf-badge ${
                c.status === "validated" ? "success" : c.status === "validating" ? "warn" : ""
              }`}
            >
              {c.status}
            </span>
            {c.latestSuggestion && <p style={{ marginTop: 8 }}>{c.latestSuggestion}</p>}
          </div>
        ))}
      </div>

      <h2 className="sf-section-title">能力层子注册表</h2>
      <div className="sf-grid sf-grid-3">
        <PlaceholderCard
          mission="管理可被调度的自主执行单元"
          coreObjects={["Agent"]}
          upstream="Founder 研发 / Marketplace 引入"
          downstream="Workflow 编排、Capability 组合"
          sinoActions={["列出 Agent 调用频率与成功率"]}
          status="待建模：Agent 注册表 UI（后端 app/agents/* 可复用，见 08-backend-reuse-audit.md）"
          loopRelation="能力研发 → 验证 → 晋升"
          nextSteps={["定义 Agent API", "接入后端 agent_registry"]}
        />
        <PlaceholderCard
          mission="管理 Agent 行为的核心指令资产与版本"
          coreObjects={["Prompt", "Version"]}
          upstream="Founder 研发"
          downstream="Agent 绑定"
          sinoActions={["对比 Prompt 版本评测结果"]}
          status="待建模"
          loopRelation="能力研发"
          nextSteps={["定义 Prompt 版本对比 UI"]}
        />
        <PlaceholderCard
          mission="管理可复用技能单元"
          coreObjects={["Skill"]}
          upstream="Founder 研发"
          downstream="Agent 组合"
          sinoActions={["列出 Skill 依赖的 Connector"]}
          status="待建模"
          loopRelation="能力研发"
          nextSteps={["定义 Skill 契约"]}
        />
        <PlaceholderCard
          mission="编排多 Agent/多步骤流程"
          coreObjects={["Workflow"]}
          upstream="触发事件（机会创建/内容提交等）"
          downstream="Task 生成"
          sinoActions={["可视化 Workflow 执行状态"]}
          status="待建模：编排画布（可复用 Studio InfiniteCanvas 组件）"
          loopRelation="能力层核心"
          nextSteps={["用 InfiniteCanvas 搭建 Workflow 编排视图"]}
        />
        <PlaceholderCard
          mission="管理 Agent 可检索的知识资产"
          coreObjects={["Knowledge"]}
          upstream="品类知识、平台规则、历史案例"
          downstream="Agent 检索调用"
          sinoActions={["标记知识陈旧度"]}
          status="待建模"
          loopRelation="能力研发"
          nextSteps={["定义 Knowledge 更新频率追踪"]}
        />
        <PlaceholderCard
          mission="管理与外部平台对接的适配器"
          coreObjects={["Connector"]}
          upstream="平台方 API"
          downstream="Agent / Workflow 调用"
          sinoActions={["检查 Connector 鉴权状态"]}
          status="后端已有可复用实现：app/integrations/platforms/*"
          loopRelation="能力层基础设施"
          nextSteps={["接入真实 Connector 状态到本页"]}
        />
      </div>
    </div>
  );
}
