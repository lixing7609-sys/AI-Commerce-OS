import { useState } from "react";
import { intentLabel, objectTypeLabel, statusLabel } from "./founderTerminology.js";

const DISPLAY_NAMES = { "Discussion to Skill Pipeline": "讨论 → Skill 生成管线" };
const displayName = (name) => DISPLAY_NAMES[name] || name;
const executionRef = (item) => item?.execution_refs?.at(-1) || null;
const executionLabel = (item) => statusLabel(executionRef(item)?.status, { execution: true });
const candidateChange = (item) => item.proposed_description || item.proposed_patch?.description || item.reason || "等待 Founder 确认变更内容";

function ObjectCard({ item, selected, onSelect }) {
  return <button type="button" className={`sino-implementation-card${selected ? " is-active" : ""}`} onClick={() => onSelect(item.object_id)}>
    <span>{objectTypeLabel(item.object_type, item.type_label)}</span><strong>{displayName(item.name)}</strong>{displayName(item.name) !== item.name ? <small>{item.name}</small> : null}
    <small>V{item.version} · {statusLabel(item.status)}</small>
    {executionRef(item) ? <em>执行：{executionLabel(item)} · V{executionRef(item).object_version || item.version}</em> : null}
  </button>;
}

function PendingCandidateCard({ item, target, selected, onSelect, onReview, onContinue, busy }) {
  const name = item.proposed_name || target?.name || "目标对象待确认";
  const currentVersion = target?.version;
  const candidateVersion = currentVersion ? currentVersion + 1 : 1;
  const execution = executionRef(target);
  return <article className={`sino-implementation-card sino-implementation-card--pending${selected ? " is-active" : ""}`}>
    <button type="button" className="sino-implementation-card__body" onClick={() => onSelect(`candidate:${item.candidate_id}`)}>
      <span className="sino-status-chip">待审批</span>
      <strong>{displayName(name)}</strong>{displayName(name) !== name ? <small>{name}</small> : null}
      <small>{objectTypeLabel(item.proposed_object_type || target?.object_type, target?.type_label)}</small>
      <b>{currentVersion ? `V${currentVersion} → V${candidateVersion}` : `候选版本 V${candidateVersion}`}</b>
      <p><span>{intentLabel(item.intent_type)}：</span>{candidateChange(item)}</p>
      {execution ? <em>当前执行版本：V{execution.object_version || currentVersion} · {statusLabel(execution.status, { execution: true })}</em> : null}
    </button>
    <footer className="sino-implementation-card__actions"><button type="button" className="is-primary" onClick={() => onReview(item, "approve")} disabled={busy}>批准</button><button type="button" onClick={() => onContinue(item)} disabled={busy}>继续讨论</button><button type="button" className="is-muted" onClick={() => onReview(item, "reject")} disabled={busy}>驳回</button></footer>
  </article>;
}

export function ImplementationWorkspace({ objects = [], candidates = [], contextObject = null, contextCandidate = null, recognitionStatus = null, onApprove, onContinue, onArchive, onCandidateReview, onCandidateContinue, busy }) {
  const [selectedId, setSelectedId] = useState(null);
  const pending = candidates.filter((item) => item.review_status === "pending");
  const pendingTargetIds = new Set(pending.map((item) => item.target_object_id).filter(Boolean));
  const recognized = objects.filter((item) => item.object_id !== contextObject?.object_id && !pendingTargetIds.has(item.object_id));
  const drafts = recognized.filter((item) => item.status === "draft");
  const approved = recognized.filter((item) => item.status !== "draft");
  const selectedCandidate = candidates.find((item) => `candidate:${item.candidate_id}` === selectedId) || contextCandidate || null;
  const selected = objects.find((item) => item.object_id === selectedId) || (!selectedCandidate ? contextObject : null) || null;
  const targetFor = (candidate) => objects.find((item) => item.object_id === candidate.target_object_id) || (contextObject?.object_id === candidate.target_object_id ? contextObject : null);
  const group = (title, items) => items.length ? <section className="sino-object-workspace__group"><h3>{title}</h3>{items.map((item) => <ObjectCard key={item.object_id} item={item} selected={selected?.object_id === item.object_id} onSelect={setSelectedId} />)}</section> : null;
  return <section className="sino-object-workspace" aria-label="实现工作区">
    <header><h2>实现工作区</h2><span className="sino-kicker">Implementation Workspace</span><p>当前讨论产生或正在修改的技术对象</p></header>
    {pending.length ? <section className="sino-object-workspace__group sino-object-workspace__pending"><h3>待审批</h3>{pending.map((item) => <PendingCandidateCard key={item.candidate_id} item={item} target={targetFor(item)} selected={selectedCandidate?.candidate_id === item.candidate_id} onSelect={setSelectedId} onReview={onCandidateReview} onContinue={onCandidateContinue} busy={busy} />)}</section> : null}
    <div className="sino-object-workspace__list">
      {recognitionStatus?.status === "unavailable" ? <div className="sino-object-workspace__empty"><strong>对象识别暂不可用</strong><p>Sino 对话仍可正常继续，稍后会重新尝试识别。</p></div> : null}
      {group("新增对象 · 等待确认", drafts)}
      {group("已进入执行", approved)}
      {contextObject && !pendingTargetIds.has(contextObject.object_id) ? <section className="sino-object-workspace__group"><h3>当前对象</h3><ObjectCard item={contextObject} selected={selected?.object_id === contextObject.object_id} onSelect={setSelectedId} /></section> : null}
      {!objects.length && !candidates.length && <div className="sino-object-workspace__empty"><strong>当前讨论尚未形成可实现对象</strong><p>继续讨论后，Sino 会自动识别 Project、Agent、Skill、Workflow、Prompt、Capability 等技术对象。</p></div>}
    </div>
    {selectedCandidate && selectedCandidate.review_status === "pending" ? <article className="sino-object-detail sino-object-detail--candidate" aria-label="候选变更详情"><dl><div><dt>Candidate ID</dt><dd>{selectedCandidate.candidate_id}</dd></div><div><dt>意图类型</dt><dd>{intentLabel(selectedCandidate.intent_type)}</dd></div><div><dt>来源 Conversation</dt><dd>{selectedCandidate.conversation_id || "暂无"}</dd></div><div><dt>来源消息</dt><dd>{selectedCandidate.source_message_refs?.join(" · ") || "暂无"}</dd></div><div><dt>Confidence</dt><dd>{Math.round((selectedCandidate.confidence || 0) * 100)}%</dd></div></dl></article> : null}
    {selectedCandidate && selectedCandidate.review_status !== "pending" ? <article className="sino-object-detail" aria-label="候选变更操作"><header><span>{intentLabel(selectedCandidate.intent_type)}</span><h3>{displayName(selectedCandidate.proposed_name || "目标对象待确认")}</h3></header><p>{candidateChange(selectedCandidate)}</p><dl><div><dt>审核状态</dt><dd>{statusLabel(selectedCandidate.review_status)}</dd></div><div><dt>来源 Conversation</dt><dd>{selectedCandidate.conversation_id || "暂无"}</dd></div></dl></article> : null}
    {selected && !pendingTargetIds.has(selected.object_id) && <article className="sino-object-detail" aria-label="对象操作"><header><span>{objectTypeLabel(selected.object_type, selected.type_label)}</span><h3>{selected.name}</h3></header><p>{selected.description || "暂无说明"}</p><dl><div><dt>状态</dt><dd>{statusLabel(selected.status)}</dd></div><div><dt>当前版本</dt><dd>V{selected.version}</dd></div><div><dt>来源会话</dt><dd>{selected.source_conversation_id || "暂无"}</dd></div></dl>{executionRef(selected) ? <p className="sino-object-detail__execution">已进入执行 · V{executionRef(selected).object_version || selected.version} · {executionLabel(selected)}</p> : null}<footer>{selected.status === "draft" && <button type="button" onClick={() => onApprove(selected)} disabled={busy}>批准</button>}<button type="button" onClick={() => onContinue(selected)} disabled={busy}>继续讨论</button>{selected.status === "draft" && <button type="button" onClick={() => onArchive(selected)} disabled={busy}>驳回 / 归档</button>}</footer></article>}
  </section>;
}
