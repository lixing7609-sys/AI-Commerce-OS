import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
const PERSONA_ID = "founder";
const GROUP_ORDER = ["pinned", "today", "yesterday", "last7", "last30", "earlier"];

// Founder AI 是技术与系统开发入口，不是经营驾驶舱——Quick Actions 与 AI 专家
// 均围绕架构/Agent/Workflow/版本/系统诊断展开。
const QUICK_ACTIONS = [
  { key: "architecture-review", label: "架构审查" },
  { key: "dev-task", label: "开发任务" },
  { key: "agent-design", label: "Agent 设计" },
  { key: "workflow-design", label: "Workflow 设计" },
  { key: "version-check", label: "版本检查" },
  { key: "system-diagnostics", label: "系统诊断" },
];

const AI_EXPERTS = [
  { key: "system-architect", label: "系统架构师", desc: "评估架构分层与模块边界" },
  { key: "agent-engineer", label: "Agent 工程师", desc: "设计与调试 Agent 职责与调用链" },
  { key: "workflow-engineer", label: "Workflow 工程师", desc: "编排多 Agent/多步骤 Workflow" },
  { key: "prompt-engineer", label: "Prompt 工程师", desc: "打磨 Prompt 版本与评测" },
  { key: "qa-expert", label: "测试与质量专家", desc: "把关自动化测试与构建质量" },
  { key: "release-expert", label: "版本发布专家", desc: "管理版本发布与回滚策略" },
];

function fmtCNY(v) {
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

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

  const pendingApprovals = state?.approvals.filter((a) => a.status === "pending") || [];
  const totalProfit = state?.profits.reduce((s, p) => s + p.netProfit, 0) || 0;
  const unsettledOrders = state?.orders.filter((o) => o.status === "unsettled").length || 0;

  return (
    <div className="founder-home">
      <aside className="founder-home-sidebar">
        <button type="button" className="sino-new-conversation" onClick={() => setActiveId(null)}>
          + 新建对话
        </button>
        <input
          className="sino-search-input"
          placeholder="搜索对话…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

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

        <div className="founder-home-recents">
          <div className="founder-home-recent-block">
            <h4>最近任务</h4>
            <ul>
              {(state?.tasks || []).slice(-3).reverse().map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
              {(!state || state.tasks.length === 0) && <li>暂无任务</li>}
            </ul>
          </div>
          <div className="founder-home-recent-block">
            <h4>最近审批</h4>
            <ul>
              {pendingApprovals.map((a) => (
                <li key={a.id}>{a.id}：{a.aiSuggestion}</li>
              ))}
              {pendingApprovals.length === 0 && <li>暂无待审批事项</li>}
            </ul>
          </div>
          <div className="founder-home-recent-block">
            <h4>最近经营</h4>
            <ul>
              <li>今日利润：{fmtCNY(totalProfit)}</li>
              <li>待结算订单：{unsettledOrders} 笔</li>
              <li>异常提醒：暂无</li>
            </ul>
          </div>
          <div className="founder-home-recent-block">
            <h4>最近 AI</h4>
            <ul>
              {(state?.capabilities || []).map((c) => (
                <li key={c.id}>{c.name}：{c.status}</li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main className="founder-home-center">
        {!activeConversation ? (
          <>
            <div className="founder-home-hero">
              <h1>Founder AI</h1>
              <p>早上好，Founder。今天的经营、生产、增长与能力升级都在这里。</p>
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
              <Link className="founder-home-cockpit-link" to="/cockpit">
                查看完整经营驾驶舱 →
              </Link>
            </div>
          </>
        ) : (
          <div className="founder-home-thread" ref={scrollRef}>
            <div className="sino-messages">
              {activeConversation.messages.map((m) => (
                <div key={m.id} className={`sino-message role-${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <form
              className="founder-home-input founder-home-input-inline"
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
          </div>
        )}
      </main>

      <aside className="founder-home-experts">
        <h3>AI 专家</h3>
        <p className="founder-home-experts-hint">仅做展示，后续接入真实 Agent</p>
        {AI_EXPERTS.map((expert) => (
          <div key={expert.key} className="founder-home-expert-card">
            <h4>{expert.label}</h4>
            <p>{expert.desc}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}
