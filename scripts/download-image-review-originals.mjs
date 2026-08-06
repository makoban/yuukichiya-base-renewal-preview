import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const MANIFEST = path.join(ROOT, "image-review/all-products/data/manifest.json");
const OUTPUT_ROOT = path.join(ROOT, ".image-batch/originals");
const INDEX_FILE = path.join(ROOT, ".image-batch/originals-index.json");
const args = new Map(process.argv.slice(2).map((value) => value.split("=", 2)));
const start = Math.max(0, Number.parseInt(args.get("--start") || "0", 10));
const limit = Math.max(1, Number.parseInt(args.get("--limit") || "100", 10));
const concurrency = Math.min(12, Math.max(1, Number.parseInt(args.get("--concurrency") || "8", 10)));

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const all = manifest.products.flatMap((product) => product.images.map((image) => ({
  itemId: product.itemId,
  title: product.title,
  imageNo: image.imageNo,
  url: image.originalUrl,
})));
const selected = all.slice(start, start + limit);
let index = {};
try { index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8")); } catch {}

async function download(entry) {
  const key = `${entry.itemId}:${entry.imageNo}`;
  const directory = path.join(OUTPUT_ROOT, entry.itemId);
  const filename = path.join(directory, `${String(entry.imageNo).padStart(2, "0")}.jpg`);
  const existing = await fs.stat(filename).catch(() => null);
  if (existing?.size > 0 && index[key]?.url === entry.url) return { key, skipped: true, bytes: existing.size };

  const response = await fetch(entry.url, { headers: { "user-agent": "YuukichiyaImageBatch/1.0" } });
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) throw new Error(`${key}: unexpected content-type ${contentType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 512) throw new Error(`${key}: image is too small`);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${filename}.part`;
  await fs.writeFile(temporary, buffer);
  await fs.rename(temporary, filename);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  index[key] = { ...entry, file: path.relative(ROOT, filename), bytes: buffer.length, sha256 };
  return { key, skipped: false, bytes: buffer.length };
}

const results = [];
for (let offset = 0; offset < selected.length; offset += concurrency) {
  results.push(...await Promise.all(selected.slice(offset, offset + concurrency).map(download)));
}
await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
await fs.writeFile(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  start,
  requested: selected.length,
  downloaded: results.filter((entry) => !entry.skipped).length,
  skipped: results.filter((entry) => entry.skipped).length,
  bytes: results.reduce((sum, entry) => sum + entry.bytes, 0),
  totalImages: all.length,
})}\n`);
