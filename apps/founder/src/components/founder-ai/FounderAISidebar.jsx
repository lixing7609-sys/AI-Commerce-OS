import { useRef, useState } from "react";
import { NAV_ITEMS } from "./navConfig.js";
import { CONVERSATION_GROUP_LABELS } from "./conversationStore.js";
import { NavIcon } from "./icons.jsx";
import { PortalMenu } from "./PortalMenu.jsx";
import { useFounderAI } from "./useFounderAI.js";

const GROUP_ORDER = ["today", "yesterday", "last7", "earlier"];

function ConversationItem({ conversation, isActive, onSelect, onRename, onDelete, onToggleArchive }) {
  const { toggleFavorite, isFavorite } = useFounderAI();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const favorite = isFavorite(conversation.id);
  const kebabRef = useRef(null);

  function commitRename() {
    const value = renameValue.trim();
    if (value) onRename(conversation.id, value);
    setRenaming(false);
  }

  function cancelRename() {
    setRenameValue(conversation.title);
    setRenaming(false);
  }

  return (
    <div className={`founder-ai-conv-item${isActive ? " is-active" : ""}`}>
      {renaming ? (
        <input
          autoFocus
          className="founder-ai-conv-rename-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
        />
      ) : (
        <button type="button" className="founder-ai-conv-title" onClick={() => onSelect(conversation.id)}>
          <span className="founder-ai-conv-title-text">{conversation.title}</span>
          {favorite && <NavIcon name="star" />}
        </button>
      )}

      <div className="founder-ai-conv-item-more">
        <button
          ref={kebabRef}
          type="button"
          className="founder-ai-conv-kebab"
          title="更多操作"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <NavIcon name="kebab" />
        </button>
        <PortalMenu
          open={menuOpen}
          onClose={() => { setMenuOpen(false); setConfirmingDelete(false); }}
          anchorRef={kebabRef}
          align="right"
          className="founder-ai-conv-menu"
        >
          {!confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRenaming(true);
                  setMenuOpen(false);
                }}
              >
                重命名
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleFavorite({ id: conversation.id, type: "对话", title: conversation.title });
                  setMenuOpen(false);
                }}
              >
                {favorite ? "取消收藏" : "收藏"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleArchive(conversation.id);
                  setMenuOpen(false);
                }}
              >
                {conversation.isArchived ? "取消归档" : "归档"}
              </button>
              <button type="button" className="is-danger" onClick={() => setConfirmingDelete(true)}>
                删除
              </button>
            </>
          ) : (
            <div className="founder-ai-conv-delete-confirm">
              <p>删除后将无法恢复，是否继续？</p>
              <div className="founder-ai-conv-delete-actions">
                <button type="button" onClick={() => setConfirmingDelete(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => {
                    onDelete(conversation.id);
                    setMenuOpen(false);
                    setConfirmingDelete(false);
                  }}
                >
                  确认删除
                </button>
              </div>
            </div>
          )}
        </PortalMenu>
      </div>
    </div>
  );
}

export function FounderAISidebar({
  activeView,
  activeConversationId,
  onSelectView,
  conversations,
  groupedConversations,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onToggleArchiveConversation,
}) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const q = search.trim().toLowerCase();
  const visible = conversations.filter((c) => (showArchived ? c.isArchived : !c.isArchived));
  const filtered = q ? visible.filter((c) => c.title.toLowerCase().includes(q)) : visible;
  const grouped = showArchived ? { today: filtered, yesterday: [], last7: [], earlier: [] } : groupedConversations(filtered);

  return (
    <aside className="founder-ai-sidebar">
      <div className="founder-ai-new-wrap">
        <button type="button" className="founder-ai-new-button" onClick={() => onCreateConversation()}>
          <NavIcon name="plus" />
          新建对话
        </button>
      </div>

      <div className="founder-ai-search-wrap">
        <input
          className="founder-ai-search-input"
          placeholder="搜索对话…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="founder-ai-conv-list">
        <div className="founder-ai-conv-list-header">
          <span>{showArchived ? "已归档对话" : "最近对话"}</span>
          <button type="button" className="founder-ai-conv-archive-toggle" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "返回最近对话" : "查看已归档"}
          </button>
        </div>
        {GROUP_ORDER.map((groupKey) =>
          grouped[groupKey].length > 0 ? (
            <div key={groupKey}>
              {!showArchived && <div className="founder-ai-conv-group-label">{CONVERSATION_GROUP_LABELS[groupKey]}</div>}
              {grouped[groupKey].map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === activeConversationId}
                  onSelect={onSelectConversation}
                  onRename={onRenameConversation}
                  onDelete={onDeleteConversation}
                  onToggleArchive={onToggleArchiveConversation}
                />
              ))}
            </div>
          ) : null
        )}
        {filtered.length === 0 && (
          <p className="founder-ai-conv-empty">{showArchived ? "暂无已归档对话" : "暂无历史对话"}</p>
        )}
      </div>

      <nav className="founder-ai-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`founder-ai-nav-item${!activeConversationId && item.key === activeView ? " is-active" : ""}`}
            onClick={() => onSelectView(item.key)}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
