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

// 从任务原始 result（AI CEO 执行结果的完整结构）里提取委派摘要
// 的 items 数组，只用于在父任务详情里把"委派原因"和子任务列表
// 对应起来展示；提取失败（字段缺失/类型不符）一律安全返回空
// 数组，不抛异常、不影响其它字段展示。
function extractDelegationItems(result) {
  const items = result?.result?.delegation?.items;
  return Array.isArray(items) ? items : [];
}

// 从任务原始 result 里提取销售 Agent 的结构化/文本结果，供详情
// 抽屉做可读展示（而不是只能看原始 JSON）；只在确实存在
// sales_analysis 字段时返回非空对象，其它任何任务类型（包括
// AI CEO）都返回 null，不影响它们原有的展示方式。提取失败一律
// 安全返回 null。
function extractSalesAnalysis(result) {
  const inner = result?.result;

  if (
    !inner ||
    typeof inner.sales_analysis !== "object" ||
    inner.sales_analysis === null
  ) {
    return null;
  }

  return {
    format: inner.format === "text" ? "text" : "structured",
    data: inner.sales_analysis,
  };
}

// 阶段 8D：从任务原始 result 里提取产品 Agent 的结构化/文本结果，
// 只在确实存在 product_analysis 字段时返回非空对象，其它任何
// 任务类型都返回 null，提取失败一律安全返回 null。
function extractProductAnalysis(result) {
  const inner = result?.result;

  if (
    !inner ||
    typeof inner.product_analysis !== "object" ||
    inner.product_analysis === null
  ) {
    return null;
  }

  return {
    format: inner.format === "text" ? "text" : "structured",
    data: inner.product_analysis,
  };
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
    // 阶段 8B：父子任务委派展示字段。children/parentSummary 已经
    // 是后端只挑选安全字段后的轻量结构，这里不再做脱敏，只做
    // 缺省兜底。
    parentTaskId: task.parent_task_id ?? null,
    rootTaskId: task.root_task_id ?? null,
    shopId: task.shop_id ?? null,
    shopName: task.shop_name ?? null,
    delegationDepth: task.delegation_depth ?? 0,
    createdByAgent: task.created_by_agent ?? null,
    childTaskCount: task.child_task_count ?? 0,
    children: Array.isArray(task.children) ? task.children : [],
    parentSummary: task.parent_summary ?? null,
    delegationItems: extractDelegationItems(task.result),
    // 阶段 8C：销售 Agent 结构化结果的可读展示，null 表示当前
    // 任务不是销售分析结果（例如 AI CEO 或普通占位 Agent 的
    // 任务），此时抽屉沿用原有的原始 JSON 展示，不受影响。
    salesAnalysis: extractSalesAnalysis(task.result),
    // 阶段 8D：产品 Agent 结构化结果的可读展示，null 表示当前
    // 任务不是产品分析结果，此时抽屉沿用原有的原始 JSON 展示。
    productAnalysis: extractProductAnalysis(task.result),
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
