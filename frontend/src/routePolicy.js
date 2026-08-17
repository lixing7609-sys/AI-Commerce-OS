export function isFounderAIRoute(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
  if (["/legacy", "/cloud", "/operator", "/studio"].some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return false;
  }
  return true;
}
