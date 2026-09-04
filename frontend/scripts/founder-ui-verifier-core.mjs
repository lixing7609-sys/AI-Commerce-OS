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

export function controlStateMatches(snapshot = {}, representation = {}, expectedActive = true) {
  const type = representation.type;
  const expected = expectedActive ? representation.active_value : representation.inactive_value;
  if (type === "class") return Array.from(snapshot.classes || []).includes(representation.name) === Boolean(expected);
  if (type === "aria" || type === "attribute") {
    const actual = Object.prototype.hasOwnProperty.call(snapshot.attributes || {}, representation.name)
      ? snapshot.attributes[representation.name] : null;
    return actual === (expected ?? null);
  }
  if (type === "property") return snapshot.properties?.[representation.name] === expected;
  if (type === "visible") return snapshot.visible === Boolean(expected);
  return false;
}

export function accessibilityStateMatches(snapshot = {}, semantics = {}, expectedActive = true) {
  if (!semantics || semantics.required === false) return true;
  const attribute = semantics.attribute;
  if (!attribute) return false;
  const expected = expectedActive ? semantics.active_value : semantics.inactive_value;
  const actual = Object.prototype.hasOwnProperty.call(snapshot.attributes || {}, attribute)
    ? snapshot.attributes[attribute] : null;
  return actual === (expected ?? null);
}

export function evaluateControlStateTransition({
  before = [], after = [], previousIndex = -1, targetIndex = -1,
  representation = {}, accessibility = {}, expectedActiveCount = 1,
} = {}) {
  const initialActiveIndexes = before.map((item, index) => controlStateMatches(item, representation, true) ? index : -1).filter((index) => index >= 0);
  const finalActiveIndexes = after.map((item, index) => controlStateMatches(item, representation, true) ? index : -1).filter((index) => index >= 0);
  const targetActive = targetIndex >= 0 && controlStateMatches(after[targetIndex], representation, true);
  const previousCleared = previousIndex < 0 || previousIndex === targetIndex
    || controlStateMatches(after[previousIndex], representation, false);
  const accessibilityMatches = targetIndex >= 0
    && accessibilityStateMatches(after[targetIndex], accessibility, true)
    && (previousIndex < 0 || previousIndex === targetIndex || accessibilityStateMatches(after[previousIndex], accessibility, false));
  return {
    initialStateRecorded: before.length > 0 && initialActiveIndexes.length > 0,
    targetActive,
    previousCleared,
    exclusivityPreserved: finalActiveIndexes.length === expectedActiveCount,
    accessibilityMatches,
    originalBehaviorPreserved: targetActive && previousCleared,
    initialActiveIndexes,
    finalActiveIndexes,
  };
}
