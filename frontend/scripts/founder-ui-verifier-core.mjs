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

export function evaluateDerivedCount(displayedValue, visibleCount, aggregation = "count", comparison = "equals") {
  if (aggregation !== "count" || comparison !== "equals") {
    return { supported: false, displayInteger: false, matches: false };
  }
  const normalized = typeof displayedValue === "number"
    ? displayedValue
    : /^\s*\d+\s*$/.test(String(displayedValue ?? "")) ? Number(String(displayedValue).trim()) : NaN;
  const displayInteger = Number.isInteger(normalized);
  return { supported: true, displayInteger, matches: displayInteger && normalized === visibleCount };
}

export function countVisibleElements(elements = []) {
  return elements.filter((item) => item && item.visible === true).length;
}

export function evaluateDerivedStates(states = []) {
  const required = states.filter((item) => !item.skipped);
  return {
    passed: required.length > 0 && required.every((item) => item.passed === true),
    failedStates: required.filter((item) => item.passed !== true).map((item) => item.name),
  };
}
