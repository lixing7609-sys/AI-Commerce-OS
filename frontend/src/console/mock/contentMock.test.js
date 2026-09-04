import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OPERATING_LOOP_PROJECT_ID,
  decideContentApproval,
  enterPublishing,
  generateContentPackage,
  generateReview,
  getContentProject,
  getOperatingLoopSummary,
  simulatePublish,
  submitForApproval,
} from "./contentMock.js";
import { getApprovalRequests } from "./approvalMock.js";
import { getOrders } from "./orderMock.js";
import { getDailyCsState } from "./dailyCustomerServiceMock.js";
import { getKnowledgeState } from "./knowledgeMock.js";

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  };
}

/**
 * 走完 生成→提交审批→批准→进入发布→模拟发布 这一段共同前置流程，
 * 返回中间结果供各测试用例断言，避免每个用例都重复这五步。
 */
async function runToPublished() {
  generateContentPackage(OPERATING_LOOP_PROJECT_ID);
  const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
  const approved = decideContentApproval(submitted.approvalRequest.id, "approved");
  enterPublishing(OPERATING_LOOP_PROJECT_ID);
  const published = await simulatePublish(OPERATING_LOOP_PROJECT_ID);
  return { submitted, approved, published };
}

describe("contentMock operating loop orchestration", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("golden path", () => {
    it("starts in Draft with no content versions", () => {
      const project = getContentProject(OPERATING_LOOP_PROJECT_ID);
      expect(project.loopState).toBe("Draft");
      expect(project.contentVersions).toHaveLength(0);
    });

    it("generateContentPackage produces a realistic, non-placeholder version and moves to Generated", () => {
      const result = generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Generated");
      expect(result.version.version).toBe(1);
      expect(result.version.headline.toLowerCase()).not.toContain("lorem");
      expect(result.version.originalityScore).toBeGreaterThan(0);
      expect(result.version.copyrightResult).toBe("通过");
      expect(result.version.complianceResult).toBe("通过");
    });

    it("submitForApproval creates a pending content_approval request bound to the project", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const result = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      expect(result.ok).toBe(true);
      expect(result.approvalRequest.type).toBe("content_approval");
      expect(result.approvalRequest.status).toBe("pending");
      expect(result.approvalRequest.contentProjectId).toBe(OPERATING_LOOP_PROJECT_ID);
      expect(result.project.loopState).toBe("Pending Approval");
    });

    it("decideContentApproval(approved) moves the project to Approved", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      const result = decideContentApproval(submitted.approvalRequest.id, "approved");
      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Approved");
      expect(result.approvalRequest.status).toBe("approved");
    });

    it("enterPublishing requires an Approved project", () => {
      const result = enterPublishing(OPERATING_LOOP_PROJECT_ID);
      expect(result.ok).toBe(false);
    });

    it("simulatePublish end-to-end creates traffic attribution, an order and a conversation", async () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      decideContentApproval(submitted.approvalRequest.id, "approved");
      enterPublishing(OPERATING_LOOP_PROJECT_ID);
      const result = await simulatePublish(OPERATING_LOOP_PROJECT_ID);

      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Published");
      expect(result.project.orderId).toBeTruthy();
      expect(result.project.conversationId).toBeTruthy();
      expect(result.order.attribution.contentProjectId).toBe(OPERATING_LOOP_PROJECT_ID);
      expect(result.conversation.orderNumber).toBe(result.order.orderNumber);

      const orders = getOrders();
      expect(orders.filter((o) => o.id === result.order.id)).toHaveLength(1);
      const cs = getDailyCsState();
      expect(cs.conversations.filter((c) => c.id === result.conversation.id)).toHaveLength(1);
    });

    it("generateReview requires publish, order attribution and a conversation to already exist", async () => {
      await runToPublished();
      const result = generateReview(OPERATING_LOOP_PROJECT_ID);
      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Reviewed");
      expect(result.review.attributedGmv).toBeGreaterThan(0);
    });

    it("generateReview creates knowledge candidates, not published knowledge", async () => {
      await runToPublished();
      generateReview(OPERATING_LOOP_PROJECT_ID);
      const candidates = getKnowledgeState().assets.filter((a) => a.sourceProjectId === OPERATING_LOOP_PROJECT_ID);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((c) => c.status === "candidate")).toBe(true);
    });
  });

  describe("rejection and revision paths", () => {
    it("decideContentApproval(rejected) requires a reason", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      const result = decideContentApproval(submitted.approvalRequest.id, "rejected");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/理由/);
    });

    it("decideContentApproval(rejected, reason) moves the project to Revision Requested and preserves the version", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      const result = decideContentApproval(submitted.approvalRequest.id, "rejected", "封面不符合品牌调性");
      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Revision Requested");
      expect(result.project.rejectionReason).toBe("封面不符合品牌调性");
      expect(result.project.contentVersions).toHaveLength(1);
    });

    it("decideContentApproval(returned, note) requires a revision note and does not create a duplicate project", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      const missingNote = decideContentApproval(submitted.approvalRequest.id, "returned");
      expect(missingNote.ok).toBe(false);

      const result = decideContentApproval(submitted.approvalRequest.id, "returned", "请补充卖点细节");
      expect(result.ok).toBe(true);
      expect(result.project.loopState).toBe("Revision Requested");
      expect(result.project.revisionNote).toBe("请补充卖点细节");
      expect(result.project.id).toBe(OPERATING_LOOP_PROJECT_ID);
    });

    it("after revision, generateContentPackage can be run again and appends a new version", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      decideContentApproval(submitted.approvalRequest.id, "rejected", "需要修改");
      const regenerated = generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      expect(regenerated.ok).toBe(true);
      expect(regenerated.version.version).toBe(2);
      expect(regenerated.project.contentVersions).toHaveLength(2);
    });
  });

  describe("idempotency protections", () => {
    it("submitForApproval cannot be called twice from the same state", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      submitForApproval(OPERATING_LOOP_PROJECT_ID);
      const second = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      expect(second.ok).toBe(false);
      expect(getApprovalRequests().filter((r) => r.contentProjectId === OPERATING_LOOP_PROJECT_ID)).toHaveLength(1);
    });

    it("decideContentApproval cannot re-decide an already-approved request", () => {
      generateContentPackage(OPERATING_LOOP_PROJECT_ID);
      const submitted = submitForApproval(OPERATING_LOOP_PROJECT_ID);
      decideContentApproval(submitted.approvalRequest.id, "approved");
      const second = decideContentApproval(submitted.approvalRequest.id, "approved");
      expect(second.ok).toBe(false);
      expect(second.alreadyProcessed).toBe(true);
    });

    it("simulatePublish cannot be run twice — no duplicate publish job, order or conversation", async () => {
      const { published: first } = await runToPublished();
      const second = await simulatePublish(OPERATING_LOOP_PROJECT_ID);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      expect(second.alreadyExists).toBe(true);

      const orders = getOrders().filter((o) => o.attribution?.contentProjectId === OPERATING_LOOP_PROJECT_ID);
      expect(orders).toHaveLength(1);
      const conversations = getDailyCsState().conversations.filter((c) => c.contentProjectId === OPERATING_LOOP_PROJECT_ID);
      expect(conversations).toHaveLength(1);
    });

    it("generateReview cannot be run twice — returns the existing snapshot instead of creating a second one", async () => {
      await runToPublished();
      const first = generateReview(OPERATING_LOOP_PROJECT_ID);
      const second = generateReview(OPERATING_LOOP_PROJECT_ID);

      expect(first.alreadyExists).toBe(false);
      expect(second.alreadyExists).toBe(true);
      expect(second.review.id).toBe(first.review.id);

      const candidates = getKnowledgeState().assets.filter((a) => a.sourceProjectId === OPERATING_LOOP_PROJECT_ID);
      // 三种候选类型各只出现一次，第二次调用不会重复追加
      const byType = new Map();
      candidates.forEach((c) => byType.set(c.candidateType, (byType.get(c.candidateType) ?? 0) + 1));
      expect([...byType.values()].every((count) => count === 1)).toBe(true);
    });
  });

  describe("cross-entity relationships", () => {
    it("every generated record in the chain shares the same store and product", async () => {
      const { published } = await runToPublished();
      const project = published.project;
      expect(published.order.storeId).toBe(project.storeId);
      expect(published.conversation.storeId).toBe(project.storeId);
      expect(published.order.sku).toBe("SKU-LED-005");
    });

    it("getOperatingLoopSummary reflects real counts, not placeholders", async () => {
      const before = getOperatingLoopSummary();
      expect(before.attributedOrders).toBe(0);

      await runToPublished();
      const after = getOperatingLoopSummary();
      expect(after.attributedOrders).toBe(1);
      expect(after.publishedToday).toBe(1);
      expect(after.attributedGmv).toBeGreaterThan(0);
    });
  });
});
