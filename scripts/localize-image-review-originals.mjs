import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "image-review/all-products/data/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let count = 0;
let bytes = 0;

for (const product of manifest.products) {
  for (const image of product.images) {
    const relativePath = `originals/${product.itemId}/${String(image.imageNo).padStart(2, "0")}.jpg`;
    const filePath = path.join(root, "image-review/all-products", relativePath);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 1024) {
      throw new Error(`比較用原本が不正です: ${product.itemId}/${image.imageNo}`);
    }
    image.originalBaseUrl ||= image.originalUrl;
    image.originalUrl = relativePath;
    count += 1;
    bytes += stat.size;
  }
}

if (count !== manifest.meta.imageCount) throw new Error("比較用原本数が一致しません");
manifest.meta.updatedAt = new Date().toISOString();
manifest.meta.originalPreview = {
  localizedAt: manifest.meta.updatedAt,
  imageCount: count,
  totalBytes: bytes,
  maxDimension: 640,
  jpegQuality: 65,
  rule: "加工前原本を内容変更せず比較表示用に縮小したJPEG",
};

const temporaryPath = `${manifestPath}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.renameSync(temporaryPath, manifestPath);
process.stdout.write(`${JSON.stringify({ images: count, totalBytes: bytes })}\n`);
