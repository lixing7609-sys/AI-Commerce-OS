import { useEffect, useRef, useState } from "react";
import { RUN_LABELS } from "./founderDeveloperOSAdapter.js";

const POLLING_STATES = new Set([
  "execution_approved", "executing", "testing", "artifact_collection", "reviewing",
  "scope_adjustment", "replanning", "retrying",
]);

function display(value, fallback = "暂未提供") {
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function MissionApprovalCard({ entry, onAction, onRefresh }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const refreshPending = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const snapshot = entry.snapshot || {};
  const mission = snapshot.mission || {};
  const workspace = snapshot.workspace || {};
  const state = entry.status || snapshot.run?.state || "waiting_execution_approval";
  const waiting = state === "waiting_execution_approval";
  const busy = Boolean(entry.actionPending);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!snapshot.run?.run_id || !onRefreshRef.current) return undefined;
    let active = true;
    const refresh = async () => {
      if (!active || refreshPending.current) return;
      refreshPending.current = true;
      try { await onRefreshRef.current(entry.id); } finally { refreshPending.current = false; }
    };
    refresh();
    if (!POLLING_STATES.has(state)) return () => { active = false; };
    const timer = window.setInterval(refresh, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [entry.id, snapshot.run?.run_id, state]);

  return (
    <article className="founder-mission-approval-card">
      <div className="founder-mission-approval-heading">
        <div>
          <span className="founder-mission-approval-kicker">Developer OS · 执行授权</span>
          <h3>{display(mission.title, "今日建议 Mission")}</h3>
        </div>
        <span className={`founder-mission-approval-status${waiting ? " is-waiting" : ""}`}>
          {waiting && entry.deferred ? "已暂缓" : RUN_LABELS[state] || "状态不可用"}
        </span>
      </div>

      <dl className="founder-mission-approval-summary">
        <div><dt>为什么现在做</dt><dd>{display(mission.business_reason)}</dd></div>
        <div><dt>预计结果</dt><dd>{display(mission.expected_result)}</dd></div>
        <div><dt>风险</dt><dd>{display(mission.risk_level)}</dd></div>
        <div><dt>Workspace</dt><dd>{display(workspace.name)}</dd></div>
      </dl>

      {state === "failed" && (
        <div className="founder-mission-approval-failure">
          <p><strong>发生了什么</strong>{snapshot.run?.failure_summary || "本次开发未能通过自动执行或验证。"}</p>
          <p><strong>已有成果是否安全</strong>已有对话、Mission 与研发记录均已保留，未执行自动提交。</p>
          <p><strong>下一步建议</strong>查看详细报告，确认失败原因后重新规划或执行。</p>
        </div>
      )}
      {state === "waiting_execution_approval" && snapshot.raw_report?.plan?.revised_task_package && (
        <div className="founder-mission-approval-details">
          <p><strong>新增文件</strong>{snapshot.raw_report.plan.revised_task_package.added_files?.join("、") || "无"}</p>
          <p><strong>调整原因</strong>{snapshot.raw_report.plan.revised_task_package.reason}</p>
          <p><strong>风险</strong>{snapshot.raw_report.plan.revised_task_package.risk}</p>
          <p><strong>回滚方式</strong>{snapshot.raw_report.plan.revised_task_package.rollback_plan}</p>
        </div>
      )}
      {entry.error && state !== "failed" && <p className="founder-mission-approval-error">{entry.error}</p>}
      {detailsOpen && (
        <div className="founder-mission-approval-details">
          <p><strong>目标文件</strong>{mission.target_files?.length ? mission.target_files.join("、") : "将在执行方案中确认"}</p>
          <p><strong>依赖</strong>{mission.dependencies?.length ? mission.dependencies.join("、") : "无阻塞依赖"}</p>
          <p><strong>Run ID</strong>{snapshot.run?.run_id || "尚未创建"}</p>
          <p><strong>技术状态</strong>{state}</p>
          {snapshot.run?.failure_summary && <p><strong>技术详情</strong>{snapshot.run.failure_summary}</p>}
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
