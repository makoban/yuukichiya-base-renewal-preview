import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = path.join(ROOT, "image-review/all-products/data/manifest.json");
const OUTPUT_ROOT = path.join(ROOT, ".image-batch/contact-sheets");
const TILE = 220;
const COLUMNS = 5;
const PER_SHEET = 25;
const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const mains = manifest.products.map((product) => ({
  itemId: product.itemId,
  title: product.title,
  file: path.join(ROOT, ".image-batch/originals", product.itemId, "01.jpg"),
}));

await fs.mkdir(OUTPUT_ROOT, { recursive: true });
for (let offset = 0; offset < mains.length; offset += PER_SHEET) {
  const entries = mains.slice(offset, offset + PER_SHEET);
  const sheetNo = Math.floor(offset / PER_SHEET) + 1;
  const basename = `main-${String(sheetNo).padStart(2, "0")}`;
  const output = path.join(OUTPUT_ROOT, `${basename}.jpg`);
  const mapping = path.join(OUTPUT_ROOT, `${basename}.json`);
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const entry of entries) args.push("-i", entry.file);

  const filters = entries.map((entry, index) => (
    `[${index}:v]scale=${TILE}:${TILE}:force_original_aspect_ratio=decrease:flags=lanczos,`
    + `pad=${TILE}:${TILE}:(ow-iw)/2:(oh-ih)/2:color=white[v${index}]`
  ));
  const layout = entries.map((_, index) => `${(index % COLUMNS) * TILE}_${Math.floor(index / COLUMNS) * TILE}`).join("|");
  const inputs = entries.map((_, index) => `[v${index}]`).join("");
  filters.push(`${inputs}xstack=inputs=${entries.length}:layout=${layout}:fill=white[out]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", "-q:v", "3", output);
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`ffmpeg ${basename}: ${result.stderr}`);
  await fs.writeFile(mapping, `${JSON.stringify({ sheetNo, offset, entries }, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ products: mains.length, sheets: Math.ceil(mains.length / PER_SHEET), output: path.relative(ROOT, OUTPUT_ROOT) })}\n`);
