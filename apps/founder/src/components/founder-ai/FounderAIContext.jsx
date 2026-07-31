import { useState } from "react";
import {
  nextId,
  SEED_PENDING_DECISIONS,
  SEED_MAJOR_ANOMALIES,
  SEED_TECH_OPPORTUNITIES,
  SEED_EXECUTION_TASKS,
  SEED_SYSTEM_OVERVIEW,
  SEED_KNOWLEDGE_ITEMS,
  SEED_FILES,
  SEED_DECISION_MEMORIES,
  SEED_HISTORY,
  SEED_MEETINGS,
  SEED_ARGUMENTATIONS,
} from "./mockData.js";
import { FounderAIContext } from "./founderAIContextObject.js";

// Founder AI 董事会/决策中心的会话级演示状态 —— 纯前端 mock，刷新即重置
// （与 packages/ui 的 SinoWorkspace / useSinoFullScreen 完全独立，不共享、不依赖）。

export function FounderAIProvider({ children }) {
  const [pendingDecisions, setPendingDecisions] = useState(SEED_PENDING_DECISIONS);
  const [majorAnomalies] = useState(SEED_MAJOR_ANOMALIES);
  const [techOpportunities, setTechOpportunities] = useState(SEED_TECH_OPPORTUNITIES);
  const [executionTasks, setExecutionTasks] = useState(SEED_EXECUTION_TASKS);
  const [systemOverview] = useState(SEED_SYSTEM_OVERVIEW);
  const [knowledgeItems, setKnowledgeItems] = useState(SEED_KNOWLEDGE_ITEMS);
  const [files] = useState(SEED_FILES);
  const [decisionMemories, setDecisionMemories] = useState(SEED_DECISION_MEMORIES);
  const [history, setHistory] = useState(SEED_HISTORY);
  const [meetings, setMeetings] = useState(SEED_MEETINGS);
  const [argumentations, setArgumentations] = useState(SEED_ARGUMENTATIONS);
  const [favorites, setFavorites] = useState([]);

  function addHistory(entry) {
    setHistory((prev) => [{ id: nextId("h"), date: new Date().toISOString().slice(0, 10), ...entry }, ...prev]);
  }

  function addPendingDecision(item) {
    const record = { id: nextId("pd"), status: "pending", riskLevel: "中", ...item };
    setPendingDecisions((prev) => [record, ...prev]);
    return record;
  }

  function resolvePendingDecision(id, action) {
    const item = pendingDecisions.find((d) => d.id === id);
    if (!item) return;
    setPendingDecisions((prev) => prev.filter((d) => d.id !== id));
    const actionLabel = { approve: "同意", reject: "驳回", "more-argument": "要求补充论证", "model-meeting": "交给模型会议", defer: "延后处理" }[action];
    addHistory({ type: "审批决策", title: item.title, summary: `${actionLabel}：${item.title}` });
    if (action === "approve") {
      addExecutionTask({
        name: item.title,
        source: `待决策 ${item.id} 批准后创建`,
        executor: item.source,
        stage: "执行中",
        progress: 0,
        doneSummary: "刚刚创建",
        blockers: "无",
        nextStep: "启动执行",
        needsReauthorization: false,
      });
    }
  }

  function addExecutionTask(item) {
    const record = { id: nextId("et"), ...item };
    setExecutionTasks((prev) => [record, ...prev]);
    return record;
  }

  function updateExecutionTask(id, patch) {
    setExecutionTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addDecisionMemory(item) {
    const record = {
      id: nextId("dm"),
      decidedAt: new Date().toISOString().slice(0, 10),
      isValid: true,
      ...item,
    };
    setDecisionMemories((prev) => [record, ...prev]);
    addHistory({ type: "审批决策", title: record.content, summary: "已加入决策记忆" });
    return record;
  }

  function invalidateDecisionMemory(id) {
    setDecisionMemories((prev) => prev.map((m) => (m.id === id ? { ...m, isValid: false } : m)));
  }

  function addArgumentation(record) {
    const full = { id: nextId("arg"), createdAt: new Date().toISOString().slice(0, 10), ...record };
    setArgumentations((prev) => [full, ...prev]);
    addHistory({ type: "功能论证", title: record.title, summary: record.conclusion });
    return full;
  }

  function addMeeting(record) {
    const full = { id: nextId("mtg"), createdAt: new Date().toISOString().slice(0, 10), ...record };
    setMeetings((prev) => [full, ...prev]);
    addHistory({ type: "模型会议", title: record.topic, summary: record.recommendation });
    return full;
  }

  function markKnowledgeCore(id) {
    setKnowledgeItems((prev) => prev.map((k) => (k.id === id ? { ...k, isCore: !k.isCore } : k)));
  }

  function toggleFavorite(entry) {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === entry.id);
      if (exists) return prev.filter((f) => f.id !== entry.id);
      return [{ ...entry }, ...prev];
    });
  }

  function isFavorite(id) {
    return favorites.some((f) => f.id === id);
  }

  const value = {
    pendingDecisions,
    majorAnomalies,
    techOpportunities,
    executionTasks,
    systemOverview,
    knowledgeItems,
    files,
    decisionMemories,
    history,
    meetings,
    argumentations,
    favorites,
    addPendingDecision,
    resolvePendingDecision,
    addExecutionTask,
    updateExecutionTask,
    addDecisionMemory,
    invalidateDecisionMemory,
    addArgumentation,
    addMeeting,
    markKnowledgeCore,
    toggleFavorite,
    isFavorite,
    addHistory,
    setTechOpportunities,
  };

  return <FounderAIContext.Provider value={value}>{children}</FounderAIContext.Provider>;
}
