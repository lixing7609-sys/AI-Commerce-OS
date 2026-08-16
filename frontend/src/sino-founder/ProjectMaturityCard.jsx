const OUTCOME_LABELS = { project_definition: "Project Definition", decision: "Decision", knowledge: "Knowledge", constraint: "Constraint", candidate_capability: "Proposed Candidate Capability", pending_question: "Pending Question", new_project_proposal: "New Project Proposal" };

function OutcomeContent({ value }) {
  if (value == null) return null;
  if (typeof value === "string") return <p>{value}</p>;
  return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{Array.isArray(item) ? item.join(" · ") : typeof item === "object" ? JSON.stringify(item) : String(item)}</dd></div>)}</dl>;
}

export function ProjectMaturityCard({ maturity, busy, onReview }) {
  if (!maturity || maturity.maturity_status !== "ready_for_review") return null;
  return <section className="sino-project-maturity" aria-label="Discussion Maturity">
    <header><span>Current Action</span><h2>审核本轮成果</h2></header><p>{maturity.reason}</p>
    <section className="sino-outcome-review" aria-label="Outcome Review"><span>Outcome Review</span><h3>本轮成果</h3>{maturity.outcomes?.map((item) => <article key={item.outcome_id}><small>{OUTCOME_LABELS[item.outcome_type] || item.outcome_type}</small><strong>{item.title}</strong><OutcomeContent value={item.content} /></article>)}<footer>{maturity.review_status === "founder_confirmed" ? <strong>✓ Founder 已确认成果</strong> : <><button type="button" className="is-primary" disabled={busy} onClick={() => onReview?.("confirm")}>确认成果</button><button type="button" disabled={busy} onClick={() => onReview?.("discuss")}>返回讨论</button></>}</footer></section>
  </section>;
}

export function ImplementationPlanCard({ plan, busy, onReview }) {
  if (!plan) return null;
  const ready = plan.status === "ready_for_execution_review";
  const approved = plan.execution_approval === "approved";
  return <section className="sino-project-maturity sino-implementation-plan" aria-label="Implementation Plan">
    <header><span>Implementation Planning</span><h2>{approved ? "实施方案已批准" : ready ? "制定实施方案" : "实施方案"}</h2></header>
    <p>{plan.implementation_goal}</p>
    <section className="sino-outcome-review"><span>Implementation Plan</span><h3>实施方案</h3>
      <OutcomeContent value={{ scope: plan.scope, out_of_scope: plan.out_of_scope, dependencies: plan.dependencies, execution_order: plan.execution_order, risk: plan.risk, validation_criteria: plan.validation_criteria, acceptance_criteria: plan.acceptance_criteria, affected_system_objects: plan.affected_system_objects, execution_requirements: plan.execution_requirements }} />
      <article><small>Work Items</small>{plan.work_items?.map((item, index) => <div key={item.work_item_id || index}><strong>{item.title || `Work Item ${index + 1}`}</strong><OutcomeContent value={item} /></div>)}</article>
      {approved ? <p><strong>Next Step</strong><br />生成 Execution Package（执行包）</p> : null}
      <footer>{approved ? <strong>✓ Founder 已批准实施</strong> : <><button type="button" className="is-primary" disabled={busy || !ready} onClick={() => onReview?.("approve")}>批准实施</button><button type="button" disabled={busy || !ready} onClick={() => onReview?.("discuss")}>返回讨论 / 修改方案</button></>}</footer>
    </section>
  </section>;
}

export function ExecutionPackageCard({ pkg }) {
  if (!pkg) return null;
  const preflight = pkg.preflight || {};
  const statusLabel = { ready: "Ready", blocked: "Blocked", founder_gate_required: "Founder Gate Required" }[pkg.preflight_status] || pkg.preflight_status;
  return <section className="sino-project-maturity sino-execution-package" aria-label="Execution Package">
    <header><span>Execution Package</span><h2>{pkg.preflight_status === "ready" ? "执行准备完成" : "Preflight Validation"}</h2></header>
    <p>{pkg.package_id} · {pkg.work_items?.length || 0} Work Items · {statusLabel}</p>
    <section className="sino-outcome-review"><span>Overview</span><h3>Package Review</h3>
      <OutcomeContent value={{ scope: pkg.scope, dependencies: pkg.dependencies, execution_order: pkg.execution_order, risk_summary: pkg.risk_summary, validation_plan: pkg.validation_plan, acceptance_criteria: pkg.acceptance_criteria, rollback_plan: pkg.rollback_plan, executor_requirements: pkg.executor_requirements }} />
      <article><small>Work Items</small>{pkg.work_items?.map((item) => <div key={item.work_item_id}><strong>{item.title}</strong><OutcomeContent value={item} /></div>)}</article>
      <article><small>Preflight Result</small>{preflight.checks?.map((item) => <div key={item.check}><strong>{item.check} · {item.status}</strong><p>{item.detail}</p></div>)}</article>
      <footer><strong>{pkg.preflight_status === "ready" ? "Ready for Execution" : pkg.preflight_status === "blocked" ? "Blocked · 需先解决技术准备问题" : "需要 Founder 判断异常"}</strong></footer>
    </section>
  </section>;
}
