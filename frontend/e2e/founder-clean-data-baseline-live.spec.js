import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

test("Founder opens on the clean data baseline without recreating history", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.clear());
  const [conversations, projects, drafts, domains, capabilities, assets] = await Promise.all([
    request.get(`${API}/conversations`),
    request.get(`${API}/founder-ai/projects`),
    request.get(`${API}/founder-ai/drafts`),
    request.get(`${API}/founder-ai/capability-repository/domains`),
    request.get(`${API}/founder-ai/capability-repository/assets`),
    request.get(`${API}/founder-ai/asset-memory-center`),
  ]);
  expect(await conversations.json()).toEqual([]);
  expect((await projects.json())).toHaveLength(4);
  expect((await drafts.json()).drafts).toEqual([]);
  const domainPayload = await domains.json();
  expect(domainPayload.domains).toHaveLength(6);
  for (const domain of domainPayload.domains) {
    expect(domain.counts).toMatchObject({ candidate: 0, developing: 0, testing: 0, ready: 0 });
  }
  expect((await capabilities.json()).assets).toEqual([]);
  const assetPayload = await assets.json();
  expect(assetPayload.artifacts).toEqual([]);
  expect(assetPayload.memories).toEqual([]);
  expect(assetPayload.executions).toEqual([]);

  await page.goto("/");
  await expect(page.locator(".sino-conversation-item")).toHaveCount(0);
  await expect(page.locator(".sino-project-item")).toHaveCount(4);
  await expect(page.getByRole("article", { name: /Task Card:/ })).toHaveCount(0);

  await page.getByRole("button", { name: "能力仓库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "草案中心" })).toBeVisible();
  await expect(page.getByText("还没有草案")).toBeVisible();
  await page.getByRole("button", { name: "能力周期", exact: true }).click();
  await expect(page.getByRole("heading", { name: "能力仓库" })).toBeVisible();
  await expect(page.locator(".sino-domain-list .sino-workspace-row")).toHaveCount(6);
  await expect(page.locator(".sino-asset-list .sino-workspace-row")).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".sino-conversation-item")).toHaveCount(0);
  await expect(page.locator(".sino-project-item")).toHaveCount(4);
  await expect(page.getByRole("article", { name: /Task Card:/ })).toHaveCount(0);
});
