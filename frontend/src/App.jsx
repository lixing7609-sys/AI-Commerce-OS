import { useState } from "react";

import "./App.css";
import Dashboard from "./pages/Dashboard";
import TaskCenter from "./pages/TaskCenter";

function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  function handleNavigateToTask(taskId) {
    setSelectedTaskId(taskId);
    setActivePage("tasks");
  }

  if (activePage === "tasks") {
    return (
      <TaskCenter
        onNavigate={setActivePage}
        selectedTaskId={selectedTaskId}
      />
    );
  }

  return (
    <Dashboard
      onNavigate={setActivePage}
      onNavigateToTask={handleNavigateToTask}
    />
  );
}

export default App;