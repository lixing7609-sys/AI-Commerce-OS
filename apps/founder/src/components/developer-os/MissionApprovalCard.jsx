import { useEffect, useRef, useState } from "react";
import { RUN_LABELS, formatRunElapsed, runElapsedSeconds, runHeartbeatStale } from "./founderDeveloperOSAdapter.js";

const POLLING_STATES = new Set([
  "waiting_execution_approval", "execution_approved", "executing", "testing", "artifact_collection", "reviewing",
  "scope_adjustment", "replanning", "retrying",
]);

function display(value, fallback = "暂未提供") {
  return value === undefined || value === null || value === "" ? fallback : value;
}

export function MissionApprovalCard({ entry, onAction, onRefresh }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [now, setNow] = useState(0);
  const refreshPending = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const snapshot = entry.snapshot || {};
  const mission = snapshot.mission || {};
  const workspace = snapshot.workspace || {};
  const state = entry.status || snapshot.run?.state || "waiting_execution_approval";
  const waiting = state === "waiting_execution_approval";
  const waitingCommit = state === "waiting_commit_approval";
  const committed = state === "committed" || state === "completed";
  const candidate = snapshot.candidate;
  const artifact = snapshot.artifact;
  const commitResult = snapshot.commit_result;
  const busy = Boolean(entry.actionPending);
  const elapsed = formatRunElapsed(runElapsedSeconds(snapshot.run, now));
  const unresponsive = runHeartbeatStale(snapshot.run, now);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!snapshot.run?.started_at || ["waiting_commit_approval", "failed", "cancelled", "timed_out", "committed", "completed"].includes(state)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.run?.started_at, state]);

  useEffect(() => {
    if ((!snapshot.run?.run_id && state !== "waiting_execution_approval") || !onRefreshRef.current) return undefined;
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

  if (entry.historical) return null;

  return (
    <article className="founder-mission-approval-card">
      <div className="founder-mission-approval-heading">
        <div>
          <span className="founder-mission-approval-kicker">Developer OS · 执行授权</span>
          <h3>{display(mission.title, "今日建议 Mission")}</h3>
        </div>
        <span className={`founder-mission-approval-status${waiting ? " is-waiting" : ""}`}>
          {waiting && entry.deferred ? "已暂缓" : RUN_LABELS[state] || "状态不可用"}
          {snapshot.run?.started_at ? ` · ${elapsed}` : ""}
        </span>
      </div>

      <dl className="founder-mission-approval-summary">
        <div><dt>为什么现在做</dt><dd>{display(mission.business_reason)}</dd></div>
        <div><dt>预计结果</dt><dd>{display(mission.expected_result)}</dd></div>
        <div><dt>风险</dt><dd>{display(mission.risk_level)}</dd></div>
        <div><dt>预计文件</dt><dd>{mission.target_files?.length ?? 0} 个</dd></div>
        <div><dt>Workspace</dt><dd>{display(workspace.name)}</dd></div>
      </dl>

      {snapshot.run?.started_at && <dl className="founder-mission-approval-summary">
        <div><dt>当前阶段</dt><dd>{display(snapshot.run.current_step, RUN_LABELS[state])}</dd></div>
        <div><dt>最近心跳</dt><dd>{display(snapshot.run.last_heartbeat_at)}{unresponsive ? " · 可能无响应" : ""}</dd></div>
        <div><dt>超时上限</dt><dd>{snapshot.run.timeout_seconds ? `${Math.round(snapshot.run.timeout_seconds / 60)} 分钟` : "暂未提供"}</dd></div>
      </dl>}

      {state === "failed" && (
        <div className="founder-mission-approval-failure">
          <p><strong>发生了什么</strong>{snapshot.run?.failure_summary || "本次开发未能通过自动执行或验证。"}</p>
          <p><strong>已有成果是否安全</strong>已有对话、Mission 与研发记录均已保留，未执行自动提交。</p>
          <p><strong>下一步建议</strong>查看详细报告，确认失败原因后重新规划或执行。</p>
        </div>
      )}
      {state === "timed_out" && (
        <div className="founder-mission-approval-failure">
          <p><strong>发生了什么</strong>执行达到安全超时上限，关联 Codex 进程已终止。</p>
          <p><strong>已有成果是否安全</strong>已有修改、Conversation 和研发记录均已保留，未执行 Git Commit。</p>
          <p><strong>停止位置</strong>{display(snapshot.run?.current_step)}</p>
          <p><strong>下一步建议</strong>查看详细变更后重新生成执行计划，或放弃当前任务。</p>
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
      {waitingCommit && candidate && (
        <section className="founder-commit-review-package">
          <div className="founder-mission-approval-heading">
            <div>
              <span className="founder-mission-approval-kicker">Commit Review Package</span>
              <h3>{display(mission.title)}</h3>
            </div>
            <span className="founder-mission-approval-status is-waiting">等待正式授权</span>
          </div>
          <dl className="founder-mission-approval-summary">
            <div><dt>修改摘要</dt><dd>{display(artifact?.diff_summary)}</dd></div>
            <div><dt>涉及文件</dt><dd>{candidate.files?.length ? candidate.files.join("、") : "暂未提供"}</dd></div>
            <div><dt>Diff 摘要</dt><dd>{display(candidate.diff_summary)}</dd></div>
            <div><dt>Tests</dt><dd>{display(artifact?.tests)}</dd></div>
            <div><dt>Lint</dt><dd>{display(artifact?.lint)}</dd></div>
            <div><dt>Build</dt><dd>{display(artifact?.build)}</dd></div>
            <div><dt>风险等级</dt><dd>{display(candidate.risk_level || mission.risk_level)}</dd></div>
            <div><dt>建议 Commit Message</dt><dd>{display(candidate.suggested_commit_message)}</dd></div>
            <div><dt>Rollback Plan</dt><dd>{display(artifact?.rollback_plan)}</dd></div>
          </dl>
        </section>
      )}
      {committed && commitResult && (
        <section className="founder-commit-result">
          <span className="founder-mission-approval-kicker">Commit Result</span>
          <dl className="founder-mission-approval-summary">
            <div><dt>Commit Hash</dt><dd title={commitResult.commit_hash}>{display(commitResult.commit_hash)}</dd></div>
            <div><dt>Commit Message</dt><dd>{display(commitResult.commit_message)}</dd></div>
            <div><dt>提交文件</dt><dd>{commitResult.committed_files?.length ? commitResult.committed_files.join("、") : "暂未提供"}</dd></div>
            <div><dt>分支</dt><dd>{display(commitResult.branch)}</dd></div>
            <div><dt>Workspace</dt><dd>{commitResult.workspace_clean ? "clean" : "仍有未提交内容"}</dd></div>
          </dl>
        </section>
      )}
      {entry.error && state !== "failed" && <p className="founder-mission-approval-error">{entry.error}</p>}
      {detailsOpen && (
        <div className="founder-mission-approval-details">
          <p><strong>目标文件</strong>{mission.target_files?.length ? mission.target_files.join("、") : "将在执行方案中确认"}</p>
          <p><strong>依赖</strong>{mission.dependencies?.length ? mission.dependencies.join("、") : "无阻塞依赖"}</p>
          <p><strong>Run ID</strong>{snapshot.run?.run_id || "尚未创建"}</p>
          <p><strong>技术状态</strong>{state}</p>
          {snapshot.run?.failure_summary && <p><strong>技术详情</strong>{snapshot.run.failure_summary}</p>}
          {snapshot.raw_report?.plan?.artifacts?.full_diff && (
            <pre className="founder-commit-full-diff">{snapshot.raw_report.plan.artifacts.full_diff}</pre>
          )}
        </div>
      )}

      <div className="founder-mission-approval-actions">
        {waiting && (
          <button type="button" className="sf-button-primary" disabled={busy} onClick={() => onAction(entry.id, "approve")}>
            {busy ? "正在提交授权…" : "批准执行"}
          </button>
        )}
        {!waitingCommit && !committed && <button type="button" className="sf-button-secondary" onClick={() => setDetailsOpen((open) => !open)}>
          {detailsOpen ? "收起方案" : "查看方案"}
        </button>}
        {waiting && !entry.deferred && (
          <button type="button" className="sf-button-secondary" disabled={busy} onClick={() => onAction(entry.id, "defer")}>暂缓</button>
        )}
        {waitingCommit && candidate && (
          <>
            <button type="button" className="sf-button-primary" disabled={busy} onClick={() => onAction(entry.id, "approve-commit")}>
              {busy ? "正在提交授权…" : "批准提交"}
            </button>
            <button type="button" className="sf-button-secondary" disabled={busy} onClick={() => onAction(entry.id, "revise-commit")}>退回修改</button>
            <button type="button" className="sf-button-secondary" disabled={busy} onClick={() => onAction(entry.id, "reject-commit")}>放弃提交</button>
          </>
        )}
        {state === "timed_out" && (
          <>
            <button type="button" className="sf-button-primary" disabled={busy} onClick={() => onAction(entry.id, "retry")}>重新执行</button>
            <button type="button" className="sf-button-secondary" onClick={() => setDetailsOpen((open) => !open)}>查看详情</button>
            <button type="button" className="sf-button-secondary" disabled={busy} onClick={() => onAction(entry.id, "abandon")}>放弃任务</button>
          </>
        )}
        {(waitingCommit || committed) && (
          <button type="button" className="sf-button-secondary" onClick={() => setDetailsOpen((open) => !open)}>
            {detailsOpen ? "收起详细变更" : "查看详细变更"}
          </button>
        )}
      </div>
    </article>
  );
}
