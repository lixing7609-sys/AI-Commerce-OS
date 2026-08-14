const INTERNAL_TITLE = /^(goal\s*(revision|confirmation|understanding|brief)?|intent|validation|decision|discussion\s*package|package)(\b|\s|[-_:])/i;

export function founderConversationTitle(title, goal) {
  const value = String(title || "").trim();
  const businessGoal = String(goal || "").trim().replace(/[。！？?!]+$/, "");
  if (!value || value === "New Conversation" || value === "新讨论" || INTERNAL_TITLE.test(value)) return businessGoal || "新讨论";
  return value;
}
