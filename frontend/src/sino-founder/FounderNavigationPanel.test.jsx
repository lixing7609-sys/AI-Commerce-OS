// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FounderNavigationPanel, stableConversationOrder } from "./FounderNavigationPanel.jsx";
import { bindFounderConversationProject, createFounderProject, deleteFounderProject, updateFounderProject } from "../services/founderAiApi.js";


vi.mock("../services/founderAiApi.js", () => ({ bindFounderConversationProject: vi.fn(), createFounderProject: vi.fn(), deleteFounderProject: vi.fn(), updateFounderProject: vi.fn() }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Founder sidebar information architecture", () => {
  it("uses one fixed Settings entry and navigates to the existing settings view", () => {
    const onNavigate = vi.fn();
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={onNavigate} />);
    expect(screen.queryByText("AI Commerce OS")).toBeNull();
    expect(screen.queryByText("Founder AI Secretary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("collapses into a persisted icon rail and expands from projects or conversations", () => {
    window.localStorage.clear();
    const onNewConversation = vi.fn(); const onNavigate = vi.fn();
    const { unmount } = render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={onNavigate} onNewConversation={onNewConversation} />);
    expect(screen.getByText("新建讨论")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    const panel = screen.getByLabelText("Founder Navigation");
    expect(panel.classList.contains("is-collapsed")).toBe(true);
    expect(window.localStorage.getItem("sino-founder-sidebar-collapsed")).toBe("true");
    expect(screen.getByTitle("新建讨论")).toBeTruthy();
    expect(screen.getByTitle("库")).toBeTruthy();
    expect(screen.getByTitle("项目")).toBeTruthy();
    expect(screen.getByTitle("会话")).toBeTruthy();
    expect(screen.getByTitle("设置")).toBeTruthy();
    fireEvent.click(screen.getByTitle("新建讨论"));
    expect(onNewConversation).toHaveBeenCalledOnce();
    expect(panel.classList.contains("is-collapsed")).toBe(true);
    fireEvent.click(screen.getByTitle("项目"));
    expect(panel.classList.contains("is-collapsed")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    fireEvent.click(screen.getByTitle("会话"));
    expect(panel.classList.contains("is-collapsed")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    unmount();
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={onNavigate} onNewConversation={onNewConversation} />);
    expect(screen.getByLabelText("Founder Navigation").classList.contains("is-collapsed")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByText("新建讨论")).toBeTruthy();
  });

  it("uses governance metadata rather than titles to hide non-Founder runs", () => {
    const now = Date.now();
    render(<FounderNavigationPanel
      conversations={[
        { id: "real", title: "AI短剧生产系统", updatedAt: now },
        { id: "test", title: "Runtime probe", updatedAt: now, conversation_type: "VERIFICATION_RUN", visibility: "hidden_from_conversation_list", created_by: "VERIFICATION" },
      ]}
      projects={[{ id: "project-1", name: "验证AI短剧生产的可行性，跑通从创意到成片的全流程，为后续商业化或产品化打基础。 Project", description: "验证 AI 短剧生产可行性" }]}
    />);
    expect(screen.queryByText("Runtime probe")).toBeNull();
    expect(document.querySelectorAll(".sino-sidebar__scroll-region .sino-conversation-item__open b")).toHaveLength(1);
    expect(document.querySelector(".sino-project-item .sino-conversation-list")).toBeNull();
  });

  it("renders one updated-at ordered list with time metadata and no groups", () => {
    const now = Date.now();
    render(<FounderNavigationPanel conversations={[{ id: "old", title: "旧工作", updatedAt: now - 86400000 * 8 }, { id: "latest", title: "最新工作", updatedAt: now }]} />);
    const titles = [...document.querySelectorAll(".sino-conversation-item__open b")].map((item) => item.textContent);
    expect(titles).toEqual(["最新工作", "旧工作"]);
    expect(screen.queryByText("最近 7 天")).toBeNull();
    expect(document.querySelectorAll(".sino-conversation-group")).toHaveLength(0);
  });

  it("uses created time and conversation id as deterministic tie breakers", () => {
    const timestamp = "2026-08-18T10:27:00.000000+08:00";
    const conversations = [
      { id: "conv-a", title: "A", updated_at: timestamp, created_at: timestamp },
      { id: "conv-c", title: "C", updated_at: timestamp, created_at: timestamp },
      { id: "conv-b", title: "B", updated_at: timestamp, created_at: timestamp },
    ];
    expect(stableConversationOrder(conversations).map((item) => item.id)).toEqual(["conv-c", "conv-b", "conv-a"]);
    expect(stableConversationOrder(conversations).map((item) => item.id)).toEqual(["conv-c", "conv-b", "conv-a"]);
    render(<FounderNavigationPanel conversations={conversations} projects={[]} />);
    expect([...document.querySelectorAll(".sino-conversation-item")].map((item) => item.dataset.conversationId)).toEqual(["conv-c", "conv-b", "conv-a"]);
  });

  it("files project Conversations under the Project and keeps only unassigned Founder Conversations global", () => {
    const conversations = [
      { id: "project-work", project_id: "project-1", title: "Project 内工作", updatedAt: 20 },
      { id: "general-work", project_id: null, title: "普通工作", updatedAt: 10 },
    ];
    const projects = [{ id: "project-1", name: "AI 电商" }];
    const { rerender } = render(<FounderNavigationPanel conversations={conversations} projects={projects} onSelectConversation={vi.fn()} />);

    expect(document.querySelectorAll(".sino-project-heading")).toHaveLength(1);
    expect(document.querySelectorAll(".sino-sidebar__conversation-title")).toHaveLength(1);
    const headingLabels = [...document.querySelectorAll(".sino-sidebar-primary-title__label")];
    expect(headingLabels.map((label) => label.textContent)).toEqual(["项目", "会话"]);
    expect(headingLabels.every((label) => label.className === headingLabels[0].className)).toBe(true);
    expect(document.querySelector(".sino-project-item .sino-conversation-list")).toBeNull();
    const section = document.querySelector(".sino-sidebar__conversation-section");
    const title = section.querySelector(":scope > .sino-sidebar__conversation-title");
    const list = section.querySelector(".sino-sidebar__scroll-region .sino-conversation-list");
    expect([...section.children]).toEqual([title, section.querySelector(":scope > .sino-sidebar__scroll-region")]);
    expect(title.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...list.querySelectorAll("b")].map((item) => item.textContent)).toEqual(["普通工作"]);

    rerender(<FounderNavigationPanel conversations={conversations} projects={projects} activeProjectId="project-1" onSelectConversation={vi.fn()} />);
    expect([...document.querySelectorAll(".sino-sidebar__scroll-region .sino-conversation-item__open b")].map((item) => item.textContent)).toEqual(["普通工作"]);
    expect([...document.querySelectorAll(".sino-project-item .sino-conversation-item__open b")].map((item) => item.textContent)).toEqual(["Project 内工作"]);
    expect(document.querySelectorAll(".sino-sidebar__conversation-title")).toHaveLength(1);
    expect(document.querySelector('.sino-collapsed-navigation [aria-label="会话"]')).toBeNull();
  });

  it("keeps the global Conversation list complete when selecting an empty Project", () => {
    const conversations = [
      { id: "latest", title: "最近讨论", updatedAt: 20 },
      { id: "older", title: "较早讨论", updatedAt: 10 },
    ];
    const projects = [{ id: "studio", name: "Sino Studio AI" }];
    const { rerender } = render(<FounderNavigationPanel conversations={conversations} projects={projects} onSelectConversation={vi.fn()} />);
    const titles = () => [...document.querySelectorAll(".sino-sidebar__scroll-region .sino-conversation-item__open b")].map((item) => item.textContent);

    expect(titles()).toEqual(["最近讨论", "较早讨论"]);
    rerender(<FounderNavigationPanel conversations={conversations} projects={projects} activeProjectId="studio" onSelectConversation={vi.fn()} />);
    expect(titles()).toEqual(["最近讨论", "较早讨论"]);
  });

  it("keeps the active conversation id selected while filing and unfiling", async () => {
    bindFounderConversationProject.mockImplementation(async (id, projectId) => ({ id, project_id: projectId, conversation_type: projectId ? "PROJECT_CONVERSATION" : "USER_CONVERSATION" }));
    const onSelectConversation = vi.fn();
    const conversation = { id: "conv-active", title: "Active filing", conversation_type: "USER_CONVERSATION", project_id: null, updatedAt: 20 };
    const projects = [{ id: "project-a", name: "Project A" }];
    const { rerender } = render(<FounderNavigationPanel conversations={[conversation]} projects={projects} activeConversationId="conv-active" onSelectConversation={onSelectConversation} />);
    fireEvent.click(screen.getByRole("button", { name: /会话操作 Active filing/ }));
    fireEvent.click(screen.getByRole("button", { name: "Project A" }));
    await waitFor(() => expect(bindFounderConversationProject).toHaveBeenCalledWith("conv-active", "project-a"));
    expect(onSelectConversation).toHaveBeenCalledWith("conv-active");

    rerender(<FounderNavigationPanel conversations={[{ ...conversation, project_id: "project-a", conversation_type: "PROJECT_CONVERSATION" }]} projects={projects} activeProjectId="project-a" activeConversationId="conv-active" onSelectConversation={onSelectConversation} />);
    expect(document.querySelector('.sino-project-item .sino-conversation-item[data-conversation-id="conv-active"].is-active')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /会话操作 Active filing/ }));
    fireEvent.click(screen.getByRole("button", { name: "移出 Project" }));
    await waitFor(() => expect(bindFounderConversationProject).toHaveBeenCalledWith("conv-active", null));
  });

  it("never renders governed System, Verification, or ephemeral records", () => {
    render(<FounderNavigationPanel conversations={[
      { id: "user", title: "Founder", conversation_type: "USER_CONVERSATION", visibility: "conversation_list", lifecycle_status: "active" },
      { id: "system", title: "System", conversation_type: "SYSTEM_RUN", visibility: "hidden_from_conversation_list", lifecycle_status: "active" },
      { id: "verify", title: "Verify", conversation_type: "VERIFICATION_RUN", visibility: "hidden_from_conversation_list", lifecycle_status: "active" },
      { id: "empty", title: "Empty", conversation_type: "TEMPORARY_CONVERSATION", visibility: "hidden_from_conversation_list", lifecycle_status: "ephemeral" },
    ]} projects={[]} />);
    expect(screen.getByText("Founder")).toBeTruthy();
    expect(screen.queryByText("System")).toBeNull();
    expect(screen.queryByText("Verify")).toBeNull();
    expect(screen.queryByText("Empty")).toBeNull();
  });

  it("renders a System Project beneath its persisted parent Project", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[{ id: "parent", name: "AI Commerce OS" }, { id: "child", name: "Intelligence Evolution Layer", parent_project_id: "parent", project_type: "system_project" }]} activeProjectId="parent" onSelectProject={vi.fn()} />);
    const items = [...document.querySelectorAll(".sino-project-item")];
    expect(items.map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("AI Commerce OS"), expect.stringContaining("Intelligence Evolution Layer")]));
    expect(items[1].classList.contains("is-child")).toBe(true);
    expect(items[1].style.marginLeft).toBe("14px");
  });

  it("collapses and expands only the selected parent project subtree", async () => {
    const projects = [{ id: "commerce", name: "AI Commerce OS" }, { id: "intel", name: "Intelligence Evolution Layer", parent_project_id: "commerce" }, { id: "cloud", name: "AI Commerce OS Cloud", parent_project_id: "commerce" }, { id: "operator", name: "Sino Operator AI" }];
    render(<FounderNavigationPanel conversations={[]} projects={projects} activeProjectId="commerce" onSelectProject={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy());
    const parent = document.querySelector('.sino-project-item__open[title="AI Commerce OS"]');
    fireEvent.click(parent);
    expect(screen.queryByText("Intelligence Evolution Layer")).toBeNull();
    expect(screen.queryByText("AI Commerce OS Cloud")).toBeNull();
    expect(screen.getByText("Sino Operator AI")).toBeTruthy();
    fireEvent.click(parent);
    expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy();
    expect(screen.getByText("AI Commerce OS Cloud")).toBeTruthy();
    expect(screen.getByText("Sino Operator AI")).toBeTruthy();
  });

  it("removes the Projects heading chevron, preserves plus, and keeps section toggling", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[{ id: "commerce", name: "AI Commerce OS" }]} />);
    const heading = document.querySelector(".sino-project-heading");
    const toggle = heading.querySelector("button:first-child");
    expect(toggle.querySelector("i")).toBeNull();
    expect(screen.getByRole("button", { name: "新建 Project" })).toBeTruthy();
    expect(document.querySelector(".sino-project-list")).toBeTruthy();
    fireEvent.click(toggle);
    expect(document.querySelector(".sino-project-list")).toBeNull();
    fireEvent.click(toggle);
    expect(document.querySelector(".sino-project-list")).toBeTruthy();
  });

  it("creates, renames, expands and moves Conversations through the Project workspace", async () => {
    createFounderProject.mockResolvedValue({ id: "project-commerce", name: "AI电商", status: "active", updated_at: new Date().toISOString() });
    updateFounderProject.mockResolvedValue({ id: "project-commerce", name: "AI电商系统", status: "active" });
    bindFounderConversationProject.mockResolvedValue({ id: "conv-1", project_id: "project-commerce" });
    const onSelectProject = vi.fn();
    function Harness() {
      const [projects, setProjects] = useState([]);
      const refresh = async () => setProjects([{ id: "project-commerce", name: updateFounderProject.mock.calls.length ? "AI电商系统" : "AI电商", status: "active" }]);
      return <FounderNavigationPanel conversations={[{ id: "conv-1", title: "商品讨论", updatedAt: Date.now() }]} projects={projects} onProjectsChanged={refresh} onSelectProject={onSelectProject} onSelectConversation={vi.fn()} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "新建 Project" }));
    fireEvent.change(screen.getByLabelText("Project 名称"), { target: { value: "AI电商" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(createFounderProject).toHaveBeenCalledWith({ name: "AI电商", description: null }));
    expect(onSelectProject).toHaveBeenCalledWith("project-commerce");
    fireEvent.click(screen.getByRole("button", { name: /Project 操作 AI电商/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("重命名 AI电商"), { target: { value: "AI电商系统" } });
    fireEvent.keyDown(screen.getByLabelText("重命名 AI电商"), { key: "Enter" });
    await waitFor(() => expect(updateFounderProject).toHaveBeenCalledWith("project-commerce", { name: "AI电商系统" }));
    fireEvent.click(screen.getByRole("button", { name: /会话操作 商品讨论/ }));
    fireEvent.click(screen.getByRole("button", { name: "AI电商系统" }));
    await waitFor(() => expect(bindFounderConversationProject).toHaveBeenCalledWith("conv-1", "project-commerce"));
  });

  it("drops a deleted Project from the authoritative list and keeps its Conversations unassigned", () => {
    const conversation = { id: "conv-1", project_id: "deleted-project", title: "仍然保留的讨论", updatedAt: Date.now() };
    const { rerender } = render(<FounderNavigationPanel conversations={[conversation]} projects={[{ id: "deleted-project", name: "已删除 Demo Project" }]} activeProjectId="deleted-project" onSelectConversation={vi.fn()} />);
    expect(screen.getByText("已删除 Demo Project")).toBeTruthy();
    rerender(<FounderNavigationPanel conversations={[conversation]} projects={[]} activeProjectId={null} onSelectConversation={vi.fn()} />);
    expect(screen.queryByText("已删除 Demo Project")).toBeNull();
    expect(screen.getByText("仍然保留的讨论")).toBeTruthy();
    expect(document.querySelector(".sino-project-list")?.children.length || 0).toBe(0);
  });

  it("returns Home and refreshes authoritative state immediately after deleting the active Project", async () => {
    deleteFounderProject.mockResolvedValue({ deleted: true });
    const onNavigate = vi.fn();
    const onProjectsChanged = vi.fn().mockResolvedValue([]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FounderNavigationPanel projects={[{ id: "project-delete", name: "待删除 Project" }]} activeProjectId="project-delete" conversations={[]} onNavigate={onNavigate} onProjectsChanged={onProjectsChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Project 操作 待删除 Project" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteFounderProject).toHaveBeenCalledWith("project-delete"));
    expect(onNavigate).toHaveBeenCalledWith("home");
    expect(onProjectsChanged).toHaveBeenCalledTimes(1);
  });
});
