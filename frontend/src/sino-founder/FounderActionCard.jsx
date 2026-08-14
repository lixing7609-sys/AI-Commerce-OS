export function FounderActionCard({ action, busy, onConfirmGoal, onReviseGoal, onAdvanceStage, onReviewPackage, onContinueDiscussion, onViewAssets, onNewGoal, compact = false }) {
  if (!action) return null;
  const id = action.action_id;
  const primary = () => {
    if (id === "confirm_goal") return onConfirmGoal?.();
    if (id === "start_validation") return onAdvanceStage?.("validation");
    if (id === "generate_decision") return onAdvanceStage?.("decision");
    if (id === "generate_package") return onAdvanceStage?.("package");
    if (id === "approve_package") return onReviewPackage?.("approve");
    if (id === "assets_committed") return onViewAssets?.();
    return onContinueDiscussion?.();
  };
  const secondary = () => {
    if (id === "confirm_goal") return onReviseGoal?.();
    if (id === "approve_package") return onReviewPackage?.("discuss");
    if (id === "generate_package") return onAdvanceStage?.("strategy");
    if (id === "assets_committed") return onNewGoal?.();
    return onContinueDiscussion?.();
  };
  return <article className={`sino-founder-action-card${compact ? " is-compact" : ""}`} aria-label="当前行动">
    <span>Current Action</span><h2>{action.title}</h2><p>{action.description}</p>
    <footer><button type="button" className="is-primary" disabled={busy || id === "asset_commit"} onClick={primary}>{action.primary_label}</button>{action.secondary_label ? <button type="button" disabled={busy} onClick={secondary}>{action.secondary_label}</button> : null}{action.danger_label ? <button type="button" className="is-danger" disabled={busy} onClick={() => onReviewPackage?.("return")}>{action.danger_label}</button> : null}</footer>
  </article>;
}
