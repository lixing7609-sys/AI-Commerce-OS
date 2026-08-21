import { useState } from "react";
import { businessAssetName, isDeveloperRecord } from "./assetPresentation.js";
import { bindFounderConversationProject, createFounderProject, deleteFounderProject, updateFounderProject } from "../services/founderAiApi.js";
import { ComposeIcon, FolderIcon, FolderPlusIcon, LibraryIcon, SearchIcon, SettingsIcon, SidebarIcon } from "./FounderWorkspaceIcons.jsx";

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
  return <div className="sino-conversation-list">{items.map((item) => <div key={item.id} data-conversation-id={item.id} className={`sino-conversation-item${item.id === activeConversationId ? " is-active" : ""}`}><button type="button" className="sino-conversation-item__open" onClick={() => onSelectConversation(item.id)} title={item.title}><b>{item.title || "新讨论"}</b><small>{conversationTimeLabel(item, now)}</small></button><button type="button" className="sino-conversation-item__menu" aria-label={`会话操作 ${item.title}`} onClick={() => setMenu(menu === item.id ? null : item.id)}>···</button>{menu === item.id ? <div className="sino-sidebar-popover sino-conversation-move-menu"><strong>Move to Project</strong>{projects.filter((project) => project.id !== item.project_id).map((project) => <button key={project.id} type="button" onClick={() => { onMoveConversation(item.id, project.id); setMenu(null); }}>{project.name}</button>)}{item.project_id ? <button type="button" onClick={() => { onMoveConversation(item.id, null); setMenu(null); }}>移出 Project</button> : null}<button type="button" onClick={() => onDeleteConversation(item)}>删除会话</button></div> : null}</div>)}</div>;
}

export function FounderNavigationPanel({ active, onNavigate, onCollapse, resizeHandle, conversations = [], activeConversationId, onNewConversation, onSelectConversation, onDeleteConversation, projects = [], activeProjectId, onSelectProject, onProjectsChanged }) {
  const [now] = useState(() => Date.now());
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectMenu, setProjectMenu] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [projectAssignments, setProjectAssignments] = useState({});
  const [projectError, setProjectError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const founderConversations = stableConversationOrder(conversations.filter((item) => {
    const type = item.conversation_type || "USER_CONVERSATION";
    return ["USER_CONVERSATION", "PROJECT_CONVERSATION"].includes(type) && (item.visibility || "conversation_list") === "conversation_list" && (item.lifecycle_status || "active") === "active";
  }));
  const validProjectIds = new Set(projects.map((project) => project.id));
  const projectForConversation = (item) => {
    const projectId = Object.hasOwn(projectAssignments, item.id) ? projectAssignments[item.id] : item.project_id;
    return projectId && validProjectIds.has(projectId) ? projectId : null;
  };
  const sortedProjects = projects.filter((project) => !isDeveloperRecord(project)).sort((a, b) => {
    const latest = (project) => Math.max(conversationTimestamp(project), ...founderConversations.filter((item) => projectForConversation(item) === project.id).map(conversationTimestamp));
    return latest(b) - latest(a);
  });
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const matchesSearch = (value) => !normalizedSearch || String(value || "").toLocaleLowerCase().includes(normalizedSearch);
  const visibleProjects = sortedProjects.filter((project) => matchesSearch(businessAssetName({ ...project, asset_type: "project" })));
  const displayedProjects = normalizedSearch || projectsExpanded ? visibleProjects : visibleProjects.slice(0, 4);
  const visibleConversations = founderConversations.filter((conversation) => matchesSearch(conversation.title));
  const hasSearchResults = visibleProjects.length > 0 || visibleConversations.length > 0;
  async function createProject(event) {
    event.preventDefault(); const name = projectName.trim(); if (!name) return;
    try { const project = await createFounderProject({ name, description: null }); await onProjectsChanged?.(); setCreatingProject(false); setProjectName(""); onSelectProject(project.id); }
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

  return <aside className="founder-navigation-panel" aria-label="Founder Navigation">
    <div className="sino-sidebar__header">
    <div className="sino-sidebar-top-actions" aria-label="Workspace navigation controls">
      {onCollapse ? <button type="button" className="sino-sidebar-toggle" onClick={onCollapse} title="收起侧边栏" aria-label="收起侧边栏"><SidebarIcon /></button> : null}
      <button type="button" className="sino-new-conversation" onClick={onNewConversation} title="新建讨论" aria-label="新建讨论"><ComposeIcon /></button>
    </div>
    <label className="sino-sidebar-search"><SearchIcon /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setSearchQuery(""); } }} placeholder="搜索" aria-label="搜索项目和最近会话" /></label>
    {normalizedSearch && !hasSearchResults ? <p className="sino-sidebar-search-empty" role="status">没有找到结果</p> : null}
    </div>
    <div className="sino-sidebar__navigation-scroll">
    <div className="sino-sidebar__fixed-top">
    <button type="button" className={`sino-sidebar-home sino-sidebar-row${active === "conversation" ? " is-active" : ""}`} onClick={() => onNavigate("conversation")} title="Sino AI" aria-label="Sino AI"><span className="sino-brand-mark">S</span><b>Sino AI</b></button>
    <button type="button" title="库" aria-label="库" className={`sino-sidebar-library sino-sidebar-row${active === "capability-center" ? " is-active" : ""}`} onClick={() => onNavigate("capability-center")}><LibraryIcon /><span>库</span></button>
    <section className="sino-sidebar-section sino-project-workspace"><div className="sino-project-heading sino-sidebar-primary-title"><span className="sino-sidebar-primary-title__label">项目</span></div><div className="sino-project-list"><button type="button" className="sino-project-create-entry sino-sidebar-row" aria-label="新建项目" title="新建项目" onClick={() => setCreatingProject(true)}><FolderPlusIcon />新建项目</button>{creatingProject ? <form className="sino-project-create" onSubmit={createProject}><input autoFocus aria-label="Project 名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project 名称" /><button type="submit">创建</button><button type="button" onClick={() => setCreatingProject(false)}>取消</button></form> : null}{displayedProjects.map((project) => <div className="sino-project-item" key={project.id}><div className={`sino-project-item__row${project.id === activeProjectId ? " is-active" : ""}`}>{editingProject === project.id ? <input autoFocus aria-label={`重命名 ${project.name}`} defaultValue={project.name} onBlur={(event) => renameProject(project, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameProject(project, event.currentTarget.value); if (event.key === "Escape") setEditingProject(null); }} /> : <button type="button" className="sino-project-item__open sino-sidebar-row" onClick={() => onSelectProject(project.id)} title={project.description || project.name}><FolderIcon /><span>{businessAssetName({ ...project, asset_type: "project" })}</span></button>}<button type="button" className="sino-project-item__menu" aria-label={`Project 操作 ${project.name}`} onClick={() => setProjectMenu(projectMenu === project.id ? null : project.id)}>···</button>{projectMenu === project.id ? <div className="sino-sidebar-popover"><button type="button" onClick={() => { setEditingProject(project.id); setProjectMenu(null); }}>Rename</button><button type="button" onClick={() => archiveProject(project)}>Archive</button><button type="button" onClick={() => removeProject(project)}>Delete</button></div> : null}</div></div>)}{!normalizedSearch && visibleProjects.length > 4 ? <button type="button" className="sino-project-expand sino-sidebar-row" onClick={() => setProjectsExpanded((current) => !current)}><span className="sino-sidebar-row__icon" aria-hidden="true">···</span><span>{projectsExpanded ? "收起显示" : "展开显示"}</span></button> : null}{projectError ? <p role="alert">{projectError}</p> : null}</div></section>
    </div>
    {(!normalizedSearch || visibleConversations.length > 0) ? <section className="sino-sidebar__conversation-section" aria-label="最近">
      <div className="sino-sidebar__conversation-title sino-sidebar-primary-title"><span className="sino-sidebar-primary-title__label">最近</span></div>
      <div className="sino-sidebar__scroll-region" aria-label="历史会话列表">
        <div className="sino-conversation-navigation">
          <ConversationList items={visibleConversations} now={now} projects={sortedProjects} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} onMoveConversation={moveConversation} />
        </div>
      </div>
    </section> : null}
    </div>
    <footer><button type="button" className="sino-sidebar-settings sino-sidebar-row" title="设置" aria-label="设置" onClick={() => onNavigate("settings")} aria-current={active === "settings" ? "page" : undefined}><SettingsIcon /><span>设置</span></button></footer>
    {resizeHandle}
  </aside>;
}
