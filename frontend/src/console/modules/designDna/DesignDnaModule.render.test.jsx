// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DesignDnaModule } from "./DesignDnaModule.jsx";

afterEach(cleanup);

describe("Design DNA showcase route", () => {
  it("renders without throwing and shows the master title", () => {
    render(<DesignDnaModule />);
    expect(screen.getByText("AI Commerce OS Design DNA v1.0")).toBeTruthy();
  });

  it("shows all four section tabs", () => {
    render(<DesignDnaModule />);
    for (const label of ["Foundations", "Components", "AI Interaction Language", "Product Examples"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("switching to the AI Interaction Language tab shows the six-stage loop", () => {
    render(<DesignDnaModule />);
    fireEvent.click(screen.getByRole("button", { name: "AI Interaction Language" }));
    expect(screen.getByText("Observe → Recommend")).toBeTruthy();
    expect(screen.getByText("Explain")).toBeTruthy();
    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Execute")).toBeTruthy();
    expect(screen.getByText("Learn")).toBeTruthy();
  });
});
