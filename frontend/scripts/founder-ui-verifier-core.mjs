export function effectiveVisibleControlCount({ nativeVisible = false, applicationVisibleCount = 0 } = {}) {
  return Number(Boolean(nativeVisible)) + Math.max(0, Number(applicationVisibleCount) || 0);
}

export function evaluateVisibleCardinality(cardinality, effectiveCount) {
  if (!cardinality) return { matches: true, duplicateAbsent: true };
  if (cardinality.cardinality === "exactly_one") {
    return { matches: effectiveCount === cardinality.expected_visible_count, duplicateAbsent: effectiveCount <= 1 };
  }
  if (cardinality.cardinality === "at_least_one") {
    return { matches: effectiveCount >= cardinality.minimum_visible_count, duplicateAbsent: true };
  }
  if (cardinality.cardinality === "none") {
    return { matches: effectiveCount === 0, duplicateAbsent: effectiveCount === 0 };
  }
  return { matches: true, duplicateAbsent: true };
}
