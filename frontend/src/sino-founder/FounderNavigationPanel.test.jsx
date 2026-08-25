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

  it("keeps a fixed Sino AI product matrix entry and expands all product destinations", () => {
    const onNavigate = vi.fn();
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={onNavigate} />);
    const trigger = screen.getByRole("button", { name: "Sino AI 产品矩阵" });
    expect(document.querySelector(".sino-sidebar__navigation-scroll").contains(trigger)).toBe(false);
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Sino AI 产品矩阵" });
    expect(panel.textContent).toContain("Sino Founder AI");
    expect(panel.textContent).toContain("Sino Operator AI");
    expect(panel.textContent).toContain("Sino Studio AI");
    expect(panel.textContent).toContain("Sino Industrial AI");
    expect(panel.textContent).toContain("Sino Quant AI");
    expect(panel.querySelector('a[href="/operator"]')).toBeTruthy();
    expect(panel.querySelector('a[href="/studio"]')).toBeTruthy();
    expect(panel.querySelectorAll('[aria-disabled="true"]')).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Sino Founder AI/ }));
    expect(onNavigate).toHaveBeenCalledWith("conversation");
    expect(screen.queryByRole("dialog", { name: "Sino AI 产品矩阵" })).toBeNull();
  });

  it("floats the Sino AI product matrix beside the sidebar at the viewport midpoint", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Sino AI 产品矩阵" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ right: 264 });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Sino AI 产品矩阵" });
    expect(panel.style.left).toBe("276px");
    expect(panel.style.bottom).toBe("");
    expect(panel.classList.contains("sino-product-matrix__panel")).toBe(true);
  });

  it("closes the Sino AI product matrix with Escape", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Sino AI 产品矩阵" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Sino AI 产品矩阵" })).toBeNull();
  });

  it("renders only the complete navigation and delegates collapse ownership to the workspace shell", () => {
    const onCollapse = vi.fn();
    render(<FounderNavigationPanel conversations={[]} projects={[]} onNavigate={vi.fn()} onNewConversation={vi.fn()} onCollapse={onCollapse} />);
    expect(screen.getByRole("button", { name: "Sino AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建讨论" })).toBeTruthy();
    const topActions = document.querySelector(".sino-sidebar-top-actions");
    expect(topActions.children).toHaveLength(2);
    expect([...topActions.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))).toEqual(["收起侧边栏", "新建讨论"]);
    expect(screen.getByRole("button", { name: "库" })).toBeTruthy();
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByText("最近")).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
    expect(document.querySelector(".sino-collapsed-navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(onCollapse).toHaveBeenCalledOnce();
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

  it("renders the requested navigation hierarchy without Project status metadata", () => {
    const onNavigate = vi.fn();
    const onSelectConversation = vi.fn();
    render(<FounderNavigationPanel
      onNavigate={onNavigate}
      onSelectConversation={onSelectConversation}
      projects={[{ id: "commerce", name: "AI Commerce OS", ready_count: 3, candidate_count: 2 }]}
      conversations={[{ id: "recent", title: "最近的真实会话", updatedAt: 20 }]}
    />);
    expect(screen.getByRole("button", { name: "Sino AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "库" })).toBeTruthy();
    expect(screen.getByText("项目")).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeTruthy();
    expect(screen.getByText("AI Commerce OS")).toBeTruthy();
    expect(screen.getByText("最近")).toBeTruthy();
    expect(screen.queryByText(/Conversations/)).toBeNull();
    expect(screen.queryByText(/Ready 3/)).toBeNull();
    expect(screen.queryByText(/Candidate 2/)).toBeNull();
    fireEvent.click(document.querySelector('.sino-conversation-item__open[title="最近的真实会话"]'));
    expect(onSelectConversation).toHaveBeenCalledWith("recent");
    fireEvent.click(screen.getByRole("button", { name: "Sino AI" }));
    expect(onNavigate).toHaveBeenCalledWith("conversation");
  });

  it("keeps every Project and Recent Conversation in one continuous navigation scroll region", () => {
    const projects = ["AI Commerce OS", "Sino Operator AI", "Sino Studio AI", "AI短剧生产系统"].map((name, index) => ({ id: `project-${index}`, name }));
    render(<FounderNavigationPanel projects={projects} conversations={[{ id: "recent", title: "最近讨论", updatedAt: 20 }]} />);
    const scroll = document.querySelector(".sino-sidebar__navigation-scroll");
    const projectItems = [...scroll.querySelectorAll(".sino-project-item__open span")];
    expect(projectItems.map((item) => item.textContent)).toEqual(projects.map((item) => item.name));
    const recent = scroll.querySelector(".sino-sidebar__conversation-section");
    expect(projectItems.at(-1).compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(".founder-navigation-panel > footer")).toBeTruthy();
    expect(scroll.contains(document.querySelector(".founder-navigation-panel > footer"))).toBe(false);
  });

  it("filters Projects and Recent Conversations locally and restores the complete navigation", () => {
    const onSelectProject = vi.fn();
    const onSelectConversation = vi.fn();
    render(<FounderNavigationPanel
      projects={[
        { id: "commerce", name: "AI Commerce OS" },
        { id: "operator", name: "Sino Operator AI" },
        { id: "studio", name: "Sino Studio AI" },
      ]}
      conversations={[
        { id: "gpt", title: "把图标改成 GPT 风格", updatedAt: 20 },
        { id: "ads", title: "广告平台解析", updatedAt: 10 },
      ]}
      onSelectProject={onSelectProject}
      onSelectConversation={onSelectConversation}
    />);

    const search = screen.getByPlaceholderText("搜索");
    fireEvent.change(search, { target: { value: "  Commerce  " } });
    expect(screen.getByText("AI Commerce OS")).toBeTruthy();
    expect(screen.queryByText("Sino Operator AI")).toBeNull();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeTruthy();
    fireEvent.click(document.querySelector('.sino-project-item__open[title="AI Commerce OS"]'));
    expect(onSelectProject).toHaveBeenCalledWith("commerce");

    fireEvent.change(search, { target: { value: "gpt" } });
    expect(screen.getByText("把图标改成 GPT 风格")).toBeTruthy();
    expect(screen.queryByText("广告平台解析")).toBeNull();
    fireEvent.click(document.querySelector('.sino-conversation-item__open[title="把图标改成 GPT 风格"]'));
    expect(onSelectConversation).toHaveBeenCalledWith("gpt");

    fireEvent.change(search, { target: { value: "没有匹配" } });
    expect(screen.getByText("没有找到结果")).toBeTruthy();
    expect(screen.queryByText("最近")).toBeNull();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search.value).toBe("");
    expect(screen.getByText("Sino Operator AI")).toBeTruthy();
    expect(screen.getByText("广告平台解析")).toBeTruthy();
  });

  it("collapses long Project lists without limiting search results and uses aligned navigation rows", () => {
    const projects = Array.from({ length: 6 }, (_, index) => ({ id: `project-${index + 1}`, name: `Project ${index + 1}` }));
    render(<FounderNavigationPanel
      active="conversation"
      projects={projects}
      conversations={[{ id: "recent", title: "最近讨论", updatedAt: 20 }]}
    />);

    expect(document.querySelectorAll(".sino-project-item")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "展开显示" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "展开显示" }));
    expect(document.querySelectorAll(".sino-project-item")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "收起显示" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起显示" }));
    expect(document.querySelectorAll(".sino-project-item")).toHaveLength(4);

    fireEvent.change(screen.getByPlaceholderText("搜索"), { target: { value: "project" } });
    expect(document.querySelectorAll(".sino-project-item")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /展开显示|收起显示/ })).toBeNull();

    const home = screen.getByRole("button", { name: "Sino AI" });
    expect(home.classList.contains("sino-sidebar-row")).toBe(true);
    expect(home.querySelector(".sino-brand-mark")).toBeTruthy();
    expect(screen.getByRole("button", { name: "库" }).classList.contains("sino-sidebar-row")).toBe(true);
    expect(screen.getByRole("button", { name: "新建项目" }).classList.contains("sino-sidebar-row")).toBe(true);
    expect(screen.getByRole("button", { name: "设置" }).classList.contains("sino-sidebar-row")).toBe(true);
    expect(document.querySelector(".sino-sidebar-search")).toBeTruthy();
    expect(document.querySelector(".sino-conversation-item__open > span")).toBeNull();
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

  it("keeps Projects as containers and renders all Founder Conversations in Recent", () => {
    const conversations = [
      { id: "project-work", project_id: "project-1", title: "Project 内工作", updatedAt: 20 },
      { id: "general-work", project_id: null, title: "普通工作", updatedAt: 10 },
    ];
    const projects = [{ id: "project-1", name: "AI 电商" }];
    const { rerender } = render(<FounderNavigationPanel conversations={conversations} projects={projects} onSelectConversation={vi.fn()} />);

    expect(document.querySelectorAll(".sino-project-heading")).toHaveLength(1);
    expect(document.querySelectorAll(".sino-sidebar__conversation-title")).toHaveLength(1);
    const headingLabels = [...document.querySelectorAll(".sino-sidebar-primary-title__label")];
    expect(headingLabels.map((label) => label.textContent)).toEqual(["项目", "最近"]);
    expect(headingLabels.every((label) => label.className === headingLabels[0].className)).toBe(true);
    expect(headingLabels.every((label) => label.querySelector("svg") === null)).toBe(true);
    const createProjectEntry = screen.getByRole("button", { name: "新建项目" });
    expect(createProjectEntry.querySelector("svg")).toBeTruthy();
    expect(createProjectEntry.textContent).toBe("新建项目");
    expect(document.querySelector(".sino-project-item .sino-conversation-list")).toBeNull();
    const section = document.querySelector(".sino-sidebar__conversation-section");
    const title = section.querySelector(":scope > .sino-sidebar__conversation-title");
    const list = section.querySelector(".sino-sidebar__scroll-region .sino-conversation-list");
    expect([...section.children]).toEqual([title, section.querySelector(":scope > .sino-sidebar__scroll-region")]);
    expect(title.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...list.querySelectorAll("b")].map((item) => item.textContent)).toEqual(["Project 内工作", "普通工作"]);

    rerender(<FounderNavigationPanel conversations={conversations} projects={projects} activeProjectId="project-1" onSelectConversation={vi.fn()} />);
    expect([...document.querySelectorAll(".sino-sidebar__scroll-region .sino-conversation-item__open b")].map((item) => item.textContent)).toEqual(["Project 内工作", "普通工作"]);
    expect(document.querySelector(".sino-project-item .sino-conversation-item__open")).toBeNull();
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
    fireEvent.click(screen.getAllByRole("button", { name: "Project A" }).at(-1));
    await waitFor(() => expect(bindFounderConversationProject).toHaveBeenCalledWith("conv-active", "project-a"));
    expect(onSelectConversation).toHaveBeenCalledWith("conv-active");

    rerender(<FounderNavigationPanel conversations={[{ ...conversation, project_id: "project-a", conversation_type: "PROJECT_CONVERSATION" }]} projects={projects} activeProjectId="project-a" activeConversationId="conv-active" onSelectConversation={onSelectConversation} />);
    expect(document.querySelector('.sino-sidebar__scroll-region .sino-conversation-item[data-conversation-id="conv-active"].is-active')).toBeTruthy();
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

  it("renders persisted parent and System Projects as a flat navigation list", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[{ id: "parent", name: "AI Commerce OS" }, { id: "child", name: "Intelligence Evolution Layer", parent_project_id: "parent", project_type: "system_project" }]} activeProjectId="parent" onSelectProject={vi.fn()} />);
    const items = [...document.querySelectorAll(".sino-project-item")];
    expect(items.map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("AI Commerce OS"), expect.stringContaining("Intelligence Evolution Layer")]));
    expect(items[1].classList.contains("is-child")).toBe(false);
    expect(items[1].style.marginLeft).toBe("");
  });

  it("selects a Project without hiding any other Project", async () => {
    const projects = [{ id: "commerce", name: "AI Commerce OS" }, { id: "intel", name: "Intelligence Evolution Layer", parent_project_id: "commerce" }, { id: "cloud", name: "AI Commerce OS Cloud", parent_project_id: "commerce" }, { id: "operator", name: "Sino Operator AI" }];
    render(<FounderNavigationPanel conversations={[]} projects={projects} activeProjectId="commerce" onSelectProject={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy());
    fireEvent.click(document.querySelector('.sino-project-item__open[title="AI Commerce OS"]'));
    expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy();
    expect(screen.getByText("AI Commerce OS Cloud")).toBeTruthy();
    expect(screen.getByText("Sino Operator AI")).toBeTruthy();
  });

  it("shows an explicit New Project entry under the Projects section", () => {
    render(<FounderNavigationPanel conversations={[]} projects={[{ id: "commerce", name: "AI Commerce OS" }]} />);
    const heading = document.querySelector(".sino-project-heading");
    expect(heading.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: "新建项目" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    const createDialog = screen.getByRole("dialog", { name: "创建项目" });
    expect(createDialog.parentElement).toBe(document.body);
    expect(createDialog.querySelector("[data-popover-arrow]")).toBeTruthy();
    expect(screen.getByRole("button", { name: "创建项目" }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Project 名称"), { target: { value: "AI电商" } });
    expect(screen.getByRole("button", { name: "创建项目" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() => expect(createFounderProject).toHaveBeenCalledWith({ name: "AI电商", description: null }));
    expect(onSelectProject).toHaveBeenCalledWith("project-commerce");
    fireEvent.click(screen.getByRole("button", { name: /Project 操作 AI电商/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("重命名 AI电商"), { target: { value: "AI电商系统" } });
    fireEvent.keyDown(screen.getByLabelText("重命名 AI电商"), { key: "Enter" });
    await waitFor(() => expect(updateFounderProject).toHaveBeenCalledWith("project-commerce", { name: "AI电商系统" }));
    fireEvent.click(screen.getByRole("button", { name: /会话操作 商品讨论/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "AI电商系统" }).at(-1));
    await waitFor(() => expect(bindFounderConversationProject).toHaveBeenCalledWith("conv-1", "project-commerce"));
  });

  it("closes the anchored Project creation popover on repeat click, outside click and Escape", () => {
    render(<div><FounderNavigationPanel conversations={[]} projects={[]} /><button type="button">Outside</button></div>);
    const trigger = screen.getByRole("button", { name: "新建项目" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "创建项目" })).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "创建项目" })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog", { name: "创建项目" })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "创建项目" })).toBeNull();
  });

  it("drops a deleted Project from the authoritative list and keeps its Conversations unassigned", () => {
    const conversation = { id: "conv-1", project_id: "deleted-project", title: "仍然保留的讨论", updatedAt: Date.now() };
    const { rerender } = render(<FounderNavigationPanel conversations={[conversation]} projects={[{ id: "deleted-project", name: "已删除 Demo Project" }]} activeProjectId="deleted-project" onSelectConversation={vi.fn()} />);
    expect(screen.getByText("已删除 Demo Project")).toBeTruthy();
    rerender(<FounderNavigationPanel conversations={[conversation]} projects={[]} activeProjectId={null} onSelectConversation={vi.fn()} />);
    expect(screen.queryByText("已删除 Demo Project")).toBeNull();
    expect(screen.getByText("仍然保留的讨论")).toBeTruthy();
    expect(document.querySelector(".sino-project-list")?.children.length || 0).toBe(1);
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
