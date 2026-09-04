import { useEffect, useMemo, useState } from "react";

const STEPS = [
  { key: "approved", label: "已审批", start: "approved", end: "queued" },
  { key: "queued", label: "已排队", start: "queued", end: "worker_started" },
  { key: "worker", label: "Worker 已启动", start: "worker_started", end: "codex_started" },
  { key: "codex", label: "Codex 运行中", start: "codex_started", end: "codex_finished" },
  { key: "testing", label: "测试", start: "testing_started", end: "testing_finished" },
  { key: "artifact", label: "成果", start: "testing_finished", end: "artifact_saved" },
  { key: "memory", label: "记忆", start: "artifact_saved", end: "memory_saved" },
  { key: "completed", label: "已完成", start: "completed", end: "completed" },
];

const STATUS_LABELS = { draft: "草稿", approved: "已审批", queued: "已排队", executing: "执行中", testing: "测试中", paused: "已暂停", completed: "已完成", failed: "失败" };
const EVENT_LABELS = { approved: "已审批", queued: "已排队", worker_started: "Worker 已启动", codex_started: "Codex 已启动", codex_finished: "Codex 已完成", testing_started: "测试已开始", testing_finished: "测试已完成", artifact_saved: "成果已保存", memory_saved: "记忆已保存", completed: "已完成", failed: "失败", backend_restarted: "后端已重启", founder_delta_received: "已收到 Founder 补充", delta_classified: "增量已分类", delta_applied: "增量已应用", execution_paused_for_delta: "执行因增量暂停", execution_replanned: "执行计划已更新", execution_resumed: "执行已恢复" };

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

export function ExecutionTimeline({ status, timeline = {}, events = [], error, failureReason, pauseReason, recoverable = false, lastEvent, executionEngine = "Codex", onResume }) {
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
    <section className="sino-timeline sino-timeline--v2" aria-label="执行时间线" aria-live="polite">
      <header className="sino-timeline__header">
        <span className="sino-kicker">执行时间线 V2</span>
        {status && <strong data-status={status}>{STATUS_LABELS[status] || status}</strong>}
      </header>
      <ol>{STEPS.map((step, index) => {
        const startedAt = indexed[step.start]?.timestamp;
        const finishedAt = indexed[step.end]?.timestamp;
        const nextStarted = STEPS[index + 1] && indexed[STEPS[index + 1].start]?.timestamp;
        const isCurrent = Boolean(startedAt && !finishedAt && !nextStarted && running);
        const duration = formatDuration(startedAt, finishedAt || (isCurrent ? new Date(now).toISOString() : null));
        const className = [startedAt ? "is-active" : "", isCurrent ? "is-current" : "", finishedAt ? "is-complete" : ""].filter(Boolean).join(" ");
        const label = step.key === "codex" ? `${executionEngine} 执行中` : step.label;
        return <li key={step.key} className={className}><span>{index + 1}</span><div><strong>{label}</strong><time dateTime={startedAt || undefined}>{startedAt ? `${formatTime(startedAt)}${finishedAt && finishedAt !== startedAt ? ` – ${formatTime(finishedAt)}` : ""}` : "等待"}</time>{duration && <small>{duration}</small>}</div></li>;
      })}</ol>
      {events.length > 0 && <ul className="sino-timeline-events" aria-label="执行事件日志">{events.map((event) => <li key={event.event_id}><time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time><strong>{EVENT_LABELS[event.event_name] || event.event_name}</strong><span>{event.message}</span></li>)}</ul>}
      {status === "failed" && <div className="sino-execution-notice sino-execution-notice--failed" role="alert"><strong>失败</strong><p><b>原因：</b> {reason || "执行失败，但没有捕获到具体原因。"}</p><p><b>最后事件：</b> {lastObserved ? `${EVENT_LABELS[lastObserved.event_name] || lastObserved.event_name} · ${formatTime(lastObserved.timestamp)}` : "暂无"}</p></div>}
      {status === "paused" && <div className="sino-execution-notice sino-execution-notice--paused" role="status"><strong>已暂停</strong><p><b>原因：</b> {pauseReason || "后端已重启"}</p><p><b>最后事件：</b> {lastObserved ? `${EVENT_LABELS[lastObserved.event_name] || lastObserved.event_name} · ${formatTime(lastObserved.timestamp)}` : "暂无"}</p>{recoverable && onResume && <button className="sino-button" type="button" onClick={onResume}>恢复执行</button>}</div>}
    </section>
  );
}
