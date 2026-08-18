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
});
