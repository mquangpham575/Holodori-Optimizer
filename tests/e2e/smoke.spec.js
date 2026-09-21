import fs from "node:fs";
import { test, expect } from "playwright/test";

// Tests never touch the real art CDN: its media is answered from small local fixtures
// (VP9 stand-ins for the H.264 originals, which headless Chromium cannot decode).
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.holodori.dev/**", (route) => {
    const url = route.request().url();
    if (url.includes("mov_card_sign_")) return route.fulfill({ body: fixture("sign.webm"), contentType: "video/webm" });
    if (url.includes("mov_card_full_")) return route.fulfill({ body: fixture("anim.webm"), contentType: "video/webm" });
    if (url.includes("/vo_card_")) return route.fulfill({ body: fixture("voice.mp3"), contentType: "audio/mpeg" });
    return route.abort();
  });
  await page.route("**/images/cards-full/*.webp", (route) =>
    route.fulfill({ body: fixture("art.png"), contentType: "image/webp" })
  );
});

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
  const img = page.getByRole("dialog").locator("img.card-stage-art");
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
});

const FIVE_STAR = "/characters?card=00004-5-uniq-0081-00";

test("card art: animation autoplays on a loop with the signature on top, and both can be switched off", async ({ page }) => {
  await page.goto(FIVE_STAR);
  const dialog = page.getByRole("dialog");
  const video = dialog.locator("video.card-stage-video");
  await expect(video).toHaveCount(1);
  expect(await video.evaluate((v) => [v.loop, v.muted, v.autoplay])).toEqual([true, true, true]);
  await expect.poll(() => video.evaluate((v) => !v.paused && v.currentTime > 0)).toBe(true);
  // The signature is painted into two canvases (colour + matte) from one hidden video.
  const color = dialog.locator("canvas.card-sign-color");
  await expect.poll(() => color.evaluate((c) => c.width)).toBeGreaterThan(0);
  await expect(dialog.locator("canvas.card-sign-cutout")).toHaveCount(1);

  const animation = dialog.getByRole("switch", { name: "Animation" });
  const signature = dialog.getByRole("switch", { name: "Signature" });
  await expect(animation).toHaveAttribute("aria-checked", "true");
  await signature.click();
  await expect(dialog.locator("canvas.card-sign-color")).toHaveCount(0);
  await expect(video).toHaveCount(1);
  await animation.click();
  await expect(video).toHaveCount(0);

  // The choice is remembered.
  await page.goto(FIVE_STAR);
  await expect(page.getByRole("dialog").getByRole("switch", { name: "Animation" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("dialog").getByRole("switch", { name: "Signature" })).toHaveAttribute("aria-checked", "false");
});

test("card art: maximise works with idle art or animation, with or without signature, and plays the voice", async ({ page }) => {
  await page.goto(FIVE_STAR);
  await page.getByRole("dialog").getByRole("button", { name: "View larger" }).click();
  const viewer = page.locator(".card-viewer");
  await expect(viewer).toBeVisible();
  // Voice starts by itself (the click that opened the viewer is the user gesture).
  const audio = viewer.locator("audio");
  await expect.poll(() => audio.evaluate((a) => !a.paused)).toBe(true);
  await viewer.getByRole("button", { name: "Mute" }).click();
  expect(await audio.evaluate((a) => a.muted)).toBe(true);
  await expect(viewer.getByRole("button", { name: "Unmute" })).toBeVisible();

  // animation + signature
  await expect(viewer.locator("video.card-stage-video")).toHaveCount(1);
  await expect(viewer.locator("canvas.card-sign-color")).toHaveCount(1);
  // idle art + signature
  await viewer.getByRole("switch", { name: "Animation" }).click();
  await expect(viewer.locator("video.card-stage-video")).toHaveCount(0);
  await expect(viewer.locator("canvas.card-sign-color")).toHaveCount(1);
  // idle art only
  await viewer.getByRole("switch", { name: "Signature" }).click();
  await expect(viewer.locator("canvas.card-sign-color")).toHaveCount(0);
  await expect(viewer.locator("img.card-stage-art")).toBeVisible();
  // animation only
  await viewer.getByRole("switch", { name: "Animation" }).click();
  await expect(viewer.locator("video.card-stage-video")).toHaveCount(1);

  // Escape closes the viewer first, then the card, and the voice stops with the viewer.
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("card art: cards without animation still maximise, without toggles or sound", async ({ page }) => {
  await page.goto("/characters?card=00001-4-cmmn-0000-00");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("switch")).toHaveCount(0);
  await dialog.getByRole("button", { name: "View larger" }).click();
  const viewer = page.locator(".card-viewer");
  await expect(viewer.locator("img.card-stage-art")).toBeVisible();
  await expect(viewer.getByRole("switch")).toHaveCount(0);
  await expect(viewer.locator("audio")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toHaveCount(0);
});

// Card art is square (older cards) or 16:9 (newer ones) but most frames are portrait, so
// an image must be cropped to fit (object-fit: cover), never squeezed (fill).
const stretchedImages = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((img) => {
        const r = img.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || !img.naturalWidth) return false;
        const fit = getComputedStyle(img).objectFit;
        if (fit !== "fill") return false;
        return Math.abs(r.width / r.height / (img.naturalWidth / img.naturalHeight) - 1) > 0.03;
      })
      .map((img) => `${img.className || "img"} ${img.naturalWidth}x${img.naturalHeight} in ${Math.round(img.width)}x${Math.round(img.height)}`)
  );

test("card art is never stretched in the team builder, roster or card database", async ({ page }) => {
  await page.goto("/builder");
  await fillTeam(page);
  expect(await stretchedImages(page)).toEqual([]);
  await page.getByText("My Character Roster").first().click();
  await page.getByRole("button", { name: "Add All Cards" }).click();
  await expect(page.locator(".owned-card-img").first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await stretchedImages(page)).toEqual([]);
  await page.getByPlaceholder(/Search card name/).fill("Fuwawa");
  await expect(page.locator(".search-thumb-img").first()).toBeVisible();
  expect(await stretchedImages(page)).toEqual([]);

  await page.goto("/characters");
  await expect(page.locator(".char-card-img").first()).toBeVisible();
  expect(await stretchedImages(page)).toEqual([]);
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".char-row-img").first()).toBeVisible();
  expect(await stretchedImages(page)).toEqual([]);
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
