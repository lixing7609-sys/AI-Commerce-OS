import { useState } from "react";

import "./App.css";
import Dashboard from "./pages/Dashboard";
import TaskCenter from "./pages/TaskCenter";

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  if (activePage === "tasks") {
    return <TaskCenter onNavigate={setActivePage} />;
  }

  return <Dashboard onNavigate={setActivePage} />;
}

export default App;