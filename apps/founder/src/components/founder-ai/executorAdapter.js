// Claude Code 执行适配层 —— 分层：Task Package → Executor Adapter →
// Execution Run → Execution Result。真实实现：调用本地 backend 的
// Sino Connector API，backend 再用本机已登录的 Claude Code CLI 执行；
// 这里只做"启动 → 轮询 → 归一化结果"，不直接持有任何凭证。
//
// 只有在 startExecution 本身失败（Executor 未就绪 / 请求出错）时才
// 降级为 Mock，并在结果里显式标注 mock: true，调用方必须把这个标注
// 展示给用户，不能把 Mock 结果说成"Claude 已完成"。

import { startExecution, getExecutionStatus, provideExecutionInput, cancelExecution, screenshotUrl } from "./connectorApi.js";

const POLL_INTERVAL_MS = 2500;

function formatVerification(detail) {
  const parts = [];
  if (detail.lint_result) parts.push(`lint：${detail.lint_result.ran ? (detail.lint_result.passed ? "通过" : "未通过") : "跳过"}`);
  if (detail.build_result) parts.push(`build：${detail.build_result.ran ? (detail.build_result.passed ? "通过" : "未通过") : "跳过"}`);
  if (detail.test_result) parts.push(`test：${detail.test_result.ran ? (detail.test_result.passed ? "通过" : "未通过") : detail.test_result.output || "跳过"}`);
  if (detail.dev_server_status) parts.push(`页面：${detail.dev_server_status.reachable ? "可访问" : "不可访问"}`);
  return parts.join(" · ") || "无验证结果";
}

function buildRunState(patch) {
  return {
    taskName: "",
    startedAt: new Date().toISOString(),
    currentStep: "",
    awaitingInput: false,
    awaitingInputQuestion: null,
    awaitingInputKind: null,
    status: "running",
    runId: null,
    mock: false,
    ...patch,
  };
}

// 启动一次真实执行；调用方负责先把 execution 消息 append 到时间线上，
// 拿到 messageId 后再调用这里 + startPolling，这样"启动中"这个瞬间
// 也能在时间线上看到。
export async function startExecutionRun({ conversationId, decisionId, taskPackageId, taskPackage }) {
  const response = await startExecution({ conversationId, decisionId, taskPackageId, taskPackage });
  return { runId: response.run_id, status: response.status, mock: !!response.mock };
}

export function buildMockFailureResult(error, health) {
  return {
    summary: `[Mock 降级] Claude Code Executor 当前不可用，未执行真实开发：${error.message}`,
    pageUrl: null,
    filesChanged: [],
    testResults: "未执行（Executor 不可用）",
    knownIssues: (health && (health.fix_hint || health.issue)) || error.message,
    status: "failed",
    mock: true,
  };
}

// 轮询执行状态直到进入终态（completed/failed/cancelled）或转入
// waiting_for_input（此时必须停下来等待用户在 Sino 对话里回答）。
// onUpdate 每次轮询都会被调用一次，负责把归一化后的 patch 写回时间线。
export function pollExecutionRun(runId, { onUpdate, onTerminal }) {
  let stopped = false;
  let consecutiveErrors = 0;

  async function tick() {
    if (stopped) return;
    let status;
    try {
      status = await getExecutionStatus(runId);
      consecutiveErrors = 0;
    } catch {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) {
        stopped = true;
        onUpdate({
          run: buildRunState({ runId, status: "failed", currentStep: "无法获取执行状态，已停止轮询" }),
        });
        onTerminal?.();
        return;
      }
      schedule();
      return;
    }

    const runPatch = buildRunState({
      runId,
      status: status.status,
      currentStep: status.current_step || "",
      awaitingInput: status.status === "waiting_for_input",
      awaitingInputQuestion: status.awaiting_input_question,
      awaitingInputKind: status.awaiting_input_kind,
      startedAt: status.started_at,
    });

    const isTerminal = ["completed", "failed", "cancelled"].includes(status.status);
    const isWaiting = status.status === "waiting_for_input";

    if (isTerminal) {
      const detail = status.detail || {};
      onUpdate({
        run: runPatch,
        result: {
          summary: detail.summary || status.error || (status.status === "cancelled" ? "执行已取消" : "执行结束"),
          pageUrl: detail.dev_server_url || null,
          filesChanged: detail.files_changed || [],
          testResults: formatVerification(detail),
          knownIssues: detail.known_issues || status.error || "无",
          commitHash: detail.commit_hash || null,
          screenshotUrl: screenshotUrl(detail.screenshot_path),
          status: status.status,
          error: status.error || null,
        },
      });
      stopped = true;
      onTerminal?.();
      return;
    }

    onUpdate({ run: runPatch });

    if (isWaiting) {
      stopped = true;
      onTerminal?.();
      return;
    }

    schedule();
  }

  function schedule() {
    if (stopped) return;
    window.setTimeout(tick, POLL_INTERVAL_MS);
  }

  tick();

  return {
    stop() {
      stopped = true;
    },
  };
}

export async function submitExecutionInput(runId, answer) {
  await provideExecutionInput(runId, answer);
}

export async function cancelExecutionRun(runId) {
  await cancelExecution(runId);
}

export { buildRunState };
