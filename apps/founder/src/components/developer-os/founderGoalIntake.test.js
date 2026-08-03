import assert from "node:assert/strict";
import test from "node:test";
import { isExplicitDeveloperGoal, requestDeveloperMissionIfGoal } from "../founder-ai/founderGoalIntake.js";

test("explicit Founder product goals route directly to request_today_mission", async () => {
  for (const goal of [
    "继续建设 AI Commerce OS Founder",
    "把 Founder 首页升级为每日经营控制台",
    "新增 Founder 今日任务功能",
    "实现 Founder 提交授权页面",
    "开发 AI Commerce OS Founder 工作台",
    "重构 Founder 首页状态模块",
    "优化 Founder 控制台",
  ]) assert.equal(isExplicitDeveloperGoal(goal), true, goal);
  let submittedGoal = null;
  const developerOS = {
    request_today_mission: async (goal) => {
      submittedGoal = goal;
      return { mission: { title: "建设 Founder 今日工作台" } };
    },
  };

  const snapshot = await requestDeveloperMissionIfGoal("继续建设 AI Commerce OS Founder", developerOS);

  assert.equal(submittedGoal, "继续建设 AI Commerce OS Founder");
  assert.equal(snapshot.mission.title, "建设 Founder 今日工作台");
});

test("ordinary questions remain in Discussion", async () => {
  for (const discussion of [
    "分析一下 Founder 页面",
    "讨论一下 Founder 首页",
    "为什么 Founder 页面这样设计",
    "怎么看 Founder 工作台",
    "是否应该升级 Founder 首页",
    "请分析 Founder 页面应该怎么设计",
  ]) assert.equal(isExplicitDeveloperGoal(discussion), false, discussion);
  let called = false;
  const developerOS = { request_today_mission: async () => { called = true; } };

  const snapshot = await requestDeveloperMissionIfGoal("请分析 Founder 页面应该怎么设计", developerOS);

  assert.equal(called, false);
  assert.equal(snapshot, null);
});
