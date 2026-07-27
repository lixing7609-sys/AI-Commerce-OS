import { describe, expect, it } from "vitest";

import { buildDetailTabs } from "../../../pages/shopDetailTabs.js";
import { STORE_DETAIL_EXTRA_TABS } from "./storeDetailExtraTabs.jsx";

/**
 * 阶段：Founder Store Center IA 精修——验证「平台连接器」标签页被
 * 正确插入到店铺详情的「链接与授权」和「任务」之间，且不影响
 * Developer 版（不传 extraDetailTabs 时）原有的标签页顺序。
 */

const BASE_TABS = [
  ["overview", "概览"],
  ["auth", "连接与授权"],
  ["tasks", "任务"],
  ["deliverables", "成果"],
  ["sync", "同步日志"],
];

describe("STORE_DETAIL_EXTRA_TABS (Founder-only store detail tab registry)", () => {
  it("declares 平台连接器 with the stable internal key platformConnector", () => {
    const tab = STORE_DETAIL_EXTRA_TABS.find((t) => t.key === "platformConnector");
    expect(tab).toBeTruthy();
    expect(tab.label).toBe("平台连接器");
  });

  it("is configured to insert immediately after 链接与授权 (key: auth)", () => {
    const tab = STORE_DETAIL_EXTRA_TABS.find((t) => t.key === "platformConnector");
    expect(tab.insertAfter).toBe("auth");
  });
});

describe("buildDetailTabs (shared tab-insertion helper in ShopCenterContent.jsx)", () => {
  it("Developer edition (no extraDetailTabs) keeps the original 5-tab order unchanged", () => {
    expect(buildDetailTabs(BASE_TABS, undefined)).toEqual(BASE_TABS);
    expect(buildDetailTabs(BASE_TABS, [])).toEqual(BASE_TABS);
  });

  it("inserts 平台连接器 exactly between 链接与授权 and 任务 for Founder", () => {
    const result = buildDetailTabs(BASE_TABS, STORE_DETAIL_EXTRA_TABS);
    const keys = result.map(([key]) => key);
    expect(keys).toEqual(["overview", "auth", "platformConnector", "tasks", "deliverables", "sync"]);
    const authIndex = keys.indexOf("auth");
    const connectorIndex = keys.indexOf("platformConnector");
    const tasksIndex = keys.indexOf("tasks");
    expect(connectorIndex).toBe(authIndex + 1);
    expect(tasksIndex).toBe(connectorIndex + 1);
  });

  it("preserves every original tab's label unchanged", () => {
    const result = buildDetailTabs(BASE_TABS, STORE_DETAIL_EXTRA_TABS);
    const asMap = Object.fromEntries(result);
    expect(asMap.overview).toBe("概览");
    expect(asMap.auth).toBe("连接与授权");
    expect(asMap.tasks).toBe("任务");
    expect(asMap.deliverables).toBe("成果");
    expect(asMap.sync).toBe("同步日志");
  });
});
