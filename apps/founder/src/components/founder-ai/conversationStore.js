// Founder AI 对话记录的本地存储 —— 浏览器 localStorage 演示态存储，
// 与 packages/ui 的 sinoConversationStore（Studio/Growth/Operator/Cloud 全屏
// SinoWorkspace 专用）完全独立，互不依赖、互不影响。
// 真实实现应替换为 Memory / Conversation 服务的后端调用。

const STORAGE_KEY = "founder-ai-conversations";
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const now = Date.now();
  const seeded = [
    {
      id: "conv-seed-0001",
      title: "Growth Center 功能论证",
      mode: "functional-argumentation",
      messages: [{ id: "msg-seed-0001-1", role: "user", text: "Growth Center 功能论证", createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() }],
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      isArchived: false,
    },
    {
      id: "conv-seed-0002",
      title: "Operator 定价模型会议",
      mode: "model-meeting",
      messages: [{ id: "msg-seed-0002-1", role: "user", text: "Operator 定价模型会议", createdAt: new Date(now - 20 * 60 * 60 * 1000).toISOString() }],
      createdAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      isArchived: false,
    },
    {
      id: "conv-seed-0003",
      title: "Founder V2 页面重构",
      mode: "chat",
      messages: [
        { id: "msg-seed-0003-1", role: "user", text: "Founder V2 页面重构", createdAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() },
        { id: "msg-seed-0003-2", role: "sino", text: "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。", createdAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() },
      ],
      createdAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
      isArchived: false,
    },
    {
      id: "conv-seed-0004",
      title: "Studio 无限画布设计",
      mode: "chat",
      messages: [
        { id: "msg-seed-0004-1", role: "user", text: "Studio 无限画布设计", createdAt: new Date(now - 4 * DAY_MS).toISOString() },
        { id: "msg-seed-0004-2", role: "sino", text: "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。", createdAt: new Date(now - 4 * DAY_MS).toISOString() },
      ],
      createdAt: new Date(now - 4 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 4 * DAY_MS).toISOString(),
      isArchived: false,
    },
    {
      id: "conv-seed-0005",
      title: "AI Commerce OS 商业模式",
      mode: "chat",
      messages: [
        { id: "msg-seed-0005-1", role: "user", text: "AI Commerce OS 商业模式", createdAt: new Date(now - 6 * DAY_MS).toISOString() },
        { id: "msg-seed-0005-2", role: "sino", text: "已记录（演示状态 · SinoFUT Core 尚未接入真实意图理解）。", createdAt: new Date(now - 6 * DAY_MS).toISOString() },
      ],
      createdAt: new Date(now - 6 * DAY_MS).toISOString(),
      updatedAt: new Date(now - 6 * DAY_MS).toISOString(),
      isArchived: false,
    },
  ];
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

export function listConversations() {
  return seedIfEmpty()
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getConversation(id) {
  return loadAll()?.find((c) => c.id === id) || null;
}

export function createConversation({ mode = "chat", title = "新对话" } = {}) {
  const conversations = seedIfEmpty();
  const now = new Date().toISOString();
  const conversation = { id: nextConversationId(), title, mode, messages: [], createdAt: now, updatedAt: now, isArchived: false };
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

export function setConversationMode(id, mode) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.mode = mode;
  conversation.updatedAt = new Date().toISOString();
  saveAll(conversations);
  return conversation;
}

export function appendConversationMessage(id, message) {
  const conversations = seedIfEmpty();
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.messages.push({ id: nextMessageId(), createdAt: new Date().toISOString(), ...message });
  conversation.updatedAt = new Date().toISOString();
  if (conversation.title === "新对话" && message.role === "user") {
    conversation.title = message.text.slice(0, 24);
  }
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
