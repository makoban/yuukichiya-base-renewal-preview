import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".image-batch/gpt-image2/qa");
const url = process.env.YUUKICHIYA_REVIEW_URL || "http://127.0.0.1:8765/image-review/gpt-image2/";
const widths = [320, 360, 375, 390, 393, 412, 430, 1440];
await fs.mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const results = [];
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 900 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("#grid .card");
    const state = await page.evaluate(() => {
      const rootElement = document.documentElement;
      const overflows = Array.from(document.querySelectorAll("body *")).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > rootElement.clientWidth + 1;
      }).slice(0, 10).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.trim().slice(0, 80) }));
      const first = document.querySelector("#grid .card");
      const images = Array.from(first.querySelectorAll("img"));
      return {
        clientWidth: rootElement.clientWidth,
        scrollWidth: rootElement.scrollWidth,
        cards: document.querySelectorAll("#grid .card").length,
        stats: document.querySelector("#stats")?.textContent.trim(),
        firstTitle: first.querySelector("h2")?.textContent.trim(),
        firstStatus: first.querySelector(".status")?.textContent.trim(),
        description: first.querySelector(".description")?.textContent.trim().slice(0, 120),
        images: images.map((image) => ({ src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })),
        overflows,
      };
    });
    if (state.scrollWidth > state.clientWidth + 1 || state.overflows.length) {
      throw new Error(`${width}pxで横はみ出し: ${JSON.stringify(state)}`);
    }
    if (state.cards !== 60 || !state.stats?.includes("1,597") || !state.description) {
      throw new Error(`${width}pxで一覧データ不足: ${JSON.stringify(state)}`);
    }
    if (state.images.length < 1 || state.images.some((image) => image.naturalWidth < 1)) {
      throw new Error(`${width}pxで比較画像を読み込めません: ${JSON.stringify(state.images)}`);
    }
    await page.locator("#query").fill("151900296");
    await page.waitForFunction(() => document.querySelectorAll("#grid .card").length === 4);
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll("#grid .card:first-child img"));
      return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
    });
    const pilot = await page.locator("#grid .card").first().evaluate((card) => ({
      title: card.querySelector("h2")?.textContent.trim(),
      status: card.querySelector(".status")?.textContent.trim(),
      images: Array.from(card.querySelectorAll("img")).map((image) => ({ width: image.naturalWidth, height: image.naturalHeight })),
      score: card.querySelector(".score")?.textContent.trim(),
    }));
    if (pilot.images.length !== 2 || pilot.images.some((image) => image.width < 1) || !pilot.score?.includes("忠実度 96点")) {
      throw new Error(`${width}pxでGPT Image 2比較結果が不正です: ${JSON.stringify(pilot)}`);
    }
    await page.locator("#grid .zoom-trigger").first().click();
    if (!(await page.locator("#zoom").evaluate((dialog) => dialog.open))) throw new Error(`${width}pxで拡大画面が開きません`);
    await page.locator("#zoom-close").click();
    if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(output, `${width}.png`), fullPage: true });
    if (consoleErrors.length || failedRequests.length) {
      throw new Error(`${width}pxでブラウザエラー: ${JSON.stringify({ consoleErrors, failedRequests })}`);
    }
    results.push({ width, ...state, consoleErrors: 0, failedRequests: 0 });
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify({ url, widths, results, errors: 0 }, null, 2)}\n`);
