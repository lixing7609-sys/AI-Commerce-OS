// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFounderObject, getFounderObjects } from "../services/founderAiApi.js";
import { InfiniteObjectWorkspace } from "./InfiniteObjectWorkspace.jsx";

vi.mock("../services/founderAiApi.js", () => ({ getFounderObject: vi.fn(), getFounderObjects: vi.fn() }));
const skill = { object_id: "object-chrome", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", description: "Browser data", status: "approved", version: 2, source_conversation_id: "conv-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [{ execution_id: "exec-1", status: "draft" }], artifact_refs: [], memory_refs: [], revisions: [{ version: 1 }] };

beforeEach(() => { getFounderObjects.mockResolvedValue([skill]); getFounderObject.mockResolvedValue(skill); });
afterEach(cleanup);

describe("Founder Object Infinite Workspace", () => {
  it("projects the same object into capability and execution views and opens real detail", async () => {
    const onContinue = vi.fn();
    const { rerender } = render(<InfiniteObjectWorkspace view="capability-center" onContinue={onContinue} onApprove={vi.fn()} onOpenExecution={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Chrome Extension Skill/ }));
    expect((await screen.findByRole("complementary", { name: "Object Workspace 详情" })).textContent).toContain("V2");
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(onContinue).toHaveBeenCalledWith(skill);
    rerender(<InfiniteObjectWorkspace view="execution" onContinue={onContinue} onApprove={vi.fn()} onOpenExecution={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /Chrome Extension Skill/ })).toBeTruthy();
  });

  it("supports canvas pan/zoom controls without creating copied data", async () => {
    render(<InfiniteObjectWorkspace view="builder" onContinue={vi.fn()} onApprove={vi.fn()} onOpenExecution={vi.fn()} />);
    expect(await screen.findByText("拖拽平移 · 滚轮缩放")).toBeTruthy();
    fireEvent.wheel(document.querySelector(".sino-object-canvas"), { deltaY: -100 });
    await waitFor(() => expect(screen.getByText("110%")).toBeTruthy());
    expect(getFounderObjects).toHaveBeenCalled();
  });
});
