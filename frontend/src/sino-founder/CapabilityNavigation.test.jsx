// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityNavigation } from "./CapabilityNavigation.jsx";

afterEach(cleanup);

describe("Founder functional navigation", () => {
  it("contains only Capability Repository with no legacy top-level pages", () => {
    const navigate = vi.fn();
    render(<CapabilityNavigation active="builder" onNavigate={navigate} />);
    const items = screen.getAllByRole("button");
    expect(items.map((item) => item.textContent)).toEqual(["能力仓库"]);
    expect(screen.queryByRole("button", { name: "Founder", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "系统构建器" })).toBeNull();
    fireEvent.click(items[0]);
    expect(navigate).toHaveBeenCalledWith("capability-center");
  });

  it("leaves all functional tabs unselected on Founder home", () => {
    render(<CapabilityNavigation active="home" onNavigate={vi.fn()} />);
    expect(document.querySelectorAll(".sino-capability-nav .is-active")).toHaveLength(0);
  });
});
