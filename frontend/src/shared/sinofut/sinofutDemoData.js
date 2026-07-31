/**
 * SinoFUT 悬浮入口的演示数据——与 UI 分离，方便以后替换成真实事件源
 * （见 docs/sinofut-ui-foundation.md）。当前仅为静态 mock，不连接任何
 * 真实库存/广告/设备/审批系统。
 */
export const SINOFUT_DEMO_DATA = {
  focusToday: [
    { id: "focus-1", text: "今日有 3 项需要关注" },
  ],
  alerts: [
    { id: "alert-1", text: "SKU-028 库存即将低于警戒线" },
  ],
  suggestions: [
    { id: "suggestion-1", text: "建议检查今日广告投放回报" },
  ],
  approvals: [
    { id: "approval-1", text: "1 项经营策略等待确认" },
  ],
};

/**
 * status: "normal" | "suggestion" | "alert" —— 悬浮入口的三种主动提醒
 * 状态；alerts 非空时优先显示紧急态，否则有 suggestions/approvals 时
 * 显示建议态，都没有时安静显示。
 */
export function getSinoFUTStatus(data = SINOFUT_DEMO_DATA) {
  const unreadCount = data.alerts.length + data.approvals.length;
  const status = data.alerts.length > 0
    ? "alert"
    : (data.suggestions.length > 0 || data.approvals.length > 0)
      ? "suggestion"
      : "normal";
  return { status, unreadCount };
}
