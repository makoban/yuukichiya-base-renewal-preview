import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const context = vm.createContext({ console });
context.window = context;

for (const relativePath of [
  "assets/search-relevance.js",
  "assets/base-production-catalog.js",
  "assets/base-storefront-extras.js",
]) {
  vm.runInContext(await readFile(resolve(root, relativePath), "utf8"), context, {
    filename: relativePath,
  });
}

const productSchoolText = {};
for (const [school, products] of Object.entries(context.ykSearchCatalog || {})) {
  for (const product of products) {
    const id = String(product.id);
    productSchoolText[id] = `${productSchoolText[id] || ""} ${school}`.trim();
  }
}

const engine = context.ykStorefrontExtras.createSearchEngine({
  getSearchCatalog: () => context.ykSearchCatalog,
  getProductSchoolText: () => productSchoolText,
});
const products = Array.from(context.ykAllProducts || []);

function search(query) {
  return products
    .map((product) => ({ product, score: engine.score(product, query) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || (right.product.n || 0) - (left.product.n || 0))
    .map(({ product }) => product);
}

function ids(items) {
  return items.map((product) => String(product.id));
}

function assertOnly(query, allowedIds, requiredIds = allowedIds) {
  const found = search(query);
  assert(found.length > 0, `${query}: no results`);
  assert.deepEqual(
    ids(found).filter((id) => !allowedIds.includes(id)),
    [],
    `${query}: unrelated product was returned`,
  );
  for (const requiredId of requiredIds) {
    assert(ids(found).includes(requiredId), `${query}: missing ${requiredId}`);
  }
  return found;
}

const chopstickIds = ["72180473", "72180475", "72180477"];
for (const query of ["箸", "はし", "お箸", "おはし"]) {
  const found = assertOnly(query, chopstickIds);
  assert.equal(String(found[0].id), "72180473", `${query}: lunch set must rank first`);
}

for (const query of ["給食", "給食セット", "給食用品"]) {
  const found = assertOnly(query, ["72180473"]);
  assert.equal(String(found[0].id), "72180473", `${query}: lunch set must rank first`);
}

for (const query of ["スプーン", "フォーク", "カトラリー"]) {
  assertOnly(query, ["72180473", "72180476"], ["72180473", "72180476"]);
}

const gymwear = search("体操服");
assert(gymwear.length > 0 && gymwear.length < 150, "体操服: results are still too broad");
assert(
  gymwear.every((product) => /体操|体育着|体育服|運動着|運動会|体育祭|部活/.test(product.t)),
  "体操服: a generic related shirt or pair of pants was returned",
);

assert.equal(search("ソックス").length, 0, "ソックス: unrelated footwear was returned despite no sock products");
assert.equal(search("靴下").length, 0, "靴下: unrelated footwear was returned despite no sock products");

const jerseyTypo = search("ジャージ上依");
assert(jerseyTypo.length > 0, "ジャージ上依: contextual typo search stopped working");
assert(/ジャージ(?:上衣|上着)/.test(jerseyTypo[0].t), "ジャージ上依: correct upper garment did not rank first");
assert(
  jerseyTypo.slice(0, 5).some((product) => /ジャージ上衣/.test(product.t)),
  "ジャージ上依: corrected 上衣 result is missing from the top results",
);

const indoorShoeTypo = search("上ばき");
assert(indoorShoeTypo.length > 0, "上ばき: useful typo search stopped working");

const kappa = search("カッパ");
assert.equal(kappa.length, 4, "カッパ: rainwear-only boundary regressed");
assert(kappa.every((product) => /雨合羽|RAIN\s+SUIT/i.test(product.t)), "カッパ: unrelated item returned");

console.log(JSON.stringify({
  catalogProducts: products.length,
  chopsticks: ids(search("箸")),
  schoolLunchSet: ids(search("給食セット")),
  spoon: ids(search("スプーン")),
  socks: search("ソックス").length,
  gymwear: gymwear.length,
  jerseyTypoFirst: jerseyTypo[0].t,
}, null, 2));
