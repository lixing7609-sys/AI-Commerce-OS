// Structured placeholder for any not-yet-built page/section — V2-001 任务第十四条：
// 任何页面不得只显示标题，必须至少回答这八个问题。

export function PlaceholderCard({
  mission,
  coreObjects = [],
  upstream,
  downstream,
  sinoActions = [],
  status,
  loopRelation,
  nextSteps = [],
  children,
}) {
  return (
    <div className="sf-card sf-placeholder-card">
      <h3>页面使命</h3>
      <p>{mission}</p>

      <h4>核心对象</h4>
      <p>{coreObjects.join(" · ")}</p>

      <div className="sf-placeholder-grid">
        <div>
          <h4>上游输入</h4>
          <p>{upstream}</p>
        </div>
        <div>
          <h4>下游输出</h4>
          <p>{downstream}</p>
        </div>
      </div>

      <h4>SinoFUT 可执行的动作</h4>
      <ul>
        {sinoActions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>

      <div className="sf-placeholder-footer">
        <span className="sf-status-pill">{status}</span>
        <span className="sf-loop-relation">{loopRelation}</span>
      </div>

      {children ? (
        <>
          <h4>当前可用数据（演示）</h4>
          {children}
        </>
      ) : null}

      <h4>后续实现计划</h4>
      <ol>
        {nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
