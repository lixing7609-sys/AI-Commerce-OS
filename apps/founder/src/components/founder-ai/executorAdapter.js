// Claude Code 执行适配层 —— 分层：Task Package → Executor Adapter →
// Execution Run → Execution Result。当前项目未接入真实 Claude Code API，
// 这里用一个短延时模拟真实的"分配→执行→完成"节奏，但数据结构与真实
// 执行结果保持一致，未来接入真实 API 时只需替换 assignToClaudeCode 的
// 实现，调用方（FounderConversation）不需要改动。

export function assignToClaudeCode(taskPackage) {
  return {
    taskName: taskPackage.name,
    startedAt: new Date().toISOString(),
    currentStep: "分析任务包并定位相关组件",
    awaitingInput: false,
    status: "running",
  };
}

export function simulateExecutionResult(taskPackage) {
  return {
    completedAt: new Date().toISOString(),
    pageUrl: "http://localhost:5180",
    summary: `已完成「${taskPackage.name}」的开发与验证`,
    filesChanged: [
      "apps/founder/src/pages/FounderHome.jsx",
      "apps/founder/src/components/founder-ai/FounderConversation.jsx",
      "apps/founder/src/components/founder-ai/SinoPanel.jsx",
    ],
    testResults: "lint 通过 · build 通过 · 浏览器逐项验证通过",
    knownIssues: "暂无",
    status: "completed",
  };
}
