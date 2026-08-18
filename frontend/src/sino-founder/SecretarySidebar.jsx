import { useState } from "react";
import { businessAssetName, isDeveloperRecord } from "./assetPresentation.js";
import { bindFounderConversationProject, createFounderProject, deleteFounderProject, updateFounderProject } from "../services/founderAiApi.js";

const SIDEBAR_COLLAPSED_KEY = "sino-founder-sidebar-collapsed";

function FolderIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2.25 4.25h4l1.25 1.5h6.25v6.5H2.25z" /></svg>;
}

function ConversationIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2.25 3.25h11.5v7.5H6l-3.75 2z" /></svg>;
}

function SidebarToggleIcon({ expanded = false }) {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1.5" /><path d="M5.5 2.5v11M8.5 6l2 2-2 2" className={expanded ? "is-expanded" : ""} /></svg>;
}

function restoredCollapsedState() {
  try { return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"; }
  catch { return false; }
}

function conversationTimestamp(item) {
  const value = item.updatedAt ?? item.updated_at ?? item.created_at;
  const timestamp = typeof value === "number" ? value : new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function compareConversationIdentity(left, right) {
  const updated = conversationTimestamp(right) - conversationTimestamp(left);
  if (updated) return updated;
  const leftCreated = new Date(left.createdAt ?? left.created_at ?? 0).getTime() || 0;
  const rightCreated = new Date(right.createdAt ?? right.created_at ?? 0).getTime() || 0;
  if (rightCreated !== leftCreated) return rightCreated - leftCreated;
  return String(right.id ?? right.conversation_id ?? "").localeCompare(String(left.id ?? left.conversation_id ?? ""));
}

export function stableConversationOrder(items) {
  return [...items].sort(compareConversationIdentity);
}

function conversationTimeLabel(item, now) {
  const timestamp = conversationTimestamp(item);
  if (!timestamp) return "";
  const date = new Date(timestamp); const current = new Date(now);
  const startToday = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  if (timestamp >= startToday) return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (timestamp >= startYesterday) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function ConversationList({ items, now, projects, activeConversationId, onSelectConversation, onDeleteConversation, onMoveConversation }) {
  const [menu, setMenu] = useState(null);
  return <div className="sino-conversation-list">{items.map((item) => <div key={item.id} data-conversation-id={item.id} className={`sino-conversation-item${item.id === activeConversationId ? " is-active" : ""}`}><button type="button" className="sino-conversation-item__open" onClick={() => onSelectConversation(item.id)} title={item.title}><span>•</span><b>{item.title || "新讨论"}</b><small>{conversationTimeLabel(item, now)}</small></button><button type="button" className="sino-conversation-item__menu" aria-label={`会话操作 ${item.title}`} onClick={() => setMenu(menu === item.id ? null : item.id)}>···</button>{menu === item.id ? <div className="sino-sidebar-popover sino-conversation-move-menu"><strong>Move to Project</strong>{projects.filter((project) => project.id !== item.project_id).map((project) => <button key={project.id} type="button" onClick={() => { onMoveConversation(item.id, project.id); setMenu(null); }}>{project.name}</button>)}{item.project_id ? <button type="button" onClick={() => { onMoveConversation(item.id, null); setMenu(null); }}>移出 Project</button> : null}<button type="button" onClick={() => onDeleteConversation(item)}>删除会话</button></div> : null}</div>)}</div>;
}

export function SecretarySidebar({ active, onNavigate, conversations = [], activeConversationId, onNewConversation, onSelectConversation, onDeleteConversation, projects = [], activeProjectId, onSelectProject, onProjectsChanged }) {
  const [collapsed, setCollapsed] = useState(restoredCollapsedState);
  const [brandHovered, setBrandHovered] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [now] = useState(() => Date.now());
  const [expandedProjects, setExpandedProjects] = useState({});
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectMenu, setProjectMenu] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [projectAssignments, setProjectAssignments] = useState({});
  const [projectError, setProjectError] = useState("");
  const founderConversations = stableConversationOrder(conversations.filter((item) => !isDeveloperRecord(item)));
  const validProjectIds = new Set(projects.map((project) => project.id));
  const projectForConversation = (item) => {
    const projectId = Object.hasOwn(projectAssignments, item.id) ? projectAssignments[item.id] : item.project_id;
    return projectId && validProjectIds.has(projectId) ? projectId : null;
  };
  const sortedProjects = projects.filter((project) => !isDeveloperRecord(project)).sort((a, b) => {
    const latest = (project) => Math.max(conversationTimestamp(project), ...founderConversations.filter((item) => projectForConversation(item) === project.id).map(conversationTimestamp));
    return latest(b) - latest(a);
  });
  const childrenByParent = new Map();
  sortedProjects.forEach((project) => {
    const parentId = project.parent_project_id && validProjectIds.has(project.parent_project_id) ? project.parent_project_id : null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), project]);
  });
  const orderedProjects = [];
  const appendProject = (project, depth = 0) => {
    orderedProjects.push({ project, depth });
    const children = childrenByParent.get(project.id) || [];
    const expanded = expandedProjects[project.id] ?? project.id === activeProjectId;
    if (expanded) children.forEach((child) => appendProject(child, depth + 1));
  };
  (childrenByParent.get(null) || []).forEach((project) => appendProject(project));

  function setSidebarCollapsed(next) {
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* unavailable */ }
  }

  function expandSection(section) {
    setSidebarCollapsed(false);
    if (section === "projects") setProjectsOpen(true);
  }

  async function createProject(event) {
    event.preventDefault(); const name = projectName.trim(); if (!name) return;
    try { const project = await createFounderProject({ name, description: null }); await onProjectsChanged?.(); setExpandedProjects((current) => ({ ...current, [project.id]: true })); setCreatingProject(false); setProjectName(""); onSelectProject(project.id); }
    catch (error) { setProjectError(error.message); }
  }

  async function renameProject(project, name) {
    const nextName = name.trim(); if (!nextName) return;
    try { await updateFounderProject(project.id, { name: nextName }); await onProjectsChanged?.(); setEditingProject(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function archiveProject(project) {
    try { await updateFounderProject(project.id, { status: "archived" }); if (project.id === activeProjectId) onNavigate("home"); await onProjectsChanged?.(); setProjectMenu(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function removeProject(project) {
    if (!window.confirm(`删除 Project「${project.name}」？Conversation 将移出 Project，Ready 能力仍会保留。`)) return;
    try { await deleteFounderProject(project.id); setProjectAssignments((current) => ({ ...current, ...Object.fromEntries(founderConversations.filter((item) => projectForConversation(item) === project.id).map((item) => [item.id, null])) })); if (project.id === activeProjectId) onNavigate("home"); await onProjectsChanged?.(); setProjectMenu(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function moveConversation(id, projectId) {
    try { await bindFounderConversationProject(id, projectId); setProjectAssignments((current) => ({ ...current, [id]: projectId })); if (id === activeConversationId) await onSelectConversation(id); }
    catch (error) { setProjectError(error.message); }
  }

  return <aside className={`sino-sidebar${collapsed ? " sino-sidebar--collapsed" : ""}`}>
    <div className="sino-sidebar__fixed-top">
    <div className="sino-sidebar-brand-row">
      <button
        className="sino-brand"
        onClick={() => collapsed && brandHovered ? setSidebarCollapsed(false) : onNavigate("home")}
        onMouseEnter={() => setBrandHovered(true)}
        onMouseLeave={() => setBrandHovered(false)}
        onFocus={() => collapsed && setBrandHovered(true)}
        onBlur={() => setBrandHovered(false)}
        title={collapsed && brandHovered ? "展开侧边栏" : "Sino Founder AI 首页"}
      >
        <span className={`sino-brand-mark${collapsed && brandHovered ? " sino-brand-mark--expand" : ""}`}>{collapsed && brandHovered ? <SidebarToggleIcon expanded /> : "S"}</span>
        <div>Sino<strong>Founder AI</strong></div>
      </button>
      {!collapsed && <button type="button" className="sino-sidebar-toggle" onClick={() => setSidebarCollapsed(true)} title="收起侧边栏" aria-label="收起侧边栏"><SidebarToggleIcon /></button>}
    </div>
    <button className="sino-new-conversation" onClick={onNewConversation} title="新建讨论"><span>＋</span><b>新建讨论</b></button>
    {collapsed && <nav className="sino-collapsed-navigation" aria-label="侧边栏快捷入口">
      <button type="button" title="项目" aria-label="项目" onClick={() => expandSection("projects")}><FolderIcon /></button>
    </nav>}
    <section className="sino-sidebar-section sino-project-workspace"><div className="sino-project-heading sino-sidebar-primary-title"><button type="button" onClick={() => setProjectsOpen((value) => !value)} aria-expanded={projectsOpen}><span><FolderIcon />项目</span></button><button type="button" aria-label="新建 Project" title="新建 Project" onClick={() => { setCreatingProject(true); setProjectsOpen(true); }}>＋</button></div>{projectsOpen && <div className="sino-project-list">{creatingProject ? <form className="sino-project-create" onSubmit={createProject}><input autoFocus aria-label="Project 名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project 名称" /><button type="submit">创建</button><button type="button" onClick={() => setCreatingProject(false)}>取消</button></form> : null}{orderedProjects.map(({ project, depth }) => { const projectConversations = founderConversations.filter((item) => projectForConversation(item) === project.id); const expanded = expandedProjects[project.id] ?? project.id === activeProjectId; return <div className={`sino-project-item${depth ? " is-child" : ""}`} style={depth ? { marginLeft: `${depth * 14}px` } : undefined} key={project.id}><div className={`sino-project-item__row${project.id === activeProjectId ? " is-active" : ""}`}>{editingProject === project.id ? <input autoFocus aria-label={`重命名 ${project.name}`} defaultValue={project.name} onBlur={(event) => renameProject(project, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameProject(project, event.currentTarget.value); if (event.key === "Escape") setEditingProject(null); }} /> : <button type="button" className="sino-project-item__open" onClick={() => { setExpandedProjects((current) => ({ ...current, [project.id]: !expanded })); onSelectProject(project.id); }} title={project.description || project.name}><i>{depth ? "└" : expanded ? "⌄" : "›"}</i><span>{businessAssetName({ ...project, asset_type: "project" })}</span><small>{projectConversations.length}</small></button>}<button type="button" className="sino-project-item__menu" aria-label={`Project 操作 ${project.name}`} onClick={() => setProjectMenu(projectMenu === project.id ? null : project.id)}>···</button>{projectMenu === project.id ? <div className="sino-sidebar-popover"><button type="button" onClick={() => { setEditingProject(project.id); setProjectMenu(null); }}>Rename</button><button type="button" onClick={() => archiveProject(project)}>Archive</button><button type="button" onClick={() => removeProject(project)}>Delete</button></div> : null}</div><div className="sino-project-item__meta"><span>{projectConversations.length} Conversations</span><span>Ready {project.ready_count || 0}</span><span>Candidate {project.candidate_count || 0}</span></div></div>; })}{projectError ? <p role="alert">{projectError}</p> : null}</div>}</section>
    </div>
    <section className="sino-sidebar__conversation-section" aria-label="会话">
      <div className="sino-sidebar__conversation-title sino-sidebar-primary-title"><span><ConversationIcon />会话</span></div>
      <div className="sino-sidebar__scroll-region" aria-label="历史会话列表">
        <div className="sino-conversation-navigation">
          <ConversationList items={founderConversations} now={now} projects={sortedProjects} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} onMoveConversation={moveConversation} />
        </div>
      </div>
    </section>
    <footer><button type="button" className="sino-sidebar-settings" onClick={() => onNavigate("settings")} aria-current={active === "settings" ? "page" : undefined}>⚙ 设置</button></footer>
  </aside>;
}
