import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./loop.js";

test("full opportunity -> strategy -> content -> approval -> publish -> profit loop", () => {
  const store = createStore();
  const state = store.getState();
  const opportunity = state.opportunities[0];

  const { strategy } = store.generateStrategy(opportunity.id);
  assert.equal(opportunity.status, "strategized");

  const content = store.createContent(strategy.id);
  assert.equal(content.stage, "brief");

  store.advanceContent(content.id, "asset");
  const approval = store.submitForApproval(content.id);
  assert.equal(approval.status, "pending");
  assert.equal(content.stage, "approval");

  store.decideApproval(approval.id, "approved");
  assert.equal(content.stage, "ready");

  const publishRecord = store.publish(content.id);
  assert.equal(content.stage, "published");

  const { order } = store.recordMetrics(publishRecord.id, {
    impressions: 8000,
    clicks: 300,
    leads: 20,
    adSpend: 260,
    orderValue: 1980,
  });
  assert.ok(order, "an order should be created when orderValue is provided");
  assert.equal(order.status, "unsettled");

  const { profit, opportunity: settledOpportunity, capability } = store.settleOrder(order.id);

  // revenue 1980 - (contentCost 180 + adCost 260 + aiQuotaCost 12) = 1528
  assert.equal(profit.netProfit, 1980 - (180 + 260 + 12));
  assert.equal(settledOpportunity.status, "validated");
  assert.equal(capability.id, "cap-002");
  assert.ok(capability.consecutiveDays > 0);
});

test("publish is rejected before the content is approved", () => {
  const store = createStore();
  const opportunity = store.getState().opportunities[0];
  const { strategy } = store.generateStrategy(opportunity.id);
  const content = store.createContent(strategy.id);

  assert.throws(() => store.publish(content.id), /not approved yet/);
});

test("rejected approval sends content back to brief, not forward", () => {
  const store = createStore();
  const opportunity = store.getState().opportunities[0];
  const { strategy } = store.generateStrategy(opportunity.id);
  const content = store.createContent(strategy.id);
  store.advanceContent(content.id, "asset");
  const approval = store.submitForApproval(content.id);

  store.decideApproval(approval.id, "rejected");
  assert.equal(content.stage, "brief");
});

test("a settled order with negative profit retires the opportunity, not validates it", () => {
  const store = createStore();
  const opportunity = store.getState().opportunities[0];
  const { strategy } = store.generateStrategy(opportunity.id);
  const content = store.createContent(strategy.id);
  store.advanceContent(content.id, "asset");
  const approval = store.submitForApproval(content.id);
  store.decideApproval(approval.id, "approved");
  const publishRecord = store.publish(content.id);

  // orderValue lower than content+ad+ai cost forces a loss
  const { order } = store.recordMetrics(publishRecord.id, { adSpend: 5000, orderValue: 50 });
  const { profit, opportunity: settledOpportunity } = store.settleOrder(order.id);

  assert.ok(profit.netProfit < 0);
  assert.equal(settledOpportunity.status, "retired");
});

test("reset restores the seed dataset", () => {
  const store = createStore();
  store.createOpportunity({ title: "临时机会" });
  assert.equal(store.getState().opportunities.length, 3);

  const resetState = store.reset();
  assert.equal(resetState.opportunities.length, 2);
});

test("createContent defaults contentType and supports an explicit channel type", () => {
  const store = createStore();
  const opportunity = store.getState().opportunities[0];
  const { strategy } = store.generateStrategy(opportunity.id);

  const defaultContent = store.createContent(strategy.id);
  assert.equal(defaultContent.contentType, "短视频");
  assert.deepEqual(defaultContent.tags, []);
  assert.equal(defaultContent.referenceCount, 0);

  const opportunity2 = store.createOpportunity({ title: "第二个机会" });
  const { strategy: strategy2 } = store.generateStrategy(opportunity2.id);
  const article = store.createContent(strategy2.id, "公众号文章");
  assert.equal(article.contentType, "公众号文章");
  assert.match(article.title, /^公众号文章草稿/);
});

test("updateContent merges tags without disturbing stage, and incrementReference bumps the counter", () => {
  const store = createStore();
  const opportunity = store.getState().opportunities[0];
  const { strategy } = store.generateStrategy(opportunity.id);
  const content = store.createContent(strategy.id);

  store.updateContent(content.id, { tags: ["爆款", "夜灯"] });
  assert.deepEqual(content.tags, ["爆款", "夜灯"]);
  assert.equal(content.stage, "brief");

  store.incrementReference(content.id);
  store.incrementReference(content.id);
  assert.equal(content.referenceCount, 2);
});
