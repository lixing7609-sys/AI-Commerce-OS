// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SinoFounderShell } from "./SinoFounderShell.jsx";

const props = {
  active: "conversation",
  onNavigate: vi.fn(),
  sidebarProps: { conversations: [], projects: [], onNewConversation: vi.fn(), onSelectConversation: vi.fn() },
  main: <section aria-label="Conversation content">Main</section>,
  context: <section aria-label="Execution content">Execution</section>,
};

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => cleanup());

describe("formal Sino Founder workspace shell", () => {
  it("has exactly the navigation, conversation, and execution visual regions", () => {
    const { container } = render(<SinoFounderShell {...props} />);
    const workspace = container.querySelector(".founder-workspace");
    expect(workspace.dataset.workspaceStructure).toBe("navigation conversation execution");
    expect(workspace.children).toHaveLength(3);
    expect(screen.getByLabelText("Founder Navigation")).toBeTruthy();
    expect(screen.getByRole("main", { name: "Sino Natural Conversation" })).toBeTruthy();
    expect(screen.getByLabelText("执行中心")).toBeTruthy();
    expect(container.querySelector(".sino-founder-main")).toBeNull();
    expect(container.querySelector(".sino-founder-context")).toBeNull();
    expect(container.querySelector(".sino-founder-topbar")).toBeNull();
  });

  it("exposes the GPT-style navigation capabilities without a management topbar", () => {
    render(<SinoFounderShell {...props} />);
    expect(screen.getByTitle("新建讨论")).toBeTruthy();
    expect(screen.getByRole("button", { name: "库" })).toBeTruthy();
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByText("会话")).toBeTruthy();
    expect(screen.getByRole("button", { name: "⚙ 设置" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "能力管理主导航" })).toBeNull();
  });

  it("resizes only the execution center within its limits and persists the width", () => {
    render(<SinoFounderShell {...props} />);
    const handle = screen.getByRole("separator", { name: "调整执行中心宽度" });
    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 1300 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("280");
    expect(window.localStorage.getItem("sino-founder-execution-center-width")).toBe("280");

    fireEvent.pointerDown(handle, { clientX: 1000, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("640");
  });

  it("restores and resets the execution center width", () => {
    window.localStorage.setItem("sino-founder-execution-center-width", "440");
    render(<SinoFounderShell {...props} />);
    const handle = screen.getByRole("separator", { name: "调整执行中心宽度" });
    expect(handle.getAttribute("aria-valuenow")).toBe("440");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("336");
    fireEvent.click(screen.getByRole("button", { name: "重置执行中心宽度" }));
    expect(window.localStorage.getItem("sino-founder-execution-center-width")).toBe("336");
  });

  it("uses an independent asset-page layout outside the formal conversation workspace", () => {
    const { container } = render(<SinoFounderShell {...props} active="capability-center" main={<p>Library</p>} context={<p>Detail</p>} />);
    expect(container.querySelector(".founder-workspace")).toBeNull();
    expect(container.querySelector(".sino-founder-asset-route")).toBeTruthy();
    expect(screen.getByRole("main", { name: "Founder AI 功能页面" }).textContent).toContain("Library");
    expect(screen.getByLabelText("功能页详情").textContent).toContain("Detail");
  });

  it("keeps library and settings navigation wired", () => {
    const onNavigate = vi.fn();
    render(<SinoFounderShell {...props} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "库" }));
    fireEvent.click(screen.getByRole("button", { name: "⚙ 设置" }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, "capability-center");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "settings");
  });
});
