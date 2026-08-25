// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FounderHome, ProjectIntelligenceContext, ProjectWorkspace } from "./FounderHome.jsx";

afterEach(() => cleanup());

describe("Founder AI capability factory home", () => {
  it("renders the capability-first hero and routes all quick creation entries into discussion", () => {
    const onQuickCreate = vi.fn();
    render(<FounderHome message="" onMessage={vi.fn()} onSend={vi.fn((event) => event.preventDefault())} onQuickCreate={onQuickCreate} healthy projects={[]} onSelectProject={vi.fn()} onCreateProject={vi.fn()} onFiles={vi.fn()} mode="sino" onModeChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "创造什么 AI 能力？" })).toBeTruthy();
    for (const [label, type] of [["创建 Agent","agent"],["创建 Skill","skill"],["创建 Workflow","workflow"],["创建 Prompt","prompt"],["创建 Capability","capability"],["创建 Project","project"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(onQuickCreate).toHaveBeenLastCalledWith(type);
    }
  });

  it("mounts the real home Composer with pending image paste callbacks", () => {
    const onAddImages = vi.fn(); const image = new File(["png"], "Screenshot.png", { type: "image/png" });
    const { container } = render(<FounderHome message="定位这里" onMessage={vi.fn()} onSend={vi.fn()} onQuickCreate={vi.fn()} healthy projects={[]} onSelectProject={vi.fn()} onCreateProject={vi.fn()} onFiles={vi.fn()} mode="sino" onModeChange={vi.fn()} pendingAttachments={[{ localId: "pending", name: "Screenshot.png", preview: "blob:shot" }]} onAddImages={onAddImages} onRemoveImage={vi.fn()} />);
    const input = container.querySelector('textarea[aria-label="讨论内容"]');
    fireEvent.paste(input, { clipboardData: { items: [{ type: "image/png", getAsFile: () => image }], getData: () => "" } });
    expect(onAddImages).toHaveBeenCalledWith([image]);
    expect(container.querySelector('img[alt="Screenshot.png"]')).toBeTruthy();
  });
});

describe("System Project workspace context", () => {
  it("renders the Project name, tabs, and canonical Project Conversations", () => {
    const openConversation = vi.fn();
    render(<ProjectWorkspace intelligence={{ project_name: "Foundation System", conversation_refs: [{ conversation_id: "conv-new", title: "最新讨论", summary: "最近一条内容摘要", updated_at: "2026-08-21T10:00:00Z" }, { conversation_id: "conv-old", title: "较早讨论", updated_at: "2026-08-20T10:00:00Z" }] }} onOpenConversation={openConversation} message="" onMessage={vi.fn()} onSend={vi.fn()} healthy mode="sino" onModeChange={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: "Foundation System" })).toBeNull();
    expect(screen.getByRole("button", { name: "聊天" }).classList.contains("is-active")).toBe(true);
    expect(screen.getByRole("button", { name: "聊天" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "数据源" })).toBeTruthy();
    expect(screen.getByText("最近一条内容摘要")).toBeTruthy();
    const conversationRow = screen.getByRole("button", { name: /最新讨论/ });
    expect(conversationRow.querySelector("strong").textContent).toBe("最新讨论");
    expect(conversationRow.querySelector("p").textContent).toBe("最近一条内容摘要");
    expect(screen.queryByText(/Ready|Candidate|Status/)).toBeNull();
    fireEvent.click(conversationRow);
    expect(openConversation).toHaveBeenCalledWith("conv-new");
  });

  it("shows only the initial context persisted by the Formal Object Proposal", () => {
    const openConversation = vi.fn();
    render(<ProjectIntelligenceContext intelligence={{ project_name: "Intelligence Evolution Layer", project_summary: "Foundation Layer 的正式系统对象。", pending_questions: [], initial_project_context: { parent_project_name: "AI Commerce OS", architecture_role: "Foundation Layer", initial_positioning: "Foundation Layer 的正式系统对象。", initial_scope: ["定义职责与边界"], source_conversation_id: "conv-constitution", source_conversation_title: "AI Commerce OS Constitution V1", inherited_constitution: { title: "AI Commerce OS Constitution V1", status: "confirmed" } } }} onOpenConversation={openConversation} />);
    expect(screen.getAllByText("Intelligence Evolution Layer").length).toBeGreaterThan(0);
    expect(screen.getByText("AI Commerce OS")).toBeTruthy();
    expect(screen.getByText("Foundation Layer")).toBeTruthy();
    expect(screen.getByText("定义职责与边界")).toBeTruthy();
    expect(screen.getByText("Context Status · Inherited / Active")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看原文" }));
    expect(openConversation).toHaveBeenCalledWith("conv-constitution");
  });

  it("separates completed implementation from externally blocked validation", () => {
    render(<ProjectIntelligenceContext intelligence={{ project_name: "System A", pending_questions: [], implementation_result: { implementation_status: "completed", validation_status: "blocked_by_external_dependency", external_dependencies: [{ dependency_target: "Runtime Platform" }] } }} />);
    expect(screen.getByText("✓ Completed")).toBeTruthy();
    expect(screen.getByText("Blocked by External Dependency")).toBeTruthy();
    expect(screen.getByText("Runtime Platform")).toBeTruthy();
  });

  it("keeps the Project Composer bound to the selected Project", () => {
    render(<ProjectWorkspace intelligence={{ project_name: "Evolution System", conversation_refs: [] }} onOpenConversation={vi.fn()} message="" onMessage={vi.fn()} onSend={vi.fn()} healthy mode="sino" onModeChange={vi.fn()} />);
    expect(screen.getByLabelText("当前项目").textContent).toContain("Evolution System");
    const composer = screen.getByPlaceholderText("继续和 Sino 讨论 Evolution System……").closest(".sino-conversation-composer-dock");
    expect(composer).toBeTruthy();
    expect(composer.classList.contains("sino-conversation-composer-layout")).toBe(true);
  });

  it("switches to the lightweight Data Sources shell without inventing backend data", () => {
    render(<ProjectWorkspace intelligence={{ project_name: "Cloud Foundation", conversation_refs: [] }} onOpenConversation={vi.fn()} message="" onMessage={vi.fn()} onSend={vi.fn()} healthy mode="sino" onModeChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "数据源" }));
    expect(screen.getByRole("region", { name: "Cloud Foundation 数据源" })).toBeTruthy();
    expect(screen.getByText("暂无项目数据源")).toBeTruthy();
  });
});
