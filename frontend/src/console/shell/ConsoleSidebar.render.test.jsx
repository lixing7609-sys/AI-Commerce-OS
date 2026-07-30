// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { useConsoleNav } from "../nav/useConsoleNav.js";
import { ConsoleSidebar } from "./ConsoleSidebar.jsx";

function Wrapper({ children }) {
  const nav = useConsoleNav();
  return <ConsoleNavContext.Provider value={nav}>{children}</ConsoleNavContext.Provider>;
}

// Founder Master Edition Charter §3 — exactly 5 top-level groups.
// "Founder Workspace" renders flat (renderCoreGroup); the other four
// are accordions (renderLabsCloudGroup, see LABS_CLOUD_GROUP_KEYS).
const CANONICAL_WORKSPACE_LABEL = "Founder 工作台";
const CANONICAL_ACCORDION_LABELS = ["AI 能力中心", "Operator 实验室", "Studio 实验室", "Cloud Center"];

function mockMatchMedia(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  // jsdom does not implement matchMedia at all — real browsers all do.
  // Default to a wide (desktop) viewport so tests exercise the manual
  // collapse toggle rather than the always-forced narrow-viewport path.
  mockMatchMedia(false);
});

afterEach(cleanup);

describe("Founder navigation shell (Founder Master Edition Charter §3)", () => {
  it("renders exactly the 5 canonical top-level group entries", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    for (const label of [CANONICAL_WORKSPACE_LABEL, ...CANONICAL_ACCORDION_LABELS]) {
      expect(screen.getByText(label), `missing canonical entry "${label}"`).toBeTruthy();
    }
  });

  it("does not restore the retired 真实经营 root entry", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    expect(screen.queryByText("真实经营")).toBeNull();
  });

  it("renders no literal Unicode glyph navigation icons (only the Icon/lucide wrapper)", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const iconSpans = document.querySelectorAll(".fdr-sidebar__item-icon");
    expect(iconSpans.length).toBeGreaterThan(0);
    iconSpans.forEach((el) => {
      expect(el.querySelector("svg"), "expected a Lucide <svg>, not a literal glyph").toBeTruthy();
      expect(el.textContent.trim()).toBe("");
    });
  });

  it("only Icon.jsx-rendered <svg class=\"fdr-icon\"> elements exist in the sidebar (single icon source)", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const svgs = document.querySelectorAll(".fdr-sidebar svg");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => expect(svg.classList.contains("fdr-icon")).toBe(true));
  });

  it("has no duplicate Founder navigation entry labels", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const labels = Array.from(document.querySelectorAll(".fdr-sidebar__item-label, .fdr-sidebar__group-label-text")).map((el) => el.textContent);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("marks the active module with fdr-sidebar__item--active", () => {
    window.history.pushState({}, "", "/?module=founderWorkbench");
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const activeItems = document.querySelectorAll(".fdr-sidebar__item--active");
    expect(activeItems.length).toBeGreaterThan(0);
  });

  it("Operator Lab and Studio Lab chevrons expand nested navigation without navigating away", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const studioChevron = screen.getByRole("button", { name: /展开Studio 实验室|收起Studio 实验室/ });
    const beforeUrl = window.location.search;
    fireEvent.click(studioChevron);
    expect(window.location.search).toBe(beforeUrl);
    expect(document.querySelectorAll(".fdr-sidebar__subitem").length).toBeGreaterThan(0);
  });

  it("clicking a Labs group label navigates to its default workspace", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const operatorLabel = Array.from(document.querySelectorAll(".fdr-sidebar__group-label")).find((el) => el.textContent.includes("Operator"));
    fireEvent.click(operatorLabel);
    expect(window.location.search).toContain("module=operatorLab");
  });

  it("selecting a nested Studio sub-item marks it active", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const studioChevron = screen.getByRole("button", { name: /展开Studio 实验室/ });
    fireEvent.click(studioChevron);
    const subitems = document.querySelectorAll(".fdr-sidebar__subitem");
    expect(subitems.length).toBeGreaterThan(0);
    fireEvent.click(subitems[0]);
    expect(subitems[0].className).toContain("fdr-sidebar__item--active");
  });

  it("collapse toggle switches to icon-rail mode and hides text labels", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const toggle = screen.getByRole("button", { name: "收起侧边栏" });
    fireEvent.click(toggle);
    expect(document.querySelector(".fdr-sidebar").getAttribute("data-collapsed")).toBe("true");
    expect(document.querySelector(".fdr-sidebar__identity-text")).toBeNull();
  });

  it("persists the collapsed preference to localStorage and restores it on remount", () => {
    const { unmount } = render(<Wrapper><ConsoleSidebar /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(window.localStorage.getItem("ai-commerce-os:founder:sidebar-collapsed")).toBe("1");
    unmount();

    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    expect(document.querySelector(".fdr-sidebar").getAttribute("data-collapsed")).toBe("true");
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeTruthy();
  });

  it("collapsed items with nested content expose a tooltip/flyout trigger with an accessible label", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    const operatorButton = screen.getByRole("button", { name: "Operator 实验室" });
    expect(operatorButton).toBeTruthy();
    fireEvent.click(operatorButton);
    expect(document.querySelector(".fdr-sidebar__flyout")).toBeTruthy();
  });

  it("Escape closes the collapsed-mode flyout", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    fireEvent.click(screen.getByRole("button", { name: "Operator 实验室" }));
    expect(document.querySelector(".fdr-sidebar__flyout")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".fdr-sidebar__flyout")).toBeNull();
  });

  it("forces collapsed icon-rail mode when the viewport matches the <1024px media query", () => {
    mockMatchMedia(true);
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    expect(document.querySelector(".fdr-sidebar").getAttribute("data-collapsed")).toBe("true");
    // nothing to manually toggle while the viewport forces the state
    expect(screen.queryByRole("button", { name: "展开侧边栏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "收起侧边栏" })).toBeNull();
  });

  it("every interactive nav row is a real <button> (native keyboard operability)", () => {
    render(<Wrapper><ConsoleSidebar /></Wrapper>);
    const rows = document.querySelectorAll(".fdr-sidebar__item, .fdr-sidebar__group-label, .fdr-sidebar__group-chevron, .fdr-sidebar__subitem");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((el) => expect(el.tagName).toBe("BUTTON"));
  });
});
