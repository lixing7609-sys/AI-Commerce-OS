// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectIntelligenceContext } from "./FounderHome.jsx";

afterEach(cleanup);

describe("ProjectIntelligenceContext", () => {
  it("shows a structured Founder Review projection and opens the source Conversation", () => {
    const openConversation = vi.fn();
    render(<ProjectIntelligenceContext intelligence={{
      project_name: "AI Commerce OS", project_summary: "AI Commerce OS 的正式项目摘要。",
      pending_questions: [{ question_id: "q-1", content: "待确认", conversation_id: "conv-source" }],
      updated_at: "2026-08-15T06:39:11Z",
      constitution: {
        version: 1, status: "founder_review", source_conversation_id: "conv-source",
        foundation_layer_count: 2, application_layer_count: 5, system_objects_count: 7,
        capability_lifecycle_status: "identified", capability_rules_count: 4,
        founder_boundary_status: "identified", sino_boundary_status: "identified",
        proposed_work_items_count: 10, founder_decisions_count: 0,
      },
    }} onNavigate={vi.fn()} onOpenConversation={openConversation} />);

    expect(screen.getByText("Project Intelligence")).toBeTruthy();
    expect(screen.getByText("V1 · Founder Review")).toBeTruthy();
    expect(screen.getByText("7 · 已识别 · 待确认")).toBeTruthy();
    expect(screen.getByText("Founder Decisions · 0 / 10")).toBeTruthy();
    expect(screen.queryByText(/AI Commerce OS Constitution V1.*Intelligence Evolution Layer/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看原文" }));
    expect(openConversation).toHaveBeenCalledWith("conv-source");
  });
});
