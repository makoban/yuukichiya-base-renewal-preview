(function () {
  "use strict";

  function normalize(value) {
    var text = String(value || "");
    try { text = text.normalize("NFKC"); } catch (error) {}
    return text.toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, function (char) {
        return String.fromCharCode(char.charCodeAt(0) - 0x60);
      })
      .replace(/(?:体そう|たいそう|体そー|たいそー)(?:服|ふく)/g, "体操服")
      .replace(/[‐‑‒–—―ーｰ]/g, "-")
      .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\u3005\u3006\u30fc]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function compact(value) {
    return normalize(value).replace(/[\s-]+/g, "");
  }

  function unique(values) {
    return values.filter(function (value, index) {
      return value && values.indexOf(value) === index;
    });
  }

  function editDistance(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    var previous = Array.from({ length: right.length + 1 }, function (_, index) { return index; });
    for (var i = 1; i <= left.length; i += 1) {
      var current = [i];
      for (var j = 1; j <= right.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  function fuzzyContains(text, token) {
    if (text.indexOf(token) !== -1) return true;
    if (token.length < 2) return false;
    var limit = token.length >= 7 ? 2 : 1;
    var source = String(text || "").replace(/\s+/g, "");
    var minLength = Math.max(2, token.length - limit);
    var maxLength = Math.min(source.length, token.length + limit);
    for (var length = minLength; length <= maxLength; length += 1) {
      for (var start = 0; start + length <= source.length; start += 1) {
        var candidate = source.slice(start, start + length);
        if (token.length <= 4 && candidate.charAt(0) !== token.charAt(0)) continue;
        if (editDistance(token, candidate) <= limit) return true;
      }
    }
    return false;
  }

  function createSearchEngine(options) {
    options = options || {};
    var config = window.ykSearchRelevanceConfig || { concepts: [], stopWords: [] };
    var concepts = (config.concepts || []).map(function (concept) {
      return {
        id: concept.id,
        related: concept.related || [],
        aliases: (concept.aliases || []).map(function (alias) {
          return {
            normalized: normalize(alias),
            compact: compact(alias),
            tokens: normalize(alias).split(" ").map(compact).filter(Boolean)
          };
        }).filter(function (alias) { return alias.compact; })
      };
    });
    var stopWords = (config.stopWords || []).map(compact).filter(Boolean);
    var productCache = {};
    var schoolEntries = null;
    var parsedKey = "";
    var parsedValue = null;

    function searchCatalog() {
      return typeof options.getSearchCatalog === "function" ? options.getSearchCatalog() || {} : {};
    }

    function productSchoolText() {
      return typeof options.getProductSchoolText === "function" ? options.getProductSchoolText() || {} : {};
    }

    function getSchoolEntries() {
      if (schoolEntries) return schoolEntries;
      schoolEntries = Object.keys(searchCatalog()).map(function (schoolName) {
        var aliases = [
          schoolName,
          schoolName.replace(/高等学校/g, "高校"),
          schoolName.replace(/小学校/g, "小"),
          schoolName.replace(/中学校/g, "中"),
          schoolName.replace(/高等学校/g, "高").replace(/高校/g, "高"),
          schoolName.replace(/幼稚園/g, "幼")
        ].map(compact).filter(function (alias) { return alias.length >= 3; });
        return {
          name: schoolName,
          compact: compact(schoolName),
          aliases: unique(aliases).sort(function (a, b) { return b.length - a.length; })
        };
      });
      return schoolEntries;
    }

    function findSchools(queryCompact) {
      return getSchoolEntries().filter(function (entry) {
        return entry.aliases.some(function (alias) { return queryCompact.indexOf(alias) !== -1; });
      });
    }

    function findConcepts(queryNormalized, queryCompact) {
      var candidates = [];
      concepts.forEach(function (concept) {
        concept.aliases.forEach(function (alias) {
          var hasAscii = /[a-z]/.test(alias.normalized);
          var matched = hasAscii
            ? (" " + queryNormalized + " ").indexOf(" " + alias.normalized + " ") !== -1
            : queryCompact.indexOf(alias.compact) !== -1;
          if (matched) candidates.push({ concept: concept, alias: alias });
        });
      });
      candidates.sort(function (a, b) { return b.alias.compact.length - a.alias.compact.length; });
      var selected = [];
      candidates.forEach(function (candidate) {
        if (selected.some(function (item) { return item.concept.id === candidate.concept.id; })) return;
        if (selected.some(function (item) {
          return item.alias.compact.length > candidate.alias.compact.length &&
            item.alias.compact.indexOf(candidate.alias.compact) !== -1;
        })) return;
        selected.push(candidate);
      });
      return selected;
    }

    function parseQuery(query) {
      var normalized = normalize(query);
      var queryCompact = compact(query);
      if (normalized === parsedKey && parsedValue) return parsedValue;
      var conceptMatches = findConcepts(normalized, queryCompact);
      var schools = findSchools(queryCompact);
      var matchedParts = [];
      conceptMatches.forEach(function (match) {
        matchedParts.push(match.alias.compact);
        matchedParts = matchedParts.concat(match.alias.tokens);
      });
      schools.forEach(function (school) {
        matchedParts = matchedParts.concat(school.aliases.filter(function (alias) {
          return queryCompact.indexOf(alias) !== -1;
        }));
      });
      matchedParts = unique(matchedParts).sort(function (a, b) { return b.length - a.length; });
      var tokens = [];
      normalized.split(" ").forEach(function (token) {
        var remaining = compact(token);
        if (!remaining || stopWords.indexOf(remaining) !== -1) return;
        matchedParts.forEach(function (part) {
          if (remaining.indexOf(part) !== -1) remaining = remaining.split(part).join("");
        });
        stopWords.filter(function (word) {
          return word.length >= 2 || /[^\x00-\x7f]/.test(word);
        }).sort(function (a, b) { return b.length - a.length; }).forEach(function (word) {
          if (remaining.indexOf(word) !== -1) remaining = remaining.split(word).join("");
        });
        if (stopWords.indexOf(remaining) !== -1) remaining = "";
        if ((conceptMatches.length || schools.length) && remaining.length <= 1) remaining = "";
        if (remaining) tokens.push(remaining);
      });
      var measurements = normalized.match(/\d+(?:\.\d+)?\s*(?:cm|mm|㎝|号)?/g) || [];
      measurements.map(compact).forEach(function (measurement) {
        if (measurement && tokens.indexOf(measurement) === -1) tokens.push(measurement);
      });
      parsedKey = normalized;
      parsedValue = {
        compact: queryCompact,
        concepts: conceptMatches.map(function (match) { return match.concept; }),
        schools: schools,
        tokens: unique(tokens)
      };
      return parsedValue;
    }

    function productDoc(product) {
      var id = String(product.id);
      if (productCache[id]) return productCache[id];
      var title = compact(product.t);
      var variants = compact([product.v].concat(product.vs || []).join(" "));
      var schools = compact(productSchoolText()[id] || "");
      var combined = [title, variants, schools, id].join("");
      var conceptTitle = title;
      getSchoolEntries().forEach(function (school) {
        if (schools.indexOf(school.compact) !== -1 && conceptTitle.indexOf(school.compact) !== -1) {
          conceptTitle = conceptTitle.split(school.compact).join("");
        }
      });
      var matchedConcepts = {};
      concepts.forEach(function (concept) {
        var conceptText = concept.id.indexOf("school_") === 0 ? combined : conceptTitle + variants;
        if (concept.id === "bag" && title.indexOf("baginrain") !== -1) return;
        if (concept.aliases.some(function (alias) {
          return conceptText.indexOf(alias.compact) !== -1;
        })) matchedConcepts[concept.id] = true;
      });
      productCache[id] = {
        id: compact(id),
        title: title,
        variants: variants,
        schools: schools,
        combined: combined,
        concepts: matchedConcepts
      };
      return productCache[id];
    }

    function tokenScore(doc, token) {
      if (doc.title === token) return 180;
      if (doc.title.indexOf(token) === 0) return 125;
      if (doc.title.indexOf(token) !== -1) return 95;
      if (doc.schools.indexOf(token) !== -1) return 80;
      if (doc.variants.indexOf(token) !== -1) return 65;
      if (doc.id.indexOf(token) !== -1) return 55;
      return fuzzyContains(doc.combined, token) ? 20 : -1;
    }

    function conceptScore(doc, concept) {
      if (doc.concepts[concept.id]) {
        if (concept.aliases.some(function (alias) { return doc.title.indexOf(alias.compact) !== -1; })) return 155;
        if (concept.aliases.some(function (alias) { return doc.variants.indexOf(alias.compact) !== -1; })) return 120;
        return 135;
      }
      var relatedIndex = concept.related.findIndex(function (relatedId) { return doc.concepts[relatedId]; });
      return relatedIndex >= 0 ? Math.max(28, 48 - relatedIndex * 4) : -1;
    }

    function isProductIntent(concept) {
      return [
        "socks", "footwear", "indoor_shoes", "gym_shoes", "sandals", "gymwear",
        "jersey", "uniform", "shirt", "shorts", "pants", "skirt", "outerwear",
        "headwear", "bag", "bag_cover", "rainwear", "swimwear", "swim_accessory",
        "helmet", "school_commute", "school_start"
      ].indexOf(concept.id) !== -1;
    }

    function modifierBoost(concept) {
      if (/^(boys|girls|unisex)$/.test(concept.id)) return 90;
      if (concept.id.indexOf("school_") === 0) return 75;
      if (concept.id.indexOf("color_") === 0) return 60;
      if (/^(short_sleeve|long_sleeve)$/.test(concept.id)) return 50;
      if (/^(summer|winter)$/.test(concept.id)) return 70;
      return 0;
    }

    function missingPenalty(concept) {
      if (/^(boys|girls|unisex)$/.test(concept.id)) return 180;
      if (concept.id.indexOf("school_") === 0) return 160;
      if (concept.id.indexOf("color_") === 0) return 125;
      if (/^(short_sleeve|long_sleeve)$/.test(concept.id)) return 95;
      if (/^(summer|winter)$/.test(concept.id)) return 105;
      if (/^(sale|embroidery)$/.test(concept.id)) return 120;
      return 24;
    }

    function score(product, query) {
      var parsed = parseQuery(query);
      if (!parsed.compact) return -1;
      var doc = productDoc(product);
      var result = 0;
      var matchedUnits = 0;
      var softMatches = 0;
      var strongMatches = 0;
      var softUnits = parsed.concepts.length + parsed.tokens.length;
      var productIntentUnits = 0;
      var productIntentMatches = 0;
      if (doc.title.indexOf(parsed.compact) !== -1) result += 280;
      else if (doc.schools.indexOf(parsed.compact) !== -1) result += 210;
      else if (doc.variants.indexOf(parsed.compact) !== -1) result += 130;
      else if (doc.combined.indexOf(parsed.compact) !== -1) result += 115;
      for (var schoolIndex = 0; schoolIndex < parsed.schools.length; schoolIndex += 1) {
        if (doc.schools.indexOf(parsed.schools[schoolIndex].compact) === -1) return -1;
        result += 190;
        matchedUnits += 1;
      }
      for (var conceptIndex = 0; conceptIndex < parsed.concepts.length; conceptIndex += 1) {
        var concept = parsed.concepts[conceptIndex];
        if (concept.id === "rainwear" && !doc.concepts.rainwear) return -1;
        var currentScore = conceptScore(doc, concept);
        var productIntent = isProductIntent(concept);
        if (productIntent) productIntentUnits += 1;
        if (currentScore >= 0) {
          result += currentScore + modifierBoost(concept);
          matchedUnits += 1;
          softMatches += 1;
          if (productIntent) productIntentMatches += 1;
          if (currentScore >= 100) strongMatches += 1;
        } else {
          result -= missingPenalty(concept);
        }
      }
      for (var tokenIndex = 0; tokenIndex < parsed.tokens.length; tokenIndex += 1) {
        var currentTokenScore = tokenScore(doc, parsed.tokens[tokenIndex]);
        if (currentTokenScore >= 0) {
          result += currentTokenScore;
          matchedUnits += 1;
          softMatches += 1;
          strongMatches += 1;
        } else {
          result -= 18;
        }
      }
      if (softUnits) {
        var minimumMatches = softUnits <= 2 ? 1 : Math.ceil(softUnits * 0.55);
        if (softMatches < minimumMatches || (softUnits >= 2 && strongMatches < 1)) return -1;
        if (productIntentUnits && !productIntentMatches) return -1;
        result += softMatches * 12 - (softUnits - softMatches) * 10;
      }
      if (!matchedUnits) {
        var fallback = tokenScore(doc, parsed.compact);
        if (fallback < 0) return -1;
        result += fallback;
      }
      return result;
    }

    function reset() {
      productCache = {};
      schoolEntries = null;
      parsedKey = "";
      parsedValue = null;
    }

    return { score: score, reset: reset };
  }

  var reviewPageSize = 5;
  var reviewScoreValue = { good: 3, normal: 2, bad: 1 };

  function ensureReviewMarkup(section) {
    if (section.querySelector("[data-yk-review-list]")) return;
    section.innerHTML = '<div class="yk-section"><div class="yk-shop-reviews yk-shop-reviews--home">' +
      '<div class="yk-shop-reviews__head"><h2 id="yk-shop-reviews-title">ショップの評価</h2></div>' +
      '<div class="yk-shop-reviews__summary" aria-label="ショップの評価を絞り込む">' +
      '<button class="yk-review-score" type="button" data-score="all" data-yk-review-filter="all" aria-label="すべての評価" aria-pressed="true"><span>すべて</span></button>' +
      '<button class="yk-review-score" type="button" data-score="good" data-yk-review-filter="good" aria-label="良い評価" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11.5" cy="13" r="1.5" fill="currentColor"/><circle cx="20.5" cy="13" r="1.5" fill="currentColor"/><path d="M10.5 18.2c1.4 2.2 3.2 3.3 5.5 3.3s4.1-1.1 5.5-3.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><b data-yk-review-count="good">0</b></button>' +
      '<button class="yk-review-score" type="button" data-score="normal" data-yk-review-filter="normal" aria-label="普通の評価" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11.5" cy="13" r="1.5" fill="currentColor"/><circle cx="20.5" cy="13" r="1.5" fill="currentColor"/><path d="M11 20h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><b data-yk-review-count="normal">0</b></button>' +
      '<button class="yk-review-score" type="button" data-score="bad" data-yk-review-filter="bad" aria-label="悪い評価" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11.5" cy="13" r="1.5" fill="currentColor"/><circle cx="20.5" cy="13" r="1.5" fill="currentColor"/><path d="M10.5 21c1.4-2.2 3.2-3.3 5.5-3.3s4.1 1.1 5.5 3.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><b data-yk-review-count="bad">0</b></button></div>' +
      '<div class="yk-shop-reviews__toolbar"><label>並び替え<select data-yk-review-sort aria-label="評価の並び替え"><option value="newest">新しい順</option><option value="oldest">古い順</option><option value="high">評価の高い順</option><option value="low">評価の低い順</option><option value="comment">口コミあり優先</option></select></label></div>' +
      '<div class="yk-shop-reviews__list" role="list" data-yk-review-list></div><nav class="yk-shop-reviews__pagination" aria-label="評価のページ切り替え"><button type="button" data-yk-review-prev>前の5件</button><p class="yk-shop-reviews__page" aria-live="polite" data-yk-review-page></p><button type="button" data-yk-review-next>次の5件</button></nav>' +
      '</div></div>';
  }

  function reviewScoreLabel(score) {
    return score === "good" ? "良い" : score === "bad" ? "悪い" : "普通";
  }

  function reviewIconMarkup(score) {
    var mouth = score === "good"
      ? '<path d="M5.5 10c.8 1.4 1.9 2 3.5 2s2.7-.6 3.5-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
      : score === "bad"
        ? '<path d="M5.5 12c.8-1.4 1.9-2 3.5-2s2.7.6 3.5 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
        : '<path d="M5.5 11h7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6.4" cy="7" r=".8" fill="currentColor"/><circle cx="11.6" cy="7" r=".8" fill="currentColor"/>' + mouth + "</svg>";
  }

  function sortedReviews(items, sort, filter) {
    var sorted = items.slice();
    if (filter && filter !== "all") sorted = sorted.filter(function (review) { return review.score === filter; });
    var newest = function (left, right) {
      return String(right.date || "").localeCompare(String(left.date || "")) || String(left.id || "").localeCompare(String(right.id || ""));
    };
    sorted.sort(function (left, right) {
      if (sort === "oldest") return String(left.date || "").localeCompare(String(right.date || "")) || String(left.id || "").localeCompare(String(right.id || ""));
      if (sort === "high" || sort === "low") {
        var direction = sort === "high" ? -1 : 1;
        return ((reviewScoreValue[left.score] || 2) - (reviewScoreValue[right.score] || 2)) * direction || newest(left, right);
      }
      if (sort === "comment") return Number(Boolean(right.comment)) - Number(Boolean(left.comment)) || newest(left, right);
      return newest(left, right);
    });
    return sorted;
  }

  function buildReviewCard(review) {
    var card = document.createElement("article");
    card.className = "yk-shop-review";
    card.setAttribute("role", "listitem");
    var head = document.createElement("div");
    head.className = "yk-shop-review__head";
    var image = review.image ? document.createElement("img") : document.createElement("span");
    image.className = "yk-shop-review__image";
    if (review.image) {
      image.src = review.image;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.width = 146;
      image.height = 146;
    } else image.setAttribute("aria-hidden", "true");
    head.appendChild(image);
    var product = document.createElement("div");
    product.className = "yk-shop-review__product";
    var productName = document.createElement("b");
    productName.textContent = review.productName || "購入商品";
    var productMeta = document.createElement("span");
    productMeta.textContent = [review.variation || "", String(review.date || "").replace(/-/g, "/")].filter(Boolean).join(" ／ ");
    product.appendChild(productName);
    product.appendChild(productMeta);
    head.appendChild(product);
    var rating = document.createElement("span");
    rating.className = "yk-shop-review__rating";
    rating.dataset.score = review.score || "normal";
    rating.setAttribute("aria-label", "評価：" + reviewScoreLabel(review.score));
    rating.innerHTML = reviewIconMarkup(review.score);
    head.appendChild(rating);
    card.appendChild(head);
    if (review.comment) {
      var comment = document.createElement("p");
      comment.className = "yk-shop-review__comment";
      comment.textContent = review.comment;
      card.appendChild(comment);
    }
    if (review.reply) {
      var reply = document.createElement("p");
      reply.className = "yk-shop-review__reply";
      reply.setAttribute("aria-label", "ショップからの返信");
      reply.textContent = review.reply;
      card.appendChild(reply);
    }
    return card;
  }

  function renderShopReviews(data) {
    var section = document.querySelector("[data-yk-shop-reviews]");
    if (!section) return;
    var summary = data && data.summary || {};
    var items = data && Array.isArray(data.items) ? data.items : [];
    section.hidden = items.length === 0;
    if (!items.length) return;
    ensureReviewMarkup(section);
    section.ykReviewData = { summary: summary, items: items };
    if (!section.ykReviewSort) section.ykReviewSort = "newest";
    if (!section.ykReviewFilter) section.ykReviewFilter = "all";
    if (!section.ykReviewPage) section.ykReviewPage = 1;
    var sorted = sortedReviews(items, section.ykReviewSort, section.ykReviewFilter);
    var pageCount = Math.max(1, Math.ceil(sorted.length / reviewPageSize));
    section.ykReviewPage = Math.max(1, Math.min(pageCount, section.ykReviewPage));
    var start = (section.ykReviewPage - 1) * reviewPageSize;
    var pageItems = sorted.slice(start, start + reviewPageSize);
    ["good", "normal", "bad"].forEach(function (score) {
      var count = section.querySelector('[data-yk-review-count="' + score + '"]');
      if (count) count.textContent = String(Number(summary[score] || 0));
    });
    section.querySelectorAll("[data-yk-review-filter]").forEach(function (filter) {
      filter.setAttribute("aria-pressed", String(filter.dataset.ykReviewFilter === section.ykReviewFilter));
    });
    var list = section.querySelector("[data-yk-review-list]");
    list.replaceChildren();
    if (pageItems.length) pageItems.forEach(function (review) { list.appendChild(buildReviewCard(review)); });
    else {
      var empty = document.createElement("p");
      empty.className = "yk-shop-reviews__empty";
      empty.textContent = "該当する評価はありません。";
      list.appendChild(empty);
    }
    var sort = section.querySelector("[data-yk-review-sort]");
    if (sort) sort.value = section.ykReviewSort;
    var previous = section.querySelector("[data-yk-review-prev]");
    var next = section.querySelector("[data-yk-review-next]");
    if (previous) previous.disabled = section.ykReviewPage <= 1;
    if (next) next.disabled = section.ykReviewPage >= pageCount;
    var page = section.querySelector("[data-yk-review-page]");
    if (page) page.textContent = pageItems.length ? section.ykReviewPage + " / " + pageCount + "ページ（" + (start + 1) + "～" + (start + pageItems.length) + "件）" : "0件";
    if (section.dataset.ykReviewBound === "true") return;
    section.dataset.ykReviewBound = "true";
    section.addEventListener("click", function (event) {
      var filter = event.target.closest("[data-yk-review-filter]");
      if (filter) {
        section.ykReviewFilter = filter.dataset.ykReviewFilter || "all";
        section.ykReviewPage = 1;
      } else if (event.target.closest("[data-yk-review-prev]")) section.ykReviewPage -= 1;
      else if (event.target.closest("[data-yk-review-next]")) section.ykReviewPage += 1;
      else return;
      renderShopReviews(section.ykReviewData);
    });
    if (sort) sort.addEventListener("change", function () {
      section.ykReviewSort = sort.value;
      section.ykReviewPage = 1;
      renderShopReviews(section.ykReviewData);
    });
  }

  function tokyoDateKey() {
    var parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + "-" + values.month + "-" + values.day;
  }

  function dayNumber(dateKey) {
    var parts = String(dateKey || "").slice(0, 10).split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return NaN;
    return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000;
  }

  function formatDay(value) {
    var date = new Date(value * 86400000);
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日（" + weekdays[date.getUTCDay()] + "）";
  }

  function renderMajorClosures(calendarData) {
    var notice = document.querySelector("[data-yk-major-closure]");
    var target = document.querySelector("[data-yk-major-closure-periods]");
    if (!notice || !target) return;
    var today = dayNumber(tokyoDateKey());
    var stores = calendarData && calendarData.stores || {};
    var periods = {};
    Object.keys(stores).forEach(function (storeName) {
      (Array.isArray(stores[storeName]) ? stores[storeName] : []).forEach(function (event) {
        var title = String(event && event.summary || "");
        if (!/夏季休業|冬季休業|年末年始/.test(title) || event.status === "cancelled") return;
        var start = dayNumber(event.start && (event.start.date || event.start.dateTime));
        var endExclusive = dayNumber(event.end && (event.end.date || event.end.dateTime));
        if (!isFinite(start)) return;
        var end = isFinite(endExclusive) && endExclusive > start ? endExclusive - 1 : start;
        if (end < today || start > today + 14) return;
        var key = title + "|" + start + "|" + end;
        if (!periods[key]) periods[key] = { title: title, start: start, end: end, stores: [] };
        if (periods[key].stores.indexOf(storeName) === -1) periods[key].stores.push(storeName);
      });
    });
    target.replaceChildren();
    Object.keys(periods).sort(function (a, b) { return periods[a].start - periods[b].start; }).forEach(function (key) {
      var period = periods[key];
      var row = document.createElement("span");
      row.className = "yk-closure-period";
      row.textContent = period.title + "：" + formatDay(period.start) +
        (period.end > period.start ? "〜" + formatDay(period.end) : "") +
        "（" + period.stores.join("・") + "）";
      target.appendChild(row);
    });
    notice.hidden = !target.children.length;
  }

  function initMajorClosureNotice() {
    fetch("https://kokotomo-sns.bantex.jp/api/public/hp-calendar/yuukichiya/events.json", {
      cache: "no-cache", credentials: "omit"
    }).then(function (response) {
      if (!response.ok) throw new Error("calendar_http_" + response.status);
      return response.json();
    }).then(renderMajorClosures).catch(function () {});
  }

  window.ykStorefrontExtras = {
    createSearchEngine: createSearchEngine,
    renderShopReviews: renderShopReviews,
    initMajorClosureNotice: initMajorClosureNotice
  };
})();
