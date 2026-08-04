import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "qa");
const widths = process.env.YK_QA_WIDTHS
  ? process.env.YK_QA_WIDTHS.split(",").map(Number).filter(Number.isFinite)
  : [320, 360, 375, 390, 393, 412, 430, 1440];

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
      await page.waitForFunction(
        () => document.documentElement.dataset.ykCatalogSource === "base-live",
        undefined,
        { timeout: 15_000 },
      );

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
        const badgeIntersections = Array.from(document.querySelectorAll(".yk-product-badges"))
          .map((badges) => {
            const card = badges.closest(".yk-product,.yk-shelf-card");
            const image = card?.querySelector(".yk-product__photo,.yk-shelf-card__image");
            if (!image) return 0;
            const badgeRect = badges.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            const width = Math.max(0, Math.min(badgeRect.right, imageRect.right) - Math.max(badgeRect.left, imageRect.left));
            const height = Math.max(0, Math.min(badgeRect.bottom, imageRect.bottom) - Math.max(badgeRect.top, imageRect.top));
            return width * height;
          });
        return {
          clientWidth: rootElement.clientWidth,
          scrollWidth: rootElement.scrollWidth,
          overflowing,
          heroSearchAbovePriceDown: Boolean(heroSearch && priceDown) &&
            heroSearch.bottom <= priceDown.top + 1,
          priceDownCountText:
            document.querySelector('[data-shelf-count="priceDown"]')?.textContent.trim() || "",
          priceDownCards: document.querySelectorAll("#yk-shelf-priceDown .yk-shelf-card").length,
          commutingCountText:
            document.querySelector('[data-shelf-count="commuting"]')?.textContent.trim() || "",
          commutingCards: document.querySelectorAll("#yk-shelf-commuting .yk-shelf-card").length,
          livePriceDownProducts: window.ykSpecialCatalog?.priceDown?.length || 0,
          liveCommutingProducts: window.ykSpecialCatalog?.commuting?.length || 0,
          liveProductTotal: window.ykAllProducts?.length || 0,
          defaultProductTotal: Number(
            (document.querySelector("#yk-result-count")?.textContent || "").match(/全(\d+)件/)?.[1] || 0,
          ),
          renewalBadgePresent: Boolean(document.querySelector(".yk-renewal-badge")),
          freeShippingPresent: Boolean(document.querySelector(".yk-free-shipping")),
          selectedHeroImage: document.querySelector(".yk-hero__mobile-visual")
            ? getComputedStyle(document.querySelector(".yk-hero__mobile-visual")).backgroundImage
            : "",
          productImageFit: getComputedStyle(
            document.querySelector(".yk-product__photo img"),
          ).objectFit,
          shelfImageFit: getComputedStyle(
            document.querySelector(".yk-shelf-card__image img"),
          ).objectFit,
          shelfTitleClamp: getComputedStyle(
            document.querySelector(".yk-shelf-card__title"),
          ).webkitLineClamp,
          shelfTitleWhiteSpace: getComputedStyle(
            document.querySelector(".yk-shelf-card__title"),
          ).whiteSpace,
          badgePosition: getComputedStyle(document.querySelector(".yk-product-badges")).position,
          badgeImageIntersection: Math.max(0, ...badgeIntersections),
          badgesInsideImages: document.querySelectorAll(
            ".yk-product__photo .yk-product-badges,.yk-shelf-card__image .yk-product-badges",
          ).length,
          badgeHorizontalOverflow: Array.from(document.querySelectorAll(".yk-product-badges"))
            .some((badges) => badges.scrollWidth > badges.clientWidth + 1),
          doubledDiscountLabel: document.body.textContent.includes("%OFF%OFF"),
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
            visibleIds: Array.from(document.querySelectorAll(".yk-product"))
              .slice(0, 8)
              .map((element) => element.querySelector("[data-product-page]")?.getAttribute("data-product-page") || ""),
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
        result.gymTypoSearch = await runSearch("体そう服");
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
        await page.locator("[data-show-all]").click();
        result.chopsticksSearch = await runSearch("箸");
        await page.locator("[data-show-all]").click();
        result.schoolLunchSetSearch = await runSearch("給食セット");
        await page.locator("[data-show-all]").click();
        result.spoonSearch = await runSearch("スプーン");

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
          duplicateIds: Array.from(
            ykAllProducts.reduce((counts, product) => {
              const id = String(product.id);
              counts.set(id, (counts.get(id) || 0) + 1);
              return counts;
            }, new Map()),
          ).filter(([, count]) => count > 1).map(([id]) => id),
          excludedIdsPresent: ["95937631"]
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
          galleryCount: document.querySelector("[data-yk-preview-gallery-count]")?.textContent.trim() || "",
          galleryThumbs: document.querySelectorAll("[data-yk-preview-gallery-thumb]").length,
          description: document.querySelector("[data-yk-preview-description]")?.textContent.trim() || "",
          responsiveImage: document.querySelector("[data-yk-preview-item-image]")?.getAttribute("srcset") || "",
        }));
        await page.locator("[data-yk-preview-gallery-next]").click();
        result.galleryNext = await page.evaluate(() => ({
          count: document.querySelector("[data-yk-preview-gallery-count]")?.textContent.trim() || "",
          currentThumb: document.querySelector('[data-yk-preview-gallery-thumb][aria-current="true"]')?.getAttribute("data-yk-preview-gallery-thumb") || "",
          alt: document.querySelector("[data-yk-preview-item-image]")?.alt || "",
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

        await page.evaluate(() => {
          localStorage.removeItem("yuukichiya.theme-preview-cart.v1");
          ykOpenPreviewItem(ykFindProduct("96296013"), document.body);
        });
        await page.locator("[data-yk-preview-item-variant]").selectOption("サイズ S");
        await page.locator("[data-yk-preview-item-quantity]").selectOption("2");
        await page.locator("[data-yk-preview-item-variant]").selectOption("サイズ M");
        result.variantStockReduced = await page.evaluate(() => ({
          value: document.querySelector("[data-yk-preview-item-quantity]")?.value || "",
          quantities: Array.from(
            document.querySelectorAll("[data-yk-preview-item-quantity] option"),
          ).map((option) => option.value),
          stockText: document.querySelector("[data-yk-preview-stock-status]")?.textContent.trim() || "",
          status: document.querySelector("[data-yk-preview-item-status]")?.textContent.trim() || "",
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
        result.studentConditionNumeric = await page.locator("[data-yk-preview-condition-input]").evaluate((input) => ({
          inputMode: input.getAttribute("inputmode"),
          pattern: input.getAttribute("pattern"),
          numeric: input.getAttribute("data-condition-numeric"),
          placeholder: input.getAttribute("placeholder"),
        }));
        await page.locator("[data-yk-preview-add-cart]").click();
        result.studentConditionBlocksEmpty =
          await page.locator("#yk-preview-item-dialog").isVisible() &&
          (await page.locator("[data-yk-preview-item-status]").textContent())
            .includes("必須項目");
        await page.locator("[data-yk-preview-condition-input]").fill("12A３-4");
        result.studentConditionFiltered =
          await page.locator("[data-yk-preview-condition-input]").inputValue() === "1234";
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

        await page.evaluate(() => ykOpenPreviewItem(ykFindProduct("84022735"), document.body));
        await page.waitForFunction(() => {
          const image = document.querySelector("[data-yk-preview-item-image]");
          return image?.complete && image.naturalWidth > 0;
        }, { timeout: 5000 }).catch(() => {});
        await page.screenshot({
          path: resolve(outputDir, `staging-product-gallery-${width}.png`),
          fullPage: false,
        });
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
    if (
      result.priceDownCountText !== `${result.livePriceDownProducts}商品` ||
      result.priceDownCards !== result.livePriceDownProducts ||
      result.commutingCountText !== `${result.liveCommutingProducts}商品` ||
      result.commutingCards !== result.liveCommutingProducts
    ) return true;
    if (result.defaultProductTotal !== result.liveProductTotal) return true;
    if (result.productImageFit !== "contain" || result.shelfImageFit !== "contain") return true;
    if (result.shelfTitleClamp !== "2" || result.shelfTitleWhiteSpace !== "normal") return true;
    if (
      result.badgePosition === "absolute" || result.badgeImageIntersection > 0 ||
      result.badgesInsideImages || result.badgeHorizontalOverflow || result.doubledDiscountLabel
    ) return true;
    if (!result.renewalBadgePresent || !result.freeShippingPresent) return true;
    if (result.width === 390 || result.width === 1440) {
      return result.synonymSearch.total < 1 || result.synonymSearch.total >= 150 || result.synonymSearch.sort !== "relevance" ||
        result.socksSearch.total !== 0 || result.socksSearch.sort !== "relevance" ||
        result.socksSynonymSearch.total !== 0 || result.socksSynonymSearch.sort !== "relevance" ||
        result.englishGymSearch.total < 1 || result.englishGymSearch.sort !== "relevance" ||
        !result.englishGymSearch.firstTitle.includes("体操服") ||
        result.gymTypoSearch.total < 1 || result.gymTypoSearch.sort !== "relevance" ||
        !result.gymTypoSearch.firstTitle.includes("体操服") ||
        result.semanticRainSearch.total < 1 || result.semanticRainSearch.sort !== "relevance" ||
        result.englishRainSearch.firstTitle !== result.semanticRainSearch.firstTitle ||
        result.englishBagSearch.total < 1 || result.englishBagSearch.sort !== "relevance" ||
        result.englishBagSearch.firstTitle.includes("RAIN SUIT") ||
        result.kappaSearch.total !== 4 ||
        result.kappaSearch.visibleTitles.some((title) => !/雨合羽|RAIN SUIT/i.test(title)) ||
        result.multiWordSearch.total < 1 || result.multiWordSearch.sort !== "relevance" ||
        result.typoSearch.total < 1 || result.typoSearch.sort !== "relevance" ||
        result.chopsticksSearch.total !== 3 || result.chopsticksSearch.visibleIds[0] !== "72180473" ||
        result.chopsticksSearch.visibleIds.some((id) => !["72180473", "72180475", "72180477"].includes(id)) ||
        result.schoolLunchSetSearch.total !== 1 || result.schoolLunchSetSearch.visibleIds[0] !== "72180473" ||
        result.spoonSearch.total !== 2 ||
        !["72180473", "72180476"].every((id) => result.spoonSearch.visibleIds.includes(id)) ||
        result.globalSearchFromSchoolFilter.total < 1 ||
        !result.globalSearchFromSchoolFilter.firstTitle.includes("Barbie") ||
        !result.globalSearchClearedSchoolFilter ||
        result.schoolActionClearedQuery.query !== "" ||
        result.schoolActionClearedQuery.inputValues.some(Boolean) ||
        !result.schoolActionClearedQuery.school || result.schoolActionClearedQuery.total < 1 ||
        result.visibility.total !== result.liveProductTotal || result.visibility.duplicateIds.length ||
        result.visibility.excludedIdsPresent.length ||
        result.stockOneProduct.quantities.join(",") !== "1" ||
        !result.stockOneProduct.stockText.includes("1点") || result.stockOneProduct.addDisabled ||
        result.stockOneProduct.galleryCount !== "1 / 5" || result.stockOneProduct.galleryThumbs !== 5 ||
        !result.stockOneProduct.description.includes("学生の声を集めた通学専用バッグ") ||
        !result.stockOneProduct.responsiveImage.includes("480w") ||
        result.galleryNext.count !== "2 / 5" || result.galleryNext.currentThumb !== "1" ||
        !result.galleryNext.alt.includes("2 / 5") ||
        result.stockOneAfterCart.quantities.some(Boolean) || !result.stockOneAfterCart.addDisabled ||
        !result.stockOneAfterCart.stockText.includes("追加可能0点") ||
        !result.stockOneAfterCart.status.includes("在庫上限") ||
        result.variantStockLimit.quantities.length !== 7 ||
        result.variantStockLimit.quantities.at(-1) !== "7" ||
        !result.variantStockLimit.stockText.includes("7点") ||
        result.variantStockReduced.value !== "1" ||
        result.variantStockReduced.quantities.join(",") !== "1" ||
        !result.variantStockReduced.stockText.includes("1点") ||
        !result.variantStockReduced.status.includes("数量を2から1へ変更") ||
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
        result.studentConditionNumeric.inputMode !== "numeric" ||
        result.studentConditionNumeric.pattern !== "[0-9]*" ||
        result.studentConditionNumeric.numeric !== "true" ||
        !result.studentConditionNumeric.placeholder.includes("数字のみ") ||
        !result.studentConditionFiltered || !result.studentConditionAdded || !result.pricedOptionVisible ||
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
