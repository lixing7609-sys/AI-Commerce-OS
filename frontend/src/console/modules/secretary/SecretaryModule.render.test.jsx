// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { useConsoleNav } from "../../nav/useConsoleNav.js";
import { SecretaryModule } from "./SecretaryModule.jsx";

function Wrapper({ children }) {
  const nav = useConsoleNav();
  return <ConsoleNavContext.Provider value={nav}>{children}</ConsoleNavContext.Provider>;
}

afterEach(cleanup);

/**
 * Founder工作台 Decision Home pilot — renders with real data wiring
 * (safeCall resolves to {connected:false} in jsdom since there is no
 * backend, which the component already handles gracefully; this is
 * exactly the "Not Connected" path the component is built to show,
 * not a test workaround).
 */
describe("Founder工作台 Decision Home pilot (Secretary tab)", () => {
  it("renders the AI executive statement and decision sections without throwing", async () => {
    render(<Wrapper><SecretaryModule /></Wrapper>);
    expect(screen.getByText("决策 — AI 建议")).toBeTruthy();
    expect(screen.getByText("需要我审批")).toBeTruthy();
    expect(screen.getByText("执行状态")).toBeTruthy();
    expect(screen.getByText("业务概况")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/系统运行中|系统待机|运行状态尚未接入/)).toBeTruthy());
  });

  it("does not render any AIRecommendation without a visible reason", () => {
    render(<Wrapper><SecretaryModule /></Wrapper>);
    const reasons = document.querySelectorAll(".fdr-ai-card__reason");
    expect(reasons.length).toBeGreaterThan(0);
    reasons.forEach((el) => expect(el.textContent.trim().length).toBeGreaterThan(0));
  });

  it("the approve/reject controls in the approval queue are keyboard-focusable", () => {
    render(<Wrapper><SecretaryModule /></Wrapper>);
    const approveButton = screen.getAllByRole("button", { name: "批准" })[0];
    expect(approveButton).toBeTruthy();
    approveButton.focus();
    expect(document.activeElement).toBe(approveButton);
  });

  it("clicking 批准 removes that item from the approval queue (inline decision, not a link-out)", () => {
    render(<Wrapper><SecretaryModule /></Wrapper>);
    const before = screen.getAllByRole("button", { name: "批准" }).length;
    fireEvent.click(screen.getAllByRole("button", { name: "批准" })[0]);
    const after = screen.queryAllByRole("button", { name: "批准" }).length;
    expect(after).toBe(before - 1);
  });
});
