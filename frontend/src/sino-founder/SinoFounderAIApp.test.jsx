// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";

vi.mock("../services/founderAiApi.js", () => ({
  createFounderConversation: vi.fn(), analyzeWithSinoBrain: vi.fn(),
  createFounderExecution: vi.fn(), approveFounderExecution: vi.fn(), executeFounderExecution: vi.fn(),
}));

describe("SinoFounderAIApp", () => {
  it("renders the independent application workspace", () => {
    render(<SinoFounderAIApp />);
    expect(screen.getByText("Sino", { selector: ".sino-brand div" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "把目标变成可控的执行" })).toBeTruthy();
    expect(screen.getByTestId("goal-analysis-card")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sino Founder AI" })).toBeTruthy();
  });
});
