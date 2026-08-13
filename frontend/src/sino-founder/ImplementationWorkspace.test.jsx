// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImplementationWorkspace } from "./ImplementationWorkspace.jsx";

describe("ImplementationWorkspace", () => {
  afterEach(cleanup);
  it("renders a real clickable object and its three lifecycle actions", () => {
    const item = { object_id: "object-1", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", description: "浏览器端数据获取", status: "draft", version: 1, source_conversation_id: "conversation-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [] };
    const approve = vi.fn(), discuss = vi.fn(), archive = vi.fn();
    render(<ImplementationWorkspace objects={[item]} onApprove={approve} onContinue={discuss} onArchive={archive} />);
    fireEvent.click(screen.getByRole("button", { name: /Chrome Extension Skill/ }));
    expect(screen.getAllByText(/V1/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "批准" }));
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    fireEvent.click(screen.getByRole("button", { name: "驳回 / 归档" }));
    expect(approve).toHaveBeenCalledWith(item); expect(discuss).toHaveBeenCalledWith(item); expect(archive).toHaveBeenCalledWith(item);
  });

  it("separates a persisted context object from new draft recognition", () => {
    const context = { object_id: "object-skill", object_type: "skill", name: "Chrome Extension Skill", status: "approved", version: 2, is_context_object: true, execution_refs: [{ status: "draft" }] };
    const draft = { object_id: "object-cap", object_type: "capability", name: "Browser Session", status: "draft", version: 1, revisions: [] };
    render(<ImplementationWorkspace objects={[context, draft]} contextObject={context} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    expect(screen.getByText("当前对象")).toBeTruthy();
    expect(screen.getByText("新增对象 · 等待确认")).toBeTruthy();
    expect(screen.getByText("Capability（能力）")).toBeTruthy();
    expect(screen.getByText("执行：待开发")).toBeTruthy();
  });

  it("renders and reviews a pending Intent candidate", () => {
    const candidate = { candidate_id: "candidate-1", intent_type: "delay", proposed_object_type: "agent", proposed_name: "广告投放 Agent", proposed_status: "deferred", reason: "当前先不开发", confidence: .94, review_status: "pending" };
    const review = vi.fn(), discuss = vi.fn();
    render(<ImplementationWorkspace candidates={[candidate]} onCandidateReview={review} onCandidateContinue={discuss} />);
    expect(screen.getByText("待确认变更")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /广告投放 Agent/ }));
    expect(screen.getAllByText("Delay（延期）").length).toBeGreaterThan(0);
    expect(screen.getByText("建议状态：延期")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准" }));
    expect(review).toHaveBeenCalledWith(candidate, "approve");
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(discuss).toHaveBeenCalledWith(candidate);
    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    expect(review).toHaveBeenCalledWith(candidate, "reject");
  });

  it("isolates recognition unavailability from the Conversation", () => {
    render(<ImplementationWorkspace recognitionStatus={{ status: "unavailable", error: "DatabaseError" }} />);
    expect(screen.getByText("对象识别暂不可用")).toBeTruthy();
    expect(screen.getByText(/Sino 对话仍可正常继续/)).toBeTruthy();
  });

  it("shows traceable bilingual detail for Discussion to Skill Pipeline", () => {
    const candidate = { candidate_id: "candidate-pipeline", conversation_id: "conv-pipeline", intent_type: "create", proposed_object_type: "capability", proposed_name: "Discussion to Skill Pipeline", proposed_description: "distill discussions", proposed_status: "draft", source_message_refs: ["message-1"], confidence: .8, review_status: "pending" };
    render(<ImplementationWorkspace candidates={[candidate]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /讨论 → Skill 生成管线/ }));
    expect(screen.getAllByText("Discussion to Skill Pipeline").length).toBeGreaterThan(0);
    expect(screen.getByText("candidate-pipeline")).toBeTruthy();
    expect(screen.getByText("conv-pipeline")).toBeTruthy();
    expect(screen.getByText("message-1")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });
});
