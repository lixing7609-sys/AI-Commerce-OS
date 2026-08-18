import { useEffect, useState } from "react";

function Elapsed({ startedAt, completedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || completedAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, completedAt]);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor(((completedAt ? Date.parse(completedAt) : now) - Date.parse(startedAt)) / 1000));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return <time dateTime={`PT${seconds}S`} aria-label="已耗时">{hh}:{mm}:{ss}</time>;
}

export function FounderActionCard({ action, busy, onConfirmGoal, onReviseGoal, onAdvanceStage, onReviewPackage, onReviewProjectOutcome, onContinueProjectAnalysis, onContinueDiscussion, onViewAssets, onNewGoal, onCapabilityAction, compact = false, readOnly = false }) {
  if (!action) return null;
  const id = action.action_id;
  const primary = () => {
    if (id === "confirm_goal") return onConfirmGoal?.();
    if (id === "start_validation") return onAdvanceStage?.("validation");
    if (id === "generate_decision") return onAdvanceStage?.("decision");
    if (id === "generate_package") return onAdvanceStage?.("package");
    if (id === "approve_package") return onReviewPackage?.("approve");
    if (id === "review_project_outcome") return onReviewProjectOutcome?.("focus");
    if (id === "continue_project_planning") return onContinueProjectAnalysis?.();
    if (id === "assets_committed") return onViewAssets?.();
    if (["candidates_saved", "develop", "complete_development", "run_capability_test", "run_test", "approve_ready"].includes(id)) return onCapabilityAction?.(action);
    return onContinueDiscussion?.();
  };
  const secondary = () => {
    if (id === "confirm_goal") return onReviseGoal?.();
    if (id === "approve_package") return onReviewPackage?.("discuss");
    if (id === "generate_package") return onAdvanceStage?.("strategy");
    if (["candidates_saved", "develop"].includes(id)) return onViewAssets?.();
    if (id === "assets_committed") return onNewGoal?.();
    return onContinueDiscussion?.();
  };
  return <article className={`sino-founder-action-card${compact ? " is-compact" : ""}`} aria-label="当前行动">
    <span>Current Action</span><h2>{action.title} <Elapsed startedAt={action.timing_started_at} completedAt={action.timing_completed_at} /></h2><p>{action.description}</p>{Number.isFinite(action.progress_percent) ? <div className="sino-execution-progress" aria-label={`任务进度 ${action.progress_percent}%`}><i style={{ width: `${action.progress_percent}%` }} /><strong>{action.progress_percent}%</strong></div> : null}{action.founder_action_required === false ? <small>Founder：无需操作</small> : action.founder_action_required === true ? <small>Founder：需要操作</small> : action.status_label ? <small>{action.status_label}</small> : null}
    {!readOnly && (action.primary_label || action.secondary_label || action.danger_label) ? <footer>{action.primary_label ? <button type="button" className="is-primary" disabled={busy || ["asset_commit", "project_maturity_evaluating"].includes(id)} onClick={primary}>{action.primary_label}</button> : null}{action.secondary_label ? <button type="button" disabled={busy} onClick={secondary}>{action.secondary_label}</button> : null}{action.danger_label ? <button type="button" className="is-danger" disabled={busy} onClick={() => onReviewPackage?.("return")}>{action.danger_label}</button> : null}</footer> : null}
  </article>;
}
