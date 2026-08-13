// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemBuilderPanel } from "./SystemBuilderPanel.jsx";

afterEach(cleanup);

describe("System Builder boundary", () => {
  it("renders only the five application architecture sections", async () => {
    const onPrepare = vi.fn().mockResolvedValue({ system_blueprint: { system_key: "operator_ai", system_name: "Operator AI", system_goal: "创建 Operator AI", system_boundaries: ["独立边界"], core_modules: ["商品模块"], system_relationships: ["商品读取订单"], implementation_plan: ["Founder 确认"] } });
    render(<SystemBuilderPanel onPrepare={onPrepare} />);
    fireEvent.change(screen.getByLabelText("应用系统目标"), { target: { value: "创建 Operator AI" } });
    fireEvent.click(screen.getByRole("button", { name: "生成系统蓝图" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith("创建 Operator AI"));
    for (const label of ["01 · 系统目标", "02 · 系统边界", "03 · 核心模块", "04 · 系统关系", "05 · 实施计划"]) expect(screen.getByText(label)).toBeTruthy();
    for (const label of ["02 · 能力", "03 · 智能体", "Skill", "Prompt", "Workflow", "Model"]) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByRole("navigation", { name: "系统构建器模块" })).toBeNull();
    expect(screen.queryByRole("button", { name: "系统蓝图" })).toBeNull();
    expect(screen.queryByRole("button", { name: "AI 能力中心" })).toBeNull();
  });
});
