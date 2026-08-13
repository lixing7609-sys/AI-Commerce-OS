import { useState } from "react";
import { intentLabel, objectTypeLabel, statusLabel } from "./founderTerminology.js";

const executionLabel = (item) => statusLabel(item.execution_refs?.at(-1)?.status, { execution: true });

function ObjectCard({ item, selected, onSelect }) {
  const previousVersion = item.revisions?.at(0)?.version;
  return <button type="button" className={selected ? "is-active" : ""} onClick={() => onSelect(item.object_id)}>
    <span>{objectTypeLabel(item.object_type, item.type_label)}</span><strong>{item.name}</strong>
    <small>{previousVersion && item.version > previousVersion ? `V${previousVersion} → V${item.version}` : `V${item.version}`} · {statusLabel(item.status)}</small>
    {item.execution_refs?.length ? <em>执行：{executionLabel(item)}</em> : null}
  </button>;
}

function CandidateCard({ item, selected, onSelect }) {
  return <button type="button" className={selected ? "is-active" : ""} onClick={() => onSelect(`candidate:${item.candidate_id}`)}><span>{intentLabel(item.intent_type)}</span><strong>{item.proposed_name || "目标对象待确认"}</strong><small>{item.proposed_object_type ? objectTypeLabel(item.proposed_object_type) : "对象待解析"} · {statusLabel(item.review_status)}</small>{item.proposed_status ? <em>建议状态：{statusLabel(item.proposed_status)}</em> : null}</button>;
}

export function ImplementationWorkspace({ objects = [], candidates = [], contextObject = null, contextCandidate = null, onApprove, onContinue, onArchive, onCandidateReview, onCandidateContinue, busy }) {
  const [selectedId, setSelectedId] = useState(null);
  const recognized = objects.filter((item) => item.object_id !== contextObject?.object_id);
  const drafts = recognized.filter((item) => item.status === "draft");
  const changed = recognized.filter((item) => item.status !== "draft" || item.revisions?.length);
  const selectedCandidate = candidates.find((item) => `candidate:${item.candidate_id}` === selectedId) || contextCandidate || null;
  const selected = objects.find((item) => item.object_id === selectedId) || (!selectedCandidate ? contextObject : null) || null;
  const group = (title, items) => items.length ? <section className="sino-object-workspace__group"><h3>{title}</h3>{items.map((item) => <ObjectCard key={item.object_id} item={item} selected={selected?.object_id === item.object_id} onSelect={setSelectedId} />)}</section> : null;
  return <section className="sino-object-workspace" aria-label="实现工作区">
    <header><h2>实现工作区</h2><span className="sino-kicker">Implementation Workspace</span><p>当前讨论产生或正在修改的技术对象</p></header>
    {contextObject && <section className="sino-object-workspace__current"><h3>当前对象</h3><ObjectCard item={contextObject} selected={selected?.object_id === contextObject.object_id} onSelect={setSelectedId} /></section>}
    {contextCandidate && <section className="sino-object-workspace__current"><h3>正在讨论候选变更</h3><CandidateCard item={contextCandidate} selected={selectedCandidate?.candidate_id === contextCandidate.candidate_id} onSelect={setSelectedId} /></section>}
    <div className="sino-object-workspace__list">
      {candidates.filter((item) => item.review_status === "pending").length ? <section className="sino-object-workspace__group"><h3>待确认变更</h3>{candidates.filter((item) => item.review_status === "pending").map((item) => <CandidateCard key={item.candidate_id} item={item} selected={selectedCandidate?.candidate_id === item.candidate_id} onSelect={setSelectedId} />)}</section> : null}
      {group("新增对象 · 等待确认", drafts)}
      {group(contextObject ? "本轮讨论产生的变更" : "修改对象 / 已进入执行", changed)}
      {!objects.length && !candidates.length && <div className="sino-object-workspace__empty"><strong>当前讨论尚未形成可实现对象</strong><p>继续讨论后，Sino 会自动识别 Project、Agent、Skill、Workflow、Prompt、Capability 等技术对象。</p></div>}
    </div>
    {selectedCandidate && <article className="sino-object-detail" aria-label="候选变更操作"><header><span>{intentLabel(selectedCandidate.intent_type)}</span><h3>{selectedCandidate.proposed_name || "目标对象待确认"}</h3></header><p>{selectedCandidate.proposed_description || selectedCandidate.reason || "等待 Founder 确认"}</p><dl><div><dt>审核状态</dt><dd>{statusLabel(selectedCandidate.review_status)}</dd></div><div><dt>建议状态</dt><dd>{statusLabel(selectedCandidate.proposed_status)}</dd></div><div><dt>置信度</dt><dd>{Math.round((selectedCandidate.confidence || 0) * 100)}%</dd></div></dl><footer>{selectedCandidate.review_status === "pending" && <button type="button" onClick={() => onCandidateReview(selectedCandidate, "approve")} disabled={busy}>批准</button>}<button type="button" onClick={() => onCandidateContinue(selectedCandidate)} disabled={busy}>继续讨论</button>{selectedCandidate.review_status === "pending" && <button type="button" onClick={() => onCandidateReview(selectedCandidate, "reject")} disabled={busy}>驳回</button>}</footer></article>}
    {selected && <article className="sino-object-detail" aria-label="对象操作"><header><span>{objectTypeLabel(selected.object_type, selected.type_label)}</span><h3>{selected.name}</h3></header><p>{selected.description || "暂无说明"}</p><dl><div><dt>状态</dt><dd>{statusLabel(selected.status)}</dd></div><div><dt>当前版本</dt><dd>V{selected.version}</dd></div><div><dt>来源会话</dt><dd>{selected.source_conversation_id || "暂无"}</dd></div><div><dt>依赖</dt><dd>{selected.dependency_object_ids?.join(" · ") || "暂无"}</dd></div><div><dt>关联</dt><dd>{selected.related_object_ids?.join(" · ") || "暂无"}</dd></div></dl>{selected.execution_refs?.length ? <p className="sino-object-detail__execution">已进入执行 · {executionLabel(selected)}</p> : null}<footer>{selected.status === "draft" && <button type="button" onClick={() => onApprove(selected)} disabled={busy}>批准</button>}<button type="button" onClick={() => onContinue(selected)} disabled={busy}>继续讨论</button>{selected.status === "draft" && <button type="button" onClick={() => onArchive(selected)} disabled={busy}>驳回 / 归档</button>}</footer></article>}
  </section>;
}
