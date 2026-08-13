import { useState } from "react";

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

function ConversationGroup({ label, items, activeConversationId, onSelectConversation, onDeleteConversation }) {
  if (!items.length) return null;
  return <div className="sino-conversation-group"><strong>{label}</strong>{items.map((item) => <div key={item.id} className={`sino-conversation-item${item.id === activeConversationId ? " is-active" : ""}`}><button type="button" className="sino-conversation-item__open" onClick={() => onSelectConversation(item.id)} title={item.title}><span>•</span><b>{item.title || "新讨论"}</b></button><button type="button" className="sino-conversation-item__menu" aria-label="会话操作" title="删除会话" onClick={() => onDeleteConversation(item)}>···</button></div>)}</div>;
}

export function SecretarySidebar({ onNavigate, conversations = [], activeConversationId, onNewConversation, onSelectConversation, onDeleteConversation, projects = [], activeProjectId, onSelectProject }) {
  const [collapsed, setCollapsed] = useState(restoredCollapsedState);
  const [brandHovered, setBrandHovered] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const now = Date.now();
  const today = conversations.filter((item) => now - item.updatedAt < 86400000);
  const yesterday = conversations.filter((item) => now - item.updatedAt >= 86400000 && now - item.updatedAt < 172800000);
  const recent = conversations.filter((item) => now - item.updatedAt >= 172800000 && now - item.updatedAt < 604800000);
  const older = conversations.filter((item) => now - item.updatedAt >= 604800000);

  function setSidebarCollapsed(next) {
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* unavailable */ }
  }

  function expandSection(section) {
    setSidebarCollapsed(false);
    if (section === "projects") setProjectsOpen(true);
    if (section === "conversations") setConversationsOpen(true);
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
    </div>
    <div className="sino-sidebar__scroll-region" aria-label="项目与历史会话">
    <section className="sino-sidebar-section"><button className="sino-sidebar-section__toggle" onClick={() => setProjectsOpen((value) => !value)} aria-expanded={projectsOpen}><span>项目</span><i>{projectsOpen ? "⌄" : "›"}</i></button>{projectsOpen && <div className="sino-project-list">{projects.map((project) => <button key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => onSelectProject(project.id)}><FolderIcon /><span>{project.name}</span></button>)}</div>}</section>
    <section className="sino-sidebar-section sino-sidebar-section--conversations"><button className="sino-sidebar-section__toggle" onClick={() => setConversationsOpen((value) => !value)} aria-expanded={conversationsOpen}><span>会话</span><i>{conversationsOpen ? "⌄" : "›"}</i></button>{conversationsOpen && <div className="sino-conversation-navigation"><ConversationGroup label="今天" items={today} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} /><ConversationGroup label="昨天" items={yesterday} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} /><ConversationGroup label="最近 7 天" items={recent} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} /><ConversationGroup label="更早" items={older} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} /></div>}</section>
    </div>
    <footer>AI Commerce OS<br /><small>Founder AI Secretary</small></footer>
  </aside>;
}
