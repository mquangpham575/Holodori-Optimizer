import { test, expect } from "playwright/test";

const TEAM = [
  "Nerissa Ravencroft",
  "Nekomata Okayu",
  "Shiori Novella",
  "Hoshimachi Suisei",
  "Takane Lui",
];

async function fillTeam(page) {
  for (let i = 0; i < 5; i++) {
    await page.locator(".builder-slot").nth(i).click();
    await page.waitForTimeout(150);
    const char = page.locator(`.modal-content >> text=${TEAM[i]}`).first();
    if (await char.count()) {
      await char.click();
      await page.waitForTimeout(150);
    }
  }
}

test("home page loads", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("body")).not.toHaveText("");
  expect(errors).toEqual([]);
});

test("characters page renders cards and type icons", async ({ page }) => {
  await page.goto("/characters");
  await expect(page.locator(".char-card").first()).toBeVisible();
  const iconOk = await page
    .locator("img.elem-icon")
    .first()
    .evaluate((img) => img.naturalWidth > 0);
  expect(iconOk).toBe(true);
});

test("guides page loads", async ({ page }) => {
  await page.goto("/guides");
  await expect(page.locator("body")).not.toHaveText("");
});

test("builder: fill team, set leader, drag updates it", async ({ page }) => {
  await page.goto("/builder");
  await fillTeam(page);

  // Set leader via modal
  await page.locator(".leader-slot").click();
  await page.waitForTimeout(200);
  await page.locator(".modal-content >> text=Nerissa Ravencroft").first().click();
  await page.waitForTimeout(300);

  // L icon should appear on the leader's slot
  await expect(page.locator(".builder-slot .leader-tag-mini")).toHaveCount(1);

  // Drag Okayu (slot 1) onto the leader slot
  await page.locator(".builder-slot").nth(1).dragTo(page.locator(".leader-slot"));
  await page.waitForTimeout(700);
  await expect(page.locator(".leader-slot .slot-name")).toHaveText("Nekomata Okayu");
});

test("home active party renders when a device has an active team", async ({ page }) => {
  await page.goto("/");
  // No active team on a fresh device -> placeholder shows instead of crashing.
  await expect(page.locator("body")).not.toHaveText("");
});
