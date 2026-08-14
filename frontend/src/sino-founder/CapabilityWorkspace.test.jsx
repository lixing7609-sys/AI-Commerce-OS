// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter, CapabilityObjectWorkspace } from "./CapabilityWorkspace.jsx";
import { getFounderObject, getFounderObjects } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getFounderObject: vi.fn(), getFounderObjects: vi.fn() }));

const skill = { object_id: "object-skill", object_type: "skill", name: "Character Consistency", description: "保持角色跨镜头一致性", status: "approved", version: 2, dependency_object_ids: [], execution_refs: [], revisions: [] };

describe("AI Capability Factory visual framework", () => {
  beforeEach(() => { cleanup(); localStorage.clear(); getFounderObjects.mockResolvedValue([skill]); getFounderObject.mockResolvedValue(skill); });

  it("lists real capability objects and opens the selected object", async () => {
    const open = vi.fn(); render(<CapabilityCenter onOpenObject={open} />);
    fireEvent.click(await screen.findByRole("button", { name: /Character Consistency/ }));
    expect(open).toHaveBeenCalledWith(skill);
  });

  it("uses one Skill workspace skeleton with discussion, test and publish interactions", async () => {
    const onContinue = vi.fn(); render(<CapabilityObjectWorkspace object={skill} onContinue={onContinue} onOpenExecution={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Logic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prompt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" })); expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ object_id: "object-skill" }));
    fireEvent.click(screen.getByRole("button", { name: "测试" })); expect(screen.getByText(/测试中 · V2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "完成测试" })); fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(screen.getByText(/已发布 · V2/)).toBeTruthy();
    await waitFor(() => expect(getFounderObject).toHaveBeenCalledWith("object-skill"));
  });
});
