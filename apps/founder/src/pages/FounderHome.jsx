import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FounderAIProvider } from "../components/founder-ai/FounderAIContext.jsx";
import { FounderAISidebar } from "../components/founder-ai/FounderAISidebar.jsx";
import { ConversationShell } from "../components/founder-ai/ConversationShell.jsx";
import { ConversationHome } from "../components/founder-ai/views/ConversationHome.jsx";
import { useConversations } from "../components/founder-ai/useConversations.js";
import { groupConversationsByRecency } from "../components/founder-ai/conversationStore.js";
import { resolveFirstMessage } from "../components/founder-ai/resolveFirstMessage.js";
import { VIEW_META } from "../components/founder-ai/navConfig.js";
import { DecisionCenter } from "../components/founder-ai/views/DecisionCenter.jsx";
import { TechRadar } from "../components/founder-ai/views/TechRadar.jsx";
import { SystemOverview } from "../components/founder-ai/views/SystemOverview.jsx";
import { PendingDecisions } from "../components/founder-ai/views/PendingDecisions.jsx";
import { ExecutionTracking } from "../components/founder-ai/views/ExecutionTracking.jsx";
import { KnowledgeBase } from "../components/founder-ai/views/KnowledgeBase.jsx";
import { FileCenter } from "../components/founder-ai/views/FileCenter.jsx";
import { DecisionMemory } from "../components/founder-ai/views/DecisionMemory.jsx";
import { HistoryView } from "../components/founder-ai/views/HistoryView.jsx";
import { FavoritesView } from "../components/founder-ai/views/FavoritesView.jsx";

// Founder AI — SinoFUT 统一对话入口 + 固定系统工作台页面。左侧栏切换的是
// "对话记录"（conversations，见 conversationStore.js）或"固定导航页"
// （见 navConfig.js VIEW_META）两者之一，从不改变路由、端口或组件树 ——
// 无论普通模式还是原生全屏模式，渲染的都还是这同一个 FounderHome.jsx
// （全屏本身由 AppShell 的 "全屏" 按钮通过 document.documentElement.
// requestFullscreen() 实现，这里完全不涉及）。
const VIEW_COMPONENTS = {
  "decision-center": DecisionCenter,
  "tech-radar": TechRadar,
  "system-overview": SystemOverview,
  "pending-decisions": PendingDecisions,
  "execution-tracking": ExecutionTracking,
  "knowledge-base": KnowledgeBase,
  "file-center": FileCenter,
  "decision-memory": DecisionMemory,
  history: HistoryView,
  favorites: FavoritesView,
};

function FounderAIWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view");
  const activeConversationId = searchParams.get("conv");
  const { conversations, create, rename, remove, toggleArchive, setMode, appendMessage } = useConversations();
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

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

  function goToConversation(id) {
    const next = new URLSearchParams();
    next.set("conv", id);
    setSearchParams(next);
  }

  function goToView(key) {
    const next = new URLSearchParams();
    next.set("view", key);
    setSearchParams(next);
  }

  function handleCreateConversation(modeOrKey) {
    const mode = modeOrKey === "chat" ? "chat" : modeOrKey;
    const conversation = create({ mode, title: "新对话" });
    goToConversation(conversation.id);
  }

  function handleDeleteConversation(id) {
    const wasActive = id === activeConversationId;
    remove(id);
    if (wasActive) {
      const next = create({ mode: "chat", title: "新对话" });
      goToConversation(next.id);
    }
  }

  // 首页"草稿"态：还没有任何对话被打开，也没有选中固定导航页。
  // 发送第一条消息时才真正创建对话记录（避免每次刷新都在"最近对话"里
  // 堆积空白记录），随后立即路由进那条新对话。
  function handleDraftSend(text, { mode, hasFile }) {
    const { finalMode, messages } = resolveFirstMessage(text, { mode, hasFile });
    const conversation = create({ mode: finalMode, title: text.slice(0, 24) });
    messages.forEach((m) => appendMessage(conversation.id, m));
    goToConversation(conversation.id);
  }

  let content;
  let isConversationMode = false;

  if (activeConversation) {
    isConversationMode = true;
    content = (
      <ConversationShell
        conversation={activeConversation}
        onAppendMessage={appendMessage}
        onSetMode={setMode}
        onRename={rename}
      />
    );
  } else if (view && VIEW_COMPONENTS[view]) {
    const ViewComponent = VIEW_COMPONENTS[view];
    content = <ViewComponent onNavigate={goToView} />;
  } else {
    isConversationMode = true;
    content = <ConversationHome onSend={handleDraftSend} />;
  }

  const meta = !isConversationMode ? VIEW_META[view] : null;

  return (
    <div className="founder-home" style={workspaceHeight ? { height: workspaceHeight } : undefined}>
      <FounderAISidebar
        activeView={view}
        activeConversationId={activeConversationId}
        onSelectView={(key) => {
          goToView(key);
        }}
        conversations={conversations}
        groupedConversations={groupConversationsByRecency}
        onCreateConversation={handleCreateConversation}
        onSelectConversation={goToConversation}
        onRenameConversation={rename}
        onDeleteConversation={handleDeleteConversation}
        onToggleArchiveConversation={toggleArchive}
      />
      <main className={`founder-home-workspace${isConversationMode ? " is-conversation" : ""}`}>
        {!isConversationMode && meta && (
          <div className="founder-home-topbar">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
        )}
        <div className="founder-ai-content">{content}</div>
      </main>
    </div>
  );
}

export function FounderHome() {
  return (
    <FounderAIProvider>
      <FounderAIWorkspace />
    </FounderAIProvider>
  );
}
