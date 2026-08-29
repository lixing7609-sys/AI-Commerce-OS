import { describe, expect, it } from "vitest";
import { effectiveVisibleControlCount, evaluateVisibleCardinality } from "../../scripts/founder-ui-verifier-core.mjs";

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
