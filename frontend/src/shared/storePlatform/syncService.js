import { recordSyncJob } from "./storeConnectionRepository.js";

/**
 * 同步编排层——把某个 StorePlatformAdapter 的分页读取方法跑成一个
 * SyncJob。设计要点（对应任务书 §7）：
 *   - 支持全量（不传游标）与增量（传入上次的游标）两种模式；
 *   - 幂等——同一个 cursor 重复跑不会产生重复副作用（这里只做读取
 *     计数，不做写入去重，真正落库时游标本身就是幂等键）；
 *   - 分页——遵循 adapter 返回的 `nextCursor`；
 *   - 单条记录失败不拖垮整批——`listXxx` 本身失败才记为该资源级别
 *     的 SyncError，不会因为一个资源出错就中断其它资源的同步；
 *   - 限流退避——`maxPages` 兜底，避免 mock/未来真实分页游标异常时
 *     无限循环。
 */

const RESOURCE_LISTERS = {
  products: (adapter, storeId, opts) => adapter.listProducts(storeId, opts),
  orders: (adapter, storeId, opts) => adapter.listOrders(storeId, opts),
  customers: (adapter, storeId, opts) => adapter.listCustomers(storeId, opts),
};

const MAX_PAGES_PER_RESOURCE = 20;

async function syncResource(adapter, storeId, resource, cursor) {
  const lister = RESOURCE_LISTERS[resource];
  let nextCursor = cursor ?? null;
  let recordsProcessed = 0;
  let pages = 0;
  const errors = [];

  do {
    try {
      const page = await lister(adapter, storeId, nextCursor ? { cursor: nextCursor } : {});
      recordsProcessed += page.items.length;
      nextCursor = page.nextCursor;
    } catch (err) {
      errors.push({
        errorId: `err-${resource}-${Date.now()}-${pages}`,
        resource,
        recordRef: nextCursor ?? "first-page",
        message: err instanceof Error ? err.message : String(err),
        retryCount: 0,
        occurredAt: new Date().toISOString(),
      });
      break;
    }
    pages += 1;
  } while (nextCursor && pages < MAX_PAGES_PER_RESOURCE);

  return {
    cursor: { resource, cursor: nextCursor, lastSyncedAt: new Date().toISOString() },
    recordsProcessed,
    errors,
  };
}

/**
 * @param {string} storeId
 * @param {import("./types.js").StorePlatformAdapter} adapter
 * @param {{syncType?: "full"|"incremental", resources?: string[], cursors?: Record<string,string|null>}} opts
 * @returns {Promise<import("./types.js").SyncJob>}
 */
export async function runSync(storeId, adapter, opts = {}) {
  const syncType = opts.syncType ?? "full";
  const resources = opts.resources ?? Object.keys(RESOURCE_LISTERS);
  const startedAt = new Date().toISOString();

  const results = await Promise.all(
    resources.map((resource) =>
      syncResource(adapter, storeId, resource, syncType === "incremental" ? opts.cursors?.[resource] ?? null : null)
    )
  );

  const recordsProcessed = results.reduce((sum, r) => sum + r.recordsProcessed, 0);
  const errors = results.flatMap((r) => r.errors);
  const cursors = results.map((r) => r.cursor);

  let status = "succeeded";
  if (errors.length > 0 && errors.length < resources.length) status = "partially_failed";
  if (errors.length >= resources.length && resources.length > 0) status = "failed";

  const job = {
    jobId: `sync-${storeId}-${Date.now()}`,
    storeId,
    syncType,
    resources,
    status,
    recordsProcessed,
    recordsFailed: errors.length,
    cursors,
    errors,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  recordSyncJob(storeId, job);
  return job;
}
