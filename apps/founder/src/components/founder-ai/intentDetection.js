// SinoFUT 前端可验证的意图识别模拟 —— 纯关键词规则，后续替换为真实模型判断。

const RULES = [
  {
    mode: "model-meeting",
    pattern: /多个模型|不同模型|分别.*方案|讨论方案/,
    label: "模型会议",
    explanation: "我可以让多个模型分别提出方案，再由我汇总分歧和建议。",
  },
  {
    mode: "functional-argumentation",
    pattern: /是否值得|要不要开发|功能可行性|值得开发/,
    label: "功能论证",
    explanation: "我可以从用户价值、经营需求、实现难度、商业模式和系统架构等角度进行论证。",
  },
  {
    mode: "decision",
    pattern: /决定|选择|审批|是否通过/,
    label: "决策事项",
    explanation: "我可以帮你把这件事整理成一个正式的决策事项，方便跟踪判断结果。",
  },
  {
    mode: "execution-task",
    pattern: /执行|安排|分工|完成时间/,
    label: "执行任务",
    explanation: "我可以把这件事创建为一个可执行、可跟踪的工作任务。",
  },
  {
    mode: "file-analysis",
    pattern: /分析.*文件|这个文件/,
    label: "文件分析",
    explanation: "我可以针对上传的文件进行研究分析。",
  },
];

export function detectIntent(text, { hasFile = false } = {}) {
  if (hasFile) {
    const rule = RULES.find((r) => r.mode === "file-analysis");
    return { mode: rule.mode, label: rule.label, explanation: rule.explanation };
  }
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      return { mode: rule.mode, label: rule.label, explanation: rule.explanation };
    }
  }
  return null;
}
