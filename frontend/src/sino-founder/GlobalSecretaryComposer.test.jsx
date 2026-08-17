// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSecretaryComposer } from "./GlobalSecretaryComposer.jsx";

afterEach(() => cleanup());

describe("GlobalSecretaryComposer mode header", () => {
  it("replaces the duplicate label with the working mode switch", () => {
    const onModeChange = vi.fn();
    const onChange = vi.fn();
    const { container } = render(<GlobalSecretaryComposer value="讨论内容" onChange={onChange} onSubmit={vi.fn()} busy={false} mode="sino" onModeChange={onModeChange} />);

    expect(screen.queryByText("与 Sino 讨论")).toBeNull();
    expect(screen.getByRole("button", { name: "Sino" }).classList.contains("is-active")).toBe(true);
    expect(screen.getByRole("button", { name: "多模型讨论" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "自动多轮" })).toBeTruthy();
    expect(container.querySelector(".sino-global-composer > .sino-council-mode")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "多模型讨论" }));
    expect(onModeChange).toHaveBeenCalledWith("council");
    fireEvent.click(screen.getByRole("button", { name: "自动多轮" }));
    expect(onModeChange).toHaveBeenCalledWith("auto");
    fireEvent.change(screen.getByLabelText("讨论内容"), { target: { value: "新的内容" } });
    expect(onChange).toHaveBeenCalledWith("新的内容");
  });

  it.each(["sino", "council", "auto"])("submits %s mode with Enter through the form submit path", (mode) => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<GlobalSecretaryComposer value="发送内容" onChange={vi.fn()} onSubmit={onSubmit} busy={false} mode={mode} onModeChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText("讨论内容"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps Shift+Enter for newlines and ignores empty, busy and composing Enter", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const { rerender } = render(<GlobalSecretaryComposer value="多行内容" onChange={vi.fn()} onSubmit={onSubmit} busy={false} mode="sino" onModeChange={vi.fn()} />);
    const input = screen.getByLabelText("讨论内容");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(<GlobalSecretaryComposer value="   " onChange={vi.fn()} onSubmit={onSubmit} busy={false} mode="sino" onModeChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText("讨论内容"), { key: "Enter" });
    rerender(<GlobalSecretaryComposer value="不可重复" onChange={vi.fn()} onSubmit={onSubmit} busy mode="sino" onModeChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText("讨论内容"), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the send button on the same form submit path", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<GlobalSecretaryComposer value="按钮发送" onChange={vi.fn()} onSubmit={onSubmit} busy={false} mode="sino" onModeChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("grows the compact textarea to a capped height and then scrolls internally", () => {
    const { rerender } = render(<GlobalSecretaryComposer value="短内容" onChange={vi.fn()} onSubmit={vi.fn()} busy={false} mode="sino" onModeChange={vi.fn()} />);
    const input = screen.getByLabelText("讨论内容");
    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 120 });
    rerender(<GlobalSecretaryComposer value="两行内容\n继续输入" onChange={vi.fn()} onSubmit={vi.fn()} busy={false} mode="sino" onModeChange={vi.fn()} />);
    expect(input.style.height).toBe("120px");
    expect(input.style.overflowY).toBe("hidden");
    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 260 });
    rerender(<GlobalSecretaryComposer value={`${"长内容".repeat(100)}。`} onChange={vi.fn()} onSubmit={vi.fn()} busy={false} mode="sino" onModeChange={vi.fn()} />);
    expect(input.style.height).toBe("180px");
    expect(input.style.overflowY).toBe("auto");
  });

  it("accepts pasted, dropped and selected images and removes previews", () => {
    const onAddImages = vi.fn(); const onRemoveImage = vi.fn();
    const image = new File(["png"], "shot.png", { type: "image/png" });
    const { container } = render(<GlobalSecretaryComposer value="箭头这里" onChange={vi.fn()} onSubmit={vi.fn()} busy={false} attachments={[{ localId: "1", name: "shot.png", preview: "blob:shot" }]} onAddImages={onAddImages} onRemoveImage={onRemoveImage} />);
    fireEvent.paste(screen.getByLabelText("讨论内容"), { clipboardData: { files: [image] } });
    fireEvent.drop(container.querySelector("form"), { dataTransfer: { files: [image] } });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [image] } });
    expect(onAddImages).toHaveBeenCalledTimes(3);
    expect(screen.getByAltText("shot.png")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "删除图片 1" }));
    expect(onRemoveImage).toHaveBeenCalledWith(0);
  });
});
