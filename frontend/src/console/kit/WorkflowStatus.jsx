import { Timeline } from "./Timeline.jsx";

export function WorkflowStatus({ steps = [] }) {
  return <Timeline items={steps} />;
}
