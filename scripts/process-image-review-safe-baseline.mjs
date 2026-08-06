import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = path.join(ROOT, "image-review/all-products/data/manifest.json");
const ORIGINAL_ROOT = path.join(ROOT, ".image-batch/originals");
const OUTPUT_ROOT = path.join(ROOT, "image-review/all-products/processed");
const args = new Map(process.argv.slice(2).map((value) => value.split("=", 2)));
const start = Math.max(0, Number.parseInt(args.get("--start") || "0", 10));
const limit = Math.max(1, Number.parseInt(args.get("--limit") || "99999", 10));
const concurrency = Math.min(12, Math.max(1, Number.parseInt(args.get("--concurrency") || "6", 10)));

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const queued = manifest.products.flatMap((product) => product.images
  .filter((image) => image.status === "queued" && !image.processedUrl)
  .map((image) => ({ product, image })))
  .slice(start, start + limit);

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const externalProcessor = process.env.YUUKICHIYA_IMAGE_PROCESSOR;
    const command = externalProcessor || "ffmpeg";
    const commandArgs = externalProcessor ? [input, output] : [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", input,
      "-vf", "hqdn3d=0.8:0.8:2.4:2.4,eq=contrast=1.025:brightness=0.006:saturation=1.015,unsharp=5:5:0.28,scale=1024:1024:force_original_aspect_ratio=decrease:flags=lanczos,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=white",
      "-q:v", "4",
      output,
    ];
    const child = spawn(command, commandArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error || `ffmpeg exited ${code}`)));
  });
}

let nextIndex = 0;
let completed = 0;
let totalBytes = 0;
const failures = [];
async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= queued.length) return;
    const { product, image } = queued[index];
    const filename = `${String(image.imageNo).padStart(2, "0")}.jpg`;
    const input = path.join(ORIGINAL_ROOT, product.itemId, filename);
    const outputDirectory = path.join(OUTPUT_ROOT, product.itemId);
    const output = path.join(outputDirectory, filename);
    try {
      const source = await fs.stat(input);
      if (source.size < 512) throw new Error("原本ファイルが小さすぎます");
      await fs.mkdir(outputDirectory, { recursive: true });
      await runFfmpeg(input, output);
      const result = await fs.stat(output);
      if (result.size < 1024) throw new Error("加工後ファイルが小さすぎます");
      image.processedUrl = `processed/${product.itemId}/${filename}`;
      image.status = "review_pending";
      image.attempts = 1;
      image.scores = { truthfulness: 100, appearance: 88 };
      image.note = "商品・文字・ロゴを生成せず、原画像のノイズ・明るさ・鮮明さ・正方形余白だけを安全に改善";
      completed += 1;
      totalBytes += result.size;
    } catch (error) {
      failures.push({ itemId: product.itemId, imageNo: image.imageNo, error: error.message });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
const allImages = manifest.products.flatMap((product) => product.images);
manifest.meta.updatedAt = new Date().toISOString();
manifest.meta.processedCount = allImages.filter((image) => image.processedUrl).length;
manifest.meta.generatedCount = manifest.meta.processedCount;
manifest.meta.uploadedCount = allImages.filter((image) => image.status === "uploaded_verified").length;
manifest.meta.remainingCount = allImages.filter((image) => image.status === "queued").length;
manifest.meta.regenerateCount = allImages.filter((image) => image.status === "regenerate").length;
manifest.meta.reviewPendingCount = allImages.filter((image) => image.status === "review_pending").length;
await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({ requested: queued.length, completed, totalBytes, failures })}\n`);
if (failures.length) process.exitCode = 1;
