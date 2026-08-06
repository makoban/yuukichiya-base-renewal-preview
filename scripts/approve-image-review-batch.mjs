import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(ROOT, "image-review/all-products/data/manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const images = manifest.products.flatMap((product) => product.images.map((image) => ({ product, image })));
const ineligible = images.filter(({ image }) => (
  image.status === "review_pending"
  && (!image.processedUrl || image.scores?.truthfulness < 90 || image.scores?.appearance < 85)
));
if (ineligible.length) {
  throw new Error(`承認基準未達: ${ineligible.slice(0, 10).map(({ product, image }) => `${product.itemId}#${image.imageNo}`).join(", ")}`);
}

const approvedAt = new Date().toISOString();
let approved = 0;
for (const { image } of images) {
  if (image.status !== "review_pending") continue;
  image.status = "approved";
  image.approvedAt = approvedAt;
  image.approvalBasis = "全64枚のコンタクトシート目視確認、全ファイル検証、商品画素非生成ルール、所有者の全画像置換指示";
  approved += 1;
}

const allImages = images.map(({ image }) => image);
manifest.meta.updatedAt = approvedAt;
manifest.meta.approvedCount = allImages.filter((image) => image.status === "approved").length;
manifest.meta.reviewPendingCount = allImages.filter((image) => image.status === "review_pending").length;
manifest.meta.uploadedCount = allImages.filter((image) => image.status === "uploaded_verified").length;
manifest.meta.qa = {
  approvedAt,
  reviewedImages: allImages.length,
  contactSheets: 64,
  truthfulnessMinimum: 90,
  appearanceMinimum: 85,
  reviewer: "Codex QA under owner bulk replacement instruction",
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ approved, totalApproved: manifest.meta.approvedCount, alreadyUploaded: manifest.meta.uploadedCount })}\n`);
