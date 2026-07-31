import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FounderAIProvider } from "../components/founder-ai/FounderAIContext.jsx";
import { FounderAISidebar } from "../components/founder-ai/FounderAISidebar.jsx";
import { DEFAULT_VIEW, VIEW_META } from "../components/founder-ai/navConfig.js";
import { DecisionCenter } from "../components/founder-ai/views/DecisionCenter.jsx";
import { FunctionalArgumentation } from "../components/founder-ai/views/FunctionalArgumentation.jsx";
import { ModelMeeting } from "../components/founder-ai/views/ModelMeeting.jsx";
import { TechRadar } from "../components/founder-ai/views/TechRadar.jsx";
import { SystemOverview } from "../components/founder-ai/views/SystemOverview.jsx";
import { PendingDecisions } from "../components/founder-ai/views/PendingDecisions.jsx";
import { ExecutionTracking } from "../components/founder-ai/views/ExecutionTracking.jsx";
import { KnowledgeBase } from "../components/founder-ai/views/KnowledgeBase.jsx";
import { FileCenter } from "../components/founder-ai/views/FileCenter.jsx";
import { DecisionMemory } from "../components/founder-ai/views/DecisionMemory.jsx";
import { HistoryView } from "../components/founder-ai/views/HistoryView.jsx";
import { FavoritesView } from "../components/founder-ai/views/FavoritesView.jsx";

// Founder AI — "AI 董事会 + 决策中心 + 公司总控". The left sidebar switches
// which section renders on the right; nothing here ever changes route, port,
// or component tree outside this file — it's still the same FounderHome.jsx
// in both normal and native-fullscreen browser modes (see App.jsx / AppShell's
// "全屏" button, which calls document.documentElement.requestFullscreen()).
const VIEW_COMPONENTS = {
  "decision-center": DecisionCenter,
  "functional-argumentation": FunctionalArgumentation,
  "model-meeting": ModelMeeting,
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
  const view = searchParams.get("view") || DEFAULT_VIEW;
  // Same runtime top-nav-height measurement technique used since the previous
  // layout fix — keeps the workspace pixel-exact regardless of how tall the
  // shared AppShell top bar renders.
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

  function handleSelectView(nextView) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("view", nextView);
      return next;
    });
  }

  const meta = VIEW_META[view] || VIEW_META[DEFAULT_VIEW];
  const ViewComponent = VIEW_COMPONENTS[view] || DecisionCenter;

  return (
    <div className="founder-home" style={workspaceHeight ? { height: workspaceHeight } : undefined}>
      <FounderAISidebar activeView={view} onSelectView={handleSelectView} />
      <main className="founder-home-workspace">
        <div className="founder-home-topbar">
          <h1>{meta.title}</h1>
          <p>{meta.subtitle}</p>
        </div>
        <div className="founder-ai-content">
          <ViewComponent onNavigate={handleSelectView} />
        </div>
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
