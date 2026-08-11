// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAssetMemoryCenter } from "../services/founderAiApi.js";
import { AssetMemoryCenter } from "./AssetMemoryCenter.jsx";

vi.mock("../services/founderAiApi.js", () => ({ getAssetMemoryCenter: vi.fn() }));

const history = {
  artifacts: [{ artifact_id: "artifact-1", execution_id: "execution-1", task: "Hide scrollbar", goal: "Hide scrollbar", artifact_type: "execution_result", summary: "Scrollbar hidden", created_at: "2026-08-10T11:24:40Z", related_files: ["sino-founder-ai.css"], commit_hash: "abc123", verification_status: "passed", verification: ["npm test"], status: "active", content: {} }],
  memories: [
    { memory_id: "memory-decision", execution_id: "execution-1", artifact_id: null, task: "Hide scrollbar", memory_type: "decision", title: "Execution decision", decision: "Founder approved", learning: null, execution_result: null, content: { decision: "Founder approved" }, created_at: "2026-08-10T11:24:41Z", status: "active" },
    { memory_id: "memory-learning", execution_id: "execution-1", artifact_id: null, task: "Hide scrollbar", memory_type: "learning", title: "Execution learning", decision: null, learning: "Keep scrolling", execution_result: null, content: { learning: "Keep scrolling" }, created_at: "2026-08-10T11:24:42Z", status: "active" },
  ],
  executions: [{ execution_id: "execution-1", task: "Hide scrollbar", goal: "Hide scrollbar", status: "completed", commit_hash: "abc123", verification_status: "passed", artifacts: ["artifact-1"], memories: ["memory-decision", "memory-learning"] }],
};

beforeEach(() => { vi.clearAllMocks(); getAssetMemoryCenter.mockResolvedValue(history); });
afterEach(() => cleanup());

describe("AssetMemoryCenter", () => {
  it("loads durable history and opens artifact detail", async () => {
    render(<AssetMemoryCenter refreshKey="history" />);
    expect(await screen.findByText("Scrollbar hidden")).toBeTruthy();
    expect(screen.getByText(/artifact-1.*execution-1/)).toBeTruthy();
    fireEvent.click(screen.getByText("Scrollbar hidden"));
    expect(screen.getByRole("dialog", { name: "历史资产详情" })).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.getByText("sino-founder-ai.css")).toBeTruthy();
    expect(screen.getByText(/1 个成果.*decision.*learning.*已通过/)).toBeTruthy();
    expect(screen.getByText("提交：abc123")).toBeTruthy();
  });

  it("filters memories by type, execution id and keyword", async () => {
    render(<AssetMemoryCenter refreshKey="history" />);
    await screen.findByText("Scrollbar hidden");
    fireEvent.click(screen.getByRole("tab", { name: /长期记忆/ }));
    fireEvent.change(screen.getByLabelText("记忆类型"), { target: { value: "learning" } });
    expect(screen.getByText("Keep scrolling")).toBeTruthy();
    expect(screen.queryByText("Founder approved")).toBeNull();
    fireEvent.change(screen.getByLabelText("资产与记忆搜索"), { target: { value: "execution-1" } });
    expect(screen.getByText("Keep scrolling")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("资产与记忆搜索"), { target: { value: "missing" } });
    expect(screen.getByText("没有匹配的记忆。")).toBeTruthy();
  });

  it("reloads history after a completed execution refresh key changes", async () => {
    const { rerender } = render(<AssetMemoryCenter refreshKey="history" />);
    await waitFor(() => expect(getAssetMemoryCenter).toHaveBeenCalledTimes(1));
    rerender(<AssetMemoryCenter refreshKey="execution-2" />);
    await waitFor(() => expect(getAssetMemoryCenter).toHaveBeenCalledTimes(2));
  });
});
