import { EmptyState } from "./EmptyState.jsx";
import { Button } from "./Button.jsx";
import { Icon } from "./Icon.jsx";

/**
 * Page/module-level fatal error fallback (component-spec.md#errorstate).
 * `detail` is raw error text, only shown in dev builds. Generalizes the
 * icon/message/detail/retry pattern already used by RenderErrorState.
 */
export function ErrorState({ message, detail, onRetry }) {
  return (
    <EmptyState
      icon={<Icon name="AlertTriangle" size={32} color="var(--danger)" />}
      message={
        <>
          <div>{message}</div>
          {import.meta.env.DEV && detail ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontFamily: "monospace" }}>
              {String(detail)}
            </div>
          ) : null}
        </>
      }
      action={onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>重试</Button> : null}
    />
  );
}
