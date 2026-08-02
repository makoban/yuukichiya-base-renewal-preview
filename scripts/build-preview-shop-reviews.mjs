import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "assets", "base-production-catalog.js");
const outputPath = resolve(root, "assets", "preview-shop-reviews.js");
const shopRoot = "https://yuukichiya.base.shop";
const pageSize = 20;
const maxPages = 25;
const reuseExisting = process.argv.includes("--reuse-existing");
const allowedImageHosts = new Set([
  "base-ec2.akamaized.net",
  "baseec-img-mng.akamaized.net",
]);

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function field(html, pattern) {
  return decodeHtml(html.match(pattern)?.[1]);
}

function imageUrl(value) {
  try {
    const url = new URL(decodeHtml(value));
    return url.protocol === "https:" && allowedImageHosts.has(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseReviewPage(html) {
  const blocks = String(html || "").match(
    /<li\b[^>]*class="[^"]*\breview01__listChild\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi,
  ) || [];
  return blocks.map((block, index) => {
    const score = block.match(/\bico--(good|normal|bad)\b/i)?.[1]?.toLowerCase() || "normal";
    const productId = block.match(/href="\/items\/(\d+)"/i)?.[1] || "";
    const productName = field(block, /<p\b[^>]*class="[^"]*\breview01__itemName\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const variation = field(block, /<p\b[^>]*class="[^"]*\breview01__itemVariation\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const date = block.match(/<time\b[^>]*datetime="(\d{4}-\d{2}-\d{2})"/i)?.[1] || "";
    const comment = field(block, /<p\b[^>]*class="[^"]*\breview01__comment\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const reply = field(block, /<p\b[^>]*class="[^"]*\breview01__reply\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const image = imageUrl(
      block.match(/<img\b[^>]*class="[^"]*\breview01__img\b[^"]*"[^>]*src="([^"]+)"/i)?.[1]
      || block.match(/<img\b[^>]*src="([^"]+)"[^>]*class="[^"]*\breview01__img\b/i)?.[1],
    );
    const id = createHash("sha256")
      .update([score, productId, productName, variation, date, comment, reply, index].join("\u0000"))
      .digest("hex")
      .slice(0, 20);
    return { id, score, productId, productName, variation, date, image, comment, reply };
  }).filter((review) => review.productName || review.comment || review.reply);
}

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "accept-language": "ja,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; YuukichiyaPreviewSync/1.0)",
        },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const waitMs = error?.status === 429 ? attempt * 3_000 : attempt * 750;
        await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
      }
    }
  }
  throw lastError;
}

async function readExisting() {
  const script = await readFile(outputPath, "utf8");
  const match = script.match(/window\.ykShopReviews\s*=\s*(\{[\s\S]*\});\s*$/);
  if (!match) throw new Error("既存の口コミデータを読み取れませんでした。");
  return JSON.parse(match[1]);
}

const catalogScript = await readFile(catalogPath, "utf8");
const seedItemId = catalogScript.match(/"id"\s*:\s*"(\d+)"/)?.[1];
if (!seedItemId) throw new Error("公開商品IDを取得できませんでした。");

let items = [];
let source = "BASEレビュー App";
let fetchError = "";
try {
  const seen = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${shopRoot}/items/${seedItemId}/reviews`);
    url.searchParams.set("format", "user");
    url.searchParams.set("score", "");
    url.searchParams.set("page", String(page));
    const pageItems = parseReviewPage(await fetchText(url));
    for (const item of pageItems) {
      const key = [item.score, item.productId, item.date, item.productName, item.comment, item.reply].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    if (pageItems.length < pageSize) break;
  }
} catch (error) {
  fetchError = error.message;
  if (!reuseExisting) throw error;
  const existing = await readExisting();
  items = Array.isArray(existing.items) ? existing.items : [];
  source = `${existing.source || source}（既存確認済みデータ）`;
}

const summary = { total: items.length, good: 0, normal: 0, bad: 0 };
for (const item of items) {
  if (Object.hasOwn(summary, item.score)) summary[item.score] += 1;
}
const data = { source, summary, items };
const meta = {
  generatedAt: new Date().toISOString(),
  source,
  seedItemId,
  ...summary,
  fetchError,
};
const output = [
  "/* BASEレビュー Appの公開ショップ評価・口コミをECステージングへ反映するフォールバックデータです。 */",
  `window.ykShopReviewsMeta = ${JSON.stringify(meta)};`,
  `window.ykShopReviews = ${JSON.stringify(data).replace(/</g, "\\u003c")};`,
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(JSON.stringify({ ...meta, output: outputPath }, null, 2));
