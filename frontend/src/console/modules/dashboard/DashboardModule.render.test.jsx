// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeAll } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { useConsoleNav } from "../../nav/useConsoleNav.js";
import { DashboardModule } from "./DashboardModule.jsx";

// jsdom has no ResizeObserver; Recharts' ResponsiveContainer needs one.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function Wrapper({ children }) {
  const nav = useConsoleNav();
  return <ConsoleNavContext.Provider value={nav}>{children}</ConsoleNavContext.Provider>;
}

afterEach(cleanup);

describe("Founder工作台 detail pilot (Dashboard tab)", () => {
  it("renders a single primary Metric, not a grid of equal-weight tiles", () => {
    render(<Wrapper><DashboardModule /></Wrapper>);
    const primaryMetrics = document.querySelectorAll(".fdr-metric--primary");
    expect(primaryMetrics.length).toBe(1);
  });

  it("range toggle is a SegmentedControl (radiogroup), not a raw button loop", () => {
    render(<Wrapper><DashboardModule /></Wrapper>);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("secondary detail sections render as KeyValueList rows, not StatCard tiles", () => {
    render(<Wrapper><DashboardModule /></Wrapper>);
    expect(document.querySelectorAll(".fdr-kv-row").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".fdr-stat-card").length).toBe(0);
  });
});
