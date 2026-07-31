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

const QUICK_ACTIONS = [
  { key: "daily-report", label: "经营日报" },
  { key: "product-analysis", label: "商品分析" },
  { key: "data-insight", label: "数据洞察" },
  { key: "content-creation", label: "内容创作" },
  { key: "marketing-advice", label: "营销建议" },
  { key: "more", label: "更多能力" },
];

const AI_EXPERTS = [
  { key: "biz-analyst", label: "经营分析师", desc: "解读经营数据，识别异常与机会" },
  { key: "growth-advisor", label: "增长顾问", desc: "评估机会与增长策略" },
  { key: "content-expert", label: "内容创作专家", desc: "生成图文/短视频/AI短剧创意" },
  { key: "ad-optimizer", label: "广告优化专家", desc: "优化广告投放与预算分配" },
  { key: "supply-chain-expert", label: "供应链专家", desc: "评估选品与供应链风险" },
];

function fmtCNY(v) {
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function buildQuickActionReply(key, state) {
  if (!state) return "数据加载中，请稍后再试。";
  switch (key) {
    case "daily-report": {
      const totalProfit = state.profits.reduce((s, p) => s + p.netProfit, 0);
      const unsettled = state.orders.filter((o) => o.status === "unsettled").length;
      const pendingApprovals = state.approvals.filter((a) => a.status === "pending").length;
      return `经营日报：今日利润 ${fmtCNY(totalProfit)} · 待结算订单 ${unsettled} 笔 · 待审批 ${pendingApprovals} 项 · 异常提醒：暂无。`;
    }
    case "product-analysis":
      return "商品分析：Product 领域对象尚未建模（见 docs/2608-v2/02-domain-model.md），敬请期待。";
    case "data-insight": {
      const counts = state.opportunities.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.entries(counts).map(([status, n]) => `${status} ${n}`).join(" · ");
      return `数据洞察：机会漏斗 ${summary || "暂无数据"}。`;
    }
    case "content-creation": {
      const recent = state.content.slice(-3).reverse();
      return recent.length
        ? `最近生成内容：${recent.map((c) => c.title).join("；")}`
        : "暂无生产中的内容，前往 Studio 无限画布创建。";
    }
    case "marketing-advice": {
      const recent = state.strategies.slice(-3).reverse();
      return recent.length
        ? `最近增长策略：${recent.map((s) => s.hypothesis).join("；")}`
        : "暂无增长策略，前往 Growth · 增长网络生成。";
    }
    case "more":
      return "更多能力持续接入中（演示状态 · SinoFUT Core 尚未接入真实意图理解）。";
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
