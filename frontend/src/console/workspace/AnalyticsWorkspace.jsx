import "./workspace.css";

/**
 * Analytics Workspace — 经营分析/流量分析/广告分析/内容分析/Cloud
 * 统计。六类里唯一允许以 KPI 卡片 + 图表为主体的类型——其余五类
 * 明确不允许默认落到这个模板。
 */
export function AnalyticsWorkspace({ title, subtitle, actions, filters, stats, children }) {
  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      {filters}
      <div className="ws-analytics">
        {stats ? (
          <div className="ws-analytics__stats">
            {stats.map((s) => (
              <div className="ws-analytics__stat" key={s.label}>
                <div className="ws-analytics__stat-label">{s.label}</div>
                <div className="ws-analytics__stat-value">{s.value}</div>
                {s.delta ? (
                  <div className={"ws-analytics__stat-delta" + (s.delta.startsWith("-") ? " ws-analytics__stat-delta--down" : " ws-analytics__stat-delta--up")}>
                    {s.delta}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
