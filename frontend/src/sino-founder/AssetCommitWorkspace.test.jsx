// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AssetCommitWorkspace } from "./AssetCommitWorkspace.jsx";

afterEach(cleanup);

it("renders durable commit receipts and completed actions", () => {
  const view = vi.fn(); const discussion = vi.fn(); const next = vi.fn();
  render(<AssetCommitWorkspace commit={{ commit_id: "commit-1", items: [{ discussion_object_id: "item-1", asset_id: "workflow-1", object_type: "workflow", name: "AI 短剧 Workflow", destination: "AI 能力中心", commit_status: "committed" }] }} onViewAssets={view} onReturnDiscussion={discussion} onNewGoal={next} />);
  expect(screen.getByText("资产提交完成")).toBeTruthy();
  expect(screen.getByText("✓ Committed")).toBeTruthy();
  fireEvent.click(screen.getByText("AI 短剧 Workflow"));
  expect(screen.getByText("workflow-1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看资产" }));
  fireEvent.click(screen.getByRole("button", { name: "返回讨论" }));
  fireEvent.click(screen.getByRole("button", { name: "开始新的目标" }));
  expect(view).toHaveBeenCalled(); expect(discussion).toHaveBeenCalled(); expect(next).toHaveBeenCalled();
});
