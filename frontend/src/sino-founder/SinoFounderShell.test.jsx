// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SinoFounderShell } from "./SinoFounderShell.jsx";

const props = { active: "home", onNavigate: vi.fn(), sidebarProps: { conversations: [], onNewConversation: vi.fn(), onSelectConversation: vi.fn() }, main: <p>Main</p>, context: <p>Context</p> };

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => cleanup());

describe("SinoFounderShell resizable dividers", () => {
  it("keeps the Sidebar brand free of workspace status", () => {
    render(<SinoFounderShell {...props} />);
    expect(screen.queryByLabelText("Sino 正常")).toBeNull();
    expect(screen.queryByLabelText("Sino 服务异常")).toBeNull();
    expect(screen.queryByText("Sino 在线")).toBeNull();
  });
  it("resizes both panes within min/max constraints and persists widths", () => {
    render(<SinoFounderShell {...props} />);
    const left = screen.getByRole("separator", { name: "调整左侧栏宽度" });
    fireEvent.mouseDown(left, { clientX: 244 });
    fireEvent.mouseMove(window, { clientX: 500 });
    fireEvent.mouseUp(window);
    expect(left.getAttribute("aria-valuenow")).toBe("320");
    expect(window.localStorage.getItem("sino-founder-sidebar-width")).toBe("320");
    fireEvent.mouseDown(left, { clientX: 320 });
    fireEvent.mouseMove(window, { clientX: 0 });
    fireEvent.mouseUp(window);
    expect(left.getAttribute("aria-valuenow")).toBe("180");

    const right = screen.getByRole("separator", { name: "调整右侧上下文宽度" });
    fireEvent.mouseDown(right, { clientX: 700 });
    fireEvent.mouseMove(window, { clientX: 1000 });
    fireEvent.mouseUp(window);
    expect(right.getAttribute("aria-valuenow")).toBe("260");
    expect(window.localStorage.getItem("sino-founder-context-width")).toBe("260");
    fireEvent.mouseDown(right, { clientX: 700 });
    fireEvent.mouseMove(window, { clientX: 0 });
    fireEvent.mouseUp(window);
    expect(right.getAttribute("aria-valuenow")).toBe("520");
  });

  it("restores persisted widths and resets them on double click", () => {
    window.localStorage.setItem("sino-founder-sidebar-width", "300");
    window.localStorage.setItem("sino-founder-context-width", "440");
    render(<SinoFounderShell {...props} />);
    const left = screen.getByRole("separator", { name: "调整左侧栏宽度" });
    const right = screen.getByRole("separator", { name: "调整右侧上下文宽度" });
    expect(left.getAttribute("aria-valuenow")).toBe("300");
    expect(right.getAttribute("aria-valuenow")).toBe("440");
    fireEvent.doubleClick(left);
    fireEvent.doubleClick(right);
    expect(left.getAttribute("aria-valuenow")).toBe("244");
    expect(right.getAttribute("aria-valuenow")).toBe("320");
  });

  it("keeps resized widths when the active view changes", () => {
    const { rerender } = render(<SinoFounderShell {...props} />);
    const left = screen.getByRole("separator", { name: "调整左侧栏宽度" });
    fireEvent.mouseDown(left, { clientX: 244 });
    fireEvent.mouseMove(window, { clientX: 280 });
    fireEvent.mouseUp(window);
    rerender(<SinoFounderShell {...props} active="assets" main={<p>Assets</p>} />);
    expect(screen.getByRole("separator", { name: "调整左侧栏宽度" }).getAttribute("aria-valuenow")).toBe("280");
    expect(document.querySelector(".sino-founder-shell").style.getPropertyValue("--sidebar-width")).toBe("280px");
  });

  it("resets the shared workspace scroll position when the active view changes", () => {
    const { rerender } = render(<SinoFounderShell {...props} main={<div style={{ height: 2000 }}>Long</div>} />);
    const main = screen.getByRole("main", { name: "Founder AI 工作区内容" });
    main.scrollTop = 900;
    rerender(<SinoFounderShell {...props} active="execution" main={<p>Empty execution</p>} />);
    expect(main.scrollTop).toBe(0);
  });

  it("uses the S logo as the persistent collapse toggle and retains core icon actions", () => {
    const { unmount } = render(<SinoFounderShell {...props} />);
    const logo = document.querySelector(".sino-brand-mark");
    fireEvent.click(screen.getByTitle("Sino Founder AI 首页"));
    expect(props.onNavigate).toHaveBeenCalledWith("home");
    expect(document.querySelector(".sino-sidebar").classList.contains("sino-sidebar--collapsed")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(document.querySelector(".sino-sidebar").classList.contains("sino-sidebar--collapsed")).toBe(true);
    expect(document.querySelector(".sino-brand-mark")).toBe(logo);
    expect(document.querySelector(".sino-brand-mark").textContent).toBe("S");
    expect(document.querySelector(".sino-brand div").textContent).toBe("SinoFounder AI");
    expect(screen.getByTitle("新建讨论")).toBeTruthy();
    expect(screen.getByRole("button", { name: "项目" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "会话" })).toBeTruthy();
    expect(window.localStorage.getItem("sino-founder-sidebar-collapsed")).toBe("true");
    fireEvent.click(screen.getByTitle("Sino Founder AI 首页"));
    expect(props.onNavigate).toHaveBeenLastCalledWith("home");
    expect(document.querySelector(".sino-sidebar").classList.contains("sino-sidebar--collapsed")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "项目" }));
    expect(document.querySelector(".sino-sidebar").classList.contains("sino-sidebar--collapsed")).toBe(false);
    expect(screen.getByRole("button", { name: "项目⌄" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    fireEvent.click(screen.getByRole("button", { name: "会话" }));
    expect(screen.getByRole("button", { name: "会话⌄" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    unmount();
    render(<SinoFounderShell {...props} />);
    expect(document.querySelector(".sino-sidebar").classList.contains("sino-sidebar--collapsed")).toBe(true);
    const collapsedBrand = screen.getByTitle("Sino Founder AI 首页");
    expect(collapsedBrand.querySelector(".sino-brand-mark").textContent).toBe("S");
    expect(document.querySelector(".sino-sidebar-toggle--expand")).toBeNull();
    fireEvent.mouseEnter(collapsedBrand);
    expect(collapsedBrand.title).toBe("展开侧边栏");
    expect(collapsedBrand.querySelector(".sino-brand-mark--expand svg")).toBeTruthy();
    expect(collapsedBrand.querySelector(".sino-brand-mark").textContent).toBe("");
    fireEvent.mouseLeave(collapsedBrand);
    expect(collapsedBrand.querySelector(".sino-brand-mark").textContent).toBe("S");
    fireEvent.mouseEnter(collapsedBrand);
    fireEvent.click(collapsedBrand);
    expect(window.localStorage.getItem("sino-founder-sidebar-collapsed")).toBe("false");
    expect(screen.getByText("Sino")).toBeTruthy();
  });
});
