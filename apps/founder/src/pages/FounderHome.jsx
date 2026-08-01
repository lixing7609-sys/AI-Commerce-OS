import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FounderAIProvider } from "../components/founder-ai/FounderAIContext.jsx";
import { FounderAISidebar } from "../components/founder-ai/FounderAISidebar.jsx";
import { FounderConversation } from "../components/founder-ai/FounderConversation.jsx";
import { SinoPanel } from "../components/founder-ai/SinoPanel.jsx";
import { useConversations } from "../components/founder-ai/useConversations.js";
import { createSinoFlow } from "../components/founder-ai/sinoFlow.js";
import { groupConversationsByRecency } from "../components/founder-ai/conversationStore.js";
import { useFounderAI } from "../components/founder-ai/useFounderAI.js";
import { VIEW_META } from "../components/founder-ai/navConfig.js";
import { PendingDecisions } from "../components/founder-ai/views/PendingDecisions.jsx";
import { ExecutionTracking } from "../components/founder-ai/views/ExecutionTracking.jsx";
import { TechRadar } from "../components/founder-ai/views/TechRadar.jsx";
import { KnowledgeBase } from "../components/founder-ai/views/KnowledgeBase.jsx";
import { FileCenter } from "../components/founder-ai/views/FileCenter.jsx";
import { RetrospectiveView } from "../components/founder-ai/views/RetrospectiveView.jsx";
import { TimelineView } from "../components/founder-ai/views/TimelineView.jsx";
import { FavoritesView } from "../components/founder-ai/views/FavoritesView.jsx";
import { DeveloperVerificationCard } from "../components/founder-ai/timeline-cards/DeveloperVerificationCard.jsx";

// Sino Founder — 三栏工作台：左侧对话记录 + 固定工作入口，中间自然对话，
// 右侧 Sino 实时跟踪讨论状态。用户只管说话，不需要先选择功能论证/模型
// 会议等模式——所有阶段判断都由 sinoAnalysisService 自动完成（见
// sinoFlow.js）。无论普通模式还是原生全屏模式，渲染的都是这同一个
// FounderHome.jsx（全屏由 AppShell 的"全屏"按钮通过
// document.documentElement.requestFullscreen() 实现，这里完全不涉及）。
const VIEW_COMPONENTS = {
  "pending-decisions": PendingDecisions,
  "execution-tracking": ExecutionTracking,
  "tech-radar": TechRadar,
  "knowledge-base": KnowledgeBase,
  "file-center": FileCenter,
  retrospective: RetrospectiveView,
  timeline: TimelineView,
  favorites: FavoritesView,
};

function FounderAIWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view");
  const activeConversationId = searchParams.get("conv");
  const conv = useConversations();
  const founderAI = useFounderAI();
  const activeConversation = conv.conversations.find((c) => c.id === activeConversationId) || null;
  const sino = createSinoFlow(conv, founderAI);

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

  // 如果当前打开的对话还是一句话都没发的空白对话，再点"新建对话"不应该
  // 再创建一个新的空白记录——直接继续用这一条就好，避免"最近对话"里
  // 堆积多条一模一样的空白"新对话"。
  function handleCreateConversation() {
    if (activeConversation && activeConversation.messages.length === 0) {
      goToConversation(activeConversation.id);
      return;
    }
    const conversation = conv.create({ title: "新对话" });
    goToConversation(conversation.id);
  }

  function handleDeleteConversation(id) {
    const wasActive = id === activeConversationId;
    conv.remove(id);
    if (wasActive) {
      const next = conv.create({ title: "新对话" });
      goToConversation(next.id);
    }
  }

  // 从系统页面（技术雷达/时间线）"与 Sino 讨论"：新建对话并同步发送种子
  // 文本，全部在同一个事件处理函数里完成，不依赖下一次渲染。
  function handleStartConversation(seedText) {
    const conversation = conv.create({ title: "新对话" });
    goToConversation(conversation.id);
    sino.handleSend(conversation, seedText);
  }

  const isConversationMode = !!activeConversation || (!view && !activeConversationId);
  let content;
  if (activeConversation) {
    content = (
      <FounderConversation
        conversation={activeConversation}
        onSend={(text, opts) => sino.handleSend(activeConversation, text, opts)}
        onDecisionAction={(messageId, action) => sino.handleDecisionAction(activeConversation, messageId, action)}
        onTaskPackageAction={(messageId, action) => sino.handleTaskPackageAction(activeConversation, messageId, action)}
        onReviewAction={(messageId, verdict) => sino.handleReviewAction(activeConversation, messageId, verdict)}
      />
    );
  } else if (view && VIEW_COMPONENTS[view]) {
    const ViewComponent = VIEW_COMPONENTS[view];
    content = <ViewComponent onStartConversation={handleStartConversation} />;
  } else {
    content = <FounderConversation conversation={null} onSend={() => {}} />;
  }

  const meta = !isConversationMode ? VIEW_META[view] : null;

  return (
    <div
      className={`founder-home${isConversationMode ? "" : " is-two-column"}`}
      style={workspaceHeight ? { height: workspaceHeight } : undefined}
    >
      <FounderAISidebar
        activeView={view}
        activeConversationId={activeConversationId}
        onSelectView={goToView}
        conversations={conv.conversations}
        groupedConversations={groupConversationsByRecency}
        onCreateConversation={handleCreateConversation}
        onSelectConversation={goToConversation}
        onRenameConversation={conv.rename}
        onDeleteConversation={handleDeleteConversation}
        onToggleArchiveConversation={conv.toggleArchive}
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
      {isConversationMode && (
        <SinoPanel conversation={activeConversation} onAction={(key) => sino.handleNextAction(activeConversation, key)} />
      )}
      {searchParams.get("verify") === "dev" && <DeveloperVerificationCard floating />}
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
