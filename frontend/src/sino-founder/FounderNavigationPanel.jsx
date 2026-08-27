import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { businessAssetName, isDeveloperRecord } from "./assetPresentation.js";
import { bindFounderConversationProject, createFounderProject, deleteFounderProject, updateFounderProject } from "../services/founderAiApi.js";
import { ComposeIcon, FolderIcon, FolderPlusIcon, LibraryIcon, ProductMatrixIcon, SearchIcon, SettingsIcon, SidebarIcon } from "./FounderWorkspaceIcons.jsx";

const SINO_AI_PRODUCTS = [
  { key: "founder", name: "Sino Founder AI", description: "战略、决策与系统构建", available: true },
  { key: "operator", name: "Sino Operator AI", description: "经营执行与业务运营", href: "/operator", available: true },
  { key: "studio", name: "Sino Studio AI", description: "内容生产与流量运营", href: "/studio", available: true },
  { key: "industrial", name: "Sino Industrial AI", description: "产业智能", available: false },
  { key: "quant", name: "Sino Quant AI", description: "量化研究与交易", available: false },
];

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
  const navigationPanelRef = useRef(null);
  const [now] = useState(() => Date.now());
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectMenu, setProjectMenu] = useState(null);
  const [projectAction, setProjectAction] = useState(null);
  const [projectActionName, setProjectActionName] = useState("");
  const [projectAssignments, setProjectAssignments] = useState({});
  const [projectError, setProjectError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [productMatrixOpen, setProductMatrixOpen] = useState(false);
  const productMatrixTriggerRef = useRef(null);
  const productMatrixPanelRef = useRef(null);
  const createProjectTriggerRef = useRef(null);
  const createProjectPopoverRef = useRef(null);
  const projectActionTriggerRefs = useRef(new Map());
  const projectActionPopoverRef = useRef(null);
  const [createProjectPopoverPosition, setCreateProjectPopoverPosition] = useState({ top: 0, left: 0, arrowTop: 0 });
  const [projectActionPopoverPosition, setProjectActionPopoverPosition] = useState({ top: 0, left: 0, arrowTop: 0 });
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
  useEffect(() => {
    if (!creatingProject) return undefined;
    const position = () => {
      const triggerBounds = createProjectTriggerRef.current?.getBoundingClientRect();
      if (!triggerBounds) return;
      const popoverBounds = createProjectPopoverRef.current?.getBoundingClientRect();
      const popoverHeight = popoverBounds?.height || 190;
      const anchorCenter = triggerBounds.top + triggerBounds.height / 2;
      const top = Math.max(12, Math.min(anchorCenter - popoverHeight / 2, window.innerHeight - popoverHeight - 12));
      setCreateProjectPopoverPosition({ top, left: triggerBounds.right + 12, arrowTop: anchorCenter - top });
    };
    const close = (event) => {
      if (!createProjectTriggerRef.current?.contains(event.target) && !createProjectPopoverRef.current?.contains(event.target)) setCreatingProject(false);
    };
    const escape = (event) => { if (event.key === "Escape") setCreatingProject(false); };
    position();
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [creatingProject]);
  useEffect(() => {
    if (!projectAction) return undefined;
    const position = () => {
      const triggerBounds = projectActionTriggerRefs.current.get(projectAction.project.id)?.getBoundingClientRect();
      if (!triggerBounds) return;
      const popoverBounds = projectActionPopoverRef.current?.getBoundingClientRect();
      const popoverHeight = popoverBounds?.height || 190;
      const anchorCenter = triggerBounds.top + triggerBounds.height / 2;
      const top = Math.max(12, Math.min(anchorCenter - popoverHeight / 2, window.innerHeight - popoverHeight - 12));
      setProjectActionPopoverPosition({ top, left: triggerBounds.right + 12, arrowTop: anchorCenter - top });
    };
    const close = (event) => {
      const trigger = projectActionTriggerRefs.current.get(projectAction.project.id);
      if (!trigger?.contains(event.target) && !projectActionPopoverRef.current?.contains(event.target)) setProjectAction(null);
    };
    const escape = (event) => { if (event.key === "Escape") setProjectAction(null); };
    position();
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [projectAction]);
  useEffect(() => {
    if (!productMatrixOpen) return undefined;
    const close = (event) => {
      if (!productMatrixTriggerRef.current?.contains(event.target) && !productMatrixPanelRef.current?.contains(event.target)) setProductMatrixOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") setProductMatrixOpen(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [productMatrixOpen]);
  async function createProject(event) {
    event.preventDefault(); const name = projectName.trim(); if (!name) return;
    try { const project = await createFounderProject({ name, description: null }); await onProjectsChanged?.(); setCreatingProject(false); setProjectName(""); onSelectProject(project.id); }
    catch (error) { setProjectError(error.message); }
  }

  async function renameProject(project, name) {
    const nextName = name.trim(); if (!nextName) return;
    try { await updateFounderProject(project.id, { name: nextName }); await onProjectsChanged?.(); setProjectAction(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function archiveProject(project) {
    try { await updateFounderProject(project.id, { status: "archived" }); if (project.id === activeProjectId) onNavigate("home"); await onProjectsChanged?.(); setProjectAction(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function removeProject(project) {
    try { await deleteFounderProject(project.id); setProjectAssignments((current) => ({ ...current, ...Object.fromEntries(founderConversations.filter((item) => projectForConversation(item) === project.id).map((item) => [item.id, null])) })); if (project.id === activeProjectId) onNavigate("home"); await onProjectsChanged?.(); setProjectAction(null); }
    catch (error) { setProjectError(error.message); }
  }

  async function moveConversation(id, projectId) {
    try { await bindFounderConversationProject(id, projectId); setProjectAssignments((current) => ({ ...current, [id]: projectId })); if (id === activeConversationId) await onSelectConversation(id); }
    catch (error) { setProjectError(error.message); }
  }

  return <aside ref={navigationPanelRef} className="founder-navigation-panel" aria-label="Founder Navigation">
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
    <button type="button" title="库" aria-label="库" className={`sino-sidebar-library sino-sidebar-row${active === "library" ? " is-active" : ""}`} onClick={() => onNavigate("library")}><LibraryIcon /><span>库</span></button>
    <section className="sino-sidebar-section sino-project-workspace"><div className="sino-project-heading sino-sidebar-primary-title"><span className="sino-sidebar-primary-title__label">项目</span></div><div className="sino-project-list"><button ref={createProjectTriggerRef} type="button" className="sino-project-create-entry sino-sidebar-row" aria-label="新建项目" title="新建项目" aria-expanded={creatingProject} onClick={() => setCreatingProject((current) => !current)}><FolderPlusIcon />新建项目</button>{displayedProjects.map((project) => <div className="sino-project-item" key={project.id}><div className={`sino-project-item__row${project.id === activeProjectId ? " is-active" : ""}`}><button type="button" className="sino-project-item__open sino-sidebar-row" onClick={() => onSelectProject(project.id)} title={project.description || project.name}><FolderIcon /><span>{businessAssetName({ ...project, asset_type: "project" })}</span></button><button ref={(node) => { if (node) projectActionTriggerRefs.current.set(project.id, node); else projectActionTriggerRefs.current.delete(project.id); }} type="button" className="sino-project-item__menu" aria-label={`Project 操作 ${project.name}`} onClick={() => setProjectMenu(projectMenu === project.id ? null : project.id)}>···</button>{projectMenu === project.id ? <div className="sino-sidebar-popover"><button type="button" onClick={() => { setProjectActionName(project.name); setProjectAction({ type: "rename", project }); setProjectMenu(null); }}>Rename</button><button type="button" onClick={() => { setProjectAction({ type: "archive", project }); setProjectMenu(null); }}>Archive</button><button type="button" onClick={() => { setProjectAction({ type: "delete", project }); setProjectMenu(null); }}>Delete</button></div> : null}</div></div>)}{!normalizedSearch && visibleProjects.length > 4 ? <button type="button" className="sino-project-expand sino-sidebar-row" onClick={() => setProjectsExpanded((current) => !current)}><span className="sino-sidebar-row__icon" aria-hidden="true">···</span><span>{projectsExpanded ? "收起显示" : "展开显示"}</span></button> : null}{projectError ? <p role="alert">{projectError}</p> : null}</div></section>
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
    <footer>
      <div className="sino-product-matrix">
        {productMatrixOpen ? <section ref={productMatrixPanelRef} className="sino-product-matrix__panel" role="dialog" aria-label="Sino AI 产品矩阵">
          <span className="sino-product-matrix__arrow" aria-hidden="true" />
          <div className="sino-product-matrix__list">
            {SINO_AI_PRODUCTS.map((product) => product.available ? (
              product.href ? <a key={product.key} href={product.href} className="sino-product-matrix__item"><span className="sino-product-matrix__mark">S</span><span><b>{product.name}</b><small>{product.description}</small></span></a>
                : <button key={product.key} type="button" className="sino-product-matrix__item is-current" onClick={() => { onNavigate("conversation"); setProductMatrixOpen(false); }}><span className="sino-product-matrix__mark">S</span><span><b>{product.name}</b><small>{product.description}</small></span><em>当前</em></button>
            ) : <div key={product.key} className="sino-product-matrix__item is-disabled" aria-disabled="true"><span className="sino-product-matrix__mark">S</span><span><b>{product.name}</b><small>{product.description}</small></span><em>筹备中</em></div>)}
          </div>
        </section> : null}
        <button ref={productMatrixTriggerRef} type="button" className="sino-product-matrix__launcher sino-sidebar-products sino-sidebar-row" aria-label="Sino AI 产品矩阵" aria-expanded={productMatrixOpen} onClick={() => setProductMatrixOpen((open) => !open)}><ProductMatrixIcon /><span>Sino AI 产品</span></button>
      </div>
      <button type="button" className="sino-sidebar-settings sino-sidebar-row" title="设置" aria-label="设置" onClick={() => onNavigate("settings")} aria-current={active === "settings" ? "page" : undefined}><SettingsIcon /><span>设置</span></button>
    </footer>
    {creatingProject && typeof document !== "undefined" ? createPortal(<form ref={createProjectPopoverRef} className="sino-project-create-popover" role="dialog" aria-label="创建项目" onSubmit={createProject} style={{ top: `${createProjectPopoverPosition.top}px`, left: `${createProjectPopoverPosition.left}px`, "--popover-arrow-top": `${createProjectPopoverPosition.arrowTop}px` }}><span className="sino-project-create-popover__arrow" data-popover-arrow aria-hidden="true" /><p>创建一个项目，把相关聊天、文件和工作集中在一起。</p><input autoFocus aria-label="Project 名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" /><button type="submit" disabled={!projectName.trim()}>创建项目</button></form>, document.body) : null}
    {projectAction && typeof document !== "undefined" ? createPortal(<form ref={projectActionPopoverRef} className={`sino-project-create-popover sino-project-action-popover is-${projectAction.type}`} role="dialog" aria-label={`${projectAction.type === "rename" ? "重命名" : projectAction.type === "archive" ? "归档" : "删除"}项目`} onSubmit={(event) => { event.preventDefault(); if (projectAction.type === "rename") renameProject(projectAction.project, projectActionName); else if (projectAction.type === "archive") archiveProject(projectAction.project); else removeProject(projectAction.project); }} style={{ top: `${projectActionPopoverPosition.top}px`, left: `${projectActionPopoverPosition.left}px`, "--popover-arrow-top": `${projectActionPopoverPosition.arrowTop}px` }}><span className="sino-project-create-popover__arrow" data-popover-arrow aria-hidden="true" />{projectAction.type === "rename" ? <><p>为「{projectAction.project.name}」输入新的项目名称。</p><input autoFocus aria-label={`重命名 ${projectAction.project.name}`} value={projectActionName} onChange={(event) => setProjectActionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.form?.requestSubmit(); }} /><button type="submit" disabled={!projectActionName.trim()}>保存</button></> : <><p>{projectAction.type === "archive" ? `归档「${projectAction.project.name}」？归档后项目将不再显示在当前列表中。` : `删除「${projectAction.project.name}」？Conversation 将移出项目，Ready 能力仍会保留。`}</p><div className="sino-project-action-popover__actions"><button type="button" className="is-secondary" onClick={() => setProjectAction(null)}>取消</button><button type="submit" className={projectAction.type === "delete" ? "is-danger" : ""}>{projectAction.type === "archive" ? "归档项目" : "删除项目"}</button></div></>}</form>, document.body) : null}
    {resizeHandle}
  </aside>;
}
