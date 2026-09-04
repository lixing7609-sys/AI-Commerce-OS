const PRINCIPLE_SECTIONS = [
  ["Founder Boundary", "founder_boundary"], ["Sino Boundary", "sino_boundary"],
  ["Shared vs Isolated", "shared_vs_isolated_principle"], ["Execution Principle", "execution_principle"],
  ["Validation Principle", "validation_principle"],
];

const STATE_LABELS = { not_found: "尚未发现", existing: "已存在", partial: "部分存在", needs_review: "需要核对" };
const DECISION_LABELS = { pending: "待判断", approved: "✓ 已同意推进", discuss: "继续讨论", deferred: "暂不处理" };

function UnderstandingDetails({ understanding }) {
  return <div className="sino-constitution-understanding__details">
    <div className="sino-constitution-layers">
      <section><h3>Foundation Layer</h3>{understanding.foundation_layer.map((item) => <article key={item.name}><strong>{item.name}</strong><p>{item.role}</p></article>)}</section>
      <section><h3>Application Layer</h3>{understanding.application_layer.map((item) => <article key={item.name}><strong>{item.name}</strong><p>{item.role}</p></article>)}</section>
    </div>
    <details open><summary>System Objects · {understanding.system_objects.length}</summary><ol>{understanding.system_objects.map((item) => <li key={item.name}><strong>{item.name}</strong><span>{item.role}</span></li>)}</ol></details>
    <details><summary>Capability Lifecycle</summary><p>{understanding.capability_lifecycle.join(" → ")}</p></details>
    <details><summary>Capability Rules</summary><ul>{understanding.capability_rules.map((item) => <li key={item}>{item}</li>)}</ul></details>
    {PRINCIPLE_SECTIONS.map(([label, key]) => <details key={key}><summary>{label}</summary><p>{understanding[key]}</p></details>)}
  </div>;
}

export function ConstitutionUnderstandingCard({ understanding, busy, onReview, selectedWorkItemId, onSelectWorkItem }) {
  if (!understanding?.system_objects?.length) return null;
  const approved = understanding.status === "founder_approved";
  return <section className="sino-constitution-understanding" aria-label="Constitution Understanding">
    <header><span>Constitution Understanding</span><h2>从 Constitution 中识别出的系统结构</h2><p>{understanding.core_definition}</p></header>
    {approved ? <details className="sino-constitution-confirmed"><summary><span>Founder Confirmed Structure</span><strong>✓ Founder 已确认结构</strong></summary><UnderstandingDetails understanding={understanding} /></details> : <><UnderstandingDetails understanding={understanding} /><footer><button type="button" className="is-primary" disabled={busy} onClick={() => onReview?.("confirm_structure")}>确认结构</button><button type="button" disabled={busy} onClick={() => onReview?.("return_to_discussion")}>返回讨论</button></footer></>}
    <section className="sino-proposed-work-items" aria-label="Proposed Work Items">
      <header><span>Proposed Work Items</span><h3>建议工作项</h3><p>这些只是 Sino 的专业建议，不是 Goal、Candidate、Project 或 Execution。</p></header>
      {(understanding.proposed_work_items || []).map((item) => { const decision = item.founder_decision || "pending"; return <article key={item.work_item_id} className={selectedWorkItemId === item.work_item_id ? "is-selected" : ""}>
        <button type="button" className="sino-proposed-work-item__select" disabled={busy || !approved} aria-pressed={selectedWorkItemId === item.work_item_id} onClick={() => onSelectWorkItem?.(item.work_item_id)}>
        <header><div><strong>{item.title}</strong><small>{STATE_LABELS[item.existing_state] || item.existing_state}</small></div><b className={`is-decision-${decision}`}>{DECISION_LABELS[decision] || decision}</b></header>
        </button>
      </article>; })}
      {!approved ? <p className="sino-proposed-work-items__gate">请先确认 Constitution Understanding，再逐项判断建议工作项。</p> : null}
    </section>
  </section>;
}
