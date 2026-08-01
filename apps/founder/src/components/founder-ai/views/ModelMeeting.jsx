import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";
import { MEETING_MODES, MODEL_OPTIONS, MODEL_ROLES, MODEL_DEFAULT_ROLE } from "../mockData.js";

const MODE_MODEL_COUNT = { 单模型: 1, 双模型: 2, 多模型: 4, "AI 董事会": 6 };

const ROLE_PROPOSAL = {
  技术负责人: (topic) => `从系统架构角度看，「${topic}」建议复用现有 Agent/Connector 基础设施，优先保证与验证闸门兼容。`,
  产品负责人: (topic) => `从产品与交互角度看，「${topic}」应先明确用户价值与最小可用范围，避免一次性做全。`,
  研究负责人: (topic) => `从资料研究角度看，「${topic}」在行业内已有相近实践，可参考其验证方法但不直接照搬结论。`,
  成本负责人: (topic) => `从成本角度看，「${topic}」的 AI 经营额度与算力消耗需要先做小流量测算。`,
  风险负责人: (topic) => `从风险角度看，「${topic}」需要关注数据安全与人工介入率是否达标。`,
  最终裁决: (topic) => `综合各方意见，「${topic}」建议先小范围试点，再决定是否全面推广。`,
};

function buildSummary(topic, models) {
  return {
    common: `各方一致认为「${topic}」值得先做小范围验证，而非直接全量投入。`,
    disagreement: models.length > 1 ? "在验证周期长短与是否需要额外人力投入上存在分歧。" : "暂无分歧（单模型模式）。",
    prosCons: models.map((m) => `${m}：视角聚焦于其负责角色，覆盖面有限，需要与其他角色交叉验证。`).join(" "),
    riskCompare: "技术风险普遍低于组织/数据风险，建议优先解决数据依赖与人工介入率问题。",
    recommendation: `建议采用「先验证、后决策」路径：7 天内在 Founder 自己的场景中试点「${topic}」。`,
    openQuestions: "是否批准试点所需的数据访问权限；是否接受当前的验证周期。",
  };
}

export function ModelMeeting({ onResult } = {}) {
  const { addMeeting } = useFounderAI();
  const [mode, setMode] = useState(MEETING_MODES[2]);
  const [selectedModels, setSelectedModels] = useState(["Claude", "GPT", "Gemini", "DeepSeek"]);
  const [roles, setRoles] = useState(MODEL_DEFAULT_ROLE);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState(null);

  function toggleModel(model) {
    setSelectedModels((prev) => (prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]));
  }

  function setRole(model, role) {
    setRoles((prev) => ({ ...prev, [model]: role }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim() || selectedModels.length === 0) return;
    const proposals = selectedModels.map((model) => {
      const role = roles[model] || "技术负责人";
      const fn = ROLE_PROPOSAL[role] || ROLE_PROPOSAL.技术负责人;
      return { model, role, proposal: fn(topic) };
    });
    const summary = buildSummary(topic, selectedModels);
    const record = { topic, mode, proposals, summary, recommendation: summary.recommendation };
    setResult(record);
    addMeeting(record);
    onResult?.(record);
  }

  const maxModels = MODE_MODEL_COUNT[mode] || MODEL_OPTIONS.length;

  return (
    <div className="founder-ai-view-shell">
      <div className="sf-card">
        <h3>会议配置</h3>
        <p className="founder-ai-meta">模式</p>
        <div className="studio-channel-chips">
          {MEETING_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`sf-icon-button${m === mode ? " is-active" : ""}`}
              style={m === mode ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>

        <p className="founder-ai-meta" style={{ marginTop: 12 }}>
          模型选择（最多 {maxModels} 个，可多选）
        </p>
        <div className="founder-ai-model-grid">
          {MODEL_OPTIONS.map((model) => {
            const checked = selectedModels.includes(model);
            return (
              <div key={model} className={`founder-ai-model-chip${checked ? " is-selected" : ""}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(model)}
                    disabled={!checked && selectedModels.length >= maxModels}
                  />
                  {model}
                </label>
                {checked && (
                  <select value={roles[model] || "技术负责人"} onChange={(e) => setRole(model, e.target.value)}>
                    {MODEL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          <textarea
            className="founder-ai-textarea"
            rows={3}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="描述本次模型会议需要讨论的问题"
          />
          <button type="submit" className="sf-button-primary" style={{ marginTop: 10 }}>
            发起会议
          </button>
        </form>
      </div>

      {result && (
        <>
          <h2 className="founder-ai-section-title">各方案</h2>
          <div className="founder-ai-model-columns">
            {result.proposals.map((p) => (
              <div key={p.model} className="sf-card founder-ai-model-column">
                <h4>
                  {p.model} <span className="sf-badge">{p.role}</span>
                </h4>
                <p>{p.proposal}</p>
              </div>
            ))}
          </div>

          <h2 className="founder-ai-section-title">SinoFUT 总结</h2>
          <div className="sf-card">
            <dl className="founder-ai-definition-grid">
              <dt>共同意见</dt>
              <dd>{result.summary.common}</dd>
              <dt>分歧点</dt>
              <dd>{result.summary.disagreement}</dd>
              <dt>各方案优缺点</dt>
              <dd>{result.summary.prosCons}</dd>
              <dt>风险对比</dt>
              <dd>{result.summary.riskCompare}</dd>
              <dt>推荐方案</dt>
              <dd>{result.summary.recommendation}</dd>
              <dt>需要 Founder 决定的问题</dt>
              <dd>{result.summary.openQuestions}</dd>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
