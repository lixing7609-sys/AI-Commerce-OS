const RESULT_MAX_LENGTH = 5000;
const ERROR_MAX_LENGTH = 2000;
const TRUNCATED_SUFFIX = "\n\n…（内容已截断）";

export const TASK_DETAIL_STATUS_LABELS = {
  pending: "等待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

export function getTaskDetailStatusLabel(status) {
  return TASK_DETAIL_STATUS_LABELS[status] ?? "未知";
}

// result 中可能出现的敏感键名，统一小写比较，覆盖常见的下划线/
// 驼峰两种写法。命中时值一律替换为 "***"，只影响前端展示，不修改
// 后端数据。
const SENSITIVE_KEYS = new Set([
  "api_key",
  "apikey",
  "token",
  "access_token",
  "authorization",
  "password",
  "secret",
  "database_url",
  "db_url",
]);

function maskSensitiveValues(value) {
  if (Array.isArray(value)) {
    return value.map(maskSensitiveValues);
  }

  if (value && typeof value === "object") {
    const masked = {};

    for (const [key, val] of Object.entries(value)) {
      masked[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? "***"
        : maskSensitiveValues(val);
    }

    return masked;
  }

  return value;
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength) + TRUNCATED_SUFFIX;
}

function formatResultForDisplay(result) {
  if (result === null || result === undefined) {
    return "暂无";
  }

  const masked = maskSensitiveValues(result);

  let text;

  try {
    text = JSON.stringify(masked, null, 2);
  } catch {
    text = String(masked);
  }

  return truncateText(text, RESULT_MAX_LENGTH);
}

function formatErrorForDisplay(error) {
  if (!error) {
    return "暂无";
  }

  return truncateText(String(error), ERROR_MAX_LENGTH);
}

/**
 * 把后端返回的完整任务对象转换成安全的展示结构：只挑选允许
 * 展示的字段（不包含 payload/context），result 递归遮蔽敏感键并
 * 限长格式化为 JSON 文本，error 限长格式化为纯文本。
 *
 * @param {import("../../types/task").TaskDetail | null | undefined} task
 */
export function sanitizeTaskDetail(task) {
  if (!task) {
    return null;
  }

  return {
    id: task.id ?? "",
    status: task.status ?? "unknown",
    assignedAgent: task.assigned_agent ?? null,
    taskType: task.task_type ?? "",
    priority: task.priority ?? "normal",
    createdAt: task.created_at ?? null,
    startedAt: task.started_at ?? null,
    completedAt: task.completed_at ?? null,
    // TaskDB 没有真正的 updated_at 列；用已知时间戳里最新的一个
    // 作为"最近更新时间"的合理近似值，不请求后端新增字段。
    updatedAt: task.completed_at ?? task.started_at ?? task.created_at ?? null,
    resultText: formatResultForDisplay(task.result),
    errorText: formatErrorForDisplay(task.error),
  };
}

export function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
