export function isFounderAIRoute(pathname) {
  return !pathname.startsWith("/legacy") || pathname.startsWith("/founder/sino");
}
