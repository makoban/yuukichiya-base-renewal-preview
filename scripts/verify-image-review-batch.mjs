import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PAGE_ROOT = path.join(ROOT, "image-review/all-products");
const REVIEW_ROOT = path.join(ROOT, "image-review");
const MANIFEST = path.join(PAGE_ROOT, "data/manifest.json");
const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

const allowedStatuses = new Set(["review_pending", "approved", "uploaded_verified"]);
const allowedHosts = new Set(["base-ec2.akamaized.net", "baseec-img-mng.akamaized.net"]);
const errors = [];
let images = 0;
let totalBytes = 0;
const originalUrls = new Set();
const processedFiles = new Set();

for (const product of manifest.products) {
  if (!/^\d+$/.test(product.itemId) || !product.title || product.imageCount !== product.images.length) {
    errors.push(`${product.itemId}: 商品台帳が不正です`);
  }
  for (const image of product.images) {
    images += 1;
    let original;
    try { original = new URL(image.originalUrl); } catch {}
    if (!original || original.protocol !== "https:" || !allowedHosts.has(original.hostname)) {
      errors.push(`${product.itemId}:${image.imageNo}: 原本URLが不正です`);
    } else if (originalUrls.has(original.pathname)) {
      errors.push(`${product.itemId}:${image.imageNo}: 原本URLが重複しています`);
    } else {
      originalUrls.add(original.pathname);
    }
    if (!image.processedUrl || !allowedStatuses.has(image.status)) {
      errors.push(`${product.itemId}:${image.imageNo}: 加工状態が未完了です`);
      continue;
    }
    if (!image.scores || image.scores.truthfulness < manifest.meta.scoreThresholds.truthfulness) {
      errors.push(`${product.itemId}:${image.imageNo}: 忠実度が基準未満です`);
    }
    const resolved = path.resolve(PAGE_ROOT, image.processedUrl);
    if (!resolved.startsWith(`${REVIEW_ROOT}${path.sep}`)) {
      errors.push(`${product.itemId}:${image.imageNo}: 加工後パスが確認領域外です`);
      continue;
    }
    if (processedFiles.has(resolved)) errors.push(`${product.itemId}:${image.imageNo}: 加工後ファイルが重複しています`);
    processedFiles.add(resolved);
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile() || stat.size < 1024) throw new Error("ファイルが小さすぎます");
      totalBytes += stat.size;
      const file = await fs.readFile(resolved);
      const size = jpegDimensions(file);
      if (!size || size.width !== 1024 || size.height !== 1024) {
        errors.push(`${product.itemId}:${image.imageNo}: 1024x1024 JPEGではありません`);
      }
    } catch (error) {
      errors.push(`${product.itemId}:${image.imageNo}: ${error.message}`);
    }
  }
}

if (manifest.products.length !== 606) errors.push(`商品数 ${manifest.products.length} != 606`);
if (images !== 1597 || images !== manifest.meta.imageCount) errors.push(`画像数 ${images} != 1597`);
if (errors.length) {
  process.stderr.write(`${JSON.stringify({ errors: errors.slice(0, 100), errorCount: errors.length }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ products: manifest.products.length, images, processedFiles: processedFiles.size, totalBytes, errors: 0 })}\n`);
