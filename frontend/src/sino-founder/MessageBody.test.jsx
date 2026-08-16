// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageBody } from "./MessageBody.jsx";

afterEach(() => cleanup());

describe("MessageBody", () => {
  it("renders safe headings, paragraphs, lists, line breaks and emphasis", () => {
    const { container } = render(<MessageBody>{`# AI Commerce OS Constitution V1

## 一、AI Commerce OS 的定义

第一行
第二行

1. Intelligence Evolution Layer
2. AI Commerce OS Cloud

- **最高原则**
- 保持原始内容

<script>alert("unsafe")</script>`}</MessageBody>);

    expect(screen.getByRole("heading", { level: 1, name: "AI Commerce OS Constitution V1" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "一、AI Commerce OS 的定义" })).toBeTruthy();
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(screen.getByText("最高原则").tagName).toBe("STRONG");
    expect([...container.querySelectorAll("p")].find((item) => item.textContent === "第一行第二行")?.querySelector("br")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText('<script>alert("unsafe")</script>')).toBeTruthy();
  });
});
