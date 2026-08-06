import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = path.join(ROOT, "image-review/all-products/data/manifest.json");
const args = new Map(process.argv.slice(2).map((value) => value.split("=", 2)));
const source = args.get("--source") || "original";
const scope = args.get("--scope") || "main";
if (!new Set(["original", "processed"]).has(source)) throw new Error("--sourceはoriginalまたはprocessedです");
if (!new Set(["main", "all"]).has(scope)) throw new Error("--scopeはmainまたはallです");
const OUTPUT_ROOT = path.join(ROOT, ".image-batch/contact-sheets", `${source}-${scope}`);
const TILE = 220;
const COLUMNS = 5;
const PER_SHEET = 25;
const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const ffmpegAvailable = spawnSync("which", ["ffmpeg"], { stdio: "ignore" }).status === 0;
let nativeSheetBinary = null;
if (!ffmpegAvailable) {
  const binaryDir = path.join(ROOT, ".image-batch/bin");
  nativeSheetBinary = path.join(binaryDir, "image-contact-sheet");
  const swiftSource = path.join(ROOT, "scripts/image-contact-sheet.swift");
  await fs.mkdir(binaryDir, { recursive: true });
  const needsCompile = !fsSync.existsSync(nativeSheetBinary)
    || fsSync.statSync(nativeSheetBinary).mtimeMs < fsSync.statSync(swiftSource).mtimeMs;
  if (needsCompile) {
    const compile = spawnSync("xcrun", ["swiftc", "-O", swiftSource, "-o", nativeSheetBinary], { encoding: "utf8" });
    if (compile.status !== 0) throw new Error(`Swift contact sheet compile: ${compile.stderr}`);
  }
}
const selected = manifest.products.flatMap((product) => {
  const images = scope === "main" ? product.images.slice(0, 1) : product.images;
  return images.map((image) => ({ product, image }));
}).map(({ product, image }) => {
  return {
    itemId: product.itemId,
    title: product.title,
    imageNo: image.imageNo,
    file: source === "processed"
      ? path.resolve(ROOT, "image-review/all-products", image.processedUrl)
      : path.join(ROOT, ".image-batch/originals", product.itemId, `${String(image.imageNo).padStart(2, "0")}.jpg`),
  };
});

await fs.mkdir(OUTPUT_ROOT, { recursive: true });
for (let offset = 0; offset < selected.length; offset += PER_SHEET) {
  const entries = selected.slice(offset, offset + PER_SHEET);
  const sheetNo = Math.floor(offset / PER_SHEET) + 1;
  const basename = `${scope}-${String(sheetNo).padStart(2, "0")}`;
  const output = path.join(OUTPUT_ROOT, `${basename}.jpg`);
  const mapping = path.join(OUTPUT_ROOT, `${basename}.json`);
  if (ffmpegAvailable) {
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y"];
    for (const entry of entries) ffmpegArgs.push("-i", entry.file);
    const filters = entries.map((entry, index) => (
      `[${index}:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=decrease:flags=lanczos,`
      + `pad=${TILE}:${TILE}:(ow-iw)/2:(oh-ih)/2:color=white[v${index}]`
    ));
    const layout = entries.map((_, index) => `${(index % COLUMNS) * TILE}_${Math.floor(index / COLUMNS) * TILE}`).join("|");
    const inputs = entries.map((_, index) => `[v${index}]`).join("");
    filters.push(`${inputs}xstack=inputs=${entries.length}:layout=${layout}:fill=white[out]`);
    ffmpegArgs.push("-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", output);
    const result = spawnSync("ffmpeg", ffmpegArgs, { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`ffmpeg ${basename}: ${result.stderr}`);
  } else {
    const result = spawnSync(nativeSheetBinary, [output, ...entries.map((entry) => entry.file)], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`native contact sheet ${basename}: ${result.stderr}`);
  }
  await fs.writeFile(mapping, `${JSON.stringify({ sheetNo, offset, entries }, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ source, scope, images: selected.length, sheets: Math.ceil(selected.length / PER_SHEET), output: path.relative(ROOT, OUTPUT_ROOT) })}\n`);
