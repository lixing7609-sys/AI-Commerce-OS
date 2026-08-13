import { useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "sino-founder-sidebar-collapsed";
const HISTORY_GROUPS_KEY = "sino-founder-history-groups";
const DEFAULT_HISTORY_GROUPS = { today: true, yesterday: true, recent7: false, recent30: false, older: false };

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

function restoredHistoryGroups() {
  try { return { ...DEFAULT_HISTORY_GROUPS, ...JSON.parse(window.localStorage.getItem(HISTORY_GROUPS_KEY) || "{}") }; }
  catch { return DEFAULT_HISTORY_GROUPS; }
}

function ConversationGroup({ id, label, items, expanded, onToggle, activeConversationId, onSelectConversation, onDeleteConversation }) {
  return <section className="sino-conversation-group">
    <button type="button" className="sino-conversation-group__toggle" aria-expanded={expanded} aria-controls={`history-${id}`} onClick={onToggle}><strong>{label}</strong><i>{expanded ? "⌄" : "›"}</i></button>
    {expanded && <div id={`history-${id}`} className="sino-conversation-group__items">{items.map((item) => <div key={item.id} className={`sino-conversation-item${item.id === activeConversationId ? " is-active" : ""}`}><button type="button" className="sino-conversation-item__open" onClick={() => onSelectConversation(item.id)} title={item.title}><span>•</span><b>{item.title || "新讨论"}</b></button><button type="button" className="sino-conversation-item__menu" aria-label="会话操作" title="删除会话" onClick={() => onDeleteConversation(item)}>···</button></div>)}</div>}
  </section>;
}

export function SecretarySidebar({ onNavigate, conversations = [], activeConversationId, onNewConversation, onSelectConversation, onDeleteConversation, projects = [], activeProjectId, onSelectProject }) {
  const [collapsed, setCollapsed] = useState(restoredCollapsedState);
  const [brandHovered, setBrandHovered] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [conversationsOpen, setConversationsOpen] = useState(true);
  const [historyGroups, setHistoryGroups] = useState(restoredHistoryGroups);
  const now = Date.now();
  const today = conversations.filter((item) => now - item.updatedAt < 86400000);
  const yesterday = conversations.filter((item) => now - item.updatedAt >= 86400000 && now - item.updatedAt < 172800000);
  const recent7 = conversations.filter((item) => now - item.updatedAt >= 172800000 && now - item.updatedAt < 604800000);
  const recent30 = conversations.filter((item) => now - item.updatedAt >= 604800000 && now - item.updatedAt < 2592000000);
  const older = conversations.filter((item) => now - item.updatedAt >= 2592000000);

  function setSidebarCollapsed(next) {
    setCollapsed(next);
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* unavailable */ }
  }

  function expandSection(section) {
    setSidebarCollapsed(false);
    if (section === "projects") setProjectsOpen(true);
    if (section === "conversations") setConversationsOpen(true);
  }

  function toggleHistoryGroup(id) {
    setHistoryGroups((current) => {
      const next = { ...current, [id]: !current[id] };
      try { window.localStorage.setItem(HISTORY_GROUPS_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
      return next;
    });
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
    <section className="sino-sidebar-section"><button className="sino-sidebar-section__toggle" onClick={() => setProjectsOpen((value) => !value)} aria-expanded={projectsOpen}><span>项目</span><i>{projectsOpen ? "⌄" : "›"}</i></button>{projectsOpen && <div className="sino-project-list">{projects.map((project) => <button key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => onSelectProject(project.id)}><FolderIcon /><span>{project.name}</span></button>)}</div>}</section>
    <div className="sino-sidebar__conversation-title"><span>会话</span></div>
    </div>
    <div className="sino-sidebar__scroll-region" aria-label="历史会话列表">
      <div className="sino-conversation-navigation">
        <ConversationGroup id="today" label="今天" items={today} expanded={historyGroups.today} onToggle={() => toggleHistoryGroup("today")} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
        <ConversationGroup id="yesterday" label="昨天" items={yesterday} expanded={historyGroups.yesterday} onToggle={() => toggleHistoryGroup("yesterday")} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
        <ConversationGroup id="recent7" label="最近 7 天" items={recent7} expanded={historyGroups.recent7} onToggle={() => toggleHistoryGroup("recent7")} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
        <ConversationGroup id="recent30" label="最近 30 天" items={recent30} expanded={historyGroups.recent30} onToggle={() => toggleHistoryGroup("recent30")} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
        <ConversationGroup id="older" label="更早" items={older} expanded={historyGroups.older} onToggle={() => toggleHistoryGroup("older")} activeConversationId={activeConversationId} onSelectConversation={onSelectConversation} onDeleteConversation={onDeleteConversation} />
      </div>
    </div>
    <footer>AI Commerce OS<br /><small>Founder AI Secretary</small></footer>
  </aside>;
}
