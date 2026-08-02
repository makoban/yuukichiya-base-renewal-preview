import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexPath = resolve(root, "index.html");
const index = await readFile(indexPath, "utf8");
const contact = await readFile(resolve(root, "contact.html"), "utf8");
const previewActions = await readFile(resolve(root, "assets/preview-actions.js"), "utf8");

const checks = [
  ["HP logo image", /assets\/yuukichiya-logo\.(?:png|webp|svg)/i],
  ["purchase history links", (text) => (text.match(/yuukichiya-purchase-history-prototype\.onrender\.com/g) || []).length >= 2],
  ["5,000 yen free-shipping notice", /5,000円以上の[\s\S]{0,120}送料無料/],
  ["major closure 14-day lead", /ykMajorClosureLeadDays\s*=\s*14/],
  ["semantic search asset", /assets\/search-relevance\.js/],
  ["public catalog reset", (text) => /assets\/base-production-catalog\.js/.test(text) && /window\.ykCurrentCatalog/.test(text)],
  ["BASE live catalog apply", (text) => /window\.ykApplyLiveCatalog/.test(text) && /dataset\.ykCatalogSource\s*=\s*["']base-live["']/.test(text)],
  ["dynamic category rendering", (text) => /function ykRenderCategoryCatalog/.test(text) && /function ykBindSchoolLinks/.test(text)],
  ["sold-out handling", /SOLD OUT/],
  ["price-down and NEW labels", (text) => /yk-sale-badge/.test(text) && /yk-new-badge/.test(text)],
  ["privacy-policy link", /href=["']privacy\.html["']/],
  ["desktop image viewer bound", /width:\s*min\(94vw,1120px\)/],
  ["mobile image viewer bound", /width:\s*calc\(100vw - 16px\)/],
  ["numeric-only student number", /inputmode=["']numeric["']/],
  ["multiple-image product gallery", (text) => /data-yk-preview-gallery-next/.test(text) && /ykRenderPreviewGallery/.test(text)],
  ["product description display", (text) => /data-yk-preview-description/.test(text) && /ykRenderPreviewDescription/.test(text)],
  ["product description whitespace normalization", (text) => /function ykNormalizePreviewDescription/.test(text) && /\.filter\(Boolean\)\s*\.join\("\\n"\)/.test(text)],
  ["mobile size and quantity controls stack vertically", /\.yk-preview-purchase\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/],
];

const failures = [];
for (const [label, test] of checks) {
  const passed = typeof test === "function" ? test(index) : test.test(index);
  if (!passed) failures.push(label);
}

if (!/この画面ではご注文を確定できません。商品ページから購入手続きへお進みください。/.test(previewActions)) {
  failures.push("customer-facing checkout guidance");
}
if (/下書き確認中/.test(previewActions)) {
  failures.push("no internal draft wording in checkout guidance");
}
if (!/name=["']source["']\s+value=["']ec["']/.test(contact)) {
  failures.push("EC inquiry source marker");
}
if (!/action=["']https:\/\/yuukichi-ya\.com\/contact-submit\.php["']/.test(contact)) {
  failures.push("EC inquiry official endpoint");
}

const requiredAssets = [
  "assets/search-relevance.js",
  "assets/base-production-catalog.js",
  "assets/catalog-runtime.js",
  "assets/preview-product-inventory.js",
  "assets/preview-product-options.js",
  "assets/preview-product-details.js",
];

for (const asset of requiredAssets) {
  try {
    await stat(resolve(root, asset));
  } catch {
    failures.push(`required asset: ${asset}`);
  }
}

if (failures.length) {
  console.error("Yuukichiya EC regression contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Yuukichiya EC regression contract: OK (${checks.length + requiredAssets.length + 4} checks)`);
}
