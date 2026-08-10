import { getTaskAssets } from "./taskAssetApi";
import { getTasks as getLegacyTasks } from "./api";

/**
 * Canonical TaskCenter read boundary. The response shape remains compatible
 * with the existing TaskCenter list state and child components.
 */
export async function getTasks(options = {}) {
  const { status, limit = 50, offset = 0 } = options;
  try {
    const assets = await getTaskAssets();
    const source = Array.isArray(assets) ? assets : [];
    const filtered = status ? source.filter((task) => task.status === status) : source;
    const items = filtered.map((task) => ({
      ...task,
      task_type: task.title,
      assigned_agent: null,
      shop_name: null,
      created_at: task.created_at ?? null,
      completed_at: task.execution_status === "completed" ? task.updated_at : null,
    }));
    return {
      items,
      pagination: { limit, offset, returned: items.length, filtered_total: items.length },
    };
  } catch (error) {
    // Preserve runtime compatibility while the canonical read endpoint is
    // being rolled out. TaskCenter remains unaware of this fallback.
    return getLegacyTasks(options).catch(() => { throw error; });
  }
}
