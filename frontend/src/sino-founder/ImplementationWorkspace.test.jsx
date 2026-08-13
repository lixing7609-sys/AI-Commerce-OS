// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImplementationWorkspace } from "./ImplementationWorkspace.jsx";

describe("ImplementationWorkspace", () => {
  it("renders a real clickable object and its three lifecycle actions", () => {
    const item = { object_id: "object-1", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", description: "浏览器端数据获取", status: "draft", version: 1, source_conversation_id: "conversation-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [] };
    const approve = vi.fn(), discuss = vi.fn(), archive = vi.fn();
    render(<ImplementationWorkspace objects={[item]} onApprove={approve} onContinue={discuss} onArchive={archive} />);
    fireEvent.click(screen.getByRole("button", { name: /Chrome Extension Skill/ }));
    expect(screen.getByText("V1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准" }));
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    fireEvent.click(screen.getByRole("button", { name: "归档" }));
    expect(approve).toHaveBeenCalledWith(item); expect(discuss).toHaveBeenCalledWith(item); expect(archive).toHaveBeenCalledWith(item);
  });
});
