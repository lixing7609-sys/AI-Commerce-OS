// 把批准后的待决策整理成结构化、可执行的开发任务包 —— 纯函数。

export function buildTaskPackage(conversation, decision) {
  return {
    name: decision.title,
    background: decision.background,
    currentProblem: conversation.pendingConfirmations.map((c) => c.text).join("；") || "无遗留问题",
    confirmedConclusions: decision.conclusion,
    rejectedApproaches: decision.rejected,
    prohibitions: decision.constraints,
    scope: `Founder AI 页面（${conversation.topic || conversation.title}）`,
    uiReference: "沿用当前 SinoFUT V2 深色设计系统",
    images: [],
    files: [],
    codeImpact: "apps/founder/src 内的 Founder AI 相关组件",
    acceptanceCriteria: decision.conclusion.length ? decision.conclusion : ["按讨论中确认的结论逐条验收"],
    testRequirements: "lint + build + 浏览器逐项点击验证",
    pageViewRequirement: "必须提供可直接打开的本地页面地址",
    gitRequirement: "创建新 commit，不使用 --amend，提交前确认 git status 干净",
  };
}
