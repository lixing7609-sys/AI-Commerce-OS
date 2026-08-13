// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFounderObject, getFounderObjects } from "../services/founderAiApi.js";
import { InfiniteObjectWorkspace, ObjectInspector, projectFounderObjects } from "./InfiniteObjectWorkspace.jsx";

vi.mock("../services/founderAiApi.js", () => ({ getFounderObject: vi.fn(), getFounderObjects: vi.fn() }));
const skill = { object_id: "object-chrome", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", description: "Browser data", status: "approved", version: 2, source_conversation_id: "conv-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [{ execution_id: "exec-1", status: "draft" }], artifact_refs: [], memory_refs: [], revisions: [{ version: 1 }] };

beforeEach(() => { getFounderObjects.mockResolvedValue([skill]); getFounderObject.mockResolvedValue(skill); });
afterEach(cleanup);

describe("Founder Object Infinite Workspace", () => {
  it("projects the same object into capability and execution views and opens real detail", async () => {
    const onContinue = vi.fn();
    const onSelectionChange = vi.fn();
    const { rerender } = render(<InfiniteObjectWorkspace view="capability-center" selectedObject={null} onSelectionChange={onSelectionChange} />);
    fireEvent.click(await screen.findByRole("button", { name: /Chrome Extension Skill/ }));
    await waitFor(() => expect(onSelectionChange.mock.calls.some(([value]) => value?.object_id === skill.object_id)).toBe(true));
    rerender(<><InfiniteObjectWorkspace view="capability-center" selectedObject={skill} onSelectionChange={onSelectionChange} /><ObjectInspector object={skill} onContinue={onContinue} onApprove={vi.fn()} onOpenExecution={vi.fn()} /></>);
    const inspector = screen.getByRole("region", { name: "对象详情" });
    expect(inspector.textContent).toContain("Skill（技能）");
    expect(inspector.textContent).toContain("V2");
    expect(inspector.textContent).toContain("已批准");
    expect(inspector.textContent).toContain("待开发");
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(onContinue).toHaveBeenCalledWith(skill);
    rerender(<InfiniteObjectWorkspace view="execution" selectedObject={null} onSelectionChange={onSelectionChange} />);
    expect(await screen.findByRole("button", { name: /Chrome Extension Skill/ })).toBeTruthy();
  });

  it("renders centralized Chinese terminology for nodes and relationships", async () => {
    const parent = { ...skill, object_id: "object-parent", object_type: "project", name: "Browser Project", execution_refs: [] };
    getFounderObjects.mockResolvedValueOnce([{ ...skill, parent_object_id: parent.object_id }, parent]);
    render(<InfiniteObjectWorkspace view="builder" selectedObject={null} onSelectionChange={vi.fn()} />);
    expect(await screen.findByText("Skill（技能）")).toBeTruthy();
    expect(screen.getByText("Project（项目）")).toBeTruthy();
    expect(screen.getByText("父子关系")).toBeTruthy();
    expect(screen.getAllByText(/已批准/)).toHaveLength(2);
  });

  it("supports canvas pan/zoom controls without creating copied data", async () => {
    render(<InfiniteObjectWorkspace view="builder" selectedObject={null} onSelectionChange={vi.fn()} />);
    expect(await screen.findByText("拖拽平移 · 滚轮缩放")).toBeTruthy();
    fireEvent.wheel(document.querySelector(".sino-object-canvas"), { deltaY: -100 });
    await waitFor(() => expect(screen.getByText("110%")).toBeTruthy());
    expect(getFounderObjects).toHaveBeenCalled();
  });

  it("creates distinct real-data projections without changing the stable object id", () => {
    const object = { ...skill, revisions: [{ revision_id: "rev-1", version: 1, status: "draft" }], artifact_refs: ["artifact-1"], memory_refs: ["memory-1"] };
    const architecture = projectFounderObjects([object], "builder");
    const capability = projectFounderObjects([object], "capability-center");
    const execution = projectFounderObjects([object], "execution");
    const evolution = projectFounderObjects([object], "assets");
    expect(architecture.nodes[0].root_object_id).toBe("object-chrome");
    expect(capability.nodes).toHaveLength(1);
    expect(execution.nodes.map((item) => item.node_kind)).toEqual(["object", "execution"]);
    expect(execution.edges[0].relation).toBe("execution");
    expect(evolution.nodes.map((item) => item.node_kind)).toEqual(["object", "revision", "artifact", "memory"]);
    expect(evolution.edges.map((item) => item.relation)).toEqual(["version", "artifact", "memory"]);
  });
});
