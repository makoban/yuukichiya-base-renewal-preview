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
  "assets/catalog-search-engine.js",
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
  getAllProducts: () => context.ykAllProducts,
  getProductSchoolText: () => productSchoolText,
  getProductConditions: () => context.ykProductConditions,
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

function searchableText(product) {
  const conditionValues = (context.ykProductConditions?.[String(product.id)]?.options || [])
    .flatMap((option) => option.values || []);
  return [product.t, product.v, ...(product.vs || []), ...conditionValues].join(" ").normalize("NFKC");
}

function belongsToSchool(product, schoolName) {
  const title = String(product.t || "").normalize("NFKC");
  const registeredSchools = String(productSchoolText[String(product.id)] || "").normalize("NFKC");
  const aliases = [
    schoolName,
    schoolName.replace(/小学校/g, "小"),
    schoolName.replace(/中学校/g, "中"),
    schoolName.replace(/高等学校/g, "高校"),
    schoolName.replace(/高校/g, "高"),
    schoolName.replace(/幼稚園/g, "幼"),
  ];
  return aliases.some((alias) => title.includes(alias) || registeredSchools.includes(alias));
}

function isJersey(product) {
  return /ジャージ|トレーニングウェア|トラックスーツ/i.test(searchableText(product));
}

function isGymwear(product) {
  return /体操服|体操着|体育着|体育服|運動着/.test(searchableText(product));
}

function isGymFamily(product) {
  const title = String(product.t || "").normalize("NFKC");
  if (/水着|スイム|上履き|上靴|体育館?シューズ|サンダル|スリッパ|雨合羽|レイン|RAIN|ヘルメット/i.test(title)) {
    return false;
  }
  return /体操服|体操着|体育着|体育服|運動着|ジャージ|Tシャツ|丸首シャツ|ハーフパンツ|ストレートパンツ|短パン|ショートパンツ/i.test(title);
}

function isMiddleSchoolProduct(product) {
  const text = `${product.t || ""} ${productSchoolText[String(product.id)] || ""}`.normalize("NFKC");
  return /中学校/.test(text) || /(?:^|[\s　])[^\s　]+中(?:[\s　]|$|[（(])/.test(text);
}

function isUniformProduct(product) {
  const title = String(product.t || "").normalize("NFKC");
  if (/体操服|体操着|ジャージ|ハーフパンツ|雨合羽|RAIN\s*SUIT|レイン/i.test(title)) return false;
  const withoutTShirt = title.replace(/Tシャツ/gi, "");
  return /制服|学生服|標準服|セーラー|ブレザー|詰襟|学ラン|通園服|園内服|スカート|リボン|ブラウス|ニットシャツ|シャツ/.test(withoutTShirt);
}

function assertEveryResult(query, predicate, requiredIds = []) {
  const found = search(query);
  assert(found.length > 0, `${query}: no results`);
  const unrelated = found.filter((product) => !predicate(product));
  assert.equal(
    unrelated.length,
    0,
    `${query}: ${unrelated.length} unrelated product(s); examples: ${unrelated
      .slice(0, 8)
      .map((product) => `${product.id}:${product.t}`)
      .join(" / ")}`,
  );
  for (const requiredId of requiredIds) {
    assert(ids(found).includes(requiredId), `${query}: missing ${requiredId}`);
  }
  return found;
}

function assertExactIds(query, expectedIds) {
  const actual = ids(search(query)).sort();
  const expected = [...expectedIds].map(String).sort();
  const extra = actual.filter((id) => !expected.includes(id));
  const missing = expected.filter((id) => !actual.includes(id));
  assert.equal(
    extra.length + missing.length,
    0,
    `${query}: exact result set changed; extra=${extra.slice(0, 12).join(",") || "none"}` +
      `${extra.length > 12 ? ` (+${extra.length - 12})` : ""}; missing=${missing.join(",") || "none"}`,
  );
}

function assertEquivalentIds(leftQuery, rightQuery) {
  assert.deepEqual(
    ids(search(leftQuery)).sort(),
    ids(search(rightQuery)).sort(),
    `${leftQuery} / ${rightQuery}: spelling variants returned different products`,
  );
}

function assertEveryOrEmpty(query, predicate) {
  const unrelated = search(query).filter((product) => !predicate(product));
  assert.equal(
    unrelated.length,
    0,
    `${query}: unrelated product(s): ${unrelated.slice(0, 8).map((product) => `${product.id}:${product.t}`).join(" / ")}`,
  );
}

const strictFailures = [];
let strictChecks = 0;

function strictCheck(label, check) {
  strictChecks += 1;
  try {
    check();
  } catch (error) {
    strictFailures.push(`${label}: ${error.message}`);
  }
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

// Amazon-like fuzzy matching means spelling variants may be corrected, but unrelated
// products must not be mixed into the primary result set. Check the entire result set,
// not merely the first item or a non-zero count.
for (const query of [
  "ジャージ",
  "じゃーじ",
  "ジャジ",
  "じやーじ",
  "じぁーじ",
  "ジャージー",
  "jersey",
  "track suit",
]) {
  strictCheck(`jersey spelling ${query}`, () => assertEveryResult(query, isJersey));
}

for (const query of [
  "体操服",
  "たいそうふく",
  "たいそふく",
  "体操ふく",
  "たいそうぎ",
  "体操ぎ",
  "体そう服",
  "たいそーふく",
  "タイソウフク",
]) {
  strictCheck(`gymwear spelling ${query}`, () => assertEveryResult(query, isGymwear));
}

// School + product intent is an AND search. Shared products registered to a school
// are valid even when the school name is omitted from the product title.
for (const query of ["浄水中学校 ジャージ", "浄水中学校 じゃーじ", "浄水中学校 ジャジ", "浄水中 ジャージ"]) {
  strictCheck(`Jousui jersey ${query}`, () => assertExactIds(query, ["72149190"]));
}
for (const query of ["東保見小学校 ジャージ", "東保見小学校 じゃーじ", "東保見小学校 ジャジ"]) {
  strictCheck(`Higashihomi jersey ${query}`, () =>
    assertExactIds(query, ["72180309", "149182872"]));
}
for (const query of ["青木小学校 体操服", "青木小 たいそうふく", "青木小学校体操ふく"]) {
  strictCheck(`Aoki gymwear ${query}`, () =>
    assertEveryResult(
      query,
      (product) => belongsToSchool(product, "青木小学校") && isGymFamily(product),
      ["95873128", "72180345", "72180346", "76083736"],
    ));
}
for (const query of ["末野原中学校 体操服", "末野原中 たいそふく", "末野原中学校 たいそうぎ"]) {
  strictCheck(`Suenohara gymwear ${query}`, () =>
    assertEveryResult(
      query,
      (product) => belongsToSchool(product, "末野原中学校") && isGymFamily(product),
      ["72149102", "72149108", "72149113", "72149119"],
    ));
}

// A school-scoped 体操服 query intentionally expands to that school's PE family,
// while shoes and uniform accessories stay outside the result set.
const jousuiGymFamilyIds = ["72149179", "72149184", "72149190", "72149195"];
for (const query of ["浄水中学校 体操服", "浄水中 たいそうふく", "じょうすい中学校 たいそふく"]) {
  strictCheck(`Jousui gym family ${query}`, () => assertExactIds(query, jousuiGymFamilyIds));
}
strictCheck("no Aoki jersey stock", () => assertExactIds("青木小学校 ジャージ", []));

for (const query of [
  "中学校 体操服",
  "中学校 たいそうふく",
  "中学校 たいそふく",
  "中学校 たいそうぎ",
  "中学 体操服",
  "中学 たいそうふく",
  "junior high school gym clothes",
]) {
  strictCheck(`middle-school gymwear ${query}`, () =>
    assertEveryResult(
      query,
      (product) => isMiddleSchoolProduct(product) && isGymFamily(product),
      ["147575633", "95877507", "95876363", "88864427", "72149113"],
    ));
}

// Uniform must not broaden into PE T-shirts, generic pants, jersey or rainwear.
strictCheck("generic uniform purity", () => assertEveryResult("制服", isUniformProduct));
strictCheck("Jousui uniform accessory only", () => assertExactIds("浄水中学校 制服", ["75660674"]));

// The catalog has no product identified as a uniform for these schools.
strictCheck("no Suenohara uniform stock", () => assertExactIds("末野原中学校 制服", []));
strictCheck("no Aoki uniform stock", () => assertExactIds("青木小学校 制服", []));
strictCheck("no Toyotanishi uniform stock", () =>
  assertExactIds("豊田西高等学校・附属中学校 制服", []));

// These three sale items are the only catalog records that can safely satisfy
// "衣台高校 制服" from their school name and uniform garment title.
const koromodaiUniformIds = ["145086937", "145087529", "145087738"];
for (const query of ["衣台高校 制服", "衣台高 制服"]) {
  strictCheck(`Koromodai uniform ${query}`, () => assertExactIds(query, koromodaiUniformIds));
}

// Unknown terms are mandatory AND terms. Do not silently ignore them because a
// school or product concept matched another part of the query.
for (const query of ["浄水中学校 ジャージ 彗星", "体操服 彗星", "PK-X3 彗星"]) {
  strictCheck(`unknown AND ${query}`, () => assertExactIds(query, []));
}

// Numeric sizes and alphanumeric model numbers must match their own field. In
// particular, the 1108 suffix of a model number must not match 110cm sizes.
for (const query of ["中学校 体操服 165cm", "中学校 体操服 １６５ｃｍ"]) {
  strictCheck(`middle-school gymwear size ${query}`, () =>
    assertEveryResult(
      query,
      (product) => isMiddleSchoolProduct(product) && isGymFamily(product) && /165/.test(searchableText(product)),
      ["88864427"],
    ));
}
for (const query of ["S400", "Ｓ４００"]) {
  strictCheck(`model S400 ${query}`, () =>
    assertEveryResult(query, (product) => /S400/i.test(searchableText(product)), ["74074759"]));
}
for (const query of ["PK-X3", "pk x3"]) {
  strictCheck(`model PK-X3 ${query}`, () =>
    assertExactIds(query, ["112034386", "74107371", "73632329"]));
}
strictCheck("model columbine1108", () => assertExactIds("columbine1108", ["72148910"]));
strictCheck("exact product id", () => assertExactIds("72149190", ["72149190"]));

// Size choices stored in BASE's product-condition options are part of the search
// corpus even when v/vs only says 種類・サイズあり.
strictCheck("Jousui jersey condition size", () =>
  assertExactIds("浄水中学校 ジャージ 160", ["72149190"]));
for (const query of ["浄水中 体操服 M", "浄水中 体操服 160cm"]) {
  strictCheck(`Jousui gym condition size ${query}`, () => assertExactIds(query, jousuiGymFamilyIds));
}

// A unique one-character school typo may be corrected, but an unknown school must
// never collapse into a global product search.
for (const query of ["浄氷中学校 ジャージ", "浄水中額校 ジャージ", "じょうすい中学校 ジャージ"]) {
  strictCheck(`safe Jousui school correction ${query}`, () => assertExactIds(query, ["72149190"]));
}
for (const query of ["青木小額校 体操服", "あおき小学校 体操服"]) {
  strictCheck(`safe Aoki school correction ${query}`, () =>
    assertEveryResult(
      query,
      (product) => belongsToSchool(product, "青木小学校") && isGymFamily(product),
      ["95873128", "72180345", "72180346", "76083736"],
    ));
}
strictCheck("unknown school boundary", () => assertExactIds("架空中学校 ジャージ", []));

// Keep the chopstick boundary strict while supporting lunch-set discovery.
strictCheck("chopstick case boundary", () =>
  assertExactIds("はしケース", ["72180473", "72180477"]));
strictCheck("single chopstick boundary", () => assertExactIds("はし 単品", ["72180475"]));
strictCheck("chopstick unknown AND", () => assertExactIds("箸 彗星", []));

// Run the three customer-requested phrase families against every configured
// school, including schools with zero matching stock. Kana/kanji variants must
// return the same set and every non-empty result must stay inside both the school
// and the requested product family.
const schoolIntentMatrix = [
  { kanji: "ジャージ", kana: "じゃーじ", predicate: isJersey },
  { kanji: "体操服", kana: "たいそうふく", predicate: isGymFamily },
  { kanji: "制服", kana: "せいふく", predicate: isUniformProduct },
];
for (const schoolName of Object.keys(context.ykSearchCatalog || {})) {
  for (const intent of schoolIntentMatrix) {
    const kanjiQuery = `${schoolName} ${intent.kanji}`;
    const kanaQuery = `${schoolName} ${intent.kana}`;
    strictCheck(`75-school equivalence ${schoolName} ${intent.kanji}`, () =>
      assertEquivalentIds(kanjiQuery, kanaQuery));
    strictCheck(`75-school precision ${schoolName} ${intent.kanji}`, () =>
      assertEveryOrEmpty(
        kanjiQuery,
        (product) => belongsToSchool(product, schoolName) && intent.predicate(product),
      ));
  }
}

for (const [query, expected] of [
  ["制服 衣台高校", koromodaiUniformIds],
  ["浄水中学校　じゃーじ", ["72149190"]],
  ["じゃーじ 浄水中学校", ["72149190"]],
  ["たいそうふく　青木小学校", ["95873128", "72180345", "72180346", "76083736"]],
  ["体操服 青木小学校", ["95873128", "72180345", "72180346", "76083736"]],
]) {
  strictCheck(`phrase order and spacing ${query}`, () => assertExactIds(query, expected));
}

for (const query of ["中学校　たいそうふく", "たいそうふく 中学校", "体操服　中学"]) {
  strictCheck(`middle-school phrase order ${query}`, () =>
    assertEveryResult(query, (product) => isMiddleSchoolProduct(product) && isGymFamily(product)));
}

assert.equal(
  strictFailures.length,
  0,
  `strict search regression failures (${strictFailures.length}/${strictChecks}):\n- ${strictFailures.join("\n- ")}`,
);

console.log(JSON.stringify({
  catalogProducts: products.length,
  chopsticks: ids(search("箸")),
  schoolLunchSet: ids(search("給食セット")),
  spoon: ids(search("スプーン")),
  socks: search("ソックス").length,
  gymwear: gymwear.length,
  jerseyTypoFirst: jerseyTypo[0].t,
  strictChecks,
}, null, 2));
