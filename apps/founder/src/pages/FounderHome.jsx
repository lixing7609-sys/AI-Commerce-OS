import { useEffect, useMemo, useRef, useState } from "react";
import {
  useApiState,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  togglePin,
  appendMessage,
  groupConversationsByRecency,
  CONVERSATION_GROUP_LABELS,
} from "@sinofut/ui";

// Founder AI is now the default home workspace for Founder — not a chat entry,
// not a dashboard. Conversation history is stored under the "founder" persona id,
// the same key the full-screen SinoFUT workspace already uses, so history carries
// over between the two surfaces without touching packages/ui/src/sino/SinoWorkspace.jsx.
//
// Layout is modeled on the Operator AI workspace (SinoWorkspace.jsx): fixed
// conversation sidebar on the left, a fixed-height main workspace on the right
// with a non-scrolling title bar, a scrollable middle area, and a composer
// pinned to the bottom — not a copy of that shared component, just the same
// proportions/spacing, since Founder needs its own single implementation.
const PERSONA_ID = "founder";
const GROUP_ORDER = ["pinned", "today", "yesterday", "last7", "last30", "earlier"];

// Founder AI 是技术与系统开发入口，不是经营驾驶舱。
const QUICK_ACTIONS = [
  { key: "architecture-review", label: "架构审查" },
  { key: "dev-task", label: "开发任务" },
  { key: "agent-design", label: "Agent 设计" },
  { key: "workflow-design", label: "Workflow 设计" },
  { key: "version-check", label: "版本检查" },
  { key: "system-diagnostics", label: "系统诊断" },
];

function buildQuickActionReply(key, state) {
  if (!state) return "数据加载中，请稍后再试。";
  switch (key) {
    case "architecture-review":
      return "架构审查：当前基于 docs/2608-v2/01-architecture.md 的五大主体分层（SinoFUT/Founder/Growth/Studio/Operator），暂未接入自动化架构审查工具。";
    case "dev-task": {
      const recent = state.tasks.slice(-5).reverse();
      return recent.length ? `开发任务：${recent.map((t) => t.title).join("；")}` : "暂无开发任务。";
    }
    case "agent-design": {
      const agents = state.capabilities;
      return agents.length
        ? `Agent 设计现状：${agents.map((c) => `${c.name}（${c.status}）`).join("；")}`
        : "暂无 Agent 记录。";
    }
    case "workflow-design": {
      const workflows = state.capabilities.filter((c) => c.name.includes("Workflow"));
      return workflows.length
        ? `Workflow 设计现状：${workflows.map((c) => `${c.name}（${c.status}）`).join("；")}`
        : "暂无 Workflow 记录，能力中心当前尚未按 Agent/Workflow 分类存储。";
    }
    case "version-check":
      return "版本检查：当前系统版本 2608·V2；Version 对象尚未接入运行时数据（见 02-domain-model.md 能力层 Version）。";
    case "system-diagnostics": {
      const validated = state.capabilities.filter((c) => c.status === "validated").length;
      const total = state.capabilities.length;
      return `系统诊断：Mock API 连接正常；能力验证状态 ${validated}/${total} 已通过验证。`;
    }
    default:
      return "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。";
  }
}

export function FounderHome() {
  const { state } = useApiState();
  const [conversations, setConversations] = useState(() => listConversations(PERSONA_ID));
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef(null);
  // Measure the real top-nav height at runtime rather than assuming a fixed
  // px value or relying on .sf-main's flex/percentage resolution — this is
  // what makes "calc(100dvh - topbar height)" reliable regardless of how
  // AppShell's top bar wraps at a given viewport width.
  const [workspaceHeight, setWorkspaceHeight] = useState(null);

  useEffect(() => {
    function measure() {
      const topbar = document.querySelector(".sf-topbar");
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
      setWorkspaceHeight(`calc(100dvh - ${topbarHeight}px)`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

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

  function refresh() {
    setConversations(listConversations(PERSONA_ID));
  }

  function sendMessage(text, replyOverride) {
    if (!text.trim()) return;
    let conversation = activeConversation;
    if (!conversation) {
      conversation = createConversation(PERSONA_ID);
      setActiveId(conversation.id);
    }
    appendMessage(PERSONA_ID, conversation.id, { role: "user", text });
    appendMessage(PERSONA_ID, conversation.id, {
      role: "sino",
      text: replyOverride ?? "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。",
    });
    refresh();
    setInput("");
  }

  function handleQuickAction(action) {
    sendMessage(action.label, buildQuickActionReply(action.key, state));
  }

  function startRename(conversation) {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }

  function commitRename(id) {
    renameConversation(PERSONA_ID, id, renameValue.trim() || "未命名对话");
    setRenamingId(null);
    refresh();
  }

  const recentTasks = (state?.tasks || []).slice(-5).reverse();
  const recentApprovals = (state?.approvals || []).slice(-5).reverse();
  const capabilities = state?.capabilities || [];
  const validatedCount = capabilities.filter((c) => c.status === "validated").length;
  const aiQuota = state?.cloud?.aiQuota;

  return (
    <div className="founder-home" style={workspaceHeight ? { height: workspaceHeight } : undefined}>
      <aside className="founder-home-sidebar">
        <div className="founder-home-sidebar-header">
          <button type="button" className="sino-new-conversation" onClick={() => setActiveId(null)}>
            + 新建对话
          </button>
          <input
            className="sino-search-input"
            placeholder="搜索对话…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="founder-home-conversations">
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
                          togglePin(PERSONA_ID, conversation.id);
                          refresh();
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
                          deleteConversation(PERSONA_ID, conversation.id);
                          if (activeId === conversation.id) setActiveId(null);
                          refresh();
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

      <main className="founder-home-workspace">
        <div className="founder-home-topbar">
          <h1>Founder AI</h1>
          <p>早上好，Founder。今天的架构、开发任务、Agent 与 Workflow 都在这里。</p>
        </div>

        <div className="founder-home-scroll" ref={scrollRef}>
          {!activeConversation ? (
            <div className="founder-home-cards-wrapper">
              <div className="founder-home-cards">
                <div className="sf-card">
                  <h3>最近开发任务</h3>
                  <ul>
                    {recentTasks.map((t) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                    {recentTasks.length === 0 && <li>暂无开发任务</li>}
                  </ul>
                </div>
                <div className="sf-card">
                  <h3>最近系统变更</h3>
                  <ul>
                    {capabilities.map((c) => (
                      <li key={c.id}>
                        {c.name}：{c.status}
                        {c.latestSuggestion ? `（${c.latestSuggestion}）` : ""}
                      </li>
                    ))}
                    {capabilities.length === 0 && <li>暂无系统变更</li>}
                  </ul>
                </div>
                <div className="sf-card">
                  <h3>最近审批</h3>
                  <ul>
                    {recentApprovals.map((a) => (
                      <li key={a.id}>
                        {a.id}：{a.status}
                      </li>
                    ))}
                    {recentApprovals.length === 0 && <li>暂无审批记录</li>}
                  </ul>
                </div>
                <div className="sf-card">
                  <h3>当前系统状态</h3>
                  <ul>
                    <li>Mock API 连接：正常</li>
                    <li>
                      能力验证：{validatedCount}/{capabilities.length} 已通过
                    </li>
                    {aiQuota && (
                      <li>
                        AI 经营额度：{aiQuota.used.toLocaleString("zh-CN")} / {aiQuota.total.toLocaleString("zh-CN")}
                        （{aiQuota.cycle}）
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
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

        <div className="founder-home-composer">
          <form
            className="founder-home-input"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问 Founder AI，或输入操作指令……"
            />
            <button type="submit" className="sf-button-primary">发送</button>
          </form>
          <div className="founder-home-quick-actions">
            {QUICK_ACTIONS.map((action) => (
              <button key={action.key} type="button" className="sf-icon-button" onClick={() => handleQuickAction(action)}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
