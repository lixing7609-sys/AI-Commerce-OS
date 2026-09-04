import { useFounderAI } from "../useFounderAI.js";

export function RetrospectiveView() {
  const { retrospectives } = useFounderAI();

  return (
    <div className="founder-ai-view-shell">
      <div className="founder-ai-stack">
        {retrospectives.map((r) => (
          <div key={r.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{r.originalGoal}</h3>
              <span className="sf-badge">{r.createdAt}</span>
            </div>
            <dl className="founder-ai-definition-grid">
              <dt>原始目标</dt>
              <dd>{r.originalGoal}</dd>
              <dt>最终结果</dt>
              <dd>{r.finalResult}</dd>
              <dt>方向变化</dt>
              <dd>{r.directionChanges}</dd>
              <dt>被否决方案</dt>
              <dd>{r.rejectedApproaches.length ? r.rejectedApproaches.join("；") : "无"}</dd>
              <dt>关键约束</dt>
              <dd>{r.keyConstraints.length ? r.keyConstraints.join("；") : "无"}</dd>
              <dt>执行中出现的问题</dt>
              <dd>{r.executionIssues}</dd>
              <dt>可复用经验</dt>
              <dd>{r.reusableLessons}</dd>
              <dt>是否形成新设计规范</dt>
              <dd>{r.newDesignNorm ? "是" : "否"}</dd>
            </dl>
          </div>
        ))}
        {retrospectives.length === 0 && <p className="founder-ai-empty">暂无复盘记录，验收通过后可在对话中发起复盘</p>}
      </div>
    </div>
  );
}
