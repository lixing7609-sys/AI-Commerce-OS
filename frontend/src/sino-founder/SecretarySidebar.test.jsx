// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SecretarySidebar } from "./SecretarySidebar.jsx";

afterEach(cleanup);

describe("Founder sidebar information architecture", () => {
  it("keeps real conversations and hides only records with explicit test provenance", () => {
    const now = Date.now();
    render(<SecretarySidebar
      conversations={[
        { id: "real", title: "AI短剧生产系统", updatedAt: now },
        { id: "test", title: "Runtime probe", updatedAt: now, provenance: "test" },
      ]}
      projects={[{ id: "project-1", name: "验证AI短剧生产的可行性，跑通从创意到成片的全流程，为后续商业化或产品化打基础。 Project", description: "验证 AI 短剧生产可行性" }]}
    />);
    expect(screen.queryByText("Runtime probe")).toBeNull();
    expect(screen.getAllByText("AI短剧生产系统").length).toBeGreaterThan(1);
  });

  it("renders one updated-at ordered list with time metadata and no groups", () => {
    const now = Date.now();
    render(<SecretarySidebar conversations={[{ id: "old", title: "旧工作", updatedAt: now - 86400000 * 8 }, { id: "latest", title: "最新工作", updatedAt: now }]} />);
    const titles = [...document.querySelectorAll(".sino-conversation-item__open b")].map((item) => item.textContent);
    expect(titles).toEqual(["最新工作", "旧工作"]);
    expect(screen.queryByText("最近 7 天")).toBeNull();
    expect(document.querySelectorAll(".sino-conversation-group")).toHaveLength(0);
  });
});
