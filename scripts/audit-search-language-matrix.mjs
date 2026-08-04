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
    .sort((left, right) => right.score - left.score || (right.product.n || 0) - (left.product.n || 0));
}

let queryGroups = {
  jersey: [
    "ジャージ", "じゃーじ", "じゃあじ", "ジャジ", "じやーじ", "ジャージ上衣", "じゃーじ うわぎ",
  ],
  gymwear: [
    "体操服", "たいそうふく", "体そう服", "たいそーふく", "体育着", "体操着", "gym wear", "gymwear",
  ],
  schoolAndItem: [
    "青木小学校 体操服", "青木小 たいそうふく", "浄水中学校 ジャージ", "浄水中 じゃーじ",
    "豊南中学校 制服", "豊南中 制服", "豊田東高校 制服", "豊田東高 制服",
    "青木幼稚園 体操服", "中学校 たいそうふく", "中学校 ジャージ", "小学校 体操服",
    "中学生 たいそうふく", "高校 制服", "学校 制服", "学校名 制服",
  ],
  spacingAndTypos: [
    "青木小学校体操服", "浄水中学校じゃーじ", "豊南中学校せいふく", "体 操 服",
    "たいそふく", "たいそう服", "ジャージうわい", "ジャージ上依", "半そで体操服",
  ],
  modifiers: [
    "中学校 女子 制服", "中学校 男子 制服", "中学校 夏 制服", "中学校 冬 制服",
    "小学校 半袖 体操服", "小学校 長袖 体操服", "青木小学校 体操服 130cm",
    "浄水中学校 ジャージ 紺", "女子 夏 セーラー服", "男子 学ラン 175cm",
  ],
  englishAndIds: [
    "junior high gym wear", "middle school uniform", "girls summer uniform", "track jacket",
    "school uniform 175cm", "72180473", "青木小 130cm",
  ],
  precisionGuards: [
    "箸", "給食セット", "スプーン", "ソックス", "靴下", "カッパ", "上ばき",
  ],
};

const customQueries = process.argv.slice(2);
if (customQueries.length) queryGroups = { custom: customQueries };

for (const [group, queries] of Object.entries(queryGroups)) {
  console.log(`\n## ${group}`);
  for (const query of queries) {
    const found = search(query);
    console.log(JSON.stringify({
      query,
      count: found.length,
      top: found.slice(0, customQueries.length ? 15 : 4).map(({ product, score }) => ({
        id: String(product.id),
        score,
        title: product.t,
      })),
    }));
  }
}
