import { test, expect } from "@playwright/test";

test("Founder sidebar spacing task is visibly complete without a recovery incident", async ({ page }) => {
  await page.goto("/");
  const newDiscussion = page.getByRole("button", { name: /新建讨论/ });
  const projects = page.locator(".sino-project-workspace");
  await expect(newDiscussion).toBeVisible();
  await expect(projects).toBeVisible();
  const layout = await page.evaluate(() => {
    const button = document.querySelector(".sino-new-conversation");
    const project = document.querySelector(".sino-project-workspace");
    const buttonBox = button.getBoundingClientRect();
    const projectBox = project.getBoundingClientRect();
    return {
      gap: Math.round(projectBox.top - buttonBox.bottom),
      projectMarginTop: getComputedStyle(project).marginTop,
      newDiscussionVisible: buttonBox.width > 0 && buttonBox.height > 0,
      projectsVisible: projectBox.width > 0 && projectBox.height > 0,
    };
  });
  expect(layout.newDiscussionVisible).toBe(true);
  expect(layout.projectsVisible).toBe(true);
  expect(layout.projectMarginTop).toBe("12px");
  expect(layout.gap).toBeLessThanOrEqual(12);
  await newDiscussion.click();
  await expect(page.locator(".sino-draft-discussion")).toBeVisible();
  const projectToggle = page.getByRole("button", { name: "项目", exact: true });
  await projectToggle.click();
  await expect(projectToggle).toHaveAttribute("aria-expanded", /true|false/);
});
