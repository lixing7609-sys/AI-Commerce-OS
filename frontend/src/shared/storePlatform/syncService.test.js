import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function fakeAdapter({ failResource } = {}) {
  return {
    async listProducts(storeId, opts) {
      if (failResource === "products") throw new Error("平台商品接口超时");
      return opts.cursor ? { items: [{ productId: "p2" }], nextCursor: null } : { items: [{ productId: "p1" }], nextCursor: "1" };
    },
    async listOrders() {
      if (failResource === "orders") throw new Error("平台订单接口 429");
      return { items: [{ orderId: "o1" }], nextCursor: null };
    },
    async listCustomers() {
      return { items: [{ customerId: "c1" }], nextCursor: null };
    },
  };
}

describe("syncService.runSync", () => {
  let runSync;
  let listSyncJobs;

  beforeEach(async () => {
    globalThis.window = { localStorage: createMemoryLocalStorage(), setTimeout, clearTimeout };
    vi.resetModules();
    ({ runSync } = await import("./syncService.js"));
    ({ listSyncJobs } = await import("./storeConnectionRepository.js"));
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("follows pagination across multiple pages and sums recordsProcessed", async () => {
    const job = await runSync("store-1", fakeAdapter());
    expect(job.status).toBe("succeeded");
    expect(job.recordsProcessed).toBe(4); // products: p1+p2, orders: o1, customers: c1
    expect(job.recordsFailed).toBe(0);
  });

  it("one resource failing does not stop the other resources from syncing (partially_failed)", async () => {
    const job = await runSync("store-2", fakeAdapter({ failResource: "orders" }));
    expect(job.status).toBe("partially_failed");
    expect(job.errors).toHaveLength(1);
    expect(job.errors[0].resource).toBe("orders");
    expect(job.recordsProcessed).toBeGreaterThan(0); // products/customers still counted
  });

  it("every resource failing marks the whole job failed", async () => {
    const allFail = {
      async listProducts() {
        throw new Error("down");
      },
      async listOrders() {
        throw new Error("down");
      },
      async listCustomers() {
        throw new Error("down");
      },
    };
    const job = await runSync("store-3", allFail);
    expect(job.status).toBe("failed");
    expect(job.recordsProcessed).toBe(0);
  });

  it("persists the job into storeConnectionRepository so it survives beyond the call", async () => {
    await runSync("store-4", fakeAdapter());
    const jobs = listSyncJobs("store-4");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].storeId).toBe("store-4");
  });

  it("respects an explicit resources subset instead of always syncing all three", async () => {
    const job = await runSync("store-5", fakeAdapter(), { resources: ["orders"] });
    expect(job.resources).toEqual(["orders"]);
    expect(job.recordsProcessed).toBe(1);
  });
});
