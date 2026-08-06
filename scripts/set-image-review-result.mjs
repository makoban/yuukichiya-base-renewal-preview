import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = path.join(ROOT, "image-review/all-products/data/manifest.json");
const [itemId, imageNoValue, processedUrl, truthValue, appearanceValue, attemptsValue, status = "review_pending", note = ""] = process.argv.slice(2);
const imageNo = Number.parseInt(imageNoValue, 10);
const truthfulness = Number.parseInt(truthValue, 10);
const appearance = Number.parseInt(appearanceValue, 10);
const attempts = Number.parseInt(attemptsValue, 10);

if (!/^\d+$/.test(String(itemId || "")) || !Number.isInteger(imageNo) || imageNo < 1 || imageNo > 20) {
  throw new Error("商品IDまたは画像番号が不正です");
}
if (!processedUrl || processedUrl.startsWith("/") || processedUrl.includes("..")) {
  throw new Error("加工後画像は確認ページからの相対パスで指定してください");
}
if (![truthfulness, appearance].every((score) => Number.isInteger(score) && score >= 0 && score <= 100)) {
  throw new Error("採点は0〜100で指定してください");
}
if (!Number.isInteger(attempts) || attempts < 1) throw new Error("生成回数が不正です");
if (!new Set(["review_pending", "regenerate", "approved", "uploaded_verified"]).has(status)) {
  throw new Error("状態が不正です");
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const product = manifest.products.find((entry) => entry.itemId === String(itemId));
const image = product?.images.find((entry) => entry.imageNo === imageNo);
if (!product || !image) throw new Error("台帳に対象画像がありません");

image.processedUrl = processedUrl;
image.status = status;
image.attempts = attempts;
image.scores = { truthfulness, appearance };
image.note = note;
manifest.meta.updatedAt = new Date().toISOString();
const allImages = manifest.products.flatMap((entry) => entry.images);
manifest.meta.generatedCount = allImages.filter((entry) => entry.processedUrl).length;
manifest.meta.uploadedCount = allImages.filter((entry) => entry.status === "uploaded_verified").length;
manifest.meta.remainingCount = allImages.filter((entry) => entry.status === "queued").length;
manifest.meta.regenerateCount = allImages.filter((entry) => entry.status === "regenerate").length;
manifest.meta.reviewPendingCount = allImages.filter((entry) => entry.status === "review_pending").length;

await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ itemId, imageNo, processedUrl, truthfulness, appearance, attempts, status })}\n`);
