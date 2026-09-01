import { getTaskAsset, getTaskAssets } from "./taskAssetApi";
import { getTasks as getLegacyTasks } from "./api";

const TASK_CENTER_STATUSES = ["pending", "running", "completed", "failed"];

function taskCenterStatus(task = {}) {
  const executionStatus = task.execution_status;
  if (executionStatus === "completed") return "completed";
  if (executionStatus === "failed") return "failed";
  if (executionStatus === "running" || executionStatus === "in_progress") return "running";
  if (task.status === "completed") return "completed";
  if (task.status === "failed") return "failed";
  if (task.status === "running" || task.status === "in_progress") return "running";
  return "pending";
}

function normalizeTaskAsset(task = {}) {
  const status = taskCenterStatus(task);
  return {
    ...task,
    task_id: task.id ?? task.task_id ?? "",
    title: task.title ?? task.task_type ?? "",
    task_type: task.title ?? task.task_type ?? "",
    task_asset_status: task.status ?? null,
    status,
    approval_status: task.approval_status ?? null,
    execution_status: task.execution_status ?? null,
    conversation_id: task.conversation_id ?? null,
    decision_id: task.decision_id ?? null,
    assigned_agent: task.assigned_agent ?? null,
    shop_name: task.shop_name ?? null,
    priority: task.priority ?? "normal",
    created_at: task.created_at ?? null,
    started_at: task.started_at ?? null,
    updated_at: task.updated_at ?? null,
    completed_at: task.completed_at ?? (status === "completed" ? task.updated_at ?? null : null),
    result: task.result ?? null,
    error: task.error ?? null,
    children: Array.isArray(task.children) ? task.children : [],
    parent_summary: task.parent_summary ?? null,
    child_task_count: task.child_task_count ?? 0,
    created_by_agent: task.created_by_agent ?? null,
  };
}

function buildStats(items = []) {
  const stats = { total: items.length, pending: 0, running: 0, completed: 0, failed: 0 };
  for (const item of items) {
    const status = TASK_CENTER_STATUSES.includes(item.status) ? item.status : "pending";
    stats[status] += 1;
  }
  return stats;
}

async function readCanonicalTaskAssets() {
  const assets = await getTaskAssets();
  return Array.isArray(assets) ? assets.map(normalizeTaskAsset) : [];
}

/**
 * Canonical TaskCenter read boundary. The response shape remains compatible
 * with the existing TaskCenter list state and child components.
 */
export async function getTaskList(options = {}) {
  const { status, limit = 50, offset = 0 } = options;
  try {
    const source = await readCanonicalTaskAssets();
    const filtered = status ? source.filter((task) => task.status === status) : source;
    const items = filtered.slice(offset, offset + limit);
    return {
      items,
      stats: buildStats(source),
      pagination: { limit, offset, returned: items.length, filtered_total: filtered.length },
      source: "task_asset",
    };
  } catch (error) {
    // Preserve runtime compatibility while the canonical read endpoint is
    // being rolled out. TaskCenter remains unaware of this fallback.
    return getLegacyTasks(options).catch(() => { throw error; });
  }
}

export async function getTasks(options = {}) {
  return getTaskList(options);
}

export async function getTaskDetail(taskId) {
  const task = await getTaskAsset(taskId);
  return normalizeTaskAsset(task);
}

export async function getTaskStats() {
  const items = await readCanonicalTaskAssets();
  return buildStats(items);
}

export const __taskReadServiceInternals = {
  buildStats,
  normalizeTaskAsset,
  taskCenterStatus,
};
