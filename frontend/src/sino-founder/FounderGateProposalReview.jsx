const FIELD_LABELS = {
  storage: "Storage", compute: "Compute", iam: "IAM", network: "Network",
  provider: "Runtime Provider / Type", target_environment: "Target Environment",
  credential_source: "Credential Authorization", cost_boundary: "Cost Authorization",
  external_side_effect_boundary: "External Side Effect", production_impact: "Production Impact",
};

function TechnicalValue({ value }) {
  if (value == null || value === "") return <span>Unknown</span>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={item?.field || item?.label || item?.logical_dependency || index}><TechnicalValue value={item} /></li>)}</ul> : <span>None</span>;
  if (typeof value === "object" && "label" in value && "value" in value) return <dl><div><dt>{value.label}</dt><dd><TechnicalValue value={value.value} /></dd></div></dl>;
  if (typeof value === "object" && "field" in value && "reason" in value) return <dl><div><dt>{FIELD_LABELS[value.field] || value.field}</dt><dd><TechnicalValue value={value.reason} /></dd></div></dl>;
  if (typeof value === "object") return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd><TechnicalValue value={item} /></dd></div>)}</dl>;
  return <span>{String(value)}</span>;
}

function Fact({ label, children }) {
  return <div className="sino-founder-gate-fact"><dt>{label}</dt><dd>{children || "Unknown"}</dd></div>;
}

function resourceLabel(value) {
  return FIELD_LABELS[value] || String(value || "Resource").replaceAll("_", " ");
}

const DECISION_CONTRACT_LABELS = {
  recommendation: "Recommendation",
  approval_scope: "Approval Scope",
  boundary: "Boundary",
  escalation_rule: "Escalation Rule",
};

function buildDecisionContract(item, recommendation, architecture) {
  const explicit = item.decision_contract || item.contract || {};
  if (explicit.recommendation && explicit.approval_scope && explicit.boundary && explicit.escalation_rule) return explicit;

  const decision = item.decision;
  if (decision === "credential_source") return {
    recommendation: `复用 Discovery 已确认处于 CONFIGURED 状态的开发环境 Credential reference。${recommendation.new_credential || architecture?.credential_strategy ? `当前建议：${recommendation.new_credential || architecture?.credential_strategy}。` : ""}`,
    approval_scope: "仅授权当前 Package 在隔离的 non-production / development scope 内引用现有 Credential reference。",
    boundary: "不读取、不展示、不复制 Credential 内容；不生成新的 Secret、Service Identity 或 Credential。",
    escalation_rule: "若执行需要新建 Credential、Service Identity 或 Secret，必须立即停止并重新进入 Founder Gate。",
  };
  if (decision === "cost_boundary") return {
    recommendation: `优先复用现有 development resources；在该前提下，incremental external cost = 0。${architecture?.cost_model ? `成本模型：${architecture.cost_model}。` : ""}`,
    approval_scope: "仅授权复用当前已发现的开发资源，不包含任何新增付费资源或账单承诺。",
    boundary: "Zero-cost 结论仅在复用现有资源的前提下成立；不授权新增付费 Cloud、Runtime、Storage、Compute 或 Network 资源。",
    escalation_rule: "任何新增付费资源、订阅或外部账单，都必须在发生前重新提交 Founder Gate。",
  };
  if (decision === "external_side_effect_boundary") return {
    recommendation: `首先复用现有开发资源，不创建新的外部资源。${recommendation.external_side_effect ? `当前分析：${recommendation.external_side_effect}。` : ""}`,
    approval_scope: "仅授权在现有隔离开发边界内进行后续实现；当前 Proposal Review 阶段 actual side effects = 0。",
    boundary: "不允许擅自创建、修改或删除任何外部资源。",
    escalation_rule: "若执行需要创建、修改或删除外部资源，必须立即停止并重新进入 Founder Gate。",
  };
  if (decision === "production_impact") return {
    recommendation: `仅在 isolated non-production / development scope 内实施。${architecture?.production_impact ? `当前影响判断：${architecture.production_impact}。` : ""}`,
    approval_scope: "仅授权当前隔离开发环境方案，不包含任何 production 环境操作。",
    boundary: "不允许修改 production configuration、production data、production credential 或 production network。",
    escalation_rule: "发现任何潜在 production impact 时，必须立即停止并重新进入 Founder Gate。",
  };
  return {
    recommendation: explicit.recommendation || item.recommendation || item.reason || "Sino 已形成待审核建议。",
    approval_scope: explicit.approval_scope || item.scope || "仅限当前 Proposal 明确描述的范围。",
    boundary: explicit.boundary || item.boundary || item.risk || "不得超出当前已审核边界。",
    escalation_rule: explicit.escalation_rule || item.escalation_rule || "若执行需要超出该边界，必须停止并重新进入 Founder Gate。",
  };
}

function DecisionContract({ item, recommendation, architecture }) {
  const contract = buildDecisionContract(item, recommendation, architecture);
  return <section className="sino-founder-decision-contract" aria-label={`${item.label || resourceLabel(item.decision)} Decision Contract`}>
    <header><strong>{item.label || resourceLabel(item.decision)}</strong><small>DECISION CONTRACT</small></header>
    <dl>{Object.entries(DECISION_CONTRACT_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{contract[key]}</dd></div>)}</dl>
  </section>;
}

export function FounderGateProposalReview({ proposal, busy, onReview, onReturnDiscussion }) {
  if (!proposal) return <section className="sino-project-maturity" aria-label="Founder Gate Proposal"><p role="status">正在准备可审核方案…</p></section>;
  const content = proposal.content || {};
  const recommendation = content.recommended || {};
  const readiness = proposal.decision_readiness || {};
  const blockers = readiness.blocking_unknowns || [];
  const decisions = readiness.founder_decisions_required || [];
  const decisionReady = proposal.decision_ready === true;
  const resources = recommendation.resource_recommendations || [];
  const candidateOptions = content.environment_discovery?.candidate_options || [];
  const architecture = content.architecture_candidate || null;
  const resolutionStatus = readiness.resolution_status || "pending";
  return <section className="sino-project-maturity sino-founder-gate-proposal" aria-label="Founder Gate Proposal" data-scroll-container="founder-gate-proposal" tabIndex={0}>
    <header><div><small>FOUNDER GATE PROPOSAL</small><h2>{proposal.title}</h2></div><strong>{proposal.status === "approved" ? "✓ Founder 已批准" : decisionReady ? "需要 Founder 决策" : resolutionStatus === "blocked" ? "遇到外部或技术阻塞" : resolutionStatus === "autonomous_resolution_stalled" ? "自主分析暂无新进展" : "正在自主完善方案"}</strong></header>

    <p className="sino-founder-gate-resolution-status" role="status">{decisionReady ? "Sino 已形成具体推荐方案，剩余事项均为明确的 Founder 授权。" : readiness.last_resolution_reason || "Sino 正在自主执行 Discovery、Architecture Synthesis 与 Recommendation。"}</p>

    <article className="sino-founder-gate-review"><h3>推荐方案</h3><h4>{recommendation.name || "Sino 正在完善运行环境建议"}</h4><p>{recommendation.why}</p>
      <dl className="sino-founder-gate-facts">
        <Fact label="运行位置">{recommendation.target_environment}</Fact>
        <Fact label="Provider / Runtime Type">{recommendation.provider}</Fact>
        {resources.map((item) => <Fact key={item.logical_dependency} label={resourceLabel(item.logical_dependency)}>{item.recommended_target}<small>{item.approved_for_package ? " · 已绑定到当前 Package" : ` · ${item.classification || "Candidate"}，尚未批准`}</small></Fact>)}
        <Fact label="新增 Credential">{recommendation.new_credential}</Fact>
        <Fact label="新增费用">{recommendation.new_cost}</Fact>
        <Fact label="生产影响">{String(recommendation.production_impact ?? "Unknown")}</Fact>
        <Fact label="外部副作用">{recommendation.external_side_effect}</Fact>
        <Fact label="隔离与回滚">{recommendation.rollback_isolation}</Fact>
        <Fact label="Recommendation Confidence">{recommendation.confidence || "Unknown"}</Fact>
      </dl>
    </article>

    {architecture ? <article className="sino-founder-gate-architecture" aria-label="Architecture Candidate"><h3>Architecture Candidate</h3><h4>{architecture.name}</h4><dl className="sino-founder-gate-facts">
      <Fact label="Runtime Type">{architecture.runtime_type}</Fact><Fact label="Target Environment">{architecture.target_environment_type}</Fact>
      <Fact label="Storage">{architecture.storage_strategy}</Fact><Fact label="Compute">{architecture.compute_strategy}</Fact>
      <Fact label="IAM">{architecture.iam_strategy}</Fact><Fact label="Network">{architecture.network_strategy}</Fact>
      <Fact label="Credential">{architecture.credential_strategy}</Fact><Fact label="费用">{architecture.cost_model}</Fact>
      <Fact label="生产影响">{architecture.production_impact}</Fact><Fact label="外部副作用">{architecture.external_side_effects}</Fact>
      <Fact label="隔离">{architecture.isolation_strategy}</Fact><Fact label="回滚">{architecture.rollback_strategy}</Fact>
      <Fact label="Confidence">{architecture.confidence}</Fact>
    </dl>{architecture.risks?.length ? <><h4>主要风险</h4><ul>{architecture.risks.map((risk, index) => <li key={index}>{risk}</li>)}</ul></> : null}</article> : null}

    {candidateOptions.length ? <article><h3>候选方案</h3><ul>{candidateOptions.map((option) => <li key={option.option_id}><strong>{option.name}</strong><span>{option.constraint}</span></li>)}</ul></article> : null}

    <article aria-label="Decision Readiness"><h3>Decision Readiness</h3>
      <p className={decisionReady ? "is-ready" : "is-blocked"}>{decisionReady ? "已具备 Founder 决策条件" : "尚未达到可批准状态。Sino 正在确认关键执行事实。"}</p>
      {blockers.length ? <><h4>Sino 正在确认</h4><ul>{blockers.map((item) => <li key={item.field}><strong>{item.label || resourceLabel(item.field)}</strong><span>{item.reason}</span></li>)}</ul></> : null}
      {decisions.length ? <><h4>Founder 需要决定</h4><div className="sino-founder-decision-contracts">{decisions.map((item) => <DecisionContract key={item.decision} item={item} recommendation={recommendation} architecture={architecture} />)}</div></> : null}
    </article>

    <details className="sino-founder-gate-technical"><summary>Technical Details / Evidence</summary>
      <dl><Fact label="Proposal ID">{proposal.proposal_id}</Fact><Fact label="Gate Type">{proposal.gate_type}</Fact><Fact label="Version">v{proposal.version}</Fact><Fact label="Execution Package">{proposal.execution_package_id}</Fact></dl>
      <h4>Known Evidence</h4><TechnicalValue value={content.known} />
      <h4>Discovery</h4><TechnicalValue value={content.environment_discovery} />
      <h4>Resolution Evidence</h4><TechnicalValue value={content.resolution_evidence} />
    </details>

    <footer>
      {proposal.status === "ready_for_review" ? <button type="button" className="is-primary" disabled={busy || !decisionReady} aria-disabled={!decisionReady} onClick={() => onReview?.(proposal, "approve")}>{decisionReady ? "批准推荐方案" : "运行环境方案尚不可批准"}</button> : null}
      <button type="button" disabled={busy} onClick={() => proposal.status === "ready_for_review" ? onReview?.(proposal, "revise") : onReturnDiscussion?.(proposal)}>返回讨论 / 修改方案</button>
    </footer>
  </section>;
}
