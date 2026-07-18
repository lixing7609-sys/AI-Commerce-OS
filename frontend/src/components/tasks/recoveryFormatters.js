export const RECOVERY_STATUS_LABELS = {
  pending: "待执行",
  running: "运行中",
};

export const RECOMMENDED_ACTION_LABELS = {
  inspect: "排查",
  retry_later: "稍后重试",
  requeue: "重新排队",
  mark_failed: "标记失败",
};

export function getRecoveryStatusLabel(status) {
  return RECOVERY_STATUS_LABELS[status] ?? status;
}

export function getRecommendedActionLabel(action) {
  return RECOMMENDED_ACTION_LABELS[action] ?? action;
}

export function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "无效时间";
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function formatDuration(ageSeconds) {
  if (
    ageSeconds === null ||
    ageSeconds === undefined ||
    Number.isNaN(ageSeconds) ||
    ageSeconds < 0
  ) {
    return "暂无";
  }

  const totalSeconds = Math.floor(ageSeconds);

  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    return `${totalHours} 小时 ${remainingMinutes} 分钟`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;

  return `${totalDays} 天 ${remainingHours} 小时`;
}
