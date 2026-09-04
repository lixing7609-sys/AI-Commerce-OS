import { useEffect, useMemo, useRef, useState } from "react";
import {
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  togglePin,
  appendMessage,
  groupConversationsByRecency,
  CONVERSATION_GROUP_LABELS,
} from "./sinoConversationStore.js";
import { listFiles, addFile, removeFile, formatFileSize } from "./sinoWorkspaceStore.js";
import { useApiState } from "../useApiState.js";

const GROUP_ORDER = ["pinned", "today", "yesterday", "last7", "last30", "earlier"];

function fmtCNY(v) {
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function buildQuickActionReply(key, state, files) {
  if (!state) return "数据尚未加载完成，请稍后重试。";
  switch (key) {
    case "continue-task": {
      const task = state.tasks[state.tasks.length - 1];
      return task ? `最近任务：${task.title}（状态：${task.status}）` : "暂无进行中的任务。";
    }
    case "pending-approval": {
      const pending = state.approvals.filter((a) => a.status === "pending");
      return pending.length
        ? pending.map((a) => `审批 ${a.id}：${a.aiSuggestion}`).join("\n")
        : "暂无待审批事项。";
    }
    case "today-operation":
    case "today-operation（订单/利润）": {
      const totalProfit = state.profits.reduce((s, p) => s + p.netProfit, 0);
      const unsettled = state.orders.filter((o) => o.status === "unsettled").length;
      return `今日利润（内部结算口径）：${fmtCNY(totalProfit)}；待结算订单 ${unsettled} 笔。`;
    }
    case "recent-content": {
      const recent = state.content.slice(-5).reverse();
      return recent.length
        ? recent.map((c) => `${c.title}（${c.stage}）`).join("\n")
        : "暂无生产中的内容。";
    }
    case "recent-strategy": {
      const recent = state.strategies.slice(-5).reverse();
      return recent.length ? recent.map((s) => s.hypothesis).join("\n") : "暂无增长策略。";
    }
    case "recent-capability": {
      return state.capabilities
        .map((c) => `${c.name}：${c.status}（连续 ${c.consecutiveDays} 天）`)
        .join("\n");
    }
    case "recent-workflow": {
      const recent = state.tasks.slice(-5).reverse();
      return recent.length ? recent.map((t) => t.title).join("\n") : "暂无 Workflow 任务。";
    }
    case "device-status": {
      return state.cloud.devices.map((d) => `${d.name}：${d.status}（版本 ${d.version}）`).join("\n");
    }
    case "quota-status": {
      const { used, total, cycle } = state.cloud.aiQuota;
      return `AI 经营额度（${cycle}）：已用 ${used.toLocaleString("zh-CN")} / ${total.toLocaleString("zh-CN")}`;
    }
    case "upload": {
      return files.length
        ? `工作区当前有 ${files.length} 个文件，最新：${files[0]?.name}`
        : "工作区暂无文件，点击右侧「上传」添加。";
    }
    default:
      return "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。";
  }
}

function RecentSection({ title, children }) {
  return (
    <div className="sf-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function HomeRecents({ persona, state, files }) {
  const sections = persona.sections;
  return (
    <div className="sino-recents-grid">
      {sections.includes("tasks") && (
        <RecentSection title="最近任务">
          <ul>
            {state.tasks.slice(-5).reverse().map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
            {state.tasks.length === 0 && <li>暂无任务</li>}
          </ul>
        </RecentSection>
      )}
      {sections.includes("files") && (
        <RecentSection title="最近文件">
          <ul>
            {files.slice(0, 5).map((f) => (
              <li key={f.id}>{f.name}（{f.category}）</li>
            ))}
            {files.length === 0 && <li>暂无文件，右侧「工作区」可上传</li>}
          </ul>
        </RecentSection>
      )}
      {sections.includes("approvals") && (
        <RecentSection title="最近审批">
          <ul>
            {state.approvals.slice(-5).reverse().map((a) => (
              <li key={a.id}>{a.id}：{a.status}</li>
            ))}
            {state.approvals.length === 0 && <li>暂无审批记录</li>}
          </ul>
        </RecentSection>
      )}
      {sections.includes("operations") && (
        <RecentSection title="最近经营">
          <p>今日利润：{fmtCNY(state.profits.reduce((s, p) => s + p.netProfit, 0))}</p>
          <p>待结算订单：{state.orders.filter((o) => o.status === "unsettled").length} 笔</p>
        </RecentSection>
      )}
      {sections.includes("capabilities") && (
        <RecentSection title="最近AI（能力升级）">
          <ul>
            {state.capabilities.map((c) => (
              <li key={c.id}>{c.name}：{c.status}</li>
            ))}
          </ul>
        </RecentSection>
      )}
      {sections.includes("recent-content") && (
        <RecentSection title="最近生成内容">
          <ul>
            {state.content.slice(-5).reverse().map((c) => (
              <li key={c.id}>{c.title}（{c.stage}）</li>
            ))}
            {state.content.length === 0 && <li>暂无生产中的内容</li>}
          </ul>
        </RecentSection>
      )}
      {sections.includes("cloud") && (
        <RecentSection title="设备与额度">
          <ul>
            {state.cloud.devices.map((d) => (
              <li key={d.id}>{d.name}：{d.status}</li>
            ))}
          </ul>
          <p>
            AI 经营额度：{state.cloud.aiQuota.used.toLocaleString("zh-CN")} /{" "}
            {state.cloud.aiQuota.total.toLocaleString("zh-CN")}
          </p>
        </RecentSection>
      )}
    </div>
  );
}

export function SinoWorkspace({ persona, variant = "embedded", onExit }) {
  const { state } = useApiState();
  const [conversations, setConversations] = useState(() => listConversations(persona.id));
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [files, setFiles] = useState(() => listFiles(persona.id));
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (variant !== "overlay") return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onExit?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant, onExit]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, conversations]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const grouped = useMemo(() => groupConversationsByRecency(filteredConversations), [filteredConversations]);

  function refreshConversations() {
    setConversations(listConversations(persona.id));
  }

  function handleNewConversation() {
    setActiveId(null);
    setInput("");
  }

  function sendMessage(text, replyOverride) {
    if (!text.trim()) return;
    let conversation = activeConversation;
    if (!conversation) {
      conversation = createConversation(persona.id);
      setActiveId(conversation.id);
    }
    appendMessage(persona.id, conversation.id, { role: "user", text });
    const reply = replyOverride ?? "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。";
    appendMessage(persona.id, conversation.id, { role: "sino", text: reply });
    refreshConversations();
    setInput("");
  }

  function handleQuickAction(action) {
    const reply = buildQuickActionReply(action.key, state, files);
    if (action.key === "upload") {
      setWorkspaceOpen(true);
      fileInputRef.current?.click();
      return;
    }
    sendMessage(action.label, reply);
  }

  function handleFileChosen(event) {
    const chosen = Array.from(event.target.files || []);
    chosen.forEach((file) => addFile(persona.id, file));
    setFiles(listFiles(persona.id));
    event.target.value = "";
  }

  function startRename(conversation) {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }

  function commitRename(id) {
    renameConversation(persona.id, id, renameValue.trim() || "未命名对话");
    setRenamingId(null);
    refreshConversations();
  }

  return (
    <div
      className={`sino-workspace variant-${variant}${workspaceOpen ? " workspace-open" : ""}`}
    >
      <aside className="sino-sidebar">
        <div className="sino-sidebar-header">
          <button type="button" className="sino-new-conversation" onClick={handleNewConversation}>
            + 新建对话
          </button>
          <input
            className="sino-search-input"
            placeholder="搜索对话…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sino-conversation-list">
          {GROUP_ORDER.map((groupKey) =>
            grouped[groupKey].length > 0 ? (
              <div key={groupKey}>
                <div className="sino-conversation-group-label">{CONVERSATION_GROUP_LABELS[groupKey]}</div>
                {grouped[groupKey].map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`sino-conversation-item${conversation.id === activeId ? " is-active" : ""}`}
                    onClick={() => setActiveId(conversation.id)}
                  >
                    {renamingId === conversation.id ? (
                      <input
                        autoFocus
                        className="sino-conversation-rename-input"
                        value={renameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(conversation.id)}
                        onKeyDown={(e) => e.key === "Enter" && commitRename(conversation.id)}
                      />
                    ) : (
                      <span className="sino-conversation-title">{conversation.title}</span>
                    )}
                    <div className="sino-conversation-actions">
                      <button
                        type="button"
                        title="固定"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(persona.id, conversation.id);
                          refreshConversations();
                        }}
                      >
                        📌
                      </button>
                      <button
                        type="button"
                        title="重命名"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(conversation);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(persona.id, conversation.id);
                          if (activeId === conversation.id) setActiveId(null);
                          refreshConversations();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          )}
          {conversations.length === 0 && (
            <p style={{ padding: 8, fontSize: 12, color: "var(--text-tertiary)" }}>暂无历史对话</p>
          )}
        </div>
      </aside>

      <section className="sino-center">
        <div className="sino-center-topbar">
          <span className="sino-persona-label">{persona.label}</span>
          <div className="sino-center-topbar-actions">
            <button type="button" className="sf-icon-button" onClick={() => setWorkspaceOpen((v) => !v)}>
              工作区（{files.length}）
            </button>
            {variant === "overlay" && (
              <button type="button" className="sf-icon-button" onClick={onExit}>
                退出全屏（Esc）
              </button>
            )}
          </div>
        </div>

        <div className="sino-scroll-area" ref={scrollRef}>
          {!activeConversation ? (
            <>
              <div className="sino-home-greeting">
                <h1>{persona.label}</h1>
                <p>{persona.greeting}</p>
              </div>
              {state ? <HomeRecents persona={persona} state={state} files={files} /> : <p>加载中…</p>}
            </>
          ) : (
            <div className="sino-messages">
              {activeConversation.messages.map((m) => (
                <div key={m.id} className={`sino-message role-${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sino-composer">
          <form
            className="sino-composer-input"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问 SinoFUT，或输入操作指令……"
            />
            <button type="submit" className="sf-button-primary">发送</button>
          </form>
          <div className="sino-quick-actions">
            {persona.quickActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="sf-icon-button"
                onClick={() => handleQuickAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {workspaceOpen && (
        <aside className="sino-files-panel">
          <div className="sino-files-panel-header">
            <strong style={{ fontSize: 13 }}>工作区文件</strong>
            <button type="button" className="sf-icon-button" onClick={() => fileInputRef.current?.click()}>
              上传
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileChosen}
            />
          </div>
          <div className="sino-files-list">
            {files.map((f) => (
              <div key={f.id} className="sino-file-item">
                <span>
                  {f.name} · {f.category} · {formatFileSize(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    removeFile(persona.id, f.id);
                    setFiles(listFiles(persona.id));
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            {files.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                暂无文件（演示：仅记录文件元数据，未接入真实存储）
              </p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
