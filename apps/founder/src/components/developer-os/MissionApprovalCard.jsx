import { useState } from "react";

function display(value, fallback = "暂未提供") {
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function MissionApprovalCard({ entry, onAction }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const snapshot = entry.snapshot || {};
  const mission = snapshot.mission || {};
  const workspace = snapshot.workspace || {};
  const waiting = (entry.status || snapshot.run?.state) === "waiting_execution_approval";
  const busy = Boolean(entry.actionPending);

  return (
    <article className="founder-mission-approval-card">
      <div className="founder-mission-approval-heading">
        <div>
          <span className="founder-mission-approval-kicker">Developer OS · 执行授权</span>
          <h3>{display(mission.title, "今日建议 Mission")}</h3>
        </div>
        <span className={`founder-mission-approval-status${waiting ? " is-waiting" : ""}`}>
          {waiting ? (entry.deferred ? "已暂缓" : "等待执行授权") : "授权已处理"}
        </span>
      </div>

      <dl className="founder-mission-approval-summary">
        <div><dt>为什么现在做</dt><dd>{display(mission.business_reason)}</dd></div>
        <div><dt>预计结果</dt><dd>{display(mission.expected_result)}</dd></div>
        <div><dt>风险</dt><dd>{display(mission.risk_level)}</dd></div>
        <div><dt>Workspace</dt><dd>{display(workspace.name)}</dd></div>
      </dl>

      {entry.error && <p className="founder-mission-approval-error">{entry.error}</p>}
      {detailsOpen && (
        <div className="founder-mission-approval-details">
          <p><strong>目标文件</strong>{mission.target_files?.length ? mission.target_files.join("、") : "将在执行方案中确认"}</p>
          <p><strong>依赖</strong>{mission.dependencies?.length ? mission.dependencies.join("、") : "无阻塞依赖"}</p>
        </div>
      )}

      <div className="founder-mission-approval-actions">
        {waiting && (
          <button type="button" className="sf-button-primary" disabled={busy} onClick={() => onAction(entry.id, "approve")}>
            {busy ? "正在提交授权…" : "批准执行"}
          </button>
        )}
        <button type="button" className="sf-button-secondary" onClick={() => setDetailsOpen((open) => !open)}>
          {detailsOpen ? "收起方案" : "查看方案"}
        </button>
        {waiting && !entry.deferred && (
          <button type="button" className="sf-button-secondary" disabled={busy} onClick={() => onAction(entry.id, "defer")}>暂缓</button>
        )}
      </div>
    </article>
  );
}
