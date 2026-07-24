import { createContext, useContext } from "react";

export const ConsoleNavContext = createContext(null);

export function useConsoleNavContext() {
  const ctx = useContext(ConsoleNavContext);
  if (!ctx) {
    throw new Error("useConsoleNavContext must be used within ConsoleNavContext.Provider");
  }
  return ctx;
}
