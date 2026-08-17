// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FounderHome, ProjectIntelligenceContext, ProjectWorkspace } from "./FounderHome.jsx";

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
});

describe("System Project workspace context", () => {
  it("counts only the active canonical Draft projected by the API", () => {
    render(<ProjectWorkspace intelligence={{ project_name: "Foundation System", conversation_refs: [] }} drafts={[{ draft_id: "draft-canonical", title: "System Definition", status: "confirmed", implementation: { status: "founder_approved", execution_approval: "approved", execution_package: { package_id: "package-1", preflight_status: "ready" } } }]} onOpenConversation={vi.fn()} onOpenDraft={vi.fn()} message="" onMessage={vi.fn()} onSend={vi.fn()} healthy mode="sino" onModeChange={vi.fn()} />);
    expect(screen.getByText("Drafts").nextSibling.textContent).toBe("1");
    expect(screen.getByText("System Definition")).toBeTruthy();
    expect(screen.getByText("已确认 · 执行准备完成")).toBeTruthy();
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
});
