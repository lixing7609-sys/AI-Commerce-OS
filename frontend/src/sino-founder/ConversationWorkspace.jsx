import { useCallback, useEffect, useRef, useState } from "react";
import { approveFounderObject, archiveFounderObject, bindFounderConversationProject, clearFounderObjectDiscussion, continueFounderCandidateDiscussion, continueFounderObjectDiscussion, getFounderObject, reviewFounderCandidate } from "../services/founderAiApi.js";
import { advanceSinoBrainStage, approveFounderExecution, confirmSinoBrainGoal, createFounderConversation, createFounderExecution, createFounderProject, decideExecutionDelta, deleteFounderConversation, discussWithAutoDeliberation, discussWithCouncil, discussWithSino, forceSinoBrainGoalReview, getConversationWorkspace, getFounderConversations, getFounderExecution, getFounderProjects, getLifecycleAsset, getLifecycleReuseSuggestions, getProjectIntelligence, performConversationCapabilityAction, reasonConfirmedGoal, resumeFounderExecution, retryCouncil, retrySinoReply, reviewSinoBrainPackage, startLifecycleExecution, startSinoBrainStrategy, submitExecutionDelta } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";
import { ApprovalPanel } from "./ApprovalPanel.jsx";
import { AssetContext, AssetLifecycleCenter, ExecutionContext, LifecycleExecutionCenter } from "./AssetLifecycleCenter.jsx";
import { ConversationThread } from "./ConversationThread.jsx";
import { ImplementationWorkspace } from "./ImplementationWorkspace.jsx";
import { CapabilityCenter, CapabilityContext, CapabilityObjectWorkspace } from "./CapabilityWorkspace.jsx";
import { ComposerContextControls } from "./ComposerContextControls.jsx";
import { ExecutionCard } from "./ExecutionCard.jsx";
import { ExecutionContextComposer } from "./ExecutionContextComposer.jsx";
import { ExecutionDeltaPanel } from "./ExecutionDeltaPanel.jsx";
import { ExecutionTimeline } from "./ExecutionTimeline.jsx";
import { FounderHome, ProjectIntelligenceContext, ProjectWorkspace } from "./FounderHome.jsx";
import { SinoFounderShell } from "./SinoFounderShell.jsx";
import { SolutionCard } from "./SolutionCard.jsx";
import { SystemBuilderPanel, SystemContext } from "./SystemBuilderPanel.jsx";
import { TaskPlanCard } from "./TaskPlanCard.jsx";
import { SinoBrainContext } from "./SinoBrainContext.jsx";
import { founderConversationTitle } from "./founderConversationTitle.js";

const CONVERSATION_KEY = "sino-founder-active-conversation";
const EXECUTION_KEY = "sino-founder-active-execution";
const CONVERSATION_HISTORY_KEY = "sino-founder-conversation-history";
const GOAL_CONTEXT_KEY = "sino-founder-goal-execution-context";
const PROJECT_KEY = "sino-founder-active-project";
const WORKSPACE_VIEW_KEY = "sino-founder-object-workspace-view";
const WORKSPACE_OBJECT_KEY = "sino-founder-object-workspace-selected";
const WORKSPACE_VIEWS = ["object", "capability-center", "execution", "assets", "builder"];
const stored = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* unavailable */ } };
const storedHistory = () => {
  try {
    const history = JSON.parse(window.localStorage.getItem(CONVERSATION_HISTORY_KEY) || "[]");
    const cleaned = history.filter((item) => item.title !== "新讨论");
    if (cleaned.length !== history.length) window.localStorage.setItem(CONVERSATION_HISTORY_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch { return []; }
};
const storedGoalContext = () => { try { return JSON.parse(window.localStorage.getItem(GOAL_CONTEXT_KEY) || "{}"); } catch { return {}; } };
export const normalizeFounderView = (next) => {
  if (["reasoning", "blueprint", "system-builder"].includes(next)) return "builder";
  if (["capability", "models", "model-center", "objects"].includes(next)) return "capability-center";
  if (next === "learning") return "assets";
  if (next === "lifecycle") return "home";
  return next;
};
const queryView = () => { try { return new URLSearchParams(window.location.search).get("workspace"); } catch { return null; } };
const queryObject = () => { try { return new URLSearchParams(window.location.search).get("object"); } catch { return null; } };

export function ConversationWorkspace() {
  const [conversationId, setConversationId] = useState(() => stored(CONVERSATION_KEY));
  const [view, setView] = useState(() => normalizeFounderView(queryView() || stored(WORKSPACE_VIEW_KEY) || (stored(CONVERSATION_KEY) ? "conversation" : "home")));
  const [snapshot, setSnapshot] = useState(null);
  const [conversations, setConversations] = useState(storedHistory);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projectIntelligence, setProjectIntelligence] = useState(null);
  const [projectReloadKey, setProjectReloadKey] = useState(0);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState("");
  const [discussionMessage, setDiscussionMessage] = useState("");
  const [executionMessage, setExecutionMessage] = useState("");
  const [goalExecutionContext, setGoalExecutionContext] = useState(storedGoalContext);
  const [goal, setGoal] = useState(null);
  const [result, setResult] = useState(null);
  const [executionId, setExecutionId] = useState(() => stored(EXECUTION_KEY));
  const [execution, setExecution] = useState(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sinoHealthy, setSinoHealthy] = useState(true);
  const [replyPending, setReplyPending] = useState(false);
  const [pendingReplyMode, setPendingReplyMode] = useState("sino");
  const [discussionMode, setDiscussionMode] = useState("sino");
  const [selectedWorkspaceObject, setSelectedWorkspaceObject] = useState(null);
  const [selectedCapabilityAsset, setSelectedCapabilityAsset] = useState(null);
  const [selectedSystemAsset, setSelectedSystemAsset] = useState(null);
  const [selectedLifecycleAsset, setSelectedLifecycleAsset] = useState(null);
  const [selectedLifecycleExecution, setSelectedLifecycleExecution] = useState(null);
  const [activeCapabilityAsset, setActiveCapabilityAsset] = useState(null);
  const [capabilityLifecycleError, setCapabilityLifecycleError] = useState("");
  const [reuseSuggestions, setReuseSuggestions] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [creationContext, setCreationContext] = useState(null);
  const sendLockRef = useRef(false);
  const skipNextRestoreRef = useRef(false);
  const initialRestoreRef = useRef(Boolean(conversationId));

  useEffect(() => {
    const objects = snapshot?.founder_objects || [];
    console.debug("Implementation Workspace Snapshot", { objectsCount: objects.length, draftCount: objects.filter((item) => item.status === "draft").length, changedCount: objects.filter((item) => item.status !== "draft" || item.revisions?.length).length, currentContextObject: snapshot?.active_context_object_id || null });
  }, [snapshot]);

  useEffect(() => {
    let active = true;
    if (!conversationId || !(snapshot?.messages?.length)) {
      Promise.resolve().then(() => { if (active) setReuseSuggestions([]); });
      return () => { active = false; };
    }
    getLifecycleReuseSuggestions(conversationId).then((data) => { if (active) setReuseSuggestions(data.assets || []); }).catch(() => { if (active) setReuseSuggestions([]); });
    return () => { active = false; };
  }, [conversationId, snapshot?.messages?.length]);

  const persistWorkspace = useCallback((nextView, objectId = null) => {
    remember(WORKSPACE_VIEW_KEY, nextView);
    remember(WORKSPACE_OBJECT_KEY, objectId);
    try {
      const url = new URL(window.location.href);
      if (WORKSPACE_VIEWS.includes(nextView)) url.searchParams.set("workspace", nextView); else url.searchParams.delete("workspace");
      url.searchParams.delete("filter");
      if (WORKSPACE_VIEWS.includes(nextView) && objectId) url.searchParams.set("object", objectId); else url.searchParams.delete("object");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* unavailable */ }
  }, []);


  useEffect(() => {
    if (!WORKSPACE_VIEWS.includes(view)) return undefined;
    const objectId = queryObject() || stored(WORKSPACE_OBJECT_KEY);
    if (!objectId) return undefined;
    let active = true;
    getFounderObject(objectId).then((object) => { if (active) setSelectedWorkspaceObject(object); }).catch(() => {
      if (active) { setSelectedWorkspaceObject(null); persistWorkspace(view, null); }
    });
    return () => { active = false; };
  }, [view, persistWorkspace]);

  const rememberConversation = useCallback((id, title = "新讨论") => {
    if (!id) return;
    setConversations((current) => {
      const previous = current.find((item) => item.id === id);
      const resolvedTitle = previous?.title && previous.title !== "新讨论" ? previous.title : title;
      const next = [{ id, title: resolvedTitle.slice(0, 36), state: previous?.state, updatedAt: Date.now() }, ...current.filter((item) => item.id !== id)];
      remember(CONVERSATION_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeConversationHistory = useCallback((id) => {
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      remember(CONVERSATION_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
    if (stored(CONVERSATION_KEY) === id) remember(CONVERSATION_KEY, null);
  }, []);

  const applyConversationSnapshot = useCallback((id, restored) => {
    setConversationId(id); setSnapshot(restored); setDiscussionMessage(""); setExecutionMessage(""); setError("");
    setActiveProjectId(restored.conversation?.project_id || null); setProjectIntelligence(null);
    remember(CONVERSATION_KEY, id); remember(PROJECT_KEY, restored.conversation?.project_id || null);
    rememberConversation(id, founderConversationTitle(restored.conversation?.title || restored.messages?.[0]?.content, restored.sino_brain?.goal_brief?.goal));
    const restoredGoal = restored.goals?.find((item) => ["goal_confirmed", "planning"].includes(item.status)) || restored.goals?.[0] || null;
    setGoal(restoredGoal);
    if (restored.active_execution) { setExecution(restored.active_execution); setExecutionId(restored.active_execution.id); setApproved(Boolean(restored.active_execution.execution_allowed)); remember(EXECUTION_KEY, restored.active_execution.id); }
    else { setExecution(null); setExecutionId(null); setApproved(false); remember(EXECUTION_KEY, null); }
    setView("conversation");
  }, [rememberConversation]);

  const restoreWorkspace = useCallback(async (id) => {
    if (!id) return;
    const restored = await getConversationWorkspace(id);
    setSnapshot(restored);
    setActiveProjectId(restored.conversation?.project_id || null);
    remember(PROJECT_KEY, restored.conversation?.project_id || null);
    rememberConversation(restored.conversation?.id || id, founderConversationTitle(restored.conversation?.title || restored.messages?.[0]?.content, restored.sino_brain?.goal_brief?.goal));
    const restoredGoal = restored.goals?.find((item) => ["goal_confirmed", "planning"].includes(item.status)) || restored.goals?.[0];
    if (restoredGoal) setGoal(restoredGoal);
    if (restored.active_execution) {
      setExecution(restored.active_execution);
      setExecutionId(restored.active_execution.id);
      setApproved(Boolean(restored.active_execution.execution_allowed));
      remember(EXECUTION_KEY, restored.active_execution.id);
    }
  }, [rememberConversation]);

  useEffect(() => {
    if (!conversationId || !initialRestoreRef.current) return undefined;
    initialRestoreRef.current = false;
    if (skipNextRestoreRef.current) { skipNextRestoreRef.current = false; return undefined; }
    let active = true;
    getConversationWorkspace(conversationId).then((restored) => {
      if (!active) return;
      setSnapshot(restored);
      setActiveProjectId(restored.conversation?.project_id || null);
      remember(PROJECT_KEY, restored.conversation?.project_id || null);
      rememberConversation(restored.conversation?.id || conversationId, founderConversationTitle(restored.conversation?.title || restored.messages?.[0]?.content, restored.sino_brain?.goal_brief?.goal));
      const restoredGoal = restored.goals?.find((item) => ["goal_confirmed", "planning"].includes(item.status)) || restored.goals?.[0];
      if (restoredGoal) setGoal(restoredGoal);
      if (restored.active_execution) {
        setExecution(restored.active_execution); setExecutionId(restored.active_execution.id); setApproved(Boolean(restored.active_execution.execution_allowed)); remember(EXECUTION_KEY, restored.active_execution.id);
      }
    }).catch((requestError) => { if (active) { setError(requestError.message); if (requestError.status === 404) removeConversationHistory(conversationId); remember(CONVERSATION_KEY, null); setConversationId(null); setSnapshot(null); setView("home"); } });
    return () => { active = false; };
  }, [conversationId, rememberConversation, removeConversationHistory]);
  useEffect(() => {
    let active = true;
    getFounderConversations().then((items) => {
      if (!active) return;
      const valid = items.map((item) => ({ id: item.id, title: item.title, state: item.state, updatedAt: new Date(item.updated_at || item.created_at || 0).getTime() || Date.now() }));
      setConversations(valid); remember(CONVERSATION_HISTORY_KEY, JSON.stringify(valid));
      const activeId = stored(CONVERSATION_KEY);
      if (activeId && !valid.some((item) => item.id === activeId) && activeId !== conversationId) remember(CONVERSATION_KEY, null);
    }).catch(() => {});
    return () => { active = false; };
  }, [conversationId]);
  useEffect(() => { getFounderProjects().then(setProjects).catch(() => {}); }, []);
  useEffect(() => {
    if (!activeProjectId) { setProjectIntelligence(null); setProjectLoading(false); setProjectLoadError(""); return undefined; }
    let active = true;
    setProjectLoading(true); setProjectLoadError("");
    getProjectIntelligence(activeProjectId).then((value) => { if (active) { setProjectIntelligence(value); setProjectLoading(false); } }).catch((requestError) => { if (active) { setProjectIntelligence(null); setProjectLoading(false); setProjectLoadError(requestError.message || "项目加载失败"); setError(requestError.message); } });
    return () => { active = false; };
  }, [activeProjectId, projectReloadKey]);
  useEffect(() => {
    if (!executionId || execution) return;
    getFounderExecution(executionId).then((item) => { setExecution(item); setApproved(Boolean(item.execution_allowed)); }).catch(() => { remember(EXECUTION_KEY, null); setExecutionId(null); });
  }, [executionId, execution]);
  useEffect(() => {
    if (!executionId || !["queued", "executing", "testing"].includes(execution?.status)) return undefined;
    const timer = window.setInterval(() => getFounderExecution(executionId).then(setExecution).catch((requestError) => { setError(requestError.message); }), 1000);
    return () => window.clearInterval(timer);
  }, [executionId, execution?.status]);
  useEffect(() => { const normalized = normalizeFounderView(view); if (normalized !== view) setView(normalized); }, [view]);

  const hasExecutionContext = Boolean(goal?.goal_id || execution?.task_asset_id || executionId);

  async function prepareGoal(formalGoal) {
    setGoal(formalGoal);
    const reasoning = await reasonConfirmedGoal(formalGoal.goal_id);
    const draft = reasoning.task_asset_draft;
    const task = await createTaskAsset({ title: draft.title, description: draft.description, scope: { ...draft.scope, goal_id: formalGoal.goal_id }, conversation_id: formalGoal.conversation_id || conversationId });
    const conversationContextKey = formalGoal.conversation_id || conversationId;
    const pendingContext = [...(conversationContextKey ? goalExecutionContext[`conversation:${conversationContextKey}`] || [] : []), ...(goalExecutionContext[formalGoal.goal_id] || [])];
    const executionPackage = pendingContext.length ? { ...reasoning.execution_package, founder_supplements: pendingContext } : reasoning.execution_package;
    const nextExecution = await createFounderExecution(task.id, executionPackage, formalGoal.goal_id);
    setResult(reasoning); setExecution(nextExecution); setExecutionId(nextExecution.id); setApproved(false); remember(EXECUTION_KEY, nextExecution.id); setView("execution");
  }

  async function sendDiscussion(event) {
    event.preventDefault();
    const content = discussionMessage.trim(); if (!content || busy || sendLockRef.current) return;
    sendLockRef.current = true;
    setBusy(true); setError("");
    let id = conversationId;
    const effectiveMode = discussionMode === "auto" && snapshot?.sino_brain?.active_workspace_stage !== "strategy" ? "sino" : discussionMode;
    let progressTimer;
    try {
      if (!id) { const conversation = await createFounderConversation("新讨论", activeProjectId); id = conversation.id; skipNextRestoreRef.current = true; setConversationId(id); remember(CONVERSATION_KEY, id); rememberConversation(id, "新讨论"); }
      if (effectiveMode === "council" || effectiveMode === "auto") {
        const messageType = effectiveMode === "auto" ? "auto_deliberation" : "council";
        setSnapshot((current) => ({ ...(current || {}), conversation: current?.conversation || { id, project_id: activeProjectId, title: "新讨论", state: "exploring" }, messages: [...(current?.messages || []), { message_id: `optimistic-${Date.now()}`, role: "founder", content, message_type: messageType }], council_runs: [...(current?.council_runs || []), { council_run_id: `pending-${Date.now()}`, question: content, discussion_mode: messageType, status: "running", participants: [], model_runs: [] }] }));
        setDiscussionMessage(""); setView("conversation");
      }
      const pollProgress = async () => {
        try { setSnapshot(await getConversationWorkspace(id)); } catch { /* final request owns errors */ }
        if (sendLockRef.current) progressTimer = window.setTimeout(pollProgress, 700);
      };
      progressTimer = window.setTimeout(pollProgress, 150);
      const nextSnapshot = effectiveMode === "council" ? await discussWithCouncil(id, content) : effectiveMode === "auto" ? await discussWithAutoDeliberation(id, content) : await discussWithSino(id, content);
      setSnapshot(nextSnapshot); setDiscussionMessage(""); setReplyPending(false); setSinoHealthy(true); rememberConversation(id, founderConversationTitle(nextSnapshot.conversation?.title || nextSnapshot.messages?.[0]?.content || content, nextSnapshot.sino_brain?.goal_brief?.goal));
      if (activeProjectId) {
        try { setProjectIntelligence(await getProjectIntelligence(activeProjectId)); }
        catch (projectError) { setError(`项目智能更新失败，已保留上一版本：${projectError.message}`); }
      }
      const explicitGoal = nextSnapshot.goals?.find((item) => item.status === "goal_confirmed");
      if (explicitGoal) await prepareGoal(explicitGoal); else setView("conversation");
    } catch (requestError) {
      setSinoHealthy(false);
      setError(`${requestError.message || "Sino 回复失败"}，可重试`);
      setReplyPending(Boolean(id));
      setPendingReplyMode(effectiveMode);
      if (id) {
        try {
          const persisted = await getConversationWorkspace(id);
          setSnapshot(persisted); setDiscussionMessage(""); setView("conversation");
          rememberConversation(id, founderConversationTitle(persisted.conversation?.title, persisted.sino_brain?.goal_brief?.goal));
        } catch { setView("conversation"); }
      }
    }
    finally { sendLockRef.current = false; if (progressTimer) window.clearTimeout(progressTimer); setBusy(false); }
  }

  async function confirmBrainGoal() {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try {
      await confirmSinoBrainGoal(conversationId);
      setSnapshot(discussionMode === "auto"
        ? await discussWithAutoDeliberation(conversationId, "基于已确认 Goal Brief 开始自动多轮 Strategy Meeting")
        : await startSinoBrainStrategy(conversationId));
    }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function forceBrainGoalReview() {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try { setSnapshot(await forceSinoBrainGoalReview(conversationId)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function startBrainStrategy() {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try { setSnapshot(await startSinoBrainStrategy(conversationId)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function reviewBrainPackage(action) {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try {
      const restored = await reviewSinoBrainPackage(conversationId, action);
      setSnapshot(restored);
      if (restored?.conversation?.state === "completed") setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, state: "completed" } : item));
    }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function advanceBrainStage(action) {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try { setSnapshot(await advanceSinoBrainStage(conversationId, action)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function continueBrainDiscussion() {
    setDiscussionMessage("继续讨论：");
  }

  async function retryReply() {
    if (!conversationId || busy || sendLockRef.current) return;
    sendLockRef.current = true; setBusy(true); setError("");
    try {
      const nextSnapshot = pendingReplyMode === "council" ? await retryCouncil(conversationId) : await retrySinoReply(conversationId);
      setSnapshot(nextSnapshot); setReplyPending(false); setSinoHealthy(true); rememberConversation(conversationId, founderConversationTitle(nextSnapshot.conversation?.title, nextSnapshot.sino_brain?.goal_brief?.goal));
      if (activeProjectId) {
        try { setProjectIntelligence(await getProjectIntelligence(activeProjectId)); }
        catch (projectError) { setError(`项目智能更新失败，已保留上一版本：${projectError.message}`); }
      }
    } catch (requestError) { setSinoHealthy(false); setError(`${requestError.message || "Sino 回复失败"}，可重试`); setReplyPending(true); }
    finally { sendLockRef.current = false; setBusy(false); }
  }

  function newConversation() {
    setConversationId(null); setSnapshot(null); setDiscussionMessage(""); setExecutionMessage(""); setGoal(null); setResult(null); setExecutionId(null); setExecution(null); setApproved(false); setError("");
    setActiveProjectId(null); setProjectIntelligence(null);
    remember(CONVERSATION_KEY, null); remember(EXECUTION_KEY, null); remember(PROJECT_KEY, null); remember(WORKSPACE_VIEW_KEY, null); setCreationContext(null); setSelectedWorkspaceObject(null); setView("home");
  }

  async function quickCreate(type) {
    const labels = { agent: "Agent", skill: "Skill", workflow: "Workflow", prompt: "Prompt", capability: "Capability", project: "Project" };
    const label = labels[type];
    if (!label || busy) return;
    setBusy(true); setError("");
    try {
      const conversation = await createFounderConversation(`创建 ${label}`, activeProjectId);
      const prompt = `我们来创建一个新的 ${label}。请告诉我你希望解决什么问题。`;
      setCreationContext({ type, name: `${label} 名称待讨论`, prompt });
      setConversationId(conversation.id); remember(CONVERSATION_KEY, conversation.id); rememberConversation(conversation.id, `创建 ${label}`);
      setSnapshot({ conversation: { ...conversation, title: `创建 ${label}` }, messages: [{ message_id: `guide-${Date.now()}`, role: "sino", content: prompt }], founder_objects: [], object_candidates: [] });
      setDiscussionMessage(""); setView("conversation");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function selectConversation(id) {
    if (!id) return;
    if (id === conversationId && snapshot?.conversation?.id === id) { setView("conversation"); return; }
    setBusy(true); setError("");
    try {
      const restored = await getConversationWorkspace(id);
      remember(WORKSPACE_VIEW_KEY, "conversation");
      applyConversationSnapshot(id, restored);
    } catch (requestError) {
      if (requestError.status === 404 || requestError.code === "conversation_not_found") removeConversationHistory(id);
      setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function confirmDeleteConversation() {
    if (!deleteTarget || busy) return;
    const id = deleteTarget.id;
    setBusy(true); setError("");
    try {
      await deleteFounderConversation(id);
      removeConversationHistory(id);
      if (id === conversationId) {
        setConversationId(null); setSnapshot(null); setDiscussionMessage(""); setExecutionMessage(""); setGoal(null); setExecutionId(null); setExecution(null); setApproved(false); setActiveProjectId(null); setProjectIntelligence(null);
        remember(CONVERSATION_KEY, null); remember(EXECUTION_KEY, null); remember(PROJECT_KEY, null); setView("home");
      }
      setDeleteTarget(null);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function selectProjectContext(id) {
    setActiveProjectId(id); remember(PROJECT_KEY, id);
  }

  async function bindCurrentConversationProject(id) {
    if (!conversationId) { selectProjectContext(id); return; }
    setBusy(true); setError("");
    try {
      await bindFounderConversationProject(conversationId, id);
      setActiveProjectId(id); remember(PROJECT_KEY, id);
      const restored = await getConversationWorkspace(conversationId);
      setSnapshot(restored);
      if (!id) setProjectIntelligence(null);
      else setProjectReloadKey((current) => current + 1);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function approveObject(item) {
    setBusy(true); setError("");
    try {
      const next = await approveFounderObject(item.object_id);
      const executionRef = next.execution_refs?.at(-1);
      const restored = conversationId ? await getConversationWorkspace(conversationId) : null;
      setSnapshot(restored || ((current) => ({ ...current, founder_objects: (current?.founder_objects || []).map((value) => value.object_id === next.object_id ? next : value) })));
      if (executionRef?.execution_id) {
        setExecutionId(executionRef.execution_id);
        remember(EXECUTION_KEY, executionRef.execution_id);
        setExecution(restored?.active_execution || await getFounderExecution(executionRef.execution_id));
      }
      setView("execution");
    }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function continueObject(item) {
    const requestedConversationId = item.source_conversation_id || conversationId;
    setBusy(true); setError("");
    try {
      const binding = await continueFounderObjectDiscussion(item.object_id, requestedConversationId);
      const targetConversationId = binding.context_conversation_id;
      if (!targetConversationId) throw new Error("Object 没有可恢复的来源 Conversation");
      setConversationId(targetConversationId); remember(CONVERSATION_KEY, targetConversationId);
      setSnapshot(await getConversationWorkspace(targetConversationId)); setCreationContext({ type: item.object_type, name: item.name, prompt: item.description });
      setDiscussionMessage(`继续讨论 ${item.name}：`); setView("conversation"); persistWorkspace("conversation", null);
    }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function exitObjectDiscussion() {
    if (!conversationId || busy) return;
    setBusy(true); setError("");
    try { await clearFounderObjectDiscussion(conversationId); setSnapshot(await getConversationWorkspace(conversationId)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function archiveObject(item) {
    setBusy(true); setError("");
    try { await archiveFounderObject(item.object_id); setSnapshot((current) => ({ ...current, founder_objects: (current?.founder_objects || []).filter((value) => value.object_id !== item.object_id) })); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function reviewCandidate(item, action) {
    setBusy(true); setError("");
    try { await reviewFounderCandidate(item.candidate_id, action); if (conversationId) setSnapshot(await getConversationWorkspace(conversationId)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function continueCandidate(item) {
    if (!conversationId) return;
    setBusy(true); setError("");
    try { await continueFounderCandidateDiscussion(item.candidate_id, conversationId); setSnapshot(await getConversationWorkspace(conversationId)); setDiscussionMessage(`继续讨论候选变更 ${item.proposed_name || ""}：`); setView("conversation"); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function openConversationFiles() {
    setError("文件/文档入口已预留；当前尚未接通可安全复用的上传能力。");
  }

  function openProject(id) {
    setConversationId(null); setSnapshot(null); setDiscussionMessage(""); setExecutionMessage(""); setGoal(null); setResult(null); setExecutionId(null); setExecution(null); setApproved(false); setError("");
    setActiveProjectId(id); setProjectIntelligence(null); setProjectLoading(true); setProjectLoadError(""); setProjectReloadKey((current) => current + 1);
    remember(CONVERSATION_KEY, null); remember(EXECUTION_KEY, null); remember(PROJECT_KEY, id); setView("project");
  }

  function openCapabilityObject(item) {
    setSelectedWorkspaceObject(item); setView("object"); persistWorkspace("object", item.object_id);
  }

  function continueAsset(item) {
    const objectId = item.native_id || item.object_id;
    if (objectId) { continueObject({ ...item, object_id: objectId, object_type: item.asset_type }); return; }
    setCreationContext({ type: item.asset_type, name: item.name, prompt: item.purpose });
    setDiscussionMessage(`继续讨论 ${item.name}：`); setView("conversation");
  }

  function openAssetRecord(item) { setSelectedWorkspaceObject(item); setView("assets"); }
  async function executeAsset(item) {
    setBusy(true); setError("");
    try { openLifecycleExecution(await startLifecycleExecution(item.asset_id)); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createProject(payload) {
    const project = await createFounderProject(payload);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    selectProjectContext(project.id);
    return project;
  }

  async function submitExecutionContext(event) {
    event.preventDefault();
    const content = executionMessage.trim();
    if (!content || busy) return;
    setBusy(true); setError("");
    try {
      if (!goal?.goal_id) {
        const draftKey = conversationId ? `conversation:${conversationId}` : "reasoning:draft";
        const nextContext = { ...goalExecutionContext, [draftKey]: [...(goalExecutionContext[draftKey] || []), { content, created_at: new Date().toISOString(), context_type: "pre_goal_reasoning" }] };
        setGoalExecutionContext(nextContext); remember(GOAL_CONTEXT_KEY, JSON.stringify(nextContext)); setExecutionMessage(""); return;
      }
      if (!execution?.id) {
        const nextContext = { ...goalExecutionContext, [goal.goal_id]: [...(goalExecutionContext[goal.goal_id] || []), { content, created_at: new Date().toISOString() }] };
        setGoalExecutionContext(nextContext); remember(GOAL_CONTEXT_KEY, JSON.stringify(nextContext)); setExecutionMessage(""); return;
      }
      const delta = await submitExecutionDelta(execution.id, { conversation_id: conversationId, goal_id: goal.goal_id, task_id: execution.task_asset_id, content });
      const nextExecution = await getFounderExecution(execution.id);
      setExecution({ ...nextExecution, deltas: [...(nextExecution.deltas || []), ...(nextExecution.deltas?.some((item) => item.delta_id === delta.delta_id) ? [] : [delta])] });
      setExecutionMessage(""); await restoreWorkspace(conversationId);
    } catch (requestError) { setError(requestError.message || "执行补充提交失败"); }
    finally { setBusy(false); }
  }

  async function approve() { if (!executionId || busy) return; setBusy(true); try { const item = await approveFounderExecution(executionId); setExecution(item); setApproved(true); setView("execution"); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function resume() { if (!executionId || busy) return; setBusy(true); try { setExecution(await resumeFounderExecution(executionId)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function decideDelta(delta, action) { setBusy(true); try { await decideExecutionDelta(execution.id, delta.delta_id, action); setExecution(await getFounderExecution(execution.id)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  function openReturnedAsset() { setView("assets"); }

  function openObjectExecution(item) {
    const reference = item.execution_refs?.at(-1);
    if (reference?.execution_id) { setExecutionId(reference.execution_id); remember(EXECUTION_KEY, reference.execution_id); setExecution(null); }
    setView("execution");
  }

  function openLifecycleExecution(item) {
    const id = item.execution_id || item.id;
    if (id) { setExecutionId(id); remember(EXECUTION_KEY, id); setExecution(null); }
    setView("execution");
  }

  const capabilityAction = snapshot?.sino_brain?.current_action?.target_asset_id
    ? snapshot.sino_brain.current_action
    : null;

  useEffect(() => {
    const targetAssetId = capabilityAction?.target_asset_id;
    if (!targetAssetId) return undefined;
    let active = true;
    getLifecycleAsset(targetAssetId).then((asset) => { if (active) { setActiveCapabilityAsset(asset); setCapabilityLifecycleError(""); } }).catch((requestError) => { if (active) setCapabilityLifecycleError(requestError.message); });
    return () => { active = false; };
  }, [capabilityAction?.target_asset_id, snapshot?.conversation?.updated_at]);

  async function handleCapabilityAction(action) {
    if (action.action_id === "ready_complete") { setSelectedCapabilityAsset(activeCapabilityAsset); setView("capability-center"); return; }
    setBusy(true); setError(""); setCapabilityLifecycleError("");
    const targetAssetId = action.target_asset_id || action.asset_id;
    try {
      const actionId = action.action_id === "candidates_saved" ? "develop" : action.action_id;
      const result = await performConversationCapabilityAction(conversationId || snapshot?.conversation?.id, { action: actionId, target_asset_id: targetAssetId });
      const asset = result?.asset || result;
      if (asset) { setActiveCapabilityAsset(asset); setSelectedCapabilityAsset(asset); }
      if (conversationId || snapshot?.conversation?.id) {
        setSnapshot(await getConversationWorkspace(conversationId || snapshot.conversation.id));
      }
    } catch (requestError) {
      setCapabilityLifecycleError(requestError.message); setError(requestError.message);
      const refreshId = requestError.lifecycle?.asset_id || targetAssetId;
      if (refreshId) { try { setActiveCapabilityAsset(await getLifecycleAsset(refreshId)); } catch { /* retain actionable lifecycle error */ } }
      if (conversationId) { try { setSnapshot(await getConversationWorkspace(conversationId)); } catch { /* retain current snapshot */ } }
    }
    finally { setBusy(false); }
  }

  async function handleReuseAsset(asset) {
    if (!conversationId) return;
    setBusy(true); setError("");
    try {
      const nextSnapshot = await discussWithSino(conversationId, `引用 ${asset.name}`);
      setReuseSuggestions((items) => items.filter((item) => item.asset_id !== asset.asset_id));
      setSelectedCapabilityAsset(await getLifecycleAsset(asset.asset_id));
      setActiveCapabilityAsset(await getLifecycleAsset(asset.asset_id));
      setSnapshot(nextSnapshot);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const projectName = projectIntelligence?.project_name || projects.find((item) => item.id === activeProjectId)?.name || "未关联项目";
  const conversationIntelligence = snapshot?.conversation_intelligence || (snapshot?.digest ? {
    summary: snapshot.digest.summary,
    judgments: snapshot.digest.key_viewpoints || [],
    decisions: snapshot.digest.decisions || [],
    knowledge: snapshot.digest.knowledge_items || [],
    constraints: snapshot.digest.constraints || [],
    terminology: snapshot.digest.terminology || [],
    pending_questions: snapshot.digest.pending_questions || [],
    candidate_goals: snapshot.digest.candidate_goals || [],
    goals: snapshot.goals || [],
    updated_at: snapshot.digest.updated_at || snapshot.conversation?.updated_at,
  } : null);
  const latestDelta = execution?.deltas?.at(-1) || snapshot?.execution_deltas?.at(-1);
  const executionComposer = hasExecutionContext ? <ExecutionContextComposer value={executionMessage} onChange={setExecutionMessage} onSubmit={submitExecutionContext} busy={busy} /> : null;
  const executionView = <section className="sino-section sino-execution-page" id="execution"><header className="sino-execution-page__header"><span className="sino-kicker">Execution Center</span><h1>执行中心</h1></header>{!executionId ? <><section className="sino-execution-empty" aria-label="当前执行空状态"><span className="sino-kicker">当前执行</span><h2>当前没有正在执行的任务。</h2><p>已确认并进入执行的任务会显示在这里。</p></section><section className="sino-founder-actions" aria-label="待 Founder 处理"><div><span className="sino-kicker">待 Founder 处理</span><h3>当前无需处理</h3></div></section><section className="sino-recent-executions" aria-label="最近完成"><span className="sino-kicker">最近完成</span><h3>暂无执行记录</h3></section><ExecutionContextComposer value={executionMessage} onChange={setExecutionMessage} onSubmit={submitExecutionContext} busy={busy} disabled /></> : <><section className="sino-current-execution" aria-label="当前执行"><span className="sino-kicker">当前执行</span><h2>{result?.task_asset_draft?.title || snapshot?.task_asset?.title || goal?.title || "当前任务"}</h2><dl><div><dt>所属项目</dt><dd>{projectName}</dd></div><div><dt>正式目标</dt><dd>{goal?.title || snapshot?.task_asset?.title || "已确认"}</dd></div><div><dt>已确认范围</dt><dd>{result?.task_asset_draft?.description || snapshot?.task_asset?.description || result?.solution?.summary || "按已批准执行方案"}</dd></div><div><dt>当前阶段</dt><dd>{execution?.status === "draft" ? "Waiting Development" : execution?.status || "准备中"}</dd></div></dl></section>{result && <section className="sino-reasoning-grid" aria-label="已确认执行方案"><SolutionCard solution={result.solution} /><TaskPlanCard draft={result.task_asset_draft} plan={result.task_plan} /><ExecutionCard requirement={result.execution_requirement} executionPackage={result.execution_package} risk={result.risk} /></section>}<ExecutionTimeline status={execution?.status} timeline={execution?.timeline} events={execution?.events} failureReason={execution?.failure_reason} pauseReason={execution?.pause_reason} recoverable={execution?.recoverable} lastEvent={execution?.last_event} executionEngine={execution?.execution_engine_name || execution?.execution_engine || "执行引擎"} onResume={resume} /><ApprovalPanel ready approved={approved} busy={busy} status={execution?.status} latestDelta={latestDelta} onApprove={approve} /><ExecutionDeltaPanel deltas={execution?.deltas || snapshot?.execution_deltas} onDecision={decideDelta} /><ExecutionResultSummary execution={execution} onOpen={openReturnedAsset} />{executionComposer}</>}</section>;

  const executionContext = <ContextSummary title="执行上下文"><small>所属项目</small><p>{executionId ? projectName : "—"}</p><small>正式目标</small><p>{executionId ? goal?.title || "已确认" : "—"}</p><small>当前阶段</small><p>{execution?.status || "暂无执行"}</p><small>关键约束</small><p>{executionId ? result?.analysis?.constraints?.join?.(" · ") || "—" : "—"}</p><small>最近补充</small><p>{latestDelta?.content || "—"}</p><small>待审批事项</small><p>{latestDelta?.status === "pending_confirmation" ? "执行补充待确认" : approved ? "无" : executionId ? "执行方案待授权" : "无"}</p></ContextSummary>;
  const capabilityContext = snapshot?.sino_brain ? <SinoBrainContext brain={snapshot.sino_brain} busy={busy} capabilityAction={capabilityAction} capabilityAsset={activeCapabilityAsset} onCapabilityAction={handleCapabilityAction} onConfirmGoal={confirmBrainGoal} onForceReview={forceBrainGoalReview} onStartStrategy={startBrainStrategy} onAdvanceStage={advanceBrainStage} onContinueDiscussion={continueBrainDiscussion} onReviewPackage={reviewBrainPackage} onViewAssets={() => setView("capability-center")} onNewGoal={newConversation} /> : <ImplementationWorkspace objects={snapshot?.founder_objects || []} candidates={snapshot?.object_candidates || []} contextObject={snapshot?.context_object || null} contextCandidate={snapshot?.context_candidate || null} intelligence={conversationIntelligence} creationContext={creationContext} recognitionStatus={snapshot?.object_recognition} onApprove={approveObject} onContinue={continueObject} onArchive={archiveObject} onOpenObject={openCapabilityObject} onCandidateReview={reviewCandidate} onCandidateContinue={continueCandidate} busy={busy} />;
  let main = <FounderHome snapshot={snapshot} execution={execution} intelligence={projectIntelligence} message={discussionMessage} onMessage={setDiscussionMessage} onSend={sendDiscussion} busy={busy} onNavigate={setView} onOpenConversation={selectConversation} onQuickCreate={quickCreate} healthy={sinoHealthy} projects={projects} activeProjectId={activeProjectId} onSelectProject={selectProjectContext} onCreateProject={createProject} onFiles={openConversationFiles} mode={discussionMode} onModeChange={setDiscussionMode} />;
  let context = capabilityContext;
  if (view === "project") { main = <ProjectWorkspace intelligence={projectIntelligence} loading={projectLoading} error={projectLoadError} onOpenConversation={selectConversation} message={discussionMessage} onMessage={setDiscussionMessage} onSend={sendDiscussion} busy={busy} healthy={sinoHealthy} mode={discussionMode} onModeChange={setDiscussionMode} />; context = <ProjectIntelligenceContext intelligence={projectIntelligence} onNavigate={setView} onOpenConversation={selectConversation} />; }
  if (view === "conversation") { const contextControls = <ComposerContextControls healthy={sinoHealthy} projects={projects} activeProjectId={snapshot?.conversation?.project_id || null} onSelectProject={bindCurrentConversationProject} onCreateProject={createProject} onFiles={openConversationFiles} />; main = <section className="sino-conversation-page"><ConversationThread snapshot={snapshot} message={discussionMessage} onMessage={setDiscussionMessage} onSend={sendDiscussion} busy={busy} capabilityAction={capabilityAction} capabilityAsset={activeCapabilityAsset} capabilityError={capabilityLifecycleError} onCapabilityAction={handleCapabilityAction} reuseSuggestions={reuseSuggestions} onReuse={handleReuseAsset} healthy={sinoHealthy} contextControls={contextControls} mode={discussionMode} onModeChange={setDiscussionMode} onExitObjectDiscussion={exitObjectDiscussion} onConfirmGoal={confirmBrainGoal} onReviseGoal={() => setDiscussionMessage("这里需要修正：")} onAdvanceStage={advanceBrainStage} onReviewPackage={reviewBrainPackage} onContinueDiscussion={continueBrainDiscussion} onViewAssets={() => setView("capability-center")} onNewGoal={newConversation} /></section>; context = capabilityContext; }
  if (view === "capability-center") { main = <CapabilityCenter selected={selectedCapabilityAsset} onSelect={setSelectedCapabilityAsset} />; context = <CapabilityContext selected={selectedCapabilityAsset} onContinue={continueAsset} onChanged={setSelectedCapabilityAsset} conversationId={conversationId} />; }
  if (view === "object") { main = <CapabilityObjectWorkspace object={selectedWorkspaceObject} onContinue={continueObject} onOpenExecution={openObjectExecution} />; context = capabilityContext; }
  if (view === "execution") { main = executionId ? executionView : <LifecycleExecutionCenter selected={selectedLifecycleExecution} onSelect={setSelectedLifecycleExecution} />; context = executionId ? executionContext : <ExecutionContext selected={selectedLifecycleExecution} onSelect={setSelectedLifecycleExecution} onOpenExecution={openLifecycleExecution} />; }
  if (view === "assets") { main = <AssetLifecycleCenter selected={selectedLifecycleAsset} onSelect={setSelectedLifecycleAsset} initialAsset={selectedWorkspaceObject?.asset_id ? selectedWorkspaceObject : null} onStartNewGoal={newConversation} />; context = <AssetContext selected={selectedLifecycleAsset} onSelect={setSelectedLifecycleAsset} conversationId={conversationId} projectId={activeProjectId} onOpenExecution={openLifecycleExecution} onContinue={continueAsset} />; }
  if (view === "builder") { main = <SystemBuilderPanel projectId={activeProjectId} selected={selectedSystemAsset} onSelect={setSelectedSystemAsset} />; context = <SystemContext selected={selectedSystemAsset} onOpenAsset={openAssetRecord} />; }

  return <><SinoFounderShell active={normalizeFounderView(view)} onNavigate={(next) => { if (next === "home") { persistWorkspace("home", null); newConversation(); } else { const normalized = normalizeFounderView(next); if (normalized === "execution") { setExecutionId(null); remember(EXECUTION_KEY, null); } persistWorkspace(normalized, selectedWorkspaceObject?.object_id || null); setView(normalized); } }} sidebarProps={{ conversations, activeConversationId: conversationId, onNewConversation: newConversation, onSelectConversation: selectConversation, onDeleteConversation: setDeleteTarget, projects, activeProjectId, onSelectProject: openProject }} main={<>{error && <div className="sino-error" role="alert"><span>{error}</span>{replyPending && <button type="button" onClick={retryReply} disabled={busy}>重试 Sino 回复</button>}</div>}{main}</>} context={context} />{deleteTarget && <div className="sino-delete-confirm-backdrop" role="presentation"><div className="sino-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title"><h2 id="delete-conversation-title">删除这个会话？</h2><p>删除后聊天记录将从历史会话中移除。已经形成的正式 Object 不会被删除。</p><footer><button type="button" onClick={() => setDeleteTarget(null)} disabled={busy}>取消</button><button type="button" onClick={confirmDeleteConversation} disabled={busy}>删除</button></footer></div></div>}</>;
}

function ContextSummary({ title, children }) {
  return <div className="sino-context-summary"><article><span className="sino-kicker">{title}</span>{children}</article></div>;
}

function ExecutionResultSummary({ execution, onOpen }) {
  const completed = ["completed", "failed"].includes(execution?.status);
  const hasArtifact = Boolean(execution?.artifact || execution?.artifacts?.length || execution?.artifact_assets?.length);
  const hasMemory = Boolean(execution?.memory || execution?.memory_summary);
  const hasTechnical = Boolean(execution?.result || execution?.result_summary || execution?.commit || execution?.commit_sha || execution?.status === "completed");
  return <section className="sino-execution-result" aria-label="执行结果"><header><span className="sino-kicker">执行结果</span><h3>{completed ? execution.status === "completed" ? "已完成" : "失败" : "等待执行完成"}</h3></header>{completed && <><p>{execution?.result_summary || execution?.summary || execution?.failure_reason || "执行结果已记录。"}</p><dl><div><dt>成果</dt><dd>{hasArtifact ? "✓ 已回流到资产与记忆" : "未产生"}</dd>{hasArtifact && <button type="button" onClick={() => onOpen("artifacts")}>查看成果</button>}</div><div><dt>记忆</dt><dd>{hasMemory ? "✓ 已沉淀到长期记忆" : "未产生"}</dd>{hasMemory && <button type="button" onClick={() => onOpen("memories")}>查看记忆</button>}</div><div><dt>技术实现</dt><dd>{hasTechnical ? "✓ 已记录" : "未产生"}</dd>{hasTechnical && <button type="button" onClick={() => onOpen("evidence")}>查看技术实现</button>}</div></dl></>}</section>;
}
