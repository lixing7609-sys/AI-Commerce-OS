import { useEffect, useMemo, useState } from "react";

const STEPS = [
  { key: "approved", label: "Approved", start: "approved", end: "queued" },
  { key: "queued", label: "Queued", start: "queued", end: "worker_started" },
  { key: "worker", label: "Worker Started", start: "worker_started", end: "codex_started" },
  { key: "codex", label: "Codex Running", start: "codex_started", end: "codex_finished" },
  { key: "testing", label: "Testing", start: "testing_started", end: "testing_finished" },
  { key: "artifact", label: "Artifact", start: "testing_finished", end: "artifact_saved" },
  { key: "memory", label: "Memory", start: "artifact_saved", end: "memory_saved" },
  { key: "completed", label: "Completed", start: "completed", end: "completed" },
];

function formatTime(value) {
  if (!value) return "Waiting";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const seconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function indexEvents(events, timeline) {
  const indexed = {};
  for (const event of events || []) indexed[event.event_name] = event;
  const legacy = { approved: timeline?.approved, queued: timeline?.queued, codex_started: timeline?.executing, testing_started: timeline?.testing, completed: timeline?.completed };
  for (const [eventName, timestamp] of Object.entries(legacy)) {
    if (!indexed[eventName] && timestamp) indexed[eventName] = { event_name: eventName, timestamp, message: eventName };
  }
  return indexed;
}

export function ExecutionTimeline({ status, timeline = {}, events = [], error, failureReason, pauseReason, recoverable = false, lastEvent, onResume }) {
  const [now, setNow] = useState(() => Date.now());
  const indexed = useMemo(() => indexEvents(events, timeline), [events, timeline]);
  const running = ["queued", "executing", "testing"].includes(status);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const lastObserved = lastEvent || events.at(-1);
  const reason = failureReason || error;
  return (
    <section className="sino-timeline sino-timeline--v2" aria-label="Execution Timeline" aria-live="polite">
      <header className="sino-timeline__header">
        <span className="sino-kicker">Execution timeline V2</span>
        {status && <strong data-status={status}>{status === "paused" ? "Paused" : status === "failed" ? "Failed" : status.replace("_", " ")}</strong>}
      </header>
      <ol>{STEPS.map((step, index) => {
        const startedAt = indexed[step.start]?.timestamp;
        const finishedAt = indexed[step.end]?.timestamp;
        const nextStarted = STEPS[index + 1] && indexed[STEPS[index + 1].start]?.timestamp;
        const isCurrent = Boolean(startedAt && !finishedAt && !nextStarted && running);
        const duration = formatDuration(startedAt, finishedAt || (isCurrent ? new Date(now).toISOString() : null));
        const className = [startedAt ? "is-active" : "", isCurrent ? "is-current" : "", finishedAt ? "is-complete" : ""].filter(Boolean).join(" ");
        return <li key={step.key} className={className}><span>{index + 1}</span><div><strong>{step.label}</strong><time dateTime={startedAt || undefined}>{startedAt ? `${formatTime(startedAt)}${finishedAt && finishedAt !== startedAt ? ` – ${formatTime(finishedAt)}` : ""}` : "Waiting"}</time>{duration && <small>{duration}</small>}</div></li>;
      })}</ol>
      {status === "failed" && <div className="sino-execution-notice sino-execution-notice--failed" role="alert"><strong>Failed</strong><p><b>Reason:</b> {reason || "Execution failed without a captured reason."}</p><p><b>Last Event:</b> {lastObserved ? `${lastObserved.event_name} · ${formatTime(lastObserved.timestamp)}` : "Unavailable"}</p></div>}
      {status === "paused" && <div className="sino-execution-notice sino-execution-notice--paused" role="status"><strong>Paused</strong><p><b>Reason:</b> {pauseReason || "Backend restarted"}</p><p><b>Last Event:</b> {lastObserved ? `${lastObserved.event_name} · ${formatTime(lastObserved.timestamp)}` : "Unavailable"}</p>{recoverable && onResume && <button className="sino-button" type="button" onClick={onResume}>Resume Execution</button>}</div>}
    </section>
  );
}
