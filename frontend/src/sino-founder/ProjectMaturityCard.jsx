const OUTCOME_LABELS = { project_definition: "Project Definition", decision: "Decision", knowledge: "Knowledge", constraint: "Constraint", candidate_capability: "Proposed Candidate Capability", pending_question: "Pending Question", new_project_proposal: "New Project Proposal" };

function OutcomeContent({ value }) {
  if (value == null) return null;
  if (typeof value === "string") return <p>{value}</p>;
  return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{Array.isArray(item) ? item.join(" · ") : typeof item === "object" ? JSON.stringify(item) : String(item)}</dd></div>)}</dl>;
}

function PreflightFact({ label, children }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

export function ProjectMaturityCard({ maturity, busy, onReview, reviewable = true }) {
  if (!maturity || maturity.maturity_status !== "ready_for_review") return null;
  return <section className="sino-project-maturity" aria-label="Discussion Maturity">
    <header><span>Current Action</span><h2>审核本轮成果</h2></header><p>{maturity.reason}</p>
    <section className="sino-outcome-review" aria-label="Outcome Review"><span>Outcome Review</span><h3>本轮成果</h3>{maturity.outcomes?.map((item) => <article key={item.outcome_id}><small>{OUTCOME_LABELS[item.outcome_type] || item.outcome_type}</small><strong>{item.title}</strong><OutcomeContent value={item.content} /></article>)}<footer>{maturity.review_status === "founder_confirmed" ? <strong>✓ Founder 已确认成果</strong> : <><button type="button" className="is-primary" disabled={busy || !reviewable} onClick={() => onReview?.("confirm")}>确认成果</button><button type="button" disabled={busy} onClick={() => onReview?.("discuss")}>返回讨论</button>{!reviewable ? <span role="status">正在准备可审核草案</span> : null}</>}</footer></section>
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

export function ExecutionPackageCard({ pkg, onReviewFounderGate }) {
  if (!pkg) return null;
  const preflight = pkg.preflight || {};
  const runtimeBinding = pkg.runtime_binding || {};
  const recommendation = runtimeBinding.recommendation || {};
  const workingTree = preflight.working_tree_resolution || {};
  const checkpoint = workingTree.checkpoint_proposal || {};
  const readiness = pkg.execution_readiness_contract || {};
  const handoff = pkg.executor_handoff || {};
  const statusLabel = { ready: "Ready", blocked: "Blocked", founder_gate_required: "Founder Gate Required" }[pkg.preflight_status] || pkg.preflight_status;
  return <section className="sino-project-maturity sino-execution-package" aria-label="Execution Package">
    <header><span>Execution Package</span><h2>{pkg.preflight_status === "ready" ? "执行准备完成" : "Preflight Validation"}</h2></header>
    <p>{pkg.package_id} · {pkg.work_items?.length || 0} Work Items · {statusLabel}</p>
    <section className="sino-outcome-review"><span>Overview</span><h3>Package Review</h3>
      <OutcomeContent value={{ scope: pkg.scope, dependencies: pkg.dependencies, execution_order: pkg.execution_order, risk_summary: pkg.risk_summary, validation_plan: pkg.validation_plan, acceptance_criteria: pkg.acceptance_criteria, rollback_plan: pkg.rollback_plan, executor_requirements: pkg.executor_requirements }} />
      <article><small>Work Items</small>{pkg.work_items?.map((item) => <div key={item.work_item_id}><strong>{item.title}</strong><OutcomeContent value={item} /></div>)}</article>
      <article><small>Preflight Result</small>{preflight.checks?.map((item) => <div key={item.check}><strong>{item.check} · {item.status}</strong><p>{item.detail}</p></div>)}</article>
      {workingTree.status && workingTree.status !== "clean" ? <article aria-label="Working Tree Resolution"><small>Preflight Resolution</small><strong>Working Tree Analysis</strong><p>{workingTree.status === "working_tree_resolution_ready" ? "Sino 已完成只读审计，当前变更可形成安全 checkpoint；Preflight 在 working tree clean 前继续保持 blocked。" : "Sino 已完成只读审计，但仍存在无法自动确认的工作区风险。"}</p><dl><PreflightFact label="Resolution Recommendation">{checkpoint.checkpoint_name || "保持 blocked 并继续技术审计"}</PreflightFact><PreflightFact label="Risk">{checkpoint.risk || "review_required"}</PreflightFact><PreflightFact label="Next Action">{workingTree.status === "working_tree_resolution_ready" ? "按建议 checkpoint scope 收口；完成后 revalidate 同一 Package" : "解决 Technical Details 中的阻塞项"}</PreflightFact></dl><details><summary>Technical Details / Evidence</summary><OutcomeContent value={{ branch: workingTree.branch, dirty_count: workingTree.dirty_count, eligibility_counts: workingTree.eligibility_counts, inventory: workingTree.inventory, included_files: checkpoint.included_files, excluded_files: checkpoint.excluded_files, verification_evidence: checkpoint.verification_evidence }} /></details></article> : null}
      {readiness.contract_id ? <article aria-label="Execution Readiness Contract"><small>Execution Readiness Contract</small><strong>{readiness.readiness_status === "execution_readiness_ready" ? "执行边界已验证" : "执行就绪检查被阻塞"}</strong><dl><PreflightFact label="Execution Goal">{readiness.execution_scope?.execution_goal}</PreflightFact><PreflightFact label="Executor">{readiness.executor?.executor_provider}</PreflightFact><PreflightFact label="Scope">{readiness.execution_scope?.included_capabilities?.join(" · ")}</PreflightFact><PreflightFact label="Verification">{readiness.validation_result}</PreflightFact><PreflightFact label="Rollback">{readiness.rollback_contract?.rollback_anchor}</PreflightFact><PreflightFact label="Side-effect Boundary">Local runtime only；External / Cloud / Production writes prohibited</PreflightFact><PreflightFact label="Stop Conditions">{readiness.automatic_stop_conditions?.length || 0} 条机器停止条件</PreflightFact><PreflightFact label="Readiness Status">{readiness.readiness_status}</PreflightFact><PreflightFact label="Next Action">{readiness.readiness_status === "execution_readiness_ready" ? "等待独立 Executor 启动动作" : "返回 Sino Brain 解决 readiness blocker"}</PreflightFact></dl><details><summary>Technical Details</summary><OutcomeContent value={{ contract_id: readiness.contract_id, allowed_paths: readiness.execution_scope?.allowed_files_or_paths, allowed_operations: readiness.execution_scope?.allowed_operations, excluded_operations: readiness.execution_scope?.excluded_operations, verification_contract: readiness.verification_contract, rollback_contract: readiness.rollback_contract, side_effect_contract: readiness.side_effect_contract, automatic_stop_conditions: readiness.automatic_stop_conditions, readiness_checks: readiness.readiness_checks }} /></details></article> : null}
      {handoff.handoff_id ? <article aria-label="Executor Handoff"><small>Executor Handoff</small><strong>Execution Session Created</strong><dl><PreflightFact label="Executor">{handoff.executor_provider}</PreflightFact><PreflightFact label="Scope Frozen">{handoff.scope_fingerprint ? "✓ Verified" : "Not Verified"}</PreflightFact><PreflightFact label="Execution Session">{handoff.execution_session?.execution_session_id}</PreflightFact><PreflightFact label="Session Status">{handoff.execution_session?.session_status}</PreflightFact><PreflightFact label="Execution Status">{pkg.execution_status}</PreflightFact><PreflightFact label="Next Action">等待独立 Execution Start；本阶段不会自动执行</PreflightFact></dl><details><summary>Technical Details / Evidence</summary><OutcomeContent value={{ handoff_id: handoff.handoff_id, package_id: handoff.package_id, readiness_contract_id: handoff.readiness_contract_id, checkpoint_commit: handoff.checkpoint_commit, scope_fingerprint: handoff.scope_fingerprint, stop_conditions: handoff.automatic_stop_conditions }} /></details></article> : null}
      {runtimeBinding.requires_runtime_binding ? <article aria-label="Runtime Environment Binding"><small>Runtime Environment Binding</small><strong>{runtimeBinding.binding_status === "passed" ? "运行环境已绑定" : "Runtime Environment 尚未绑定"}</strong><OutcomeContent value={{ provider: runtimeBinding.provider || "Unknown / Requires Confirmation", target_environment: runtimeBinding.target_environment || "Unknown / Requires Confirmation", resource_bindings: runtimeBinding.resource_bindings, credential_boundary: runtimeBinding.credential_source || "Unknown / Requires Confirmation", cost_boundary: runtimeBinding.cost_boundary || "Unknown / Requires Confirmation", external_side_effect_boundary: runtimeBinding.external_side_effect_boundary || "Unknown / Requires Confirmation", production_impact: runtimeBinding.production_impact ?? "Unknown / Requires Confirmation" }} />{recommendation.summary ? <><h3>Sino Runtime Binding Recommendation</h3><p>{recommendation.summary}</p><OutcomeContent value={{ existing_infrastructure: recommendation.existing_infrastructure, required_new_infrastructure: recommendation.required_new_infrastructure, new_credential: recommendation.new_credential, new_cost: recommendation.new_cost, production_impact: recommendation.production_impact, external_side_effect: recommendation.external_side_effect, reason: recommendation.reason }} /></> : null}</article> : null}
      <footer><strong>{pkg.preflight_status === "ready" ? "Ready for Execution" : pkg.preflight_status === "blocked" ? "Blocked · 需先解决技术准备问题" : runtimeBinding.requires_runtime_binding ? "需要 Founder 审核运行环境方案" : "需要 Founder 判断异常"}</strong>{pkg.preflight_status === "founder_gate_required" && pkg.founder_gate_proposal ? <button type="button" className="is-primary" onClick={() => onReviewFounderGate?.(pkg.founder_gate_proposal)}>审核运行环境方案</button> : null}</footer>
    </section>
  </section>;
}
