import "./workspace.css";

/**
 * Command Workspace — Founder 工作台/决策/风险/待办/授权。
 *
 * 语法：顶部命令栏 + 任务队列（一行一个待决策项，不是 KPI 卡片墙）
 * + 可选右侧详情栏。队列行本身携带状态点、标题、一句话上下文和
 * 一个主操作按钮——逼着内容作者写"需要做什么"而不是"这里有什么
 * 数据"。
 */
export function CommandWorkspace({ title, subtitle, actions, children, sidePanel }) {
  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      <div className="ws-body">
        <div className="ws-command__feed">{children}</div>
        {sidePanel ? <div className="ws-side-panel">{sidePanel}</div> : null}
      </div>
    </div>
  );
}

const DOT_TONE = {
  urgent: "var(--danger)",
  attention: "var(--warning)",
  normal: "var(--text-tertiary)",
  done: "var(--success)",
};

export function CommandRow({ tone = "normal", title, context, action }) {
  return (
    <div className="ws-command-row">
      <span className="ws-command-row__dot" style={{ background: DOT_TONE[tone] ?? DOT_TONE.normal }} />
      <div className="ws-command-row__body">
        <div className="ws-command-row__title">{title}</div>
        {context ? <div className="ws-command-row__context">{context}</div> : null}
      </div>
      {action ? <div className="ws-command-row__action">{action}</div> : null}
    </div>
  );
}
