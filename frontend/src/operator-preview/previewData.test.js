import { describe, expect, it } from "vitest";
import {
  businessMemoryCategories,
  demoAdvice,
  demoAiTeam,
  demoBusinessMemory,
  demoDeliverables,
  demoPendingItems,
  demoSalesTrend,
  demoSecretaryWork,
  demoShops,
  demoTodayMetricsPrimary,
  demoTodayMetricsSecondary,
  secretaryCannedReplies,
  secretaryQuickQuestions,
} from "./previewData";

function allDemo(list) {
  return list.every((item) => item.is_demo === true);
}

describe("previewData centralised demo dataset", () => {
  it("has exactly three demo shops", () => {
    expect(demoShops).toHaveLength(3);
    expect(allDemo(demoShops)).toBe(true);
  });

  it("has a 7-day sales trend", () => {
    expect(demoSalesTrend).toHaveLength(7);
    expect(allDemo(demoSalesTrend)).toBe(true);
  });

  it("has four AI advice cards", () => {
    expect(demoAdvice).toHaveLength(4);
    expect(allDemo(demoAdvice)).toBe(true);
  });

  it("has four pending-for-me items", () => {
    expect(demoPendingItems).toHaveLength(4);
    expect(allDemo(demoPendingItems)).toBe(true);
  });

  it("has eight secretary work records spanning all four statuses", () => {
    expect(demoSecretaryWork).toHaveLength(8);
    expect(allDemo(demoSecretaryWork)).toBe(true);
    const statuses = new Set(demoSecretaryWork.map((item) => item.status));
    expect(statuses).toEqual(new Set(["waiting", "in_progress", "completed", "error"]));
  });

  it("has three deliverables", () => {
    expect(demoDeliverables).toHaveLength(3);
    expect(allDemo(demoDeliverables)).toBe(true);
  });

  it("has eight business memory entries across the nine categories", () => {
    expect(demoBusinessMemory).toHaveLength(8);
    expect(allDemo(demoBusinessMemory)).toBe(true);
    expect(businessMemoryCategories).toHaveLength(9);
  });

  it("has an AI team roster and system metric rows", () => {
    expect(demoAiTeam.length).toBeGreaterThan(0);
    expect(allDemo(demoAiTeam)).toBe(true);
    expect(demoTodayMetricsPrimary.length).toBeGreaterThan(0);
    expect(demoTodayMetricsSecondary.length).toBeGreaterThan(0);
    expect(allDemo(demoTodayMetricsPrimary)).toBe(true);
    expect(allDemo(demoTodayMetricsSecondary)).toBe(true);
  });

  it("no completed/waiting secretary work item uses a raw Task ID as its title", () => {
    const TASK_ID_PATTERN = /^TASK-[A-Z0-9]+$/;
    for (const item of demoSecretaryWork) {
      expect(TASK_ID_PATTERN.test(item.title)).toBe(false);
    }
  });

  it("secretary quick questions all have a canned reply", () => {
    expect(secretaryQuickQuestions).toHaveLength(6);
    for (const question of secretaryQuickQuestions) {
      expect(secretaryCannedReplies[question]).toBeTruthy();
    }
  });
});
