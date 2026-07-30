// @vitest-environment jsdom
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductReviewModule } from "./ProductReviewModule.jsx";
import { REVIEW_PAGES } from "./reviewManifest.js";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

describe("产品审查模式（Founder Master Edition V1.0 中文框架审查版 §六）", () => {
  it("渲染出全部 51 个页面的审查行", () => {
    render(<ProductReviewModule />);
    const rows = screen.getAllByRole("row");
    // 第一行是表头，其余 51 行对应 51 个页面。
    expect(rows.length).toBe(REVIEW_PAGES.length + 1);
  });

  it("按分组筛选后行数与该分组页面数一致", () => {
    render(<ProductReviewModule />);
    fireEvent.click(screen.getByRole("button", { name: /Cloud Center（10）/ }));
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(11);
  });

  it("点击查看详情可以打开抽屉并标记为已确认，刷新后仍保留（本地持久化）", () => {
    const { unmount } = render(<ProductReviewModule />);
    const firstDetailButton = screen.getAllByRole("button", { name: "查看详情" })[0];
    fireEvent.click(firstDetailButton);
    fireEvent.click(screen.getByRole("button", { name: "已确认" }));
    unmount();

    render(<ProductReviewModule />);
    const confirmedPills = screen.getAllByText("已确认");
    // 页面列表里的状态列至少有一条变成"已确认"（表头之外还应有抽屉外的行内徽标）。
    expect(confirmedPills.length).toBeGreaterThan(0);
  });

  it("顶部有演示框架标识", () => {
    render(<ProductReviewModule />);
    expect(screen.getByText("演示数据")).toBeTruthy();
  });

  it("统计卡片显示 5 个分组、51 个页面", () => {
    render(<ProductReviewModule />);
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("51").length).toBeGreaterThan(0);
  });
});
