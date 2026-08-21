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
  it("adds one continuous workspace top bar above conversation and execution", () => {
    const { container } = render(<SinoFounderShell {...props} />);
    const workspace = container.querySelector(".founder-workspace");
    expect(workspace.dataset.workspaceStructure).toBe("navigation conversation execution");
    expect(workspace.children).toHaveLength(4);
    expect(screen.getByLabelText("Founder Navigation")).toBeTruthy();
    expect(screen.getByRole("banner", { name: "Workspace top bar" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "Sino Natural Conversation" })).toBeTruthy();
    expect(screen.getByLabelText("执行中心")).toBeTruthy();
    expect(container.querySelector(".sino-founder-main")).toBeNull();
    expect(container.querySelector(".sino-founder-context")).toBeNull();
    expect(container.querySelector(".sino-founder-topbar")).toBeNull();
  });

  it("keeps only the model selector inside the workspace top bar", () => {
    render(<SinoFounderShell {...props} conversationSelector={<button type="button">Sino AI</button>} />);
    const topbar = screen.getByRole("banner", { name: "Workspace top bar" });
    expect(topbar.querySelector("button").textContent).toBe("Sino AI");
    expect(topbar.querySelector('[aria-label="重置执行中心宽度"]')).toBeNull();
  });

  it("exposes the GPT-style navigation capabilities without a management topbar", () => {
    const { container } = render(<SinoFounderShell {...props} />);
    expect(screen.getByTitle("新建讨论")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sino AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "库" })).toBeTruthy();
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByText("最近")).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "能力管理主导航" })).toBeNull();
    const icons = [...container.querySelectorAll(".sino-sidebar-toggle svg, .sino-new-conversation svg")];
    expect(icons).toHaveLength(2);
    expect(icons.every((icon) => icon.getAttribute("width") === "18" && icon.getAttribute("stroke-width") === "1.7")).toBe(true);
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

  it("restores and resets the execution center width from its resize handle", () => {
    window.localStorage.setItem("sino-founder-execution-center-width", "440");
    render(<SinoFounderShell {...props} />);
    const handle = screen.getByRole("separator", { name: "调整执行中心宽度" });
    expect(handle.getAttribute("aria-valuenow")).toBe("440");
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("336");
    expect(window.localStorage.getItem("sino-founder-execution-center-width")).toBe("336");
  });

  it("fully removes the navigation track when collapsed and exposes only top-left controls", () => {
    const onNewConversation = vi.fn();
    const { container, unmount } = render(<SinoFounderShell {...props} sidebarProps={{ ...props.sidebarProps, onNewConversation }} conversationSelector={<button>Sino AI</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    const workspace = container.querySelector(".founder-workspace");
    expect(workspace.classList.contains("is-nav-collapsed")).toBe(true);
    expect(workspace.dataset.workspaceStructure).toBe("conversation execution");
    expect(screen.queryByLabelText("Founder Navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建讨论" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "库" })).toBeNull();
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
    expect(workspace.children).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "新建讨论" }));
    expect(onNewConversation).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Founder Navigation")).toBeNull();
    unmount();
    render(<SinoFounderShell {...props} />);
    expect(screen.queryByLabelText("Founder Navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeTruthy();
  });

  it("resizes the expanded navigation within limits, persists it, and restores it after collapse", () => {
    const { container } = render(<SinoFounderShell {...props} />);
    const handle = screen.getByRole("separator", { name: "调整左侧导航宽度" });
    fireEvent.pointerDown(handle, { clientX: 244, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 344 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("344");
    expect(window.localStorage.getItem("sino-founder-navigation-width")).toBe("344");
    fireEvent.pointerDown(handle, { clientX: 344, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 0 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("210");
    fireEvent.pointerDown(handle, { clientX: 210, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 900 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("480");
    fireEvent.pointerDown(handle, { clientX: 480, pointerId: 4 });
    fireEvent.pointerMove(window, { clientX: 310 });
    fireEvent.pointerUp(window);
    expect(handle.getAttribute("aria-valuenow")).toBe("310");
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(container.querySelector(".founder-navigation-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByRole("separator", { name: "调整左侧导航宽度" }).getAttribute("aria-valuenow")).toBe("310");
  });

  it("uses an independent asset-page layout outside the formal conversation workspace", () => {
    const { container } = render(<SinoFounderShell {...props} active="capability-center" main={<p>Library</p>} context={<p>Detail</p>} />);
    expect(container.querySelector(".founder-workspace")).toBeNull();
    expect(container.querySelector(".sino-founder-asset-route")).toBeTruthy();
    expect(screen.getByRole("main", { name: "Founder AI 功能页面" }).textContent).toContain("Library");
    expect(screen.getByLabelText("功能页详情").textContent).toContain("Detail");
  });

  it("removes the navigation track from Settings while keeping its configuration inspector", () => {
    const { container } = render(<SinoFounderShell {...props} active="settings" main={<section>设置</section>} context={<section aria-label="系统配置面板">配置</section>} />);
    expect(container.querySelector(".sino-founder-asset-route.is-settings")).toBeTruthy();
    expect(screen.queryByLabelText("Founder Navigation")).toBeNull();
    expect(screen.getByRole("main", { name: "Founder AI 功能页面" }).textContent).toContain("设置");
    expect(screen.getByLabelText("功能页详情").textContent).toContain("配置");
  });

  it("expands Library across the execution column without a model selector or Composer", () => {
    const { container } = render(<SinoFounderShell {...props} active="library" main={<section aria-label="库工作区">Library cards</section>} />);
    expect(container.querySelector(".founder-workspace.is-library")).toBeTruthy();
    expect(screen.getByRole("main", { name: "Sino Library Workspace" })).toBeTruthy();
    expect(screen.queryByLabelText("执行中心")).toBeNull();
    expect(screen.queryByRole("button", { name: /Sino AI · 选择模型/ })).toBeNull();
    expect(container.querySelector(".sino-global-composer")).toBeNull();
  });

  it("keeps library and settings navigation wired", () => {
    const onNavigate = vi.fn();
    render(<SinoFounderShell {...props} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "库" }));
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, "library");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "settings");
  });
});
