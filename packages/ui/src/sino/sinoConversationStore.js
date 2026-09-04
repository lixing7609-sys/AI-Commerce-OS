// Local conversation history for SinoFUT's full-screen entry — V2-002 §3.2/3.3.
// Persisted per persona (Founder/Operator/Studio/Cloud) in localStorage. This is a
// browser-local stand-in for the real Memory service described in
// docs/2608-v2/02-domain-model.md §4 — every read/write below is a placeholder for
// a future Memory API call, not a claim of durable server-side storage.

function storageKey(personaId) {
  return `sinofut-conversations:${personaId}`;
}

function loadAll(personaId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(personaId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(personaId, conversations) {
  window.localStorage.setItem(storageKey(personaId), JSON.stringify(conversations));
}

export function listConversations(personaId) {
  return loadAll(personaId).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

export function getConversation(personaId, id) {
  return loadAll(personaId).find((c) => c.id === id) || null;
}

export function createConversation(personaId, title = "新对话") {
  const conversations = loadAll(personaId);
  const now = new Date().toISOString();
  const conversation = {
    id: `conv-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    title,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conversations.push(conversation);
  saveAll(personaId, conversations);
  return conversation;
}

export function renameConversation(personaId, id, title) {
  const conversations = loadAll(personaId);
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.title = title;
  conversation.updatedAt = new Date().toISOString();
  saveAll(personaId, conversations);
  return conversation;
}

export function deleteConversation(personaId, id) {
  const conversations = loadAll(personaId).filter((c) => c.id !== id);
  saveAll(personaId, conversations);
}

export function togglePin(personaId, id) {
  const conversations = loadAll(personaId);
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.pinned = !conversation.pinned;
  saveAll(personaId, conversations);
  return conversation;
}

export function appendMessage(personaId, id, message) {
  const conversations = loadAll(personaId);
  const conversation = conversations.find((c) => c.id === id);
  if (!conversation) return null;
  conversation.messages.push({
    id: `msg-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    ...message,
  });
  conversation.updatedAt = new Date().toISOString();
  if (conversation.title === "新对话" && message.role === "user") {
    conversation.title = message.text.slice(0, 24);
  }
  saveAll(personaId, conversations);
  return conversation;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function groupConversationsByRecency(conversations) {
  const now = Date.now();
  const groups = { pinned: [], today: [], yesterday: [], last7: [], last30: [], earlier: [] };
  for (const conversation of conversations) {
    if (conversation.pinned) {
      groups.pinned.push(conversation);
      continue;
    }
    const ageMs = now - new Date(conversation.updatedAt).getTime();
    if (ageMs < DAY_MS) groups.today.push(conversation);
    else if (ageMs < 2 * DAY_MS) groups.yesterday.push(conversation);
    else if (ageMs < 7 * DAY_MS) groups.last7.push(conversation);
    else if (ageMs < 30 * DAY_MS) groups.last30.push(conversation);
    else groups.earlier.push(conversation);
  }
  return groups;
}

export const CONVERSATION_GROUP_LABELS = {
  pinned: "固定",
  today: "今天",
  yesterday: "昨天",
  last7: "最近7天",
  last30: "最近30天",
  earlier: "更早",
};
