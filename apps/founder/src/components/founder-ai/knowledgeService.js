// 复盘 → 知识沉淀 —— 纯函数，产出符合"知识"页面字段要求的记录。

export function buildRetrospective(conversation) {
  return {
    originalGoal: conversation.topic || conversation.title,
    finalResult: conversation.consensus.map((c) => c.text).join("；") || "已形成结论",
    directionChanges: conversation.rejected.length
      ? `曾考虑但否决：${conversation.rejected.map((c) => c.text).join("；")}`
      : "过程中方向保持一致，没有大的调整",
    rejectedApproaches: conversation.rejected.map((c) => c.text),
    keyConstraints: conversation.constraints.map((c) => c.text),
    executionIssues: "暂无（模拟执行未出现异常）",
    reusableLessons: "先梳理共识与约束，再生成任务包，能显著减少来回返工",
    newDesignNorm: conversation.constraints.length > 0,
    enterKnowledgeBase: true,
  };
}

export function buildKnowledgeEntry(conversation, retrospective) {
  return {
    id: `know-${Date.now()}`,
    category: "Founder 决策原则",
    title: retrospective.originalGoal,
    summary: retrospective.finalResult,
    reason: retrospective.reusableLessons,
    prohibitions: retrospective.keyConstraints,
    relatedPages: ["http://localhost:5180"],
    relatedCode: ["apps/founder/src"],
    lastReferencedAt: new Date().toISOString().slice(0, 10),
    effectiveAt: new Date().toISOString().slice(0, 10),
    sourceConversationId: conversation.id,
    isCore: retrospective.newDesignNorm,
    isValid: true,
  };
}
