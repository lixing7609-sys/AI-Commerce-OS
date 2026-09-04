// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FounderActionCard } from "./FounderActionCard.jsx";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("FounderActionCard elapsed execution time", () => {
  it("uses backend timestamps and advances while running", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-18T00:02:31Z"));
    render(<FounderActionCard action={{ action_id: "image_model_probe_progress", title: "Image Model Probe", status_label: "Running", timing_started_at: "2026-08-18T00:00:00Z" }} readOnly />);
    expect(screen.getByLabelText("已耗时").textContent).toBe("00:02:31");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByLabelText("已耗时").textContent).toBe("00:02:32");
  });

  it("freezes elapsed time at the backend completed timestamp", () => {
    render(<FounderActionCard action={{ action_id: "done", title: "Image Model Probe", status_label: "Completed", timing_started_at: "2026-08-18T00:00:00Z", timing_completed_at: "2026-08-18T00:01:05Z" }} readOnly />);
    expect(screen.getByLabelText("已耗时").textContent).toBe("00:01:05");
  });

  it("renders canonical progress and Founder action semantics", () => {
    render(<FounderActionCard action={{ action_id: "canonical_execution_progress", title: "正在验证", description: "Founder 无需操作", progress_percent: 80, founder_action_required: false, timing_started_at: "2026-08-18T00:00:00Z", timing_completed_at: "2026-08-18T00:01:00Z" }} readOnly />);
    expect(screen.getByLabelText("任务进度 80%")).toBeTruthy();
    expect(screen.getByText("Founder：无需操作")).toBeTruthy();
    expect(screen.getByLabelText("已耗时").textContent).toBe("00:01:00");
  });

  it.each([
    ["正在实施", 35, "Founder：无需操作"],
    ["验证受阻", 80, "Founder：无需操作"],
    ["执行器异常 · 正在自愈", 35, "Founder：无需操作"],
    ["已完成", 100, "Founder：无需操作"],
    ["等待 Founder 授权", 35, "Founder：需要操作"],
  ])("projects %s from canonical backend progress", (title, percent, founderLabel) => {
    render(<FounderActionCard action={{ action_id: "canonical_execution_progress", title, description: "canonical", progress_percent: percent, founder_action_required: founderLabel.endsWith("需要操作") }} readOnly />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByLabelText(`任务进度 ${percent}%`)).toBeTruthy();
    expect(screen.getByText(founderLabel)).toBeTruthy();
    cleanup();
  });
});
