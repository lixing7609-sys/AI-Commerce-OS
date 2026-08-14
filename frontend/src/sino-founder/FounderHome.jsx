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

export function FounderHome({ intelligence, message, onMessage, onSend, busy, onNavigate, onQuickCreate, healthy, projects, activeProjectId, onSelectProject, onCreateProject, onFiles, mode, onModeChange }) {
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
      />
      <nav className="sino-quick-create" aria-label="快速创建能力">{QUICK_CREATION.map(([type, label]) => <button type="button" key={type} onClick={() => onQuickCreate(type)}>{label}</button>)}</nav>
      {resumeItems.length > 0 && <section className="sino-home-resume" aria-label="继续工作"><header><h2>继续工作</h2></header>{resumeItems.map((item) => <article key={item.execution_id}><div><strong>{item.goal}</strong><small>{executionStatusLabel(item.status)}</small></div><button type="button" onClick={() => onNavigate(item.status === "draft" ? "builder" : "execution")}>继续处理</button></article>)}</section>}
    </div>
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
  const empty = !intelligence;
  const latestDecisions = (intelligence?.decisions || []).filter((item) => item.confirmed).slice(0, 5);
  const pendingQuestions = (intelligence?.pending_questions || []).slice(0, 5);
  const activeGoals = [...(intelligence?.active_goals || []), ...(intelligence?.candidate_goals || [])].filter((item, index, items) => items.findIndex((candidate) => candidate.goal_id === item.goal_id) === index).slice(0, 5);
  const promptDelta = intelligence?.prompt_delta || {};
  return <section className="sino-project-context" aria-label="当前项目智能">
    <header><span className="sino-kicker">项目上下文</span><small>当前项目</small><strong>{intelligence?.project_name || "未选择"}</strong></header>
    <article><span>项目摘要</span><p>{intelligence?.project_summary || "—"}</p></article>
    <article><span>当前定位</span><p>{intelligence?.current_positioning || "—"}</p></article>
    <article><span>动态提示词</span>{empty ? <strong>—</strong> : <><strong>v{intelligence.prompt_version || 1}</strong><small>最近变更：新增 {promptDelta.added?.length || 0} · 修订 {promptDelta.revised?.length || 0}</small><button type="button" onClick={() => onNavigate("assets")}>查看 Prompt</button></>}</article>
    <article className={changed.includes("decisions") ? "is-intelligence-updated" : ""}><span>正式决策</span>{latestDecisions.length ? <ul>{latestDecisions.map((item) => <li key={item.decision_id}>{item.title}</li>)}</ul> : <small>—</small>}</article>
    <article className={changed.includes("knowledge") ? "is-intelligence-updated" : ""}><span>项目知识</span>{intelligence?.knowledge?.length ? <ul>{intelligence.knowledge.slice(0, 5).map((item, index) => <li key={item.memory_id || `knowledge-${index}`}>{item.title || item.content || String(item)}</li>)}</ul> : <small>—</small>}</article>
    <article><span>项目约束</span>{intelligence?.constraints?.length ? <ul>{intelligence.constraints.slice(0, 5).map((item, index) => <li key={item.constraint_id || `constraint-${index}`}>{item.title || item.content || String(item)}</li>)}</ul> : <small>—</small>}</article>
    <article><span>项目术语</span>{intelligence?.terminology?.length ? <ul>{intelligence.terminology.slice(0, 5).map((item, index) => <li key={item.term_id || `term-${index}`}>{item.term || item.title || item.content || String(item)}</li>)}</ul> : <small>—</small>}</article>
    <article className={changed.includes("questions") ? "is-intelligence-updated" : ""}><span>待确认问题</span>{pendingQuestions.length ? <ul>{pendingQuestions.map((item) => <li key={item.question_id}><button type="button" onClick={() => onOpenConversation(item.conversation_id)}>{item.content}</button></li>)}</ul> : <small>—</small>}</article>
    <article className={changed.includes("goals") ? "is-intelligence-updated" : ""}><span>项目目标</span>{activeGoals.length ? <ul>{activeGoals.map((item) => <li key={item.goal_id}><button type="button" onClick={() => item.conversation_id ? onOpenConversation(item.conversation_id) : onNavigate("reasoning")}>{item.title}<small>{item.status}</small></button></li>)}</ul> : <small>—</small>}</article>
    <footer><span>最近更新</span><time>{intelligence?.updated_at ? formatTime(intelligence.updated_at) : "—"}</time></footer>
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
  if (!intelligence) return <section className="sino-project-workspace" aria-label="项目工作区"><p className="sino-project-workspace__state" role="status">{loading ? "正在加载项目…" : error || "项目暂时不可用"}</p></section>;
  const conversations = [...(intelligence.conversation_refs || [])].sort((left, right) => new Date(right.updated_at || 0) - new Date(left.updated_at || 0));
  return <section className="sino-project-workspace" aria-label="项目工作区">
    <header><h1>{intelligence.project_name}</h1><span>项目讨论</span></header>
    <div className="sino-project-conversations" role="region" aria-label={`${intelligence.project_name} 项目会话`}>
      {conversations.length ? conversations.map((item) => <button type="button" className="sino-project-conversation-row" key={item.conversation_id} onClick={() => onOpenConversation(item.conversation_id)}>
        <strong>{item.title || "新讨论"}</strong>
        {item.summary && <p>{item.summary}</p>}
        <time>{formatTime(item.updated_at)}</time>
      </button>) : <p className="sino-project-conversations__empty">还没有项目讨论</p>}
    </div>
    <div className="sino-conversation-composer-dock"><GlobalSecretaryComposer value={message} onChange={onMessage} onSubmit={onSend} busy={busy} healthy={healthy} mode={mode} onModeChange={onModeChange} placeholder={`继续和 Sino 讨论 ${intelligence.project_name}……`} toolbar={<span className="sino-project-context-lock" aria-label="当前项目"><span aria-hidden="true">📁</span>{intelligence.project_name}</span>} /></div>
  </section>;
}

export function ProjectObjectContext({ selection, intelligence }) {
  if (!selection) return null;
  const value = selection.item;
  return <section className="sino-context-summary" aria-label="项目对象详情"><article><span className="sino-kicker">{selection.kind}</span><strong>{value?.title || value?.content || String(value)}</strong>{value?.content && value.content !== value.title && <p>{typeof value.content === "string" ? value.content : JSON.stringify(value.content, null, 2)}</p>}<small>{intelligence?.project_name}</small></article></section>;
}
