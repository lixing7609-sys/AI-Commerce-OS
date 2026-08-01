import { useState } from "react";
import {
  nextId,
  SEED_PENDING_DECISIONS,
  SEED_TECH_OPPORTUNITIES,
  SEED_EXECUTION_TASKS,
  SEED_KNOWLEDGE_ITEMS,
  SEED_FILES,
  SEED_HISTORY,
} from "./mockData.js";
import { FounderAIContext } from "./founderAIContextObject.js";

// Sino Founder 的跨对话系统级演示状态 —— 纯前端 mock，刷新即重置
// （与 packages/ui 的 SinoWorkspace / useSinoFullScreen 完全独立，不共享、不依赖）。
// 对话本身的 topic/stage/consensus 等"当前讨论状态"存在 conversationStore
// 里（localStorage，按对话持久化）；这里只放跨对话共享的系统数据：
// 待决策列表、执行任务列表、实时情报、知识库、文件、时间线、收藏。

export function FounderAIProvider({ children }) {
  const [pendingDecisions, setPendingDecisions] = useState(SEED_PENDING_DECISIONS);
  const [techOpportunities, setTechOpportunities] = useState(SEED_TECH_OPPORTUNITIES);
  const [executionTasks, setExecutionTasks] = useState(SEED_EXECUTION_TASKS);
  const [knowledgeItems, setKnowledgeItems] = useState(SEED_KNOWLEDGE_ITEMS);
  const [files] = useState(SEED_FILES);
  const [history, setHistory] = useState(SEED_HISTORY);
  const [retrospectives, setRetrospectives] = useState([]);
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
    const actionLabel = { approve: "同意", reject: "驳回", defer: "延后处理" }[action] || action;
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

  function markKnowledgeCore(id) {
    setKnowledgeItems((prev) => prev.map((k) => (k.id === id ? { ...k, isCore: !k.isCore } : k)));
  }

  function addKnowledgeEntry(entry) {
    const record = { lastReferencedAt: new Date().toISOString().slice(0, 10), isValid: true, ...entry };
    setKnowledgeItems((prev) => [record, ...prev]);
    addHistory({ type: "知识沉淀", title: record.title, summary: record.summary });
    return record;
  }

  function addRetrospective(entry) {
    const record = { id: nextId("retro"), createdAt: new Date().toISOString().slice(0, 10), ...entry };
    setRetrospectives((prev) => [record, ...prev]);
    addHistory({ type: "复盘", title: record.originalGoal, summary: record.finalResult });
    return record;
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
    techOpportunities,
    executionTasks,
    knowledgeItems,
    files,
    history,
    retrospectives,
    favorites,
    addPendingDecision,
    resolvePendingDecision,
    addExecutionTask,
    updateExecutionTask,
    markKnowledgeCore,
    addKnowledgeEntry,
    addRetrospective,
    toggleFavorite,
    isFavorite,
    addHistory,
    setTechOpportunities,
  };

  return <FounderAIContext.Provider value={value}>{children}</FounderAIContext.Provider>;
}
