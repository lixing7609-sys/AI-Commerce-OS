import { describe, expect, it } from "vitest";
import {
  accessibilityStateMatches, controlStateMatches, countVisibleElements, effectiveVisibleControlCount,
  evaluateControlStateTransition, evaluateDerivedCount, evaluateDerivedStates, evaluateVisibleCardinality,
} from "../../scripts/founder-ui-verifier-core.mjs";

describe("generic visible-control cardinality", () => {
  const exactlyOne = { cardinality: "exactly_one", expected_visible_count: 1 };

  it("accepts one native-only clear mechanism", () => {
    const count = effectiveVisibleControlCount({ nativeVisible: true, applicationVisibleCount: 0 });
    expect(count).toBe(1);
    expect(evaluateVisibleCardinality(exactlyOne, count)).toEqual({ matches: true, duplicateAbsent: true });
  });

  it("accepts one application-only clear mechanism", () => {
    const count = effectiveVisibleControlCount({ nativeVisible: false, applicationVisibleCount: 1 });
    expect(count).toBe(1);
    expect(evaluateVisibleCardinality(exactlyOne, count)).toEqual({ matches: true, duplicateAbsent: true });
  });

  it("rejects native plus application duplicate controls", () => {
    const count = effectiveVisibleControlCount({ nativeVisible: true, applicationVisibleCount: 1 });
    expect(count).toBe(2);
    expect(evaluateVisibleCardinality(exactlyOne, count)).toEqual({ matches: false, duplicateAbsent: false });
  });
});

describe("generic derived visible count", () => {
  it("passes an integer display equal to the visible collection count", () => {
    expect(evaluateDerivedCount("2", 2)).toEqual({ supported: true, displayInteger: true, matches: true });
  });

  it("rejects mismatches and non-integer displays", () => {
    expect(evaluateDerivedCount("3", 2).matches).toBe(false);
    expect(evaluateDerivedCount("two", 2)).toEqual({ supported: true, displayInteger: false, matches: false });
  });

  it("counts only visible source elements and supports count aggregation only", () => {
    expect(countVisibleElements([{ visible: true }, { visible: false }, { visible: true }])).toBe(2);
    expect(evaluateDerivedCount("2", 2, "sum")).toEqual({ supported: false, displayInteger: false, matches: false });
  });

  it("requires baseline, filtered, and restored states to all pass", () => {
    expect(evaluateDerivedStates([
      { name: "baseline", passed: true }, { name: "filtered", passed: true }, { name: "restored", passed: true },
    ])).toEqual({ passed: true, failedStates: [] });
    expect(evaluateDerivedStates([
      { name: "baseline", passed: true }, { name: "filtered", passed: false }, { name: "restored", passed: true },
    ])).toEqual({ passed: false, failedStates: ["filtered"] });
  });
});

describe("generic application control state", () => {
  const classState = { type: "class", name: "is-active", active_value: true };
  const before = [
    { visible: true, classes: ["is-active"], attributes: { "aria-pressed": "true" }, properties: {} },
    { visible: true, classes: [], attributes: { "aria-pressed": "false" }, properties: {} },
  ];
  const after = [
    { visible: true, classes: [], attributes: { "aria-pressed": "false" }, properties: {} },
    { visible: true, classes: ["is-active"], attributes: { "aria-pressed": "true" }, properties: {} },
  ];

  it("supports class and aria representations", () => {
    expect(controlStateMatches(after[1], classState, true)).toBe(true);
    expect(controlStateMatches(after[1], { type: "aria", name: "aria-pressed", active_value: "true", inactive_value: "false" }, true)).toBe(true);
    expect(accessibilityStateMatches(after[1], { attribute: "aria-pressed", active_value: "true", inactive_value: "false" }, true)).toBe(true);
    expect(accessibilityStateMatches({ attributes: { "aria-current": "page" } }, { attribute: "aria-current", active_value: "page", inactive_value: null }, true)).toBe(true);
    expect(accessibilityStateMatches({ attributes: { "aria-expanded": "true" } }, { attribute: "aria-expanded", active_value: "true", inactive_value: "false" }, true)).toBe(true);
  });

  it("verifies state transition, previous state clearing and exclusivity", () => {
    expect(evaluateControlStateTransition({
      before, after, previousIndex: 0, targetIndex: 1, representation: classState,
      accessibility: { attribute: "aria-pressed", active_value: "true", inactive_value: "false" },
      expectedActiveCount: 1,
    })).toMatchObject({
      initialStateRecorded: true, targetActive: true, previousCleared: true,
      exclusivityPreserved: true, accessibilityMatches: true, originalBehaviorPreserved: true,
    });
  });

  it("rejects mismatched state and multiple active controls", () => {
    const duplicate = [after[1], after[1]];
    expect(evaluateControlStateTransition({
      before, after: duplicate, previousIndex: 0, targetIndex: 1, representation: classState,
      accessibility: { attribute: "aria-pressed", active_value: "true", inactive_value: "false" },
      expectedActiveCount: 1,
    })).toMatchObject({ previousCleared: false, exclusivityPreserved: false, originalBehaviorPreserved: false });
  });
});
