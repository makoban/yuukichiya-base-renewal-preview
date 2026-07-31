import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "qa");
const widths = [320, 360, 375, 390, 393, 412, 430, 1440];

export async function verifySearchOptionsStaging(
  url = "http://127.0.0.1:8788/?draft-preview=1",
) {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const results = [];

  try {
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 1000 : 844 },
      });
      const browserErrors = [];
      page.on("pageerror", (error) => browserErrors.push(error.message));
      await page.goto(url, { waitUntil: "networkidle" });

      const result = await page.evaluate(() => {
        const rootElement = document.documentElement;
        const heroSearch = document.querySelector(".yk-hero-search")?.getBoundingClientRect();
        const priceDown = document.querySelector("#yk-price-down")?.getBoundingClientRect();
        const overflowing = Array.from(document.querySelectorAll("body *"))
          .filter((element) => {
            const style = getComputedStyle(element);
            if (
              style.display === "none" ||
              style.position === "fixed" ||
              element.closest(".yk-shelf-viewport")
            ) return false;
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > rootElement.clientWidth + 1;
          })
          .slice(0, 8)
          .map((element) => ({
            tag: element.tagName,
            className: String(element.className || ""),
          }));
        return {
          clientWidth: rootElement.clientWidth,
          scrollWidth: rootElement.scrollWidth,
          overflowing,
          heroSearchAbovePriceDown: Boolean(heroSearch && priceDown) &&
            heroSearch.bottom <= priceDown.top + 1,
          priceDownCountText:
            document.querySelector('[data-shelf-count="priceDown"]')?.textContent.trim() || "",
          priceDownCards: document.querySelectorAll("#yk-shelf-priceDown .yk-shelf-card").length,
          defaultProductTotal: Number(
            (document.querySelector("#yk-result-count")?.textContent || "").match(/全(\d+)件/)?.[1] || 0,
          ),
          renewalBadgePresent: Boolean(document.querySelector(".yk-renewal-badge")),
          freeShippingPresent: Boolean(document.querySelector(".yk-free-shipping")),
          selectedHeroImage: document.querySelector(".yk-hero__mobile-visual")
            ? getComputedStyle(document.querySelector(".yk-hero__mobile-visual")).backgroundImage
            : "",
        };
      });
      result.browserErrors = browserErrors;

      if (width === 390 || width === 1440) {
        const runSearch = async (query) => {
          await page.locator("#yk-hero-query").fill(query);
          await page.locator("[data-yk-search-form]").evaluate((form) => form.requestSubmit());
          return page.evaluate(() => ({
            total: Number(
              (document.querySelector("#yk-result-count")?.textContent || "").match(/全(\d+)件/)?.[1] || 0,
            ),
            sort: document.querySelector("#yk-result-sort")?.value || "",
            firstTitle:
              document.querySelector(".yk-product__title")?.textContent.replace(/\s+/g, " ").trim() || "",
            visibleTitles: Array.from(document.querySelectorAll(".yk-product__title"))
              .slice(0, 8)
              .map((element) => element.textContent.replace(/\s+/g, " ").trim()),
          }));
        };

        result.synonymSearch = await runSearch("体操着");
        await page.locator("[data-show-all]").click();
        result.socksSearch = await runSearch("ソックス");
        await page.locator("[data-show-all]").click();
        result.socksSynonymSearch = await runSearch("靴下");
        await page.locator("[data-show-all]").click();
        result.englishGymSearch = await runSearch("gym clothes");
        await page.locator("[data-show-all]").click();
        result.semanticRainSearch = await runSearch("雨の日");
        await page.locator("[data-show-all]").click();
        result.englishRainSearch = await runSearch("rain wear");
        await page.locator("[data-show-all]").click();
        result.englishBagSearch = await runSearch("school bag");
        await page.locator("[data-show-all]").click();
        result.kappaSearch = await runSearch("カッパ");
        await page.locator("[data-show-all]").click();
        result.multiWordSearch = await runSearch("青木小 赤白ぼうし");
        await page.locator("[data-show-all]").click();
        result.typoSearch = await runSearch("ジャージ上依");

        await page.locator('[data-school-type="elementary"]').first().click();
        result.globalSearchFromSchoolFilter = await runSearch("Barbie");
        result.globalSearchClearedSchoolFilter = await page.evaluate(() =>
          !ykState.schoolType && !ykState.school && !ykState.specialCategory,
        );
        await page.locator('[data-school-type="elementary"]').first().click();
        await page.locator('.yk-school-list[data-school-type="elementary"] a').first().click();
        result.schoolActionClearedQuery = await page.evaluate(() => ({
          query: ykState.query,
          inputValues: Array.from(document.querySelectorAll("[data-yk-query]")).map((input) => input.value),
          school: ykState.school,
          total: Number(
            (document.querySelector("#yk-result-count")?.textContent || "").match(/全(\d+)件/)?.[1] || 0,
          ),
        }));
        await page.locator("[data-show-all]").click();

        result.visibility = await page.evaluate(() => ({
          total: ykAllProducts.length,
          hiddenIdsPresent: ["95937631", "151900296", "151791830"]
            .filter((id) => ykAllProducts.some((product) => String(product.id) === id)),
        }));

        await page.evaluate(() => {
          localStorage.removeItem("yuukichiya.theme-preview-cart.v1");
          ykOpenPreviewItem(ykFindProduct("84022735"), document.body);
        });
        result.stockOneProduct = await page.evaluate(() => ({
          quantities: Array.from(
            document.querySelectorAll("[data-yk-preview-item-quantity] option"),
          ).map((option) => option.value),
          stockText: document.querySelector("[data-yk-preview-stock-status]")?.textContent.trim() || "",
          addDisabled: document.querySelector("[data-yk-preview-add-cart]")?.disabled,
        }));
        await page.locator("[data-yk-preview-add-cart]").click();
        await page.locator("[data-yk-preview-cart-close]").click();
        await page.evaluate(() => ykOpenPreviewItem(ykFindProduct("84022735"), document.body));
        result.stockOneAfterCart = await page.evaluate(() => ({
          quantities: Array.from(
            document.querySelectorAll("[data-yk-preview-item-quantity] option"),
          ).map((option) => option.value),
          stockText: document.querySelector("[data-yk-preview-stock-status]")?.textContent.trim() || "",
          status: document.querySelector("[data-yk-preview-item-status]")?.textContent.trim() || "",
          addDisabled: document.querySelector("[data-yk-preview-add-cart]")?.disabled,
        }));
        await page.locator("[data-yk-preview-item-close]").click();

        await page.evaluate(() => {
          localStorage.removeItem("yuukichiya.theme-preview-cart.v1");
          ykOpenPreviewItem(ykFindProduct("73632857"), document.body);
        });
        await page.locator("[data-yk-preview-item-variant]").selectOption("24.0cm");
        result.variantStockLimit = await page.evaluate(() => ({
          quantities: Array.from(
            document.querySelectorAll("[data-yk-preview-item-quantity] option"),
          ).map((option) => option.value),
          stockText: document.querySelector("[data-yk-preview-stock-status]")?.textContent.trim() || "",
        }));
        await page.locator("[data-yk-preview-item-close]").click();

        await page.evaluate(() => ykOpenPreviewItem(ykFindProduct("84053344"), document.body));
        result.barbieNoVariant = await page.evaluate(() => ({
          optionsHidden: document.querySelector("[data-yk-preview-item-options]")?.hidden,
          variantSelects: document.querySelectorAll(
            "[data-yk-preview-item-variant],[data-yk-preview-option-select]",
          ).length,
          title: document.querySelector("[data-yk-preview-purchase-title]")?.textContent.trim() || "",
          lead: document.querySelector("[data-yk-preview-item-lead]")?.textContent.trim() || "",
          price: document.querySelector("[data-yk-preview-item-price]")?.textContent.replace(/\s+/g, " ").trim() || "",
          badge: ykProductBadge(ykFindProduct("84053344")),
        }));
        await page.locator("[data-yk-preview-item-close]").click();

        result.soldOutProduct = await page.evaluate(() => {
          const product = ykFindProduct("84051406");
          return {
            exists: Boolean(product),
            card: product ? ykProductCard(product) : "",
            badge: product ? ykProductBadge(product) : "",
            price: product ? ykProductPriceMarkup(product) : "",
          };
        });

        await page.evaluate(() => {
          localStorage.removeItem("yuukichiya.theme-preview-cart.v1");
          ykOpenPreviewItem(ykFindProduct("73632857"), document.body);
        });
        result.studentConditionVisible =
          await page.locator("[data-yk-preview-condition-input]").isVisible() &&
          (await page.locator("[data-yk-preview-item-options]").textContent())
            .includes("生徒証明書の番号");
        await page.locator("[data-yk-preview-add-cart]").click();
        result.studentConditionBlocksEmpty =
          await page.locator("#yk-preview-item-dialog").isVisible() &&
          (await page.locator("[data-yk-preview-item-status]").textContent())
            .includes("必須項目");
        await page.locator("[data-yk-preview-condition-input]").fill("1234");
        await page.locator("[data-yk-preview-add-cart]").click();
        result.studentConditionAdded =
          await page.locator("#yk-preview-cart-dialog").isVisible() &&
          (await page.locator("[data-yk-preview-cart-list]").textContent()).includes("1234");
        await page.locator("[data-yk-preview-cart-close]").click();

        await page.evaluate(() => ykOpenPreviewItem(ykFindProduct("114897908"), document.body));
        const optionSelect = page.locator("[data-yk-preview-option-select]").first();
        result.pricedOptionVisible = await optionSelect.isVisible();
        if (result.pricedOptionVisible) {
          const optionCount = await optionSelect.locator("option").count();
          await optionSelect.selectOption({ index: optionCount - 1 });
          await optionSelect.evaluate((select) => {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
          result.pricedOptionAdjusted =
            (await page.locator("[data-yk-preview-item-price]").textContent()).includes("サイズ調整");
        } else {
          result.pricedOptionAdjusted = false;
        }
        await page.locator("[data-yk-preview-item-close]").click();

        await page.screenshot({
          path: resolve(outputDir, `staging-search-options-${width}.png`),
          fullPage: true,
        });
      }

      results.push({ width, ...result });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.some((result) => {
    if (result.scrollWidth > result.clientWidth || result.overflowing.length) return true;
    if (result.browserErrors.length) return true;
    if (!result.heroSearchAbovePriceDown) return true;
    if (result.priceDownCountText !== "80商品" || result.priceDownCards !== 80) return true;
    if (result.defaultProductTotal !== 608) return true;
    if (!result.renewalBadgePresent || !result.freeShippingPresent) return true;
    if (result.width === 390 || result.width === 1440) {
      return result.synonymSearch.total < 1 || result.synonymSearch.sort !== "relevance" ||
        result.socksSearch.total < 1 || result.socksSearch.sort !== "relevance" ||
        result.socksSynonymSearch.total < 1 || result.socksSynonymSearch.sort !== "relevance" ||
        result.englishGymSearch.total < 1 || result.englishGymSearch.sort !== "relevance" ||
        !result.englishGymSearch.firstTitle.includes("体操服") ||
        result.semanticRainSearch.total < 1 || result.semanticRainSearch.sort !== "relevance" ||
        result.englishRainSearch.firstTitle !== result.semanticRainSearch.firstTitle ||
        result.englishBagSearch.total < 1 || result.englishBagSearch.sort !== "relevance" ||
        result.englishBagSearch.firstTitle.includes("RAIN SUIT") ||
        result.kappaSearch.total !== 4 ||
        result.kappaSearch.visibleTitles.some((title) => !/雨合羽|RAIN SUIT/i.test(title)) ||
        result.multiWordSearch.total < 1 || result.multiWordSearch.sort !== "relevance" ||
        result.typoSearch.total < 1 || result.typoSearch.sort !== "relevance" ||
        result.globalSearchFromSchoolFilter.total < 1 ||
        !result.globalSearchFromSchoolFilter.firstTitle.includes("Barbie") ||
        !result.globalSearchClearedSchoolFilter ||
        result.schoolActionClearedQuery.query !== "" ||
        result.schoolActionClearedQuery.inputValues.some(Boolean) ||
        !result.schoolActionClearedQuery.school || result.schoolActionClearedQuery.total < 1 ||
        result.visibility.total !== 608 || result.visibility.hiddenIdsPresent.length ||
        result.stockOneProduct.quantities.join(",") !== "1" ||
        !result.stockOneProduct.stockText.includes("1点") || result.stockOneProduct.addDisabled ||
        result.stockOneAfterCart.quantities.some(Boolean) || !result.stockOneAfterCart.addDisabled ||
        !result.stockOneAfterCart.stockText.includes("追加可能0点") ||
        !result.stockOneAfterCart.status.includes("在庫上限") ||
        result.variantStockLimit.quantities.length !== 7 ||
        result.variantStockLimit.quantities.at(-1) !== "7" ||
        !result.variantStockLimit.stockText.includes("7点") ||
        !result.barbieNoVariant.optionsHidden || result.barbieNoVariant.variantSelects !== 0 ||
        result.barbieNoVariant.title !== "数量を選ぶ" ||
        !result.barbieNoVariant.lead.includes("数量を選んで") ||
        !result.barbieNoVariant.price.includes("¥7,150") || !result.barbieNoVariant.price.includes("¥3,575") ||
        !result.barbieNoVariant.badge.includes("50%OFF") ||
        !result.soldOutProduct.exists || !result.soldOutProduct.card.includes("disabled") ||
        !result.soldOutProduct.card.includes("SOLD OUT") ||
        !result.soldOutProduct.badge.includes("50%OFF") || !result.soldOutProduct.badge.includes("SOLD OUT") ||
        !result.soldOutProduct.price.includes("¥11,880") || !result.soldOutProduct.price.includes("¥5,940") ||
        !result.studentConditionVisible || !result.studentConditionBlocksEmpty ||
        !result.studentConditionAdded || !result.pricedOptionVisible ||
        !result.pricedOptionAdjusted;
    }
    return false;
  });

  const report = {
    checkedAt: new Date().toISOString(),
    url,
    widths,
    failed,
    results,
  };
  await writeFile(
    resolve(outputDir, "staging-search-options-verification-20260731.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}
