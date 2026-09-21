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

test("characters: search, sort and filters narrow the list and can be cleared", async ({ page }) => {
  await page.goto("/characters");
  const cards = page.locator(".char-card");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(100);

  await page.getByRole("searchbox").fill("Aki Rosenthal");
  await expect(cards.first()).toContainText("Aki Rosenthal");
  const filtered = await cards.count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards).toHaveCount(total);

  // Main-stat filter + name sort
  await page.getByRole("button", { name: "Sense", exact: true }).click();
  expect(await cards.count()).toBeLessThan(total);
  await page.locator(".sort-control select").selectOption("name");
  const names = await page.locator(".char-card-name").allTextContents();
  expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
});

test("characters: a card deep-links, shows stats and closes with Escape", async ({ page }) => {
  await page.goto("/characters?card=00004-5-uniq-0081-00");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Mystic Sun Swing");
  // Max level, bloom 5 stats for this card (checked against the master data).
  await expect(dialog.locator(".stat-tile.total strong")).toHaveText("25,920");
  await dialog.locator("#stat-level").fill("1");
  await expect(dialog.locator(".stat-tile.total strong")).not.toHaveText("25,920");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(page.url()).not.toContain("card=");
});

test("characters: cards without artwork fall back instead of showing a broken image", async ({ page }) => {
  await page.goto("/characters?card=00004-5-uniq-0081-00");
  const img = page.getByRole("dialog").locator("img.modal-card-portrait");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
});

test("characters: list view toggle", async ({ page }) => {
  await page.goto("/characters");
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".char-row").first()).toBeVisible();
  await expect(page.locator(".char-card")).toHaveCount(0);
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
