import { useState } from "react";
import { intentLabel, objectTypeLabel, statusLabel } from "./founderTerminology.js";

const DISPLAY_NAMES = { "Discussion to Skill Pipeline": "讨论 → Skill 生成管线" };
const displayName = (name) => DISPLAY_NAMES[name] || name;
const executionRef = (item) => item?.execution_refs?.at(-1) || null;
const taskAssetRef = (item) => item?.task_asset_ref || item?.task_asset || null;
const executionLabel = (item) => statusLabel(executionRef(item)?.status, { execution: true });
const candidateChange = (item) => item.proposed_description || item.proposed_patch?.description || item.reason || "等待 Founder 确认变更内容";
const candidateReviewStatusLabel = (status) => ({ pending: "待确认", confirmed: "已确认", rejected: "已驳回" }[status] || statusLabel(status));
const uniqueCandidates = (items) => Array.from(new Map(items.filter(Boolean).map((item) => [item.candidate_id, item])).values());
const canCreateTaskAsset = (item) => item?.object_type === "task" && item?.status === "approved" && !taskAssetRef(item);

function ObjectCard({ item, selected, onSelect }) {
  const taskRef = taskAssetRef(item);
  return <button type="button" className={`sino-implementation-card${selected ? " is-active" : ""}`} onClick={() => onSelect(item.object_id)}>
    <span>{objectTypeLabel(item.object_type, item.type_label)}</span><strong>{displayName(item.name)}</strong>{displayName(item.name) !== item.name ? <small>{item.name}</small> : null}
    <small>V{item.version} · {statusLabel(item.status)}</small>
    {taskRef ? <em>TaskAsset：{statusLabel(taskRef.status)} · 审批 {statusLabel(taskRef.approval_status)} · 执行 {statusLabel(taskRef.execution_status, { execution: true })}</em> : null}
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
      <span className="sino-status-chip">待确认</span>
      <strong>{displayName(name)}</strong>{displayName(name) !== name ? <small>{name}</small> : null}
      <small>{objectTypeLabel(item.proposed_object_type || target?.object_type, target?.type_label)}</small>
      <b>{currentVersion ? `V${currentVersion} → V${candidateVersion}` : `候选版本 V${candidateVersion}`}</b>
      <p><span>{intentLabel(item.intent_type)}：</span>{candidateChange(item)}</p>
      {execution ? <em>当前执行版本：V{execution.object_version || currentVersion} · {statusLabel(execution.status, { execution: true })}</em> : null}
    </button>
    <footer className="sino-implementation-card__actions"><button type="button" className="is-primary" onClick={() => onReview(item, "confirm")} disabled={busy}>确认</button><button type="button" onClick={() => onContinue(item)} disabled={busy}>继续讨论</button><button type="button" className="is-muted" onClick={() => onReview(item, "reject")} disabled={busy}>驳回</button></footer>
  </article>;
}

export function ImplementationWorkspace({ objects = [], candidates = [], conversationId = null, contextObject = null, contextCandidate = null, intelligence = null, creationContext = null, recognitionStatus = null, onApprove, onCreateTask, onContinue, onArchive, onOpenObject, onCandidateReview, onCandidateContinue, busy }) {
  const [selectedId, setSelectedId] = useState(null);
  const visibleCandidates = uniqueCandidates(candidates.filter((item) => !conversationId || !item.conversation_id || item.conversation_id === conversationId));
  const pending = visibleCandidates.filter((item) => item.review_status === "pending");
  const pendingTargetIds = new Set(pending.map((item) => item.target_object_id).filter(Boolean));
  const recognized = objects.filter((item) => item.object_id !== contextObject?.object_id && !pendingTargetIds.has(item.object_id));
  const drafts = recognized.filter((item) => item.status === "draft");
  const approved = recognized.filter((item) => item.status !== "draft");
  const visibleContextCandidate = contextCandidate && (!conversationId || !contextCandidate.conversation_id || contextCandidate.conversation_id === conversationId) ? contextCandidate : null;
  const selectedCandidate = visibleCandidates.find((item) => `candidate:${item.candidate_id}` === selectedId) || visibleContextCandidate || null;
  const selected = objects.find((item) => item.object_id === selectedId) || (!selectedCandidate ? contextObject : null) || null;
  const targetFor = (candidate) => objects.find((item) => item.object_id === candidate.target_object_id) || (contextObject?.object_id === candidate.target_object_id ? contextObject : null);
  const group = (title, items) => items.length ? <section className="sino-object-workspace__group"><h3>{title}</h3>{items.map((item) => <ObjectCard key={item.object_id} item={item} selected={selected?.object_id === item.object_id} onSelect={setSelectedId} />)}</section> : null;
  const primary = selected || contextObject || drafts[0] || approved[0] || null;
  const candidatePrimary = selectedCandidate || visibleContextCandidate || pending[0] || null;
  return <section className="sino-object-workspace sino-capability-context" aria-label="能力上下文">
    <header><h2>能力上下文</h2><span className="sino-kicker">Capability Context</span><p>从当前讨论持续形成的对象结构</p></header>
    {(creationContext || primary || candidatePrimary) && <section className="sino-capability-context__summary"><h3>当前创建对象</h3><strong>{objectTypeLabel(primary?.object_type || candidatePrimary?.proposed_object_type || creationContext?.type)}</strong><p>{primary?.name || candidatePrimary?.proposed_name || creationContext?.name || "名称待讨论"}</p></section>}
    {pending.length ? <section className="sino-object-workspace__group sino-object-workspace__pending"><h3>待确认</h3>{pending.map((item) => <PendingCandidateCard key={item.candidate_id} item={item} target={targetFor(item)} selected={selectedCandidate?.candidate_id === item.candidate_id} onSelect={setSelectedId} onReview={onCandidateReview} onContinue={onCandidateContinue} busy={busy} />)}</section> : null}
    <div className="sino-object-workspace__list">
      {recognitionStatus?.status === "unavailable" ? <div className="sino-object-workspace__empty"><strong>对象识别暂不可用</strong><p>Sino 对话仍可正常继续，稍后会重新尝试识别。</p></div> : null}
      {group("新增对象 · 等待确认", drafts)}
      {group("已进入执行", approved)}
      {contextObject && !pendingTargetIds.has(contextObject.object_id) ? <section className="sino-object-workspace__group"><h3>当前对象</h3><ObjectCard item={contextObject} selected={selected?.object_id === contextObject.object_id} onSelect={setSelectedId} /></section> : null}
      {!objects.length && !visibleCandidates.length && !creationContext && <div className="sino-object-workspace__empty"><strong>当前讨论尚未形成能力对象</strong><p>继续讨论后，Sino 会自动识别 Agent、Skill、Workflow、Prompt、Capability 或 Project。</p></div>}
    </div>
    <section className="sino-capability-context__structure" aria-label="能力结构"><div><span>目标</span><p>{primary?.description || candidatePrimary?.proposed_description || intelligence?.summary || creationContext?.prompt || "等待讨论形成"}</p></div><div><span>已确认结论</span><p>{intelligence?.decisions?.filter?.((item) => item.confirmed).map((item) => item.title || item.content).join(" · ") || "暂无"}</p></div><div><span>新增知识</span><p>{intelligence?.knowledge?.map?.((item) => item.title || item.content).slice(0, 3).join(" · ") || "暂无"}</p></div><div><span>关键约束</span><p>{intelligence?.constraints?.map?.((item) => item.title || item.content || item).slice(0, 3).join(" · ") || "暂无"}</p></div><div><span>待确认问题</span><p>{intelligence?.pending_questions?.map?.((item) => item.content || item).slice(0, 3).join(" · ") || "暂无"}</p></div><div><span>依赖对象</span><p>{primary?.dependency_object_ids?.join?.(" · ") || "暂无"}</p></div><div><span>计划发布给</span><p>{primary?.used_by?.join?.(" · ") || "待确认：Studio AI / Operator AI / Industrial AI / Quant AI"}</p></div></section>
    {selectedCandidate && selectedCandidate.review_status === "pending" ? <article className="sino-object-detail sino-object-detail--candidate" aria-label="候选变更详情"><dl><div><dt>Candidate ID</dt><dd>{selectedCandidate.candidate_id}</dd></div><div><dt>意图类型</dt><dd>{intentLabel(selectedCandidate.intent_type)}</dd></div><div><dt>来源 Conversation</dt><dd>{selectedCandidate.conversation_id || "暂无"}</dd></div><div><dt>来源消息</dt><dd>{selectedCandidate.source_message_refs?.join(" · ") || "暂无"}</dd></div><div><dt>Confidence</dt><dd>{Math.round((selectedCandidate.confidence || 0) * 100)}%</dd></div></dl></article> : null}
    {selectedCandidate && selectedCandidate.review_status !== "pending" ? <article className="sino-object-detail" aria-label="候选变更操作"><header><span>{intentLabel(selectedCandidate.intent_type)}</span><h3>{displayName(selectedCandidate.proposed_name || "目标对象待确认")}</h3></header><p>{candidateChange(selectedCandidate)}</p><dl><div><dt>审核状态</dt><dd>{candidateReviewStatusLabel(selectedCandidate.review_status)}</dd></div><div><dt>来源 Conversation</dt><dd>{selectedCandidate.conversation_id || "暂无"}</dd></div>{selectedCandidate.mutation_result?.object_id ? <><div><dt>正式对象</dt><dd>已生成正式对象</dd></div><div><dt>Object ID</dt><dd>{selectedCandidate.mutation_result.object_id}</dd></div><div><dt>Object Type</dt><dd>{objectTypeLabel(selectedCandidate.mutation_result.object_type || selectedCandidate.proposed_object_type)}</dd></div><div><dt>Object Status</dt><dd>{statusLabel(selectedCandidate.mutation_result.materialization_status || "draft")}</dd></div></> : null}</dl></article> : null}
    {selected && !pendingTargetIds.has(selected.object_id) && <article className="sino-object-detail" aria-label="对象操作"><header><span>{objectTypeLabel(selected.object_type, selected.type_label)}</span><h3>{selected.name}</h3></header><p>{selected.description || "暂无说明"}</p><dl><div><dt>状态</dt><dd>{statusLabel(selected.status)}</dd></div><div><dt>当前版本</dt><dd>V{selected.version}</dd></div><div><dt>来源会话</dt><dd>{selected.source_conversation_id || "暂无"}</dd></div>{taskAssetRef(selected) ? <><div><dt>TaskAsset</dt><dd>已创建 TaskAsset</dd></div><div><dt>任务标题</dt><dd>{taskAssetRef(selected).title || selected.name}</dd></div><div><dt>任务状态</dt><dd>{statusLabel(taskAssetRef(selected).status)}</dd></div><div><dt>任务审批</dt><dd>{statusLabel(taskAssetRef(selected).approval_status)}</dd></div><div><dt>任务执行</dt><dd>{statusLabel(taskAssetRef(selected).execution_status, { execution: true })}</dd></div></> : null}</dl>{executionRef(selected) ? <p className="sino-object-detail__execution">已进入执行 · V{executionRef(selected).object_version || selected.version} · {executionLabel(selected)}</p> : null}<footer><button type="button" onClick={() => onOpenObject(selected)}>查看对象</button>{selected.status === "draft" && <button type="button" onClick={() => onApprove(selected)} disabled={busy}>批准对象</button>}{canCreateTaskAsset(selected) && <button type="button" onClick={() => onCreateTask?.(selected)} disabled={busy}>创建任务</button>}{taskAssetRef(selected) ? <button type="button" onClick={() => onOpenObject(selected)} disabled={busy}>查看任务中心</button> : null}<button type="button" onClick={() => onContinue(selected)} disabled={busy}>继续讨论</button>{selected.status === "draft" && <button type="button" onClick={() => onArchive(selected)} disabled={busy}>驳回 / 归档</button>}</footer></article>}
  </section>;
}
