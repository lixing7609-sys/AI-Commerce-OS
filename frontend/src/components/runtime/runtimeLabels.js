export const RUNTIME_STATE_LABELS = {
  running: "运行中",
  stopped: "已停止",
  starting: "启动中",
  stopping: "停止中",
  error: "异常",
};

export function getRuntimeStateLabel(state) {
  return RUNTIME_STATE_LABELS[state] ?? "未知";
}
