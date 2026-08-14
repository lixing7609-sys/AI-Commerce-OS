import { expect, test } from "@playwright/test";

const NAV = ["AI 能力中心", "系统构建器", "执行中心", "资产与记忆"];

function luminance([red, green, blue]) {
  const values = [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(foreground, background = [9, 11, 9]) {
  const bright = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (bright + 0.05) / (dark + 0.05);
}

async function readable(locator, minimum = 4.5) {
  const rgb = await locator.evaluate((element) => {
    const match = getComputedStyle(element).color.match(/[\d.]+/g) || [];
    return match.slice(0, 3).map(Number);
  });
  expect(contrast(rgb)).toBeGreaterThanOrEqual(minimum);
}

test("five Founder primary pages use readable semantic visual hierarchy", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sino-founder-shell")).toBeVisible();
  await readable(page.locator(".sino-home h1"));
  await readable(page.locator(".sino-project-list button").first());

  for (const label of NAV) await readable(page.getByRole("button", { name: label, exact: true }));
  await expect(page.getByRole("button", { name: "Founder", exact: true })).toHaveCount(0);

  const tokens = await page.locator(".sino-app").evaluate((element) => {
    const style = getComputedStyle(element);
    return ["--text-primary", "--text-secondary", "--text-muted", "--text-label", "--text-disabled", "--surface-base", "--surface-raised", "--surface-selected"].map((name) => style.getPropertyValue(name).trim());
  });
  expect(tokens.every(Boolean)).toBe(true);

  await page.getByRole("button", { name: "AI 能力中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI 能力中心", exact: true })).toBeVisible();
  await readable(page.getByRole("heading", { name: "AI 能力中心", exact: true }));
  await readable(page.locator(".sino-asset-list > button strong").first());
  await readable(page.locator(".sino-asset-list > button p").first());

  await page.getByRole("button", { name: "系统构建器", exact: true }).click();
  await expect(page.locator('[aria-label="系统构建器"]')).toBeVisible();
  await readable(page.locator(".sino-system-structure__list header strong").first());

  await page.getByRole("button", { name: "执行中心", exact: true }).click();
  await expect(page.getByRole("heading", { name: "执行中心", exact: true })).toBeVisible();
  await readable(page.getByRole("heading", { name: "执行中心", exact: true }));

  await page.getByRole("button", { name: "资产与记忆", exact: true }).click();
  await expect(page.getByRole("heading", { name: "资产与记忆", exact: true })).toBeVisible();
  await readable(page.locator(".sino-asset-list > button strong").first());

  const disabled = page.locator("button:disabled").first();
  if (await disabled.count()) expect(await disabled.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");

  await page.getByTitle("Sino Founder AI 首页").click();
  await expect(page.locator(".sino-home h1")).toBeVisible();
});
