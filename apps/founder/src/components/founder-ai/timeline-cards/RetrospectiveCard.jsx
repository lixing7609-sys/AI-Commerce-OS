export function RetrospectiveCard({ entry }) {
  const { retro } = entry;
  return (
    <div className="sf-card timeline-card">
      <h4>复盘：{retro.originalGoal}</h4>
      <dl className="founder-ai-definition-grid">
        <dt>原始目标</dt>
        <dd>{retro.originalGoal}</dd>
        <dt>最终结果</dt>
        <dd>{retro.finalResult}</dd>
        <dt>中途方向变化</dt>
        <dd>{retro.directionChanges}</dd>
        <dt>被否决方案</dt>
        <dd>{retro.rejectedApproaches.length ? retro.rejectedApproaches.join("；") : "无"}</dd>
        <dt>关键约束</dt>
        <dd>{retro.keyConstraints.length ? retro.keyConstraints.join("；") : "无"}</dd>
        <dt>执行中出现的问题</dt>
        <dd>{retro.executionIssues}</dd>
        <dt>可复用经验</dt>
        <dd>{retro.reusableLessons}</dd>
        <dt>是否形成新设计规范</dt>
        <dd>{retro.newDesignNorm ? "是" : "否"}</dd>
      </dl>
    </div>
  );
}
