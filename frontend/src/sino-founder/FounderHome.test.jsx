// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FounderHome } from "./FounderHome.jsx";

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
