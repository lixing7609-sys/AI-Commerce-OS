import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";
import { ARGUMENTATION_TEMPLATES } from "../mockData.js";

const CONCLUSIONS = ["通过", "有条件通过", "暂缓", "否决"];

function mockArgue(idea, template) {
  const len = idea.trim().length;
  const conclusion = CONCLUSIONS[len % CONCLUSIONS.length];
  return {
    title: idea.trim().slice(0, 40) || `未命名${template}`,
    goal: `验证「${idea.trim() || template}」是否值得投入 Founder 的研发与验证资源`,
    userValue: "减少 Founder/Operator 的重复操作，或提升内容/增长/经营决策效率",
    businessValue: "若验证通过，可沉淀为 Capability 并计入能力商城/内部结算收入",
    feasibility: len > 20 ? "技术可行性较高，可复用现有 Agent/Connector 基础设施" : "技术可行性中等，需要先做小范围技术预研",
    requiredCapabilities: template === "新 Agent" ? "需要新增 Agent + 对应 Prompt" : template === "新 Workflow" ? "需要编排 Workflow，复用已有 Agent" : "需要能力中心现有 Agent/Connector 组合",
    dataDependency: "依赖 Growth/Studio/Operator 的经营数据作为验证输入",
    cost: len > 30 ? "中" : "低",
    risk: conclusion === "否决" ? "高" : conclusion === "暂缓" ? "中" : "低",
    relationToSystem: "不与现有架构冲突，作为能力层新增项接入验证闸门",
    mvpPlan: "先在 Founder 自己的经营场景中连续验证 7 天，达标后再开放给 Operator",
    conclusion,
  };
}

export function FunctionalArgumentation() {
  const { addArgumentation, addExecutionTask, addDecisionMemory, addPendingDecision } = useFounderAI();
  const [idea, setIdea] = useState("");
  const [template, setTemplate] = useState(ARGUMENTATION_TEMPLATES[0]);
  const [result, setResult] = useState(null);
  const [savedNote, setSavedNote] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!idea.trim()) return;
    setResult(mockArgue(idea, template));
    setSavedNote("");
  }

  function handleAction(action) {
    if (!result) return;
    switch (action) {
      case "dev-task":
        addExecutionTask({
          name: `开发任务：${result.title}`,
          source: "功能论证",
          executor: "Founder",
          stage: "执行中",
          progress: 0,
          doneSummary: "刚从功能论证生成",
          blockers: "无",
          nextStep: "拆解具体开发子任务",
          needsReauthorization: false,
        });
        setSavedNote("已生成开发任务，可在「执行跟踪」查看");
        break;
      case "adr":
        addDecisionMemory({ content: `ADR：${result.title} —— ${result.conclusion}`, source: "功能论证", scope: "架构" });
        setSavedNote("已建立 ADR 记录，可在「决策记忆」查看");
        break;
      case "capability-center":
        addArgumentation({ ...result, handoff: "能力中心" });
        setSavedNote("已交给能力中心（演示状态，未跳转页面）");
        break;
      case "pending-decision":
        addPendingDecision({
          title: `是否推进「${result.title}」`,
          source: "功能论证",
          impact: result.businessValue,
          aiSuggestion: `建议结论：${result.conclusion}`,
          riskLevel: result.risk,
        });
        setSavedNote("已加入「待决策」");
        break;
      case "decision-memory":
        addDecisionMemory({ content: `功能论证结论：${result.title} —— ${result.conclusion}`, source: "功能论证", scope: "产品" });
        setSavedNote("已保存到「决策记忆」");
        break;
      default:
        break;
    }
  }

  return (
    <div className="founder-ai-view-shell">
      <div className="sf-card">
        <h3>描述你想论证的功能或想法</h3>
        <div className="studio-channel-chips" style={{ marginBottom: 10 }}>
          {ARGUMENTATION_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              className={`sf-icon-button${t === template ? " is-active" : ""}`}
              style={t === template ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
              onClick={() => setTemplate(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <textarea
            className="founder-ai-textarea"
            rows={4}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={`描述你想论证的「${template}」……`}
          />
          <button type="submit" className="sf-button-primary" style={{ marginTop: 10 }}>
            生成论证
          </button>
        </form>
      </div>

      {result && (
        <div className="sf-card founder-ai-argument-result">
          <div className="founder-ai-row-header">
            <h3>{result.title}</h3>
            <span
              className={`sf-badge ${
                result.conclusion === "通过" ? "success" : result.conclusion === "否决" ? "danger" : "warn"
              }`}
            >
              建议结论：{result.conclusion}
            </span>
          </div>
          <dl className="founder-ai-definition-grid">
            <dt>目标</dt>
            <dd>{result.goal}</dd>
            <dt>用户价值</dt>
            <dd>{result.userValue}</dd>
            <dt>商业价值</dt>
            <dd>{result.businessValue}</dd>
            <dt>技术可行性</dt>
            <dd>{result.feasibility}</dd>
            <dt>所需能力</dt>
            <dd>{result.requiredCapabilities}</dd>
            <dt>数据依赖</dt>
            <dd>{result.dataDependency}</dd>
            <dt>成本</dt>
            <dd>{result.cost}</dd>
            <dt>风险</dt>
            <dd>{result.risk}</dd>
            <dt>与现有系统的关系</dt>
            <dd>{result.relationToSystem}</dd>
            <dt>MVP 验证方案</dt>
            <dd>{result.mvpPlan}</dd>
          </dl>
          <div className="founder-ai-actions">
            <button type="button" className="sf-button-primary" onClick={() => handleAction("dev-task")}>
              生成开发任务
            </button>
            <button type="button" className="sf-icon-button" onClick={() => handleAction("adr")}>
              建立 ADR
            </button>
            <button type="button" className="sf-icon-button" onClick={() => handleAction("capability-center")}>
              交给能力中心
            </button>
            <button type="button" className="sf-icon-button" onClick={() => handleAction("pending-decision")}>
              加入待决策
            </button>
            <button type="button" className="sf-icon-button" onClick={() => handleAction("decision-memory")}>
              保存到决策记忆
            </button>
          </div>
          {savedNote && <p className="founder-ai-saved-note">{savedNote}</p>}
        </div>
      )}
    </div>
  );
}
