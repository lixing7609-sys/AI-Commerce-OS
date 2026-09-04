import { useEffect } from "react";

/**
 * Minimal external store for "current context" text shown in the
 * SinoFUT panel (e.g. "Founder · 今日总览"). Each app shell publishes
 * its own label once via useSinoFUTContextPublisher wherever it
 * already computes a page/module title — SinoFUTWidget (mounted once
 * in main.jsx, outside every Edition's own React tree) reads whichever
 * label was last published, without importing any Edition-specific
 * nav code itself.
 */
const DEFAULT_CONTEXT = "AI Commerce OS";

let currentContext = DEFAULT_CONTEXT;
const listeners = new Set();

export function setSinoFUTContext(label) {
  const next = label && label.trim() ? label : DEFAULT_CONTEXT;
  if (next === currentContext) return;
  currentContext = next;
  listeners.forEach((listener) => listener());
}

export function getSinoFUTContext() {
  return currentContext;
}

export function subscribeSinoFUTContext(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSinoFUTContextPublisher(label) {
  useEffect(() => {
    setSinoFUTContext(label);
  }, [label]);
}
