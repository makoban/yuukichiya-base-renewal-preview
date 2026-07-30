import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = resolve(root, "index.html");
const outputPath = resolve(root, "assets", "preview-product-options.js");
const shopBaseUrl = "https://yuukichiya.base.shop";
const concurrency = 8;

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOptionGroups(html) {
  const groups = [];
  const seen = new Set();
  const blockPattern = /<div\b[^>]*class="[^"]*\bitemOptionElement\b[^"]*"[^>]*>([\s\S]*?<select\b[\s\S]*?<\/select>)[\s\S]*?<\/div>/gi;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(html))) {
    const block = blockMatch[1];
    const labelMatch = block.match(/<label\b[^>]*>([\s\S]*?)<\/label>/i);
    const selectMatch = block.match(/<select\b([^>]*)>([\s\S]*?)<\/select>/i);
    if (!selectMatch) continue;

    const selectAttributes = selectMatch[1];
    const idMatch = selectAttributes.match(/\bid="([^"]+)"/i);
    const key = idMatch ? idMatch[1] : `${decodeHtml(labelMatch?.[1])}-${groups.length}`;
    if (seen.has(key)) continue;

    const values = [];
    const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let optionMatch;
    while ((optionMatch = optionPattern.exec(selectMatch[2]))) {
      const valueMatch = optionMatch[1].match(/\bvalue="([^"]*)"/i);
      const value = valueMatch ? valueMatch[1].trim() : "";
      const label = decodeHtml(optionMatch[2]);
      if (!value || !label || /選択する（必須）|選択なし/.test(label)) continue;
      const priceMatch = label.match(/[¥￥]\s*([\d,]+)/);
      values.push({
        value,
        label,
        price: priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : 0,
      });
    }

    if (!values.length) continue;
    seen.add(key);
    groups.push({
      name: decodeHtml(labelMatch?.[1]) || "種類・サイズ",
      required: /\brequired(?:\s|>|=)/i.test(selectAttributes),
      values,
    });
  }

  return groups;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "accept-language": "ja,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; YuukichiyaPreviewSync/1.0)",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 500));
    }
  }
  throw lastError;
}

const indexHtml = await readFile(indexPath, "utf8");
const variantMatch = indexHtml.match(/var ykProductVariants = (\{[\s\S]*?\});\s*var ykTabs/);
if (!variantMatch) throw new Error("index.html の商品種類データを取得できませんでした。");

const variantMap = JSON.parse(variantMatch[1]);
const catalogIds = [...new Set([...indexHtml.matchAll(/"id":"(\d+)"/g)].map((match) => match[1]))];
const candidateIds = catalogIds.filter((id) => !Array.isArray(variantMap[id]) || variantMap[id].length === 0);
const productOptions = {};
const failures = [];
let cursor = 0;

async function worker() {
  while (cursor < candidateIds.length) {
    const index = cursor;
    cursor += 1;
    const id = candidateIds[index];
    try {
      const html = await fetchText(`${shopBaseUrl}/items/${id}`);
      const groups = parseOptionGroups(html);
      if (groups.length) productOptions[id] = groups;
    } catch (error) {
      failures.push({ id, message: error.message });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const sortedOptions = Object.fromEntries(
  Object.entries(productOptions).sort(([left], [right]) => Number(left) - Number(right)),
);
const output = [
  "/* BASE本番の商品オプションをステージング購入画面へ反映するための生成データです。 */",
  `window.ykProductOptions = ${JSON.stringify(sortedOptions)};`,
  "",
].join("\n");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);

console.log(JSON.stringify({
  candidates: candidateIds.length,
  productsWithOptions: Object.keys(sortedOptions).length,
  failures,
  output: outputPath,
}, null, 2));
