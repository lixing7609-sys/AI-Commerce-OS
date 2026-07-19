export const TASK_MAX_LENGTH = 64;

export const PRIORITY_OPTIONS = [
  { value: "high", label: "高" },
  { value: "normal", label: "普通" },
  { value: "low", label: "低" },
];

const PRIORITY_LABELS = {
  high: "高",
  normal: "普通",
  low: "低",
};

export function getPriorityLabel(priority) {
  return PRIORITY_LABELS[priority] ?? priority;
}

/**
 * 把 submitTask() 抛出的 TaskApiError 映射为固定安全文案，不展示
 * 后端原始 detail、SQL、数据库连接串或 traceback。
 */
export function getSubmitErrorMessage(error) {
  if (error?.status === 422) {
    return "提交内容不符合要求，请检查 AI 员工、任务内容和优先级。";
  }

  if (error?.status === 404) {
    return "所选 AI 员工当前不可用，请刷新后重新选择。";
  }

  if (error?.status === 500) {
    return "任务提交失败，请稍后重试。";
  }

  return "无法连接后端服务，请检查服务状态。";
}
