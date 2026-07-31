import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(
  root,
  "../現行サイト_バックアップ_20260724/BASE現行EC/管理画面エクスポート/BASE_全商品_復元用_20260724.csv",
);
const outputPath = resolve(root, "assets/preview-product-inventory.js");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function formatKind(value) {
  const kind = String(value || "").trim();
  if (!kind) return "";
  if (/^(?:\d{2,3}(?:[A-Z]+)?|S|M|L|LL|3L|4L|5L|SS|EL|O|XO)$/i.test(kind)) {
    return `サイズ ${kind}`;
  }
  return kind;
}

function inventoryNumber(value) {
  if (String(value ?? "").trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

const csvText = new TextDecoder("shift_jis").decode(await readFile(sourcePath));
const rows = parseCsv(csvText);
const headers = rows.shift().map((header) => header.trim());
const inventory = {};

for (const cells of rows) {
  const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  if (row["公開状態"] !== "1") continue;
  const id = String(row["商品ID"] || "").trim();
  if (!id) continue;
  const stock = inventoryNumber(row["在庫数"]);
  if (!inventory[id]) inventory[id] = { stock, variants: {} };
  const kind = formatKind(row["種類名"]);
  const variantStock = inventoryNumber(row["種類在庫数"]);
  if (kind && variantStock !== null) inventory[id].variants[kind] = variantStock;
}

for (const item of Object.values(inventory)) {
  if (!Object.keys(item.variants).length) delete item.variants;
}

const output = [
  "window.ykProductInventoryMeta = { source: \"BASE_全商品_復元用_20260724.csv\", snapshotDate: \"2026-07-24\" };",
  `window.ykProductInventory = ${JSON.stringify(inventory).replace(/</g, "\\u003c")};`,
  "",
].join("\n");

await writeFile(outputPath, output);
console.log(outputPath);
