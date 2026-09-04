// Founder AI 对话记录的本地存储 —— 浏览器 localStorage 演示态存储，
// 与 packages/ui 的 sinoConversationStore（Studio/Growth/Operator/Cloud 全屏
// SinoWorkspace 专用）完全独立，互不依赖、互不影响。
// 真实实现应替换为 Memory / Conversation 服务的后端调用。
//
// 对话记录不再有"模式"概念 —— 用户只管自然说话，Sino 的状态机
// （packages/ui 的 sinoStateMachine.js，人格无关、可被 Studio/Growth/
// Operator 共用）自动判断 stage 并维护 topic/consensus/
// pendingConfirmations/rejected/constraints。新对话从 IDLE 开始，
// 在第一条消息发出前不进入任何讨论阶段。
import { SINO_STAGES } from "@sinofut/ui";

const STORAGE_KEY = "founder-ai-conversations-v2";
const DAY_MS = 24 * 60 * 60 * 1000;

export const STAGES = SINO_STAGES;

function loadAll() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAll(conversations) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function seedIfEmpty() {
  const existing = loadAll();
  if (existing !== null) return existing;
  const seeded = [];
  saveAll(seeded);
  return seeded;
}

let idSeq = 1;
function nextConversationId() {
  return `conv-${Date.now()}-${(idSeq++).toString().padStart(3, "0")}`;
}
function nextMessageId() {
  return `msg-${Date.now()}-${(idSeq++).toString().padStart(3, "0")}`;
}
function nextItemId(prefix) {
  return `${prefix}-${Date.now()}-${(idSeq++).toString().padStart(3, "0")}`;
}

export function listConversations() {
  return seedIfEmpty()
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getConversation(id) {
  return loadAll()?.find((c) => c.id === id) || null;
}

export function createConversation({ title = "新对话" } = {}) {
  const conversations = seedIfEmpty();
  const now = new Date().toISOString();
  const conversation = {
    id: nextConversationId(),
    title,
    topic: "",
    stage: STAGES.IDLE,
    consensus: [],
    pendingConfirmations: [],
    rejected: [],
    constraints: [],
    suggestion: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
    isArchived: false,
  };
  conversations.push(conversation);
  saveAll(conversations);
  return conversation;
}

export function renameConversation(id, title) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.title = title;
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

export function deleteConversation(id) {
  const conversations = seedIfEmpty().filter((c) => c.id !== id);
  saveAll(conversations);
}

export function toggleArchiveConversation(id) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.isArchived = !conversation.isArchived;
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

// 追加一条时间线条目。type: "user" | "sino" | "multi-model" | "decision-draft"
// | "task-package" | "execution" | "review" | "retrospective" | "knowledge"
// | "developer-mission-approval"
export function appendConversationMessage(id, message) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.messages.push({ id: nextMessageId(), createdAt: new Date().toISOString(), ...message });
  conversation.updatedAt = new Date().toISOString();
  if (conversation.title === "新对话" && message.type === "user") {
    conversation.title = message.text.slice(0, 24);
  }
  saveAll(conversations);
  return conversation;
}

// 就地更新时间线里某一条（用于执行中→完成、待验收→已验收等状态流转）。
export function updateConversationMessage(id, messageId, patch) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  const message = conversation.messages.find((m) => m.id === messageId);
  if (!message) return null;
  Object.assign(message, patch);
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

export function updateConversationState(id, patch) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  Object.assign(conversation, patch);
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

export function addSinoStateItems(id, field, texts) {
  if (!texts || texts.length === 0) return getConversation(id);
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  const items = texts.map((text) => ({ id: nextItemId(field.slice(0, 2)), text }));
  conversation[field] = [...(conversation[field] || []), ...items];
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

export function groupConversationsByRecency(conversations) {
  const now = Date.now();
  const groups = { today: [], yesterday: [], last7: [], earlier: [] };
  for (const conversation of conversations) {
    const ageMs = now - new Date(conversation.updatedAt).getTime();
    if (ageMs < DAY_MS) groups.today.push(conversation);
    else if (ageMs < 2 * DAY_MS) groups.yesterday.push(conversation);
    else if (ageMs < 7 * DAY_MS) groups.last7.push(conversation);
    else groups.earlier.push(conversation);
  }
  return groups;
}

export const CONVERSATION_GROUP_LABELS = {
  today: "今天",
  yesterday: "昨天",
  last7: "过去 7 天",
  earlier: "更早",
};
