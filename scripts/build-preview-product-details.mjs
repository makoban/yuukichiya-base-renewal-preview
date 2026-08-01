import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "assets", "base-production-catalog.js");
const snapshotDir = resolve(
  root,
  "../現行サイト_バックアップ_20260724/BASE現行EC/公開サイト保存/pages",
);
const outputPath = resolve(root, "assets", "preview-product-details.js");
const shopBaseUrl = "https://yuukichiya.base.shop";
const concurrency = 8;
const reuseExisting = process.argv.includes("--reuse-existing");

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "・")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeImageUrl(value) {
  const url = decodeHtml(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("q");
    parsed.searchParams.delete("im");
    return parsed.toString();
  } catch {
    return url.replace(/[?&](?:q|im)=[^&]*/g, "").replace(/[?&]$/, "");
  }
}

function parseProductDetail(html) {
  const galleryMatch = html.match(
    /<div\b[^>]*class="[^"]*\bitempage-item__mainImage\b[^"]*"[^>]*>([\s\S]*?)<div\b[^>]*class="[^"]*\bitempage-purchase\b/i,
  );
  const images = [];
  const seen = new Set();
  const imagePattern = /<a\b[^>]*class="[^"]*\bglightbox\b[^"]*"[^>]*href="([^"]+)"/gi;
  let imageMatch;
  while ((imageMatch = imagePattern.exec(galleryMatch?.[1] || ""))) {
    const url = normalizeImageUrl(imageMatch[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push(url);
  }

  const titleMatch = html.match(/<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i);
  const title = decodeHtml(titleMatch?.[1]).replace(/\s*\|\s*勇吉屋ネット(?:\s+powered by BASE)?\s*$/i, "");
  const descriptionMatch = html.match(
    /<div\b[^>]*id="dolce-itemdetailtext"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*id="deeplink"/i,
  );
  let description = decodeHtml(descriptionMatch?.[1]);
  if (!description) {
    const metaMatch = html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i);
    description = decodeHtml(metaMatch?.[1]);
  }
  if (title && description.startsWith(title)) {
    description = description.slice(title.length).replace(/^\s+/, "");
  }

  return { images, description };
}

async function fetchText(url, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "accept-language": "ja,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; YuukichiyaPreviewSync/1.0)",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw lastError;
}

async function readSnapshot(id) {
  return readFile(resolve(snapshotDir, `items_${id}.html`), "utf8");
}

const catalogScript = await readFile(catalogPath, "utf8");
const catalogMatch = catalogScript.match(/window\.ykAllProducts\s*=\s*(\[[\s\S]*?\]);\s*window\.ykSpecialCatalog/);
if (!catalogMatch) throw new Error("base-production-catalog.js の公開商品一覧を取得できませんでした。");
const catalogIds = [...new Set(JSON.parse(catalogMatch[1]).map((product) => String(product.id)))];
let details = {};
const failures = [];
let liveCount = 0;
let snapshotFallbackCount = 0;
let existingCount = 0;
let cursor = 0;

if (reuseExisting) {
  try {
    const existingScript = await readFile(outputPath, "utf8");
    const existingMatch = existingScript.match(/window\.ykProductDetails\s*=\s*(\{[\s\S]*\});\s*$/);
    if (existingMatch) {
      const currentIds = new Set(catalogIds);
      details = Object.fromEntries(
        Object.entries(JSON.parse(existingMatch[1])).filter(([id]) => currentIds.has(id)),
      );
      existingCount = Object.keys(details).length;
    }
  } catch {}
}

const pendingIds = catalogIds.filter((id) => !details[id]);

async function worker() {
  while (cursor < pendingIds.length) {
    const index = cursor;
    cursor += 1;
    const id = pendingIds[index];
    let html;
    let source = "live";
    try {
      html = await fetchText(`${shopBaseUrl}/items/${id}`);
      liveCount += 1;
    } catch (liveError) {
      try {
        html = await readSnapshot(id);
        source = "snapshot";
        snapshotFallbackCount += 1;
      } catch (snapshotError) {
        failures.push({ id, live: liveError.message, snapshot: snapshotError.message });
        continue;
      }
    }
    const detail = parseProductDetail(html);
    if (!detail.images.length && !detail.description) {
      failures.push({ id, source, message: "商品画像と商品説明を取得できませんでした。" });
      continue;
    }
    details[id] = detail;
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const sortedDetails = Object.fromEntries(
  Object.entries(details).sort(([left], [right]) => Number(left) - Number(right)),
);
const meta = {
  generatedAt: new Date().toISOString(),
  catalogProducts: catalogIds.length,
  detailProducts: Object.keys(sortedDetails).length,
  productsWithDescriptions: Object.values(sortedDetails).filter((detail) => detail.description).length,
  productsWithMultipleImages: Object.values(sortedDetails).filter((detail) => detail.images.length > 1).length,
  liveCount,
  snapshotFallbackCount,
  existingCount,
  failureCount: failures.length,
};
const output = [
  "/* BASE公開商品ページの商品画像と説明文をステージング商品詳細へ反映する生成データです。 */",
  `window.ykProductDetailsMeta = ${JSON.stringify(meta)};`,
  `window.ykProductDetails = ${JSON.stringify(sortedDetails).replace(/</g, "\\u003c")};`,
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);

console.log(JSON.stringify({ ...meta, failures, output: outputPath }, null, 2));
