import { useContext } from "react";
import { FounderAIContext } from "./founderAIContextObject.js";

export function useFounderAI() {
  const ctx = useContext(FounderAIContext);
  if (!ctx) throw new Error("useFounderAI must be used within FounderAIProvider");
  return ctx;
}
