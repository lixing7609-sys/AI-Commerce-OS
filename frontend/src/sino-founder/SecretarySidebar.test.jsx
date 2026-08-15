// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretarySidebar } from "./SecretarySidebar.jsx";
import { bindFounderConversationProject, createFounderProject, updateFounderProject } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ bindFounderConversationProject: vi.fn(), createFounderProject: vi.fn(), deleteFounderProject: vi.fn(), updateFounderProject: vi.fn() }));

afterEach(cleanup);

describe("Founder sidebar information architecture", () => {
  it("keeps real conversations and hides only records with explicit test provenance", () => {
    const now = Date.now();
    render(<SecretarySidebar
      conversations={[
        { id: "real", title: "AI短剧生产系统", updatedAt: now },
        { id: "test", title: "Runtime probe", updatedAt: now, provenance: "test" },
      ]}
      projects={[{ id: "project-1", name: "验证AI短剧生产的可行性，跑通从创意到成片的全流程，为后续商业化或产品化打基础。 Project", description: "验证 AI 短剧生产可行性" }]}
    />);
    expect(screen.queryByText("Runtime probe")).toBeNull();
    expect(screen.getAllByText("AI短剧生产系统").length).toBeGreaterThan(1);
  });

  it("renders one updated-at ordered list with time metadata and no groups", () => {
    const now = Date.now();
    render(<SecretarySidebar conversations={[{ id: "old", title: "旧工作", updatedAt: now - 86400000 * 8 }, { id: "latest", title: "最新工作", updatedAt: now }]} />);
    const titles = [...document.querySelectorAll(".sino-conversation-item__open b")].map((item) => item.textContent);
    expect(titles).toEqual(["最新工作", "旧工作"]);
    expect(screen.queryByText("最近 7 天")).toBeNull();
    expect(document.querySelectorAll(".sino-conversation-group")).toHaveLength(0);
  });

  it("creates, renames, expands and moves Conversations through the Project workspace", async () => {
    createFounderProject.mockResolvedValue({ id: "project-commerce", name: "AI电商", status: "active", updated_at: new Date().toISOString() });
    updateFounderProject.mockResolvedValue({ id: "project-commerce", name: "AI电商系统", status: "active" });
    bindFounderConversationProject.mockResolvedValue({ id: "conv-1", project_id: "project-commerce" });
    const onSelectProject = vi.fn();
    render(<SecretarySidebar conversations={[{ id: "conv-1", title: "商品讨论", updatedAt: Date.now() }]} onSelectProject={onSelectProject} onSelectConversation={vi.fn()} />);
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
});
