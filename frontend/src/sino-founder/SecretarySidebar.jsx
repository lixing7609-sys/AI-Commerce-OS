import { useState } from "react";
import { businessAssetName, isDeveloperRecord } from "./assetPresentation.js";

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

function ConversationList({ items, now, activeConversationId, onSelectConversation, onDeleteConversation }) {
  return <div className="sino-conversation-list">{items.map((item) => <div key={item.id} className={`sino-conversation-item${item.id === activeConversationId ? " is-active" : ""}`}><button type="button" className="sino-conversation-item__open" onClick={() => onSelectConversation(item.id)} title={item.title}><span>•</span><b>{item.title || "新讨论"}</b><small>{conversationTimeLabel(item, now)}</small></button><button type="button" className="sino-conversation-item__menu" aria-label="会话操作" title="删除会话" onClick={() => onDeleteConversation(item)}>···</button></div>)}</div>;
}

export function SecretarySidebar({ onNavigate, conversations = [], activeConversationId, onNewConversation, onSelectConversation, onDeleteConversation, projects = [], activeProjectId, onSelectProject }) {
  const [collapsed, setCollapsed] = useState(restoredCollapsedState);
  const [brandHovered, setBrandHovered] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [now] = useState(() => Date.now());
  const founderConversations = conversations.filter((item) => !isDeveloperRecord(item)).sort((a, b) => conversationTimestamp(b) - conversationTimestamp(a));

  function setSidebarCollapsed(next) {
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* unavailable */ }
  }

  function expandSection(section) {
    setSidebarCollapsed(false);
    if (section === "projects") setProjectsOpen(true);
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
      <button type="button" title="会话" aria-label="会话" onClick={() => expandSection("conversations")}><ConversationIcon /></button>
    </nav>}
    <section className="sino-sidebar-section"><button className="sino-sidebar-section__toggle sino-sidebar-primary-title" onClick={() => setProjectsOpen((value) => !value)} aria-expanded={projectsOpen}><span><FolderIcon />项目</span><i>{projectsOpen ? "⌄" : "›"}</i></button>{projectsOpen && <div className="sino-project-list">{projects.filter((project) => !isDeveloperRecord(project)).map((project) => <button key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => onSelectProject(project.id)} title={project.description || project.name}><i aria-hidden="true">•</i><span>{businessAssetName({ ...project, asset_type: "project" })}</span></button>)}</div>}</section>
    <div className="sino-sidebar__conversation-title sino-sidebar-primary-title"><span><ConversationIcon />会话</span></div>
    </div>
    <div className="sino-sidebar__scroll-region" aria-label="历史会话列表">
      <div className="sino-conversation-navigation">
        <ConversationList items={founderConversations} now={now} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
      </div>
    </div>
    <footer>AI Commerce OS<br /><small>Founder AI Secretary</small></footer>
  </aside>;
}
