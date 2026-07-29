import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRAPHIC_WORKFLOW_STAGES, getGraphicContentState, getGraphicProjectBlocks, addContentBlock,
  removeContentBlock, reorderContentBlock, updateContentBlock, createGraphicContentProject,
  createPlatformVariant,
} from "./graphicContentMock.js";

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    setTimeout: (fn) => { fn(); return 0; },
  };
}

describe("AI图文 mock 数据层", () => {
  beforeEach(() => vi.stubGlobal("window", createFakeWindow()));
  afterEach(() => vi.unstubAllGlobals());

  it("has all 14 graphic workflow stages", () => {
    expect(GRAPHIC_WORKFLOW_STAGES).toHaveLength(14);
  });

  it("seeds the two flagship demo projects from §二十三/补充§十二", () => {
    const { projects } = getGraphicContentState();
    expect(projects.some((p) => p.name.includes("普通人如何用 AI 建立一人公司"))).toBe(true);
    expect(projects.some((p) => p.name.includes("出租屋氛围灯改造指南"))).toBe(true);
  });

  it("content is structured blocks, not a single opaque string", () => {
    const blocks = getGraphicProjectBlocks("gproj-1");
    expect(blocks.length).toBeGreaterThan(1);
    const types = new Set(blocks.map((b) => b.type));
    expect(types.size).toBeGreaterThan(1);
  });

  it("addContentBlock/removeContentBlock/reorderContentBlock keep order sequential", async () => {
    const before = getGraphicProjectBlocks("gproj-1").length;
    const afterAdd = await addContentBlock("gproj-1", "paragraph", before);
    expect(afterAdd.blocks["gproj-1"]).toHaveLength(before + 1);
    expect(afterAdd.blocks["gproj-1"].map((b) => b.order)).toEqual(afterAdd.blocks["gproj-1"].map((_, i) => i + 1));

    const target = afterAdd.blocks["gproj-1"][0];
    const afterReorder = await reorderContentBlock("gproj-1", afterAdd.blocks["gproj-1"][1].blockId, "up");
    expect(afterReorder.blocks["gproj-1"][0].blockId).not.toBe(target.blockId);

    const afterRemove = await removeContentBlock("gproj-1", afterReorder.blocks["gproj-1"][0].blockId);
    expect(afterRemove.blocks["gproj-1"]).toHaveLength(before);
  });

  it("updateContentBlock only mutates the targeted block", async () => {
    const blocks = getGraphicProjectBlocks("gproj-2");
    const target = blocks[0];
    const after = await updateContentBlock("gproj-2", target.blockId, { text: "已编辑的正文" });
    expect(after.blocks["gproj-2"].find((b) => b.blockId === target.blockId).text).toBe("已编辑的正文");
    const untouched = after.blocks["gproj-2"].find((b) => b.blockId !== target.blockId);
    expect(untouched.text).not.toBe("已编辑的正文");
  });

  it("createGraphicContentProject creates a real new project reachable by its returned id", async () => {
    const project = await createGraphicContentProject({ name: "测试图文项目", graphicType: "zhihu_answer" });
    expect(project.projectId).toBeTruthy();
    const { projects } = getGraphicContentState();
    expect(projects.find((p) => p.projectId === project.projectId)?.name).toBe("测试图文项目");
  });

  it("createPlatformVariant adds a new platform-specific version for the project", async () => {
    const before = getGraphicContentState().variants.filter((v) => v.projectId === "gproj-1").length;
    const after = await createPlatformVariant("gproj-1", "toutiao");
    const afterCount = after.variants.filter((v) => v.projectId === "gproj-1").length;
    expect(afterCount).toBe(before + 1);
  });
});
