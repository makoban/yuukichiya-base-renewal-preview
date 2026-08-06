import fs from "node:fs";
import path from "node:path";

const [manifestArgument, journalArgument] = process.argv.slice(2);
if (!manifestArgument || !journalArgument) {
  throw new Error("manifest.json と完了済みBASEアップロードジャーナルを指定してください");
}

const manifestPath = path.resolve(manifestArgument);
const journalPath = path.resolve(journalArgument);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const publicBase = "https://makoban.github.io/yuukichiya-base-renewal-preview/image-review/all-products/";

if (!journal.completedAt) throw new Error("BASEアップロードジャーナルが完了していません");
if (journal.verifiedProductCount < manifest.meta.productCount) {
  throw new Error("最終確認済みBASE商品数が対象商品数を下回っています");
}
if (journal.verifiedImageCount !== manifest.meta.imageCount) {
  throw new Error("最終確認済み画像数がマニフェストと一致しません");
}

let updated = 0;
let alreadyUploaded = 0;
for (const product of manifest.products) {
  for (const image of product.images) {
    if (image.status === "uploaded_verified") {
      image.previousBaseUrl ||= image.originalUrl;
      image.uploadedSourceUrl ||= new URL(image.processedUrl, publicBase).href;
      alreadyUploaded += 1;
      continue;
    }
    if (image.status !== "approved") {
      throw new Error(`未承認画像があります: ${product.itemId}/${image.imageNo}`);
    }
    const key = `${product.itemId}:${image.imageNo}`;
    const entry = journal.entries[key];
    if (!entry || entry.status !== "uploaded_verified" || !entry.uploadedImageUrl) {
      throw new Error(`BASE反映記録がありません: ${product.itemId}/${image.imageNo}`);
    }
    if (String(entry.previousBaseUrl) !== String(image.currentBaseUrl)) {
      throw new Error(`旧BASE画像URLが一致しません: ${product.itemId}/${image.imageNo}`);
    }
    image.previousBaseUrl = image.currentBaseUrl;
    image.currentBaseUrl = entry.uploadedImageUrl;
    image.uploadedSourceUrl = entry.sourceUrl;
    image.uploadedAt = entry.uploadedAt;
    image.status = "uploaded_verified";
    image.note = `${image.note}。BASE APIで画像のみ入れ替え、公開CDN URLを再照合済み`;
    updated += 1;
  }
}

const imageCount = manifest.products.reduce((count, product) => count + product.images.length, 0);
if (updated + alreadyUploaded !== imageCount) throw new Error("更新画像数が一致しません");

manifest.meta.updatedAt = new Date().toISOString();
manifest.meta.uploadedCount = imageCount;
manifest.meta.approvedCount = 0;
manifest.meta.baseUpload = {
  startedAt: journal.startedAt,
  completedAt: journal.completedAt,
  targetedProductCount: manifest.meta.productCount,
  verifiedCatalogProductCount: journal.verifiedProductCount,
  verifiedImageCount: journal.verifiedImageCount,
  source: "BASE API write_items / items/add_image",
};

const temporaryPath = `${manifestPath}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temporaryPath, manifestPath);
process.stdout.write(`${JSON.stringify({
  products: manifest.meta.productCount,
  images: imageCount,
  updated,
  alreadyUploaded,
  completedAt: journal.completedAt,
})}\n`);
