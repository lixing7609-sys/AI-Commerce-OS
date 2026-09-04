// 从对话当前状态生成待决策草稿 —— 纯函数，不直接操作 store/context，
// 由调用方（FounderConversation）负责落地到时间线与全局待决策列表。

function riskFromConstraints(conversation) {
  if (conversation.constraints.length >= 2) return "中";
  if (conversation.rejected.length >= 1) return "中";
  return "低";
}

export function buildDecisionDraft(conversation) {
  return {
    title: conversation.topic || conversation.title,
    background: `围绕「${conversation.topic || conversation.title}」的讨论已经进行了 ${conversation.messages.filter((m) => m.type === "user").length} 轮。`,
    conclusion: conversation.consensus.map((c) => c.text),
    alternatives: conversation.pendingConfirmations.map((c) => c.text),
    rejected: conversation.rejected.map((c) => c.text),
    constraints: conversation.constraints.map((c) => c.text),
    risk: riskFromConstraints(conversation),
    sinoSuggestion: "建议批准，已形成的共识可以直接作为开发任务包的依据。",
    nextStepAfterApproval: "批准后将自动生成开发任务包，并可分配给 Claude Code 执行。",
  };
}
