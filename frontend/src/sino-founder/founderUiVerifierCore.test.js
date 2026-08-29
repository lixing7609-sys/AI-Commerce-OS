import { describe, expect, it } from "vitest";
import {
  countVisibleElements, effectiveVisibleControlCount, evaluateDerivedCount, evaluateDerivedStates, evaluateVisibleCardinality,
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
