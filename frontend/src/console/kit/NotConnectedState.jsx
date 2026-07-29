import { EmptyState } from "./EmptyState.jsx";
import { Button } from "./Button.jsx";
import { Icon } from "./Icon.jsx";

/**
 * Module requires a backend/integration connection that isn't present
 * (component-spec.md#notconnectedstate). Semantic-name sibling of
 * BackendUnavailableState, which remains the concrete legacy implementation.
 */
export function NotConnectedState({ message = "尚未连接后端服务", onConnect }) {
  return (
    <EmptyState
      icon={<Icon name="PlugZap" size={32} />}
      message={message}
      action={onConnect ? <Button size="sm" variant="primary" onClick={onConnect}>连接</Button> : null}
    />
  );
}
