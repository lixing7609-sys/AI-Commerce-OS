export const LAST_OUTCOME_LABELS = {
  completed: "已完成",
  failed: "失败",
  no_task: "暂无任务",
  runtime_stopped: "Runtime 已停止",
  state_conflict: "状态冲突",
};

export function getLastOutcomeLabel(outcome) {
  if (!outcome) {
    return "暂无";
  }

  return LAST_OUTCOME_LABELS[outcome] ?? outcome;
}

/**
 * 任务执行器（TaskConsumerService）的展示级别。
 *
 * 优先级：consumer 缺失（旧 backend 或临时响应）→ "unknown"；
 * healthy=true → "healthy"；healthy=false 且从未启动过
 * （started_at 为空）→ "unstarted"；healthy=false 且启动过 →
 * "unhealthy"。不单独依赖 Runtime 自身的 running 状态——Runtime
 * stopped 时 consumer 通常仍然存活，此时应展示为 healthy。
 *
 * @param {import("../../types/runtime").TaskConsumerStatusResponse | null | undefined} consumer
 * @returns {"healthy" | "unstarted" | "unhealthy" | "unknown"}
 */
export function getConsumerStatusLevel(consumer) {
  if (!consumer) {
    return "unknown";
  }

  if (consumer.healthy) {
    return "healthy";
  }

  if (!consumer.started_at) {
    return "unstarted";
  }

  return "unhealthy";
}

export const CONSUMER_STATUS_LEVEL_LABELS = {
  healthy: "正常",
  unstarted: "未启动",
  unhealthy: "异常",
  unknown: "未知",
};

export function getConsumerStatusLevelLabel(level) {
  return CONSUMER_STATUS_LEVEL_LABELS[level] ?? "未知";
}
