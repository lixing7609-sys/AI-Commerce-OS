import { useState } from "react";

export function TaskPackageCard({ entry, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const { pkg } = entry;
  return (
    <div className="sf-card timeline-card">
      <div className="founder-ai-row-header">
        <h4>开发任务包：{pkg.name}</h4>
        <span className="sf-badge">{entry.assigned ? "已分配" : "待分配"}</span>
      </div>
      <p className="founder-ai-meta">{pkg.background}</p>
      <button type="button" className="sf-icon-button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "收起任务包" : "查看完整任务包"}
      </button>
      {expanded && (
        <dl className="founder-ai-definition-grid" style={{ marginTop: 10 }}>
          <dt>任务名称</dt>
          <dd>{pkg.name}</dd>
          <dt>任务背景</dt>
          <dd>{pkg.background}</dd>
          <dt>当前问题</dt>
          <dd>{pkg.currentProblem}</dd>
          <dt>已确认结论</dt>
          <dd>{pkg.confirmedConclusions.length ? pkg.confirmedConclusions.join("；") : "暂无"}</dd>
          <dt>已否决方案</dt>
          <dd>{pkg.rejectedApproaches.length ? pkg.rejectedApproaches.join("；") : "暂无"}</dd>
          <dt>禁止事项</dt>
          <dd>{pkg.prohibitions.length ? pkg.prohibitions.join("；") : "暂无"}</dd>
          <dt>执行范围</dt>
          <dd>{pkg.scope}</dd>
          <dt>UI 参考</dt>
          <dd>{pkg.uiReference}</dd>
          <dt>代码影响范围</dt>
          <dd>{pkg.codeImpact}</dd>
          <dt>验收标准</dt>
          <dd>{pkg.acceptanceCriteria.join("；")}</dd>
          <dt>测试要求</dt>
          <dd>{pkg.testRequirements}</dd>
          <dt>页面查看要求</dt>
          <dd>{pkg.pageViewRequirement}</dd>
          <dt>Git 要求</dt>
          <dd>{pkg.gitRequirement}</dd>
        </dl>
      )}
      {!entry.assigned && (
        <div className="founder-ai-actions">
          <button type="button" className="sf-button-primary" onClick={() => onAction(entry.id, "assign")}>
            批准分配给 Claude Code
          </button>
          <button type="button" className="sf-icon-button" onClick={() => onAction(entry.id, "back")}>
            返回继续讨论
          </button>
        </div>
      )}
    </div>
  );
}
