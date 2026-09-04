import { EmptyState } from "./EmptyState.jsx";
import { Button } from "./Button.jsx";

/**
 * 后端服务未连接时的可见状态——不静默吞掉 API 错误，也不让内容区
 * 变成空白。retry 由调用方传入（通常是重新发起同一个请求）。
 */
export function BackendUnavailableState({ detail, endpoint, onRetry }) {
  return (
    <EmptyState
      icon="⚠"
      message={
        <>
          <div>后端服务未连接</div>
          {detail ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{detail}</div>
          ) : null}
          {endpoint ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>预期后端地址：{endpoint}</div>
          ) : null}
        </>
      }
      action={onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>重试</Button> : null}
    />
  );
}
