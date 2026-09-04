// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionTimeline } from "./ExecutionTimeline.jsx";

afterEach(() => cleanup());

const events = [
  ["approved", "2026-08-11T12:30:00Z", "approved"],
  ["queued", "2026-08-11T12:30:01Z", "queued"],
  ["worker_started", "2026-08-11T12:31:00Z", "executing"],
  ["codex_started", "2026-08-11T12:31:10Z", "executing"],
  ["codex_finished", "2026-08-11T12:35:22Z", "executing"],
  ["testing_started", "2026-08-11T12:35:23Z", "testing"],
  ["testing_finished", "2026-08-11T12:35:33Z", "testing"],
  ["artifact_saved", "2026-08-11T12:35:34Z", "testing"],
  ["memory_saved", "2026-08-11T12:35:35Z", "testing"],
  ["completed", "2026-08-11T12:35:36Z", "completed"],
].map(([event_name, timestamp, status], index) => ({ event_id: `event-${index}`, execution_id: "execution-1", event_name, timestamp, status, message: event_name, metadata: {} }));

describe("ExecutionTimeline V2", () => {
  it("renders all observable phases with time ranges and duration", () => {
    render(<ExecutionTimeline status="completed" events={events} />);

    const phaseText = document.querySelector(".sino-timeline--v2 > ol").textContent;
    for (const label of ["已审批", "已排队", "Worker 已启动", "Codex 执行中", "测试", "成果", "记忆", "已完成"]) expect(phaseText).toContain(label);
    expect(screen.getByText("4m 12s")).toBeTruthy();
    const codexTime = document.querySelector('time[datetime="2026-08-11T12:31:10Z"]');
    expect(codexTime).toBeTruthy();
    expect(codexTime.textContent).toMatch(/31:10.*35:22/);
  });

  it("shows failure reason and last successful event", () => {
    const lastEvent = events.find((event) => event.event_name === "codex_finished");
    render(<ExecutionTimeline status="failed" events={[...events.slice(0, 5), { ...events[5], event_name: "failed", status: "failed" }]} failureReason="Codex exited with code 2" lastEvent={lastEvent} />);

    expect(screen.getByText("Codex exited with code 2")).toBeTruthy();
    expect(screen.getAllByText(/Codex 已完成/).length).toBeGreaterThan(0);
  });

  it("shows backend restart pause and resumes recoverable work", () => {
    const onResume = vi.fn();
    const restart = { event_id: "restart", execution_id: "execution-1", event_name: "backend_restarted", timestamp: "2026-08-11T12:32:00Z", status: "paused", message: "Backend restarted", metadata: {} };
    render(<ExecutionTimeline status="paused" events={[...events.slice(0, 4), restart]} pauseReason="Backend restarted" recoverable lastEvent={restart} onResume={onResume} />);

    expect(screen.getByText("已暂停", { selector: ".sino-execution-notice strong" })).toBeTruthy();
    expect(screen.getAllByText(/Backend restarted/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "恢复执行" }));
    expect(onResume).toHaveBeenCalledOnce();
  });
});
