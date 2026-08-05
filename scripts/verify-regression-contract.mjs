import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexPath = resolve(root, "index.html");
const index = await readFile(indexPath, "utf8");
const contact = await readFile(resolve(root, "contact.html"), "utf8");
const previewActions = await readFile(resolve(root, "assets/preview-actions.js"), "utf8");

const checks = [
  ["theme release fingerprint", (text) => /BASE-Theme-Version" content="1\.5\.3"/.test(text) && /YK-Theme-Contract" content="83984-uniform-taxonomy-v8"/.test(text)],
  ["HP logo image", /assets\/yuukichiya-logo\.(?:png|webp|svg)/i],
  ["purchase history links", (text) => (text.match(/yuukichiya-purchase-history-prototype\.onrender\.com/g) || []).length >= 2],
  ["5,000 yen free-shipping notice", /5,000円以上の[\s\S]{0,120}送料無料/],
  ["major closure 14-day lead", /ykMajorClosureLeadDays\s*=\s*14/],
  ["seasonal closure notice leads the homepage", (text) => {
    const main = text.indexOf('<main class="yk-main"');
    const closure = text.indexOf('data-yk-major-closure hidden', main);
    const hero = text.indexOf('class="yk-hero"', main);
    const shipping = text.indexOf('12時まで当日発送', main);
    return main >= 0 && closure > main && closure < hero && hero < shipping &&
      (text.match(/data-yk-major-closure hidden/g) || []).length === 1 &&
      /\.yk-site-notices\[hidden\]\s*\{[^}]*display:\s*none/.test(text);
  }],
  ["summer and year-end closure aliases", /夏季休暇[\s\S]{0,80}年末休暇/],
  ["semantic search asset", /assets\/search-relevance-v8\.js\?v=20260805-uniform-v8/],
  ["shared faceted-intent search engine", (text) => /assets\/catalog-search-engine-v8\.js\?v=20260805-uniform-v8/.test(text) && /ykSemanticSearchEngine\.score/.test(text)],
  ["public catalog reset", (text) => /assets\/base-production-catalog\.js/.test(text) && /window\.ykCurrentCatalog/.test(text)],
  ["BASE live catalog apply", (text) => /window\.ykApplyLiveCatalog/.test(text) && /dataset\.ykCatalogSource\s*=\s*["']base-live["']/.test(text)],
  ["BASE live catalog rerenders both special shelves", (text) => {
    const applyStart = text.indexOf("window.ykApplyLiveCatalog = function");
    const applyEnd = text.indexOf("\n    };", applyStart);
    const applyBody = applyStart >= 0 && applyEnd > applyStart ? text.slice(applyStart, applyEnd) : "";
    const liveSpecialCatalog = applyBody.indexOf("ykSpecialCatalog = payload.specialCatalog");
    const priceDownRender = applyBody.indexOf('ykRenderShelf("priceDown")');
    const commutingRender = applyBody.indexOf('ykRenderShelf("commuting")');
    return liveSpecialCatalog >= 0 && priceDownRender > liveSpecialCatalog && commutingRender > priceDownRender;
  }],
  ["dynamic category rendering", (text) => /function ykRenderCategoryCatalog/.test(text) && /function ykBindSchoolLinks/.test(text)],
  ["sold-out handling", /SOLD OUT/],
  ["price-down and NEW labels", (text) => /yk-sale-badge/.test(text) && /yk-new-badge/.test(text)],
  ["category selection clears free search", (text) => /function ykClearSearchQuery\(/.test(text) && (text.match(/ykClearSearchQuery\(\);/g) || []).length === 3],
  ["badges use an image-free information strip", (text) => /\.yk-product-badges\s*\{[^}]*position:\s*static/.test(text) && /'<span class="yk-product__body">',\s*ykProductBadge\(product\),/.test(text) && /yk-shelf-card__image"><img/.test(text)],
  ["privacy-policy link", /href=["']privacy\.html["']/],
  ["desktop image viewer bound", /width:\s*min\(94vw,1120px\)/],
  ["mobile image viewer bound", /width:\s*calc\(100vw - 16px\)/],
  ["student number keeps the BASE free-text contract", (text) => !/data-condition-numeric|生徒番号は数字のみ|数字のみで入力してください/.test(text)],
  ["multiple-image product gallery", (text) => /data-yk-preview-gallery-next/.test(text) && /ykRenderPreviewGallery/.test(text)],
  ["BASE gallery removes cross-CDN duplicate lead image", (text) => /function ykPreviewImageKey/.test(text) && /\\\.akamaized\\\.net\$\/i\.test\(url\.hostname\)/.test(text) && /return ["']base-item:["'] \+ url\.pathname\.toLowerCase\(\)/.test(text)],
  ["product gallery stays inside a fixed frame", (text) => /\.yk-preview-gallery\s*\{[^}]*grid-template-rows:\s*minmax\(0,1fr\) auto[^}]*height:\s*100%[^}]*min-height:\s*0/.test(text) && /\.yk-preview-gallery__stage\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0/.test(text) && (text.match(/\.yk-preview-item-dialog__image\s*\{[^}]*position:\s*absolute[^}]*inset:\s*12px[^}]*width:\s*calc\(100% - 24px\)[^}]*height:\s*calc\(100% - 24px\)[^}]*max-height:\s*none/g) || []).length >= 2 && !/\.yk-preview-item-dialog__image\s*\{[^}]*max-height:\s*calc\(100dvh - 84px\)/.test(text)],
  ["gallery switching scrolls thumbnails horizontally only", (text) => /function ykKeepPreviewThumbVisible/.test(text) && /thumbRail\.scrollLeft/.test(text) && !/current\s*&&\s*thumb\.scrollIntoView/.test(text)],
  ["product description display", (text) => /data-yk-preview-description/.test(text) && /ykRenderPreviewDescription/.test(text)],
  ["product description whitespace normalization", (text) => /function ykNormalizePreviewDescription/.test(text) && /\.filter\(Boolean\)\s*\.join\("\\n"\)/.test(text)],
  ["BASE shop reviews", (text) => /data-yk-shop-reviews/.test(text) && /function ykRenderShopReviews/.test(text)],
  ["BASE review heading and filters", (text) => /<h2[^>]*>ショップの評価<\/h2>/.test(text) && ["all", "good", "normal", "bad"].every((score) => text.includes(`data-yk-review-filter="${score}"`))],
  ["homepage shop-wide review placement", (text) => {
    const main = text.indexOf('<main class="yk-main"');
    const reviews = text.indexOf('data-yk-shop-reviews');
    const feature = text.indexOf('id="yk-feature-image"');
    const mainEnd = text.indexOf('</main>');
    const itemDialog = text.indexOf('id="yk-preview-item-dialog"');
    return main !== -1 && main < reviews && reviews < feature && feature < mainEnd && mainEnd < itemDialog;
  }],
  ["product detail excludes shop-wide reviews", (text) => {
    const dialogStart = text.indexOf('id="yk-preview-item-dialog"');
    const dialogEnd = text.indexOf('</dialog>', dialogStart);
    return dialogStart !== -1 && dialogEnd > dialogStart && !/data-yk-shop-reviews/.test(text.slice(dialogStart, dialogEnd));
  }],
  ["BASE original review card fields", (text) => /review\.productName/.test(text) && /review\.variation/.test(text) && /review\.date/.test(text) && /review\.comment/.test(text) && /review\.reply/.test(text) && !/評価のみ（口コミ本文はありません）/.test(text) && !/勇吉屋からの返信/.test(text)],
  ["five-review pagination", (text) => /ykReviewPageSize\s*=\s*5/.test(text) && /data-yk-review-prev/.test(text) && /data-yk-review-next/.test(text)],
  ["review sorting", (text) => /value="newest"/.test(text) && /value="oldest"/.test(text) && /value="high"/.test(text) && /value="low"/.test(text) && /value="comment"/.test(text)],
  ["BASE review labels preserved", (text) => /良い/.test(text) && /普通/.test(text) && /悪い/.test(text) && !/評価[：:]\s*[1-5]/.test(text)],
  ["desktop product close stays viewport-fixed", (text) => /@media\s*\(min-width:\s*561px\)[\s\S]*?\.yk-preview-item-dialog\s*>\s*\.yk-dialog__close\s*\{[\s\S]*?position:\s*fixed/.test(text) && /100dvh/.test(text) && /100vw/.test(text)],
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
  "assets/search-relevance-v8.js",
  "assets/catalog-search-engine-v8.js",
  "assets/base-production-catalog.js",
  "assets/catalog-runtime.js",
  "assets/preview-product-inventory.js",
  "assets/preview-product-options.js",
  "assets/preview-product-details.js",
  "assets/preview-shop-reviews.js",
  "assets/base-storefront-extras.js",
];

for (const asset of requiredAssets) {
  const assetPath = resolve(root, asset);
  try {
    await stat(assetPath);
  } catch {
    failures.push(`required asset: ${asset}`);
    continue;
  }
  try {
    new Script(await readFile(assetPath, "utf8"), { filename: asset });
  } catch {
    failures.push(`valid JavaScript asset: ${asset}`);
  }
}

if (failures.length) {
  console.error("Yuukichiya EC regression contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Yuukichiya EC regression contract: OK (${checks.length + requiredAssets.length * 2 + 4} checks)`);
}
