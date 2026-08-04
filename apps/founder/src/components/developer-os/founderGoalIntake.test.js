import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyFounderGoal, GOAL_CLASSIFICATION, requestDeveloperMissionIfGoal, routeFounderMessage } from "../founder-ai/founderGoalIntake.js";

const developerGoals = [
  "把‘今日经营重点’卡片标题改成‘今日最高优先事项’。",
  "把 Founder 首页 Greeting 升级为 Sino COO Daily Briefing。",
  "新增 Decision Center。",
  "优化 Founder 首页布局。",
  "修复 Mission Planner。",
];
const structuredDeveloperGoals = [
  "把 Founder 首页的 Sino COO Daily Briefing 做成真正的数据驾驶舱",
  "把 Founder 首页的 Sino COO Daily Briefing 接入真实 Developer OS 数据",
  "让 Founder 首页显示昨天成果、今日建议和等待决策",
  "给 Founder 首页增加 Company Health",
];

test("one classifier prioritizes explicit development actions with concrete objects", () => {
  for (const goal of [...developerGoals, ...structuredDeveloperGoals]) {
    assert.equal(classifyFounderGoal(goal), GOAL_CLASSIFICATION.DEVELOPER_GOAL, goal);
  }
});

test("structured object-action-result goals route to Developer OS", async () => {
  for (const goal of structuredDeveloperGoals) {
    const fixture = routeFixture();
    const route = await routeFounderMessage(goal, fixture.developerOS);
    assert.equal(route.classification, GOAL_CLASSIFICATION.DEVELOPER_GOAL, goal);
    assert.equal(route.snapshot.mission.status, "waiting_execution_approval");
    assert.deepEqual(fixture.submitted, [goal]);
  }
});

test("only genuine discussion language enters Discussion", () => {
  for (const discussion of [
    "分析一下是否应该修改 Founder 首页。",
    "你怎么看当前 Founder 首页？",
    "讨论一下 Founder 首页。",
    "为什么 Founder 页面这样设计？",
    "帮我比较两个 Founder 首页方案。",
  ]) assert.equal(classifyFounderGoal(discussion), GOAL_CLASSIFICATION.DISCUSSION, discussion);
  assert.equal(classifyFounderGoal("帮我处理一下"), GOAL_CLASSIFICATION.UNCLEAR);
});

test("developer goal intake submits the complete original text", async () => {
  let submittedGoal = null;
  const developerOS = {
    request_today_mission: async (goal) => {
      submittedGoal = goal;
      return { mission: { title: goal } };
    },
  };
  const goal = developerGoals[0];
  const snapshot = await requestDeveloperMissionIfGoal(goal, developerOS);
  assert.equal(submittedGoal, goal);
  assert.equal(snapshot.mission.title, goal);
});

function routeFixture() {
  const submitted = [];
  const developerOS = {
    request_today_mission: async (goal) => {
      submitted.push(goal);
      return {
        classification: "developer_goal",
      mission: { title: goal, status: "waiting_execution_approval" },
      run: { state: "waiting_execution_approval", run_id: null },
      command_context: { plan_id: "plan-new" },
      };
    },
  };
  return { developerOS, submitted };
}

for (const [name, history] of [
  ["new conversation first explicit goal", []],
  ["historical conversation explicit new goal", [{ id: "old", type: "user", text: "旧消息" }]],
  ["post-reset first explicit goal", []],
]) {
  test(`${name} renders a waiting approval card without Discussion fallback`, async () => {
    const fixture = routeFixture();
    const route = await routeFounderMessage(developerGoals[0], fixture.developerOS, { messages: history });
    assert.equal(route.classification, GOAL_CLASSIFICATION.DEVELOPER_GOAL);
    assert.equal(route.snapshot.mission.status, "waiting_execution_approval");
    assert.equal(route.snapshot.mission.title, developerGoals[0]);
    assert.deepEqual(fixture.submitted, [developerGoals[0]]);
  });
}

test("unclear input asks one concrete clarification and never reuses a Mission", async () => {
  const fixture = routeFixture();
  const route = await routeFounderMessage("帮我处理一下", fixture.developerOS);
  assert.match(route.clarification, /具体页面、组件或功能/);
  assert.equal(route.snapshot, null);
  assert.deepEqual(fixture.submitted, []);
});

test("real FounderConversation submit flow uses the one route and appends approval card", async () => {
  const flowSource = await readFile(new URL("../founder-ai/sinoFlow.js", import.meta.url), "utf8");
  assert.match(flowSource, /goalRoute = await routeFounderMessage\(displayText, developerOS\)/);
  assert.match(flowSource, /type: "developer-mission-approval"/);
  assert.match(flowSource, /if \(snapshot\)/);
  assert.doesNotMatch(flowSource, /classifyFounderGoal\(/);
});
