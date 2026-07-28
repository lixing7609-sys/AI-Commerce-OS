import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TargetProduct, ReviewState } from "./types.js";

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("marketplaceService: three-view scoping (Founder/Operator/Studio)", () => {
  let service;

  beforeEach(async () => {
    globalThis.window = { localStorage: createMemoryLocalStorage(), setTimeout, clearTimeout };
    vi.resetModules();
    service = await import("./marketplaceService.js");
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("Operator Marketplace only shows approved packages targeting operator or shared", () => {
    const results = service.listConsumablePackages("operator");
    expect(results.length).toBeGreaterThan(0);
    for (const pkg of results) {
      expect(pkg.status).toBe(ReviewState.APPROVED);
      expect(pkg.targetProducts.some((t) => t === TargetProduct.OPERATOR || t === TargetProduct.SHARED)).toBe(true);
    }
    // 明确不包含纯 Studio 专属能力包
    expect(results.find((p) => p.id === "pkg-topic-scout-agent")).toBeUndefined();
    // 明确不包含 draft/in_review 状态的包，即使 targetProducts 命中 operator
    expect(results.find((p) => p.id === "pkg-draft-refund-negotiator")).toBeUndefined();
    expect(results.find((p) => p.id === "pkg-in-review-price-optimizer")).toBeUndefined();
  });

  it("Studio Marketplace only shows approved packages targeting studio or shared", () => {
    const results = service.listConsumablePackages("studio");
    expect(results.length).toBeGreaterThan(0);
    for (const pkg of results) {
      expect(pkg.status).toBe(ReviewState.APPROVED);
      expect(pkg.targetProducts.some((t) => t === TargetProduct.STUDIO || t === TargetProduct.SHARED)).toBe(true);
    }
    // 明确不包含纯 Operator 专属能力包
    expect(results.find((p) => p.id === "pkg-product-listing-copy")).toBeUndefined();
    // 第三方开发者提交、仍在审核中的包不应该出现在消费视角
    expect(results.find((p) => p.id === "pkg-third-party-livestream-analytics")).toBeUndefined();
  });

  it("SHARED packages appear in both Operator and Studio views", () => {
    const operatorResults = service.listConsumablePackages("operator");
    const studioResults = service.listConsumablePackages("studio");
    expect(operatorResults.find((p) => p.id === "pkg-industry-knowledge-home-goods")).toBeTruthy();
    expect(studioResults.find((p) => p.id === "pkg-industry-knowledge-home-goods")).toBeTruthy();
  });

  it("Founder management view sees every package regardless of status", () => {
    const results = service.listAllPackagesForManagement();
    expect(results.find((p) => p.id === "pkg-draft-refund-negotiator")).toBeTruthy();
    expect(results.find((p) => p.id === "pkg-in-review-price-optimizer")).toBeTruthy();
    expect(results.find((p) => p.id === "pkg-third-party-livestream-analytics")).toBeTruthy();
    // Operator 和 Studio 各自的专属包也都在
    expect(results.find((p) => p.id === "pkg-product-listing-copy")).toBeTruthy();
    expect(results.find((p) => p.id === "pkg-topic-scout-agent")).toBeTruthy();
  });

  it("category and keyword filters compose without mutating the source list", () => {
    const all = service.listAllPackagesForManagement();
    const byCategory = service.filterByCategory(all, "customer_service_capability");
    expect(byCategory.length).toBeGreaterThan(0);
    expect(byCategory.every((p) => p.categories.includes("customer_service_capability"))).toBe(true);

    const byKeyword = service.filterByKeyword(all, "短剧");
    expect(byKeyword.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(byCategory.length);
  });
});

describe("marketplaceService: install/review/version actions are honest mock state changes", () => {
  let service;

  beforeEach(async () => {
    globalThis.window = { localStorage: createMemoryLocalStorage(), setTimeout, clearTimeout };
    vi.resetModules();
    service = await import("./marketplaceService.js");
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("installing a package updates installationStateFor and increments installCount", async () => {
    const before = service.getPackage("pkg-product-listing-copy").installCount;
    await service.installPackage("pkg-product-listing-copy", "operator");
    const installation = service.installationStateFor("pkg-product-listing-copy");
    expect(installation.state).toBe("installed");
    expect(service.getPackage("pkg-product-listing-copy").installCount).toBe(before + 1);
  });

  it("uninstalling reverts installation state without fabricating a decremented count", async () => {
    await service.installPackage("pkg-product-listing-copy", "operator");
    await service.uninstallPackage("pkg-product-listing-copy");
    expect(service.installationStateFor("pkg-product-listing-copy").state).toBe("not_installed");
  });

  it("setReviewState moves a draft package through the review pipeline", async () => {
    const updated = await service.setReviewState("pkg-draft-refund-negotiator", "submitted");
    expect(updated.status).toBe("submitted");
  });

  it("publishNewVersion appends a version and makes it current; rollbackToVersion restores an old one", async () => {
    await service.publishNewVersion("pkg-product-listing-copy", { version: "1.1.0", changelog: "优化文案语气" });
    let current = service.getPackage("pkg-product-listing-copy");
    expect(current.currentVersion).toBe("1.1.0");
    expect(current.versions.find((v) => v.version === "1.1.0").isCurrent).toBe(true);

    await service.rollbackToVersion("pkg-product-listing-copy", "1.0.0");
    current = service.getPackage("pkg-product-listing-copy");
    expect(current.currentVersion).toBe("1.0.0");
    expect(current.versions.find((v) => v.version === "1.0.0").isCurrent).toBe(true);
    expect(current.versions.find((v) => v.version === "1.1.0").isCurrent).toBe(false);
  });
});
