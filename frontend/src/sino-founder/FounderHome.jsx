import { useEffect, useRef, useState } from "react";
import { GlobalSecretaryComposer } from "./GlobalSecretaryComposer.jsx";

const executionStatusLabel = (status) => ({
  draft: "等待 Founder 批准",
  approved: "已批准",
  queued: "等待执行",
  executing: "执行中",
  testing: "验证中",
  paused: "执行已暂停",
  failed: "执行失败",
}[status] || status);
import { ComposerContextControls } from "./ComposerContextControls.jsx";

const formatTime = (value) => value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";

const QUICK_CREATION = [["agent", "创建 Agent"], ["skill", "创建 Skill"], ["workflow", "创建 Workflow"], ["prompt", "创建 Prompt"], ["capability", "创建 Capability"], ["project", "创建 Project"]];

export function FounderHome({ intelligence, message, onMessage, onSend, busy, onNavigate, onQuickCreate, healthy, projects, activeProjectId, onSelectProject, onCreateProject, onFiles, mode, onModeChange, pendingAttachments, onAddImages, onRemoveImage }) {
  const resumeItems = (intelligence?.execution_refs || []).filter((item) => ["draft", "approved", "queued", "executing", "testing", "paused", "failed"].includes(item.status)).slice(0, 3);
  return <section className="sino-home" aria-labelledby="sino-home-title">
    <div className="sino-home__center">
      <h1 id="sino-home-title">创造什么 AI 能力？</h1>
      <p className="sino-home__intro">与 Sino 讨论需求，创建 Agent、Skill、Workflow、Prompt 或 Capability。</p>
      <GlobalSecretaryComposer
        value={message}
        onChange={onMessage}
        onSubmit={onSend}
        busy={busy}
        healthy={healthy}
        large
        mode={mode}
        onModeChange={onModeChange}
        toolbar={<ComposerContextControls healthy={healthy} projects={projects} activeProjectId={activeProjectId} onSelectProject={onSelectProject} onCreateProject={onCreateProject} onFiles={onFiles} />}
        toolbarIncludesStatus
        attachments={pendingAttachments}
        onAddImages={onAddImages}
        onRemoveImage={onRemoveImage}
      />
      <nav className="sino-quick-create" aria-label="快速创建能力">{QUICK_CREATION.map(([type, label]) => <button type="button" key={type} onClick={() => onQuickCreate(type)}>{label}</button>)}</nav>
      {resumeItems.length > 0 && <section className="sino-home-resume" aria-label="继续工作"><header><h2>继续工作</h2></header>{resumeItems.map((item) => <article key={item.execution_id}><div><strong>{item.goal}</strong><small>{executionStatusLabel(item.status)}</small></div><button type="button" onClick={() => onNavigate(item.status === "draft" ? "builder" : "execution")}>继续处理</button></article>)}</section>}
    </div>
  </section>;
}

export function DraftDiscussion({ message, onMessage, onSend, busy, healthy, projects, activeProjectId, onSelectProject, onCreateProject, onFiles, mode, onModeChange, pendingAttachments, onAddImages, onRemoveImage }) {
  return <section className="sino-draft-discussion" aria-label="Draft Discussion">
    <div className="sino-home__center">
      <GlobalSecretaryComposer
        value={message}
        onChange={onMessage}
        onSubmit={onSend}
        busy={busy}
        healthy={healthy}
        large
        mode={mode}
        onModeChange={onModeChange}
        toolbar={<ComposerContextControls healthy={healthy} projects={projects} activeProjectId={activeProjectId} onSelectProject={onSelectProject} onCreateProject={onCreateProject} onFiles={onFiles} />}
        toolbarIncludesStatus
        attachments={pendingAttachments}
        onAddImages={onAddImages}
        onRemoveImage={onRemoveImage}
      />
    </div>
  </section>;
}

export function DraftDiscussionContext() {
  return <section className="sino-founder-task-sidebar sino-draft-discussion-context" aria-label="Task Status and Founder Action Queue">
    <section className="sino-task-status-empty" aria-label="Task Status">
      <header><h2>任务状态</h2></header>
      <strong>新讨论</strong>
      <p>尚未形成执行任务</p>
      <small>Founder：无需操作</small>
    </section>
    <section className="sino-founder-action-queue" aria-label="Founder Action Queue">
      <header><h2>需要你处理</h2><span>暂无需要你处理的事项</span></header>
      <p className="sino-draft-discussion-context__hint">提交第一条有效消息后，Sino 会在这里同步任务状态与需要你处理的事项。</p>
    </section>
  </section>;
}

export function ProjectIntelligenceContext({ intelligence, onNavigate, onOpenConversation }) {
  const previousRef = useRef(null);
  const [changed, setChanged] = useState([]);
  useEffect(() => {
    const next = intelligence ? {
      decisions: (intelligence.decisions || []).length,
      knowledge: (intelligence.knowledge || []).length,
      questions: (intelligence.pending_questions || []).length,
      goals: (intelligence.active_goals || []).length + (intelligence.candidate_goals || []).length,
    } : null;
    const previous = previousRef.current;
    if (previous && next) {
      const keys = Object.keys(next).filter((key) => next[key] > previous[key]);
      if (keys.length) {
        setChanged(keys);
        const timer = window.setTimeout(() => setChanged([]), 2000);
        previousRef.current = next;
        return () => window.clearTimeout(timer);
      }
    }
    previousRef.current = next;
    return undefined;
  }, [intelligence]);
  const constitution = intelligence?.constitution;
  const initialContext = intelligence?.initial_project_context;
  const confirmed = constitution?.status === "confirmed";
  const statusLabel = confirmed ? "Confirmed" : "Founder Review";
  const recognitionLabel = confirmed ? "已确认" : "已识别 · 待确认";
  const pendingQuestions = intelligence?.pending_questions || [];
  const implementationResult = intelligence?.implementation_result;
  const externalDependency = implementationResult?.external_dependencies?.[0];
  return <section className="sino-project-context" aria-label="当前项目智能">
    <header><span className="sino-kicker">Project Intelligence</span><small>当前项目</small><strong>{intelligence?.project_name || "未选择"}</strong></header>
    <article><span>Project Summary</span><p>{intelligence?.project_summary || "—"}</p></article>
    {initialContext ? <>
      <article><span>Project Name</span><strong>{intelligence.project_name}</strong></article>
      <article><span>Parent</span><strong>{initialContext.parent_project_name || "—"}</strong></article>
      <article><span>Architecture Role</span><strong>{initialContext.architecture_role || "—"}</strong></article>
      <article><span>Initial Positioning</span><p>{initialContext.initial_positioning || "—"}</p></article>
      <article><span>Initial Scope</span>{initialContext.initial_scope?.length ? <ul>{initialContext.initial_scope.map((item) => <li key={item}>{item}</li>)}</ul> : <small>—</small>}</article>
      <article><span>Inherited Constitution</span><strong>{initialContext.inherited_constitution?.title || "—"}</strong><small>Context Status · {initialContext.inherited_constitution?.status === "confirmed" ? "Inherited / Active" : "—"}</small></article>
      <article className="sino-project-constitution"><span>Source</span><strong>{initialContext.source_conversation_title || "AI Commerce OS Constitution V1"}</strong>{initialContext.source_conversation_id ? <button type="button" onClick={() => onOpenConversation(initialContext.source_conversation_id)}>查看原文</button> : null}</article>
    </> : null}
    {constitution ? <>
      <article className="sino-project-constitution"><span>Constitution</span><strong>V{constitution.version} · {statusLabel}</strong><button type="button" onClick={() => onOpenConversation(constitution.source_conversation_id)}>查看原文</button></article>
      <article><span>System Architecture</span><dl><div><dt>Foundation Layer</dt><dd>{constitution.foundation_layer_count}</dd></div><div><dt>Application Layer</dt><dd>{constitution.application_layer_count}</dd></div><div><dt>System Objects</dt><dd>{constitution.system_objects_count} · {recognitionLabel}</dd></div></dl></article>
      <article><span>Capability Lifecycle</span><strong>{constitution.capability_lifecycle_status === "confirmed" ? "已确认" : "已识别"}</strong></article>
      <article><span>Capability Rules</span><strong>{constitution.capability_rules_count} 条</strong></article>
      <article><span>Founder Boundary</span><strong>{constitution.founder_boundary_status === "confirmed" ? "已确认" : "已识别"}</strong></article>
      <article><span>Sino Boundary</span><strong>{constitution.sino_boundary_status === "confirmed" ? "已确认" : "已识别"}</strong></article>
      <article><span>Proposed Work Items</span><strong>{constitution.proposed_work_items_count}</strong><small>Founder Decisions · {constitution.founder_decisions_count} / {constitution.proposed_work_items_count}</small></article>
    </> : <article><span>Constitution</span><small>尚未形成结构化 Constitution Understanding</small></article>}
    {implementationResult ? <article><span>Implementation Result</span><dl><div><dt>Implementation</dt><dd>✓ Completed</dd></div><div><dt>Validation</dt><dd>Blocked by External Dependency</dd></div>{externalDependency ? <div><dt>Dependency</dt><dd>{externalDependency.dependency_target}</dd></div> : null}</dl></article> : null}
    {intelligence?.project_lifecycle?.resume_point ? <article><span>Resume Point</span><strong>{String(intelligence.project_lifecycle.resume_point).toUpperCase()} Real Environment Validation</strong><small>{intelligence.project_lifecycle.current_action?.title}</small></article> : null}
    <article className={changed.includes("questions") ? "is-intelligence-updated" : ""}><span>待确认问题</span><strong>{pendingQuestions.length}</strong></article>
    <footer><span>最近更新</span><time>{constitution?.updated_at || intelligence?.updated_at ? formatTime(constitution?.updated_at || intelligence.updated_at) : "—"}</time></footer>
    {intelligence?.developer_debug && <details className="sino-intelligence-debug"><summary>Developer Debug</summary><pre>{JSON.stringify(intelligence.developer_debug, null, 2)}</pre></details>}
  </section>;
}

export function ConversationIntelligenceContext({ intelligence }) {
  const previousRef = useRef(null);
  const [changed, setChanged] = useState([]);
  const counts = intelligence ? {
    decisions: (intelligence.decisions || []).length,
    knowledge: (intelligence.knowledge || []).length,
    constraints: (intelligence.constraints || []).length,
    questions: (intelligence.pending_questions || []).length,
    goals: (intelligence.goals || []).length + (intelligence.candidate_goals || []).length,
  } : null;
  useEffect(() => {
    const previous = previousRef.current;
    if (previous && counts) {
      const keys = Object.keys(counts).filter((key) => counts[key] > previous[key]);
      if (keys.length) {
        setChanged(keys);
        const timer = window.setTimeout(() => setChanged([]), 1800);
        previousRef.current = counts;
        return () => window.clearTimeout(timer);
      }
    }
    previousRef.current = counts;
    return undefined;
  }, [intelligence?.updated_at]);
  const list = (items, key, render) => items?.length ? <ul>{items.slice(0, 5).map((item, index) => <li key={item[key] || `${key}-${index}`}>{render(item)}</li>)}</ul> : <small>—</small>;
  const decisions = (intelligence?.decisions || []).filter((item) => item.confirmed);
  const goals = [...(intelligence?.goals || []), ...(intelligence?.candidate_goals || [])];
  return <section className="sino-project-context sino-conversation-context" aria-label="当前会话智能">
    <header><span className="sino-kicker">会话上下文</span><strong>当前讨论</strong></header>
    <article><span>会话摘要</span><p>{intelligence?.summary || "—"}</p></article>
    <article><span>当前判断</span>{list(intelligence?.judgments, "judgment", (item) => typeof item === "string" ? item : item.content || item.title)}</article>
    <article className={changed.includes("decisions") ? "is-intelligence-updated" : ""}><span>已确认结论</span>{list(decisions, "decision_id", (item) => item.title || item.content)}</article>
    <article className={changed.includes("knowledge") ? "is-intelligence-updated" : ""}><span>新增知识</span>{list(intelligence?.knowledge, "knowledge_id", (item) => item.title || item.content)}</article>
    <article className={changed.includes("constraints") ? "is-intelligence-updated" : ""}><span>关键约束</span>{list(intelligence?.constraints, "constraint", (item) => typeof item === "string" ? item : item.content || item.title)}</article>
    <article><span>关键术语</span>{list(intelligence?.terminology, "term", (item) => typeof item === "string" ? item : item.term || item.title)}</article>
    <article className={changed.includes("questions") ? "is-intelligence-updated" : ""}><span>待确认问题</span>{list(intelligence?.pending_questions, "question_id", (item) => item.content)}</article>
    <article className={changed.includes("goals") ? "is-intelligence-updated" : ""}><span>候选目标</span>{list(goals, "goal_id", (item) => item.title)}</article>
    <footer><span>最近更新</span><time>{intelligence?.updated_at ? formatTime(intelligence.updated_at) : "—"}</time></footer>
  </section>;
}

export function ProjectWorkspace({ intelligence, loading, error, onOpenConversation, message, onMessage, onSend, busy, healthy, mode, onModeChange }) {
  const [tab, setTab] = useState("chats");
  if (!intelligence) return <section className="sino-project-workspace" aria-label="项目工作区"><p className="sino-project-workspace__state" role="status">{loading ? "正在加载项目…" : error || "项目暂时不可用"}</p></section>;
  const conversations = [...(intelligence.conversation_refs || [])].sort((left, right) => new Date(right.updated_at || 0) - new Date(left.updated_at || 0));
  return <section className="sino-project-workspace" aria-label="项目工作区">
    <header><nav className="sino-project-tabs" aria-label="项目内容"><button type="button" className={tab === "chats" ? "is-active" : ""} aria-pressed={tab === "chats"} onClick={() => setTab("chats")}>聊天</button><button type="button" className={tab === "sources" ? "is-active" : ""} aria-pressed={tab === "sources"} onClick={() => setTab("sources")}>数据源</button></nav></header>
    {tab === "chats" ? <div className="sino-project-conversations" role="region" aria-label={`${intelligence.project_name} 项目会话`}>
      {conversations.length ? conversations.map((item) => <button type="button" className="sino-project-conversation-row" key={item.conversation_id} onClick={() => onOpenConversation(item.conversation_id)}>
        <strong>{item.title || "新讨论"}</strong>
        {item.summary && <p>{item.summary}</p>}
        <time>{formatTime(item.updated_at)}</time>
      </button>) : <p className="sino-project-conversations__empty">还没有项目讨论</p>}
    </div> : <div className="sino-project-sources" role="region" aria-label={`${intelligence.project_name} 数据源`}><p>暂无项目数据源</p></div>}
    <div className="sino-conversation-composer-dock"><GlobalSecretaryComposer value={message} onChange={onMessage} onSubmit={onSend} busy={busy} healthy={healthy} mode={mode} onModeChange={onModeChange} placeholder={`继续和 Sino 讨论 ${intelligence.project_name}……`} toolbar={<span className="sino-project-context-lock" aria-label="当前项目"><span aria-hidden="true">📁</span>{intelligence.project_name}</span>} /></div>
  </section>;
}

export function ProjectObjectContext({ selection, intelligence }) {
  if (!selection) return null;
  const value = selection.item;
  return <section className="sino-context-summary" aria-label="项目对象详情"><article><span className="sino-kicker">{selection.kind}</span><strong>{value?.title || value?.content || String(value)}</strong>{value?.content && value.content !== value.title && <p>{typeof value.content === "string" ? value.content : JSON.stringify(value.content, null, 2)}</p>}<small>{intelligence?.project_name}</small></article></section>;
}
