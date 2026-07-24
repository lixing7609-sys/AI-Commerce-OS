import { useState } from "react";

import "./App.css";
import Dashboard from "./pages/Dashboard";
import TaskCenter from "./pages/TaskCenter";
import DeliverableCenter from "./pages/DeliverableCenter";
import ShopCenter from "./pages/ShopCenter";
import Overview from "./pages/Overview";
import Agents from "./pages/Agents";
import Analytics from "./pages/Analytics";
import KnowledgeBase from "./pages/KnowledgeBase";
import Settings from "./pages/Settings";

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState(null);

  function handleNavigateToTask(taskId) {
    setSelectedTaskId(taskId);
    setActivePage("tasks");
  }

  function handleNavigateToDeliverable(deliverableId) {
    setSelectedDeliverableId(deliverableId);
    setActivePage("deliverables");
  }

  if (activePage === "tasks") {
    return (
      <TaskCenter
        onNavigate={setActivePage}
        selectedTaskId={selectedTaskId}
      />
    );
  }

  if (activePage === "deliverables") {
    return (
      <DeliverableCenter
        onNavigate={setActivePage}
        onNavigateToTask={handleNavigateToTask}
        selectedDeliverableId={selectedDeliverableId}
      />
    );
  }

  if (activePage === "shops") {
    return <ShopCenter onNavigate={setActivePage} />;
  }

  if (activePage === "overview") {
    return <Overview onNavigate={setActivePage} />;
  }

  if (activePage === "agents") {
    return (
      <Agents onNavigate={setActivePage} onNavigateToTask={handleNavigateToTask} />
    );
  }

  if (activePage === "analytics") {
    return <Analytics onNavigate={setActivePage} />;
  }

  if (activePage === "knowledge") {
    return <KnowledgeBase onNavigate={setActivePage} />;
  }

  if (activePage === "settings") {
    return <Settings onNavigate={setActivePage} />;
  }

  return (
    <Dashboard
      onNavigate={setActivePage}
      onNavigateToTask={handleNavigateToTask}
      onNavigateToDeliverable={handleNavigateToDeliverable}
    />
  );
}

export default App;
