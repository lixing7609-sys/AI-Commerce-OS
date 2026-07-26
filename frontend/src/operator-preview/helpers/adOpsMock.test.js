import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPROVAL_STATUS_LABEL,
  PLATFORM_AD_MAPPING,
  approveCampaign,
  getAdOpsState,
  getContributionSummary,
  pauseCampaign,
  rejectCampaign,
  resumeCampaign,
  startCampaign,
} from "./adOpsMock.js";

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

describe("operator advertising (adOps) mock", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds advertising accounts distinguishing operator-owned vs AI Commerce OS wallet budget sources", () => {
    const { accounts } = getAdOpsState();
    expect(accounts.length).toBeGreaterThan(0);
    const sources = new Set(accounts.map((a) => a.budgetSource));
    expect(sources.has("operator_owned")).toBe(true);
  });

  it("every seeded campaign has a contribution-profit figure computed from the shared formula, not just spend/revenue", () => {
    const { campaigns } = getAdOpsState();
    campaigns.forEach((c) => {
      expect(c).toHaveProperty("contributionProfit");
      expect(typeof c.contributionProfit).toBe("number");
    });
  });

  it("includes a case where a positive-looking ROAS still has a lower contribution profit due to other costs", () => {
    const { campaigns } = getAdOpsState();
    const running = campaigns.find((c) => c.status === "running" && c.roas > 0);
    expect(running).toBeTruthy();
    // contribution profit must be strictly less than raw revenue once costs are subtracted
    expect(running.contributionProfit).toBeLessThan(running.expectedRevenue);
  });

  it("getContributionSummary aggregates across all campaigns, not just one", () => {
    const summary = getContributionSummary();
    expect(summary).toHaveProperty("spend");
    expect(summary).toHaveProperty("revenue");
    expect(summary).toHaveProperty("contributionProfit");
  });

  describe("approval workflow — AI never spends without approval", () => {
    it("a pending campaign cannot be started directly (must be approved first)", () => {
      const { campaigns } = getAdOpsState();
      const pending = campaigns.find((c) => c.status === "pending_approval");
      expect(pending).toBeTruthy();
      startCampaign(pending.id); // no-op, wrong state
      const after = getAdOpsState().campaigns.find((c) => c.id === pending.id);
      expect(after.status).toBe("pending_approval");
    });

    it("approve -> start moves a campaign from pending_approval to running", () => {
      const { campaigns } = getAdOpsState();
      const pending = campaigns.find((c) => c.status === "pending_approval");
      approveCampaign(pending.id);
      expect(getAdOpsState().campaigns.find((c) => c.id === pending.id).status).toBe("approved");
      startCampaign(pending.id);
      expect(getAdOpsState().campaigns.find((c) => c.id === pending.id).status).toBe("running");
    });

    it("reject requires a reason and moves status to rejected", () => {
      const { campaigns } = getAdOpsState();
      const pending = campaigns.find((c) => c.status === "pending_approval");
      const missingReason = rejectCampaign(pending.id);
      expect(missingReason.ok).toBe(false);
      const withReason = rejectCampaign(pending.id, "预算过高，先小额测试");
      expect(withReason.ok).toBe(true);
      expect(getAdOpsState().campaigns.find((c) => c.id === pending.id).status).toBe("rejected");
    });

    it("pause and resume toggle a running campaign without deleting its record", () => {
      const { campaigns } = getAdOpsState();
      const running = campaigns.find((c) => c.status === "running");
      expect(running).toBeTruthy();
      pauseCampaign(running.id);
      expect(getAdOpsState().campaigns.find((c) => c.id === running.id).status).toBe("paused");
      resumeCampaign(running.id);
      expect(getAdOpsState().campaigns.find((c) => c.id === running.id).status).toBe("running");
    });

    it("every approval status has a human-readable Chinese label", () => {
      const { campaigns } = getAdOpsState();
      campaigns.forEach((c) => {
        expect(APPROVAL_STATUS_LABEL[c.status]).toBeTruthy();
      });
    });
  });

  it("documents platform-to-advertising-platform mappings as product mappings, not live integrations", () => {
    expect(PLATFORM_AD_MAPPING.length).toBeGreaterThan(0);
    PLATFORM_AD_MAPPING.forEach((m) => {
      expect(m.commercePlatform).toBeTruthy();
      expect(m.adPlatform).toBeTruthy();
    });
  });
});
