import { useState } from "react";
import "./workspace.css";

/**
 * Operations Workspace — 商品/订单/客服/财务/广告/发布等经营操作。
 *
 * 语法：默认是"待处理队列"（任务优先，一行一个需要处理的事项），
 * 不是"浏览所有数据的表格"。表格仍然是真实需要，作为"浏览模式"
 * 二级视图保留，用顶部切换进入，而不是默认呈现。
 */
export function OperationsWorkspace({ title, subtitle, actions, queue, table }) {
  const [mode, setMode] = useState("queue");

  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      {table ? (
        <div className="ws-ops__toggle">
          <button type="button" className={"ws-ops__toggle-btn" + (mode === "queue" ? " ws-ops__toggle-btn--active" : "")} onClick={() => setMode("queue")}>
            待处理队列
          </button>
          <button type="button" className={"ws-ops__toggle-btn" + (mode === "table" ? " ws-ops__toggle-btn--active" : "")} onClick={() => setMode("table")}>
            浏览模式（表格）
          </button>
        </div>
      ) : null}
      <div className="ws-body">{mode === "queue" ? <div className="ws-ops__queue">{queue}</div> : table}</div>
    </div>
  );
}

const ROW_TONE_CLASS = {
  urgent: " ws-ops__row--urgent",
  attention: " ws-ops__row--attention",
  normal: "",
};

export function OperationsRow({ tone = "normal", icon, title, context, actions }) {
  return (
    <div className={"ws-ops__row" + (ROW_TONE_CLASS[tone] ?? "")}>
      <div className="ws-ops__row-thumb">{icon}</div>
      <div className="ws-ops__row-body">
        <div className="ws-ops__row-title">{title}</div>
        {context ? <div className="ws-ops__row-context">{context}</div> : null}
      </div>
      {actions ? <div className="ws-ops__row-actions">{actions}</div> : null}
    </div>
  );
}
