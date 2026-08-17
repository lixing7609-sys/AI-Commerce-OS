export function projectMaturityProjection(brain) {
  const maturity = { ...(brain?.discovery?.discussion_maturity || {}) };
  const resolution = brain?.discovery?.blocking_question_resolution;
  if (resolution?.status === "resolved" && maturity.maturity_status !== "founder_input_required") {
    maturity.blocking_question = null;
    maturity.why_founder_needed = null;
    maturity.question_importance = null;
    maturity.sino_recommendation = null;
    maturity.recommendation_reason = null;
    maturity.optional_options = [];
    maturity.options = [];
  }
  return maturity;
}

export function projectCurrentAction(brain, maturity = projectMaturityProjection(brain)) {
  const lifecycle = brain?.project_lifecycle;
  if (lifecycle?.rank >= 300 && lifecycle.current_action) return lifecycle.current_action;
  if (brain?.stage !== "project_planning") return brain?.current_action || null;
  const run = brain?.discovery?.cognitive_work_run;
  if (["pending", "running"].includes(run?.run_status)) return { action_id: "cognitive_work_running", title: "Sino 正在执行", description: run.work_target, status_label: "分析中", primary_label: null };
  if (maturity.maturity_status === "continue_analysis") return { action_id: "continue_project_planning", title: "继续自主分析", description: maturity.autonomous_next_analysis || maturity.reason, primary_label: "继续分析" };
  if (maturity.maturity_status === "founder_input_required") return { action_id: "answer_project_question", title: "需要 Founder 判断", description: maturity.blocking_question || maturity.reason, primary_label: null };
  if (maturity.maturity_status === "ready_for_review") return { action_id: "review_project_outcome", title: "审核本轮成果", description: maturity.reason, primary_label: "审核成果", secondary_label: "返回讨论" };
  return { action_id: "project_maturity_evaluating", title: "正在判断讨论成熟度", description: maturity.reason || "等待 Sino 完成成熟度判断。", primary_label: null };
}
