import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG_URL = "https://yuukichiya-purchase-history-prototype.onrender.com/api/catalog";
const OUTPUT = path.join(ROOT, "image-review/all-products/data/manifest.json");
const PILOT_METADATA = path.join(ROOT, "image-review/151900296/metadata.json");

function canonicalPath(value) {
  try {
    return new URL(String(value || "")).pathname;
  } catch {
    return "";
  }
}

const response = await fetch(CATALOG_URL, {
  headers: { "user-agent": "YuukichiyaImageReviewManifest/1.0" },
});
if (!response.ok) throw new Error(`catalog fetch failed: HTTP ${response.status}`);

const catalog = await response.json();
const pilot = JSON.parse(await fs.readFile(PILOT_METADATA, "utf8"));
const products = Array.isArray(catalog.allProducts) ? catalog.allProducts : [];
const details = catalog.productDetails && typeof catalog.productDetails === "object"
  ? catalog.productDetails
  : {};

const pilotUploadedPath = canonicalPath(pilot.uploaded_image_url);
const records = products.map((product) => {
  const itemId = String(product.id || product.n || "");
  const currentImages = Array.isArray(details[itemId]?.images) ? details[itemId].images : [];
  const images = currentImages.map((currentBaseUrl, index) => {
    const imageNo = index + 1;
    const isPilot = itemId === String(pilot.item_id)
      && imageNo === Number(pilot.uploaded_image_no)
      && canonicalPath(currentBaseUrl) === pilotUploadedPath;
    return {
      imageNo,
      originalUrl: isPilot
        ? pilot.original_image_urls[index]
        : currentBaseUrl,
      currentBaseUrl,
      processedUrl: isPilot
        ? `../${pilot.item_id}/${pilot.approved_candidate.file}`
        : null,
      status: isPilot ? "uploaded_verified" : "queued",
      attempts: isPilot ? pilot.approved_candidate.generation_attempt : 0,
      scores: isPilot ? {
        truthfulness: pilot.approved_candidate.truthfulness_score,
        appearance: pilot.approved_candidate.appearance_score,
      } : null,
      note: isPilot ? "先行試験でBASE API反映と公開表示を確認済み" : "",
    };
  });
  return {
    itemId,
    title: String(product.t || "商品名未登録"),
    publicUrl: String(product.u || `https://yuukichiya.base.shop/items/${itemId}`),
    imageCount: images.length,
    images,
  };
});

const imageCount = records.reduce((sum, product) => sum + product.images.length, 0);
const uploadedCount = records.reduce(
  (sum, product) => sum + product.images.filter((image) => image.status === "uploaded_verified").length,
  0,
);
if (records.length !== Number(catalog.meta?.itemCount)) {
  throw new Error(`product count mismatch: ${records.length} != ${catalog.meta?.itemCount}`);
}
if (imageCount === 0 || records.some((product) => product.imageCount === 0)) {
  throw new Error("商品画像が0件の商品、または全体0件を検出しました");
}

const manifest = {
  meta: {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    catalogCompletedAt: catalog.meta?.completedAt || null,
    catalogHash: catalog.meta?.hash || null,
    productCount: records.length,
    imageCount,
    uploadedCount,
    remainingCount: imageCount - uploadedCount,
    scoreThresholds: {
      truthfulness: 90,
      appearance: 85,
    },
    rule: "商品そのものの色・形・素材・縫製・ロゴ・文字・付属品を変えず、背景・光・傾き・構図だけを改善する",
  },
  products: records,
};

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest.meta)}\n`);
