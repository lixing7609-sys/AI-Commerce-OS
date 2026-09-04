import { getMemories, getMemory } from "./memoryApi";
import { getLibraryMemory } from "./founderAiApi";

function parseJsonObject(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTags(value) {
  return Array.isArray(value) ? value : [];
}

function sourceOf(memory = {}, content = {}, enrichment = {}) {
  if (memory.source) return memory.source;
  if (content.source) return content.source;
  if (memory.task_asset_id || memory.task_id || enrichment.task_asset_id) return "task_asset";
  if (memory.artifact_id || enrichment.artifact_id) return "artifact";
  if (memory.decision_id || enrichment.decision_id) return "decision";
  if (memory.conversation_id || enrichment.conversation_id) return "conversation";
  return "memory_asset";
}

function projectionClassOf(memory = {}, content = {}) {
  if (memory.projection_class) return memory.projection_class;
  if (memory.memory_type === "knowledge") return "DURABLE_MEMORY";
  if (memory.memory_type === "decision" || memory.decision_id) return "DURABLE_MEMORY";
  if (memory.memory_type === "terminology" || memory.memory_type === "key_term") return "DURABLE_MEMORY";
  if (content.projected_context === true) return "PROJECTED_CONTEXT";
  if (content.knowledge_source === true) return "KNOWLEDGE_SOURCE";
  if (content.runtime_context === true) return "RUNTIME_CONTEXT";
  return "DURABLE_MEMORY";
}

function termsOf(memory = {}, content = {}) {
  if (Array.isArray(memory.terms)) return memory.terms;
  if (Array.isArray(content.terms)) return content.terms;
  if (Array.isArray(content.key_terms)) return content.key_terms;
  return normalizeTags(memory.tags).filter((tag) => String(tag).startsWith("term:")).map((tag) => String(tag).slice(5));
}

export function normalizeMemory(memory = {}, enrichment = {}) {
  const content = parseJsonObject(memory.content);
  const enrichedReferences = Array.isArray(enrichment.references) ? enrichment.references : [];
  const enrichedHistory = Array.isArray(enrichment.history) ? enrichment.history : [];
  const taskId = memory.task_asset_id || memory.task_id || enrichment.task_asset_id || null;
  const executionId = memory.execution_id || content.execution_id || enrichment.execution_id || null;
  const memoryId = memory.id || memory.memory_id || "";

  return {
    ...enrichment,
    ...memory,
    id: memoryId,
    memory_id: memoryId,
    memory_type: memory.memory_type || "memory",
    type: memory.memory_type || "memory",
    title: memory.title || "",
    content: memory.content || "",
    content_data: content,
    summary: memory.summary || "",
    status: memory.status || "active",
    source: sourceOf(memory, content, enrichment),
    provenance: {
      canonical_source: "memory_asset",
      compatibility_source: enrichment.memory_id ? "library_memory" : null,
      source_message_ids: memory.source_message_ids || [],
      references: enrichedReferences,
    },
    projection_class: projectionClassOf(memory, content),
    conversation_id: memory.conversation_id || enrichment.conversation_id || null,
    decision_id: memory.decision_id || enrichment.decision_id || null,
    task_id: taskId,
    task_asset_id: taskId,
    execution_id: executionId,
    artifact_id: memory.artifact_id || enrichment.artifact_id || null,
    created_at: memory.created_at || enrichment.created_at || null,
    updated_at: memory.updated_at || enrichment.updated_at || memory.created_at || null,
    confidence: memory.confidence ?? null,
    tags: normalizeTags(memory.tags),
    terms: termsOf(memory, content),
    metadata: {
      canonical_source: "memory_asset",
      compatibility_source: enrichment.memory_id ? "library_memory" : null,
      content,
    },
    references: enrichedReferences,
    history: enrichedHistory,
    revision_number: enrichment.revision_number || memory.revision_number || 1,
    importance: enrichment.importance ?? memory.importance ?? null,
    parent_memory_id: enrichment.parent_memory_id || memory.parent_memory_id || null,
    previous_revision_id: enrichment.previous_revision_id || memory.previous_revision_id || null,
    revision_reason: enrichment.revision_reason || memory.revision_reason || null,
    merged_into_memory_id: enrichment.merged_into_memory_id || memory.merged_into_memory_id || null,
  };
}

export async function getMemoryList() {
  const memories = await getMemories();
  const items = Array.isArray(memories) ? memories.map((item) => normalizeMemory(item)) : [];
  return { items, total: items.length, source: "memory_asset" };
}

export async function getMemoryDetail(memoryId, { includeLibrary = true } = {}) {
  const canonical = await getMemory(memoryId);
  let enrichment = {};
  if (includeLibrary) {
    try {
      enrichment = await getLibraryMemory(memoryId);
    } catch {
      enrichment = {};
    }
  }
  return normalizeMemory(canonical, enrichment);
}

export function getMemoryDisplayModel(memory, enrichment) {
  return normalizeMemory(memory, enrichment);
}

export function classifyMemoryProjection(item = {}) {
  return normalizeMemory(item).projection_class;
}

export const __memoryReadServiceInternals = {
  normalizeMemory,
  parseJsonObject,
  projectionClassOf,
  sourceOf,
};
