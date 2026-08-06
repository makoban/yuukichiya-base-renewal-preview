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
      .replace(/[‐‑‒–—―]/g, "-")
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

  function fuzzyContains(text, token, allowShortFuzzy) {
    if (text.indexOf(token) !== -1) return true;
    if (token.length < 3 && !allowShortFuzzy) return false;
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
        allowRelatedResults: concept.allowRelatedResults === true,
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
      var searchable = [title, variants, schools].join("");
      var combined = [searchable, id].join("");
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
        searchable: searchable,
        combined: combined,
        concepts: matchedConcepts
      };
      return productCache[id];
    }

    function tokenScore(doc, token, allowShortFuzzy) {
      if (doc.title === token) return 180;
      if (doc.title.indexOf(token) === 0) return 125;
      if (doc.title.indexOf(token) !== -1) return 95;
      if (doc.schools.indexOf(token) !== -1) return 80;
      if (doc.variants.indexOf(token) !== -1) return 65;
      if (doc.id.indexOf(token) !== -1) return 55;
      return fuzzyContains(doc.searchable, token, allowShortFuzzy) ? 20 : -1;
    }

    function conceptScore(doc, concept) {
      if (doc.concepts[concept.id]) {
        var relatedBoostIndex = concept.related.findIndex(function (relatedId) {
          return doc.concepts[relatedId];
        });
        var relatedBoost = relatedBoostIndex >= 0 ? Math.max(8, 18 - relatedBoostIndex * 4) : 0;
        if (concept.aliases.some(function (alias) { return doc.title.indexOf(alias.compact) !== -1; })) return 155 + relatedBoost;
        if (concept.aliases.some(function (alias) { return doc.variants.indexOf(alias.compact) !== -1; })) return 120 + relatedBoost;
        return 135 + relatedBoost;
      }
      var relatedIndex = concept.related.findIndex(function (relatedId) { return doc.concepts[relatedId]; });
      return relatedIndex >= 0 ? Math.max(28, 48 - relatedIndex * 4) : -1;
    }

    function isProductIntent(concept) {
      return [
        "socks", "footwear", "indoor_shoes", "gym_shoes", "sandals", "gymwear",
        "jersey", "uniform", "shirt", "shorts", "pants", "skirt", "outerwear",
        "headwear", "bag", "bag_cover", "rainwear", "swimwear", "swim_accessory",
        "helmet", "chopsticks", "school_lunch_set", "cutlery", "school_commute", "school_start"
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
        var productIntent = isProductIntent(concept);
        if (productIntent && !concept.allowRelatedResults && !doc.concepts[concept.id]) return -1;
        var currentScore = conceptScore(doc, concept);
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
        var contextualShortFuzzy = parsed.concepts.some(function (concept) {
          return doc.concepts[concept.id];
        });
        var currentTokenScore = tokenScore(doc, parsed.tokens[tokenIndex], contextualShortFuzzy);
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
        var fallback = tokenScore(doc, parsed.compact, false);
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
    if (window.ykMajorClosureBaseDate && /^\d{4}-\d{2}-\d{2}$/.test(window.ykMajorClosureBaseDate)) {
      return window.ykMajorClosureBaseDate;
    }
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

  function eventDateKey(event, side) {
    var value = event && event[side];
    if (!value) return "";
    return String(value.date || value.dateTime || "").slice(0, 10);
  }

  function formatDay(value) {
    var date = new Date(value * 86400000);
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return (date.getUTCMonth() + 1) + "月" + date.getUTCDate() + "日（" + weekdays[date.getUTCDay()] + "）";
  }

  function majorClosurePeriods(calendarData) {
    var today = dayNumber(tokyoDateKey());
    var stores = calendarData && calendarData.stores || {};
    var closurePattern = /休業|休暇|定休日|休み/;
    var majorPattern = /夏季休業|夏季休暇|冬季休業|冬季休暇|年末年始|年末休暇|年始休暇/;
    var periods = {};
    Object.keys(stores).forEach(function (storeName) {
      var closedDays = {};
      (Array.isArray(stores[storeName]) ? stores[storeName] : []).forEach(function (event) {
        var title = String(event && event.summary || "");
        if (!closurePattern.test(title) || event.status === "cancelled") return;
        var start = dayNumber(eventDateKey(event, "start"));
        var end = dayNumber(eventDateKey(event, "end"));
        if (!isFinite(start)) return;
        if (!isFinite(end) || end <= start) end = start + 1;
        for (var day = start; day < end; day += 1) {
          if (!closedDays[day]) closedDays[day] = [];
          if (majorPattern.test(title) && closedDays[day].indexOf(title) === -1) closedDays[day].push(title);
        }
      });
      var run = null;
      var days = Object.keys(closedDays).map(Number).sort(function (a, b) { return a - b; });
      days.forEach(function (day, index) {
        if (!run || day !== run.end + 1) {
          if (run && run.titles.length) addPeriod(run);
          run = { store: storeName, start: day, end: day, titles: [] };
        } else run.end = day;
        closedDays[day].forEach(function (title) {
          if (run.titles.indexOf(title) === -1) run.titles.push(title);
        });
        if (index === days.length - 1 && run && run.titles.length) addPeriod(run);
      });
    });

    function addPeriod(run) {
      if (run.end < today || run.start > today + 14) return;
      var title = run.titles[0] || "大型休業";
      var key = title + "|" + run.start + "|" + run.end;
      if (!periods[key]) periods[key] = { title: title, start: run.start, end: run.end, stores: [] };
      if (periods[key].stores.indexOf(run.store) === -1) periods[key].stores.push(run.store);
    }

    return Object.keys(periods).map(function (key) { return periods[key]; }).sort(function (a, b) {
      return a.start - b.start;
    });
  }

  function renderMajorClosures(calendarData) {
    var notice = document.querySelector("[data-yk-major-closure]");
    var target = document.querySelector("[data-yk-major-closure-periods]");
    if (!notice || !target) return;
    target.replaceChildren();
    majorClosurePeriods(calendarData).forEach(function (period) {
      var row = document.createElement("span");
      row.className = "yk-closure-period";
      row.textContent = period.title + "：" + formatDay(period.start) +
        (period.end > period.start ? "〜" + formatDay(period.end) : "") +
        "／" + period.stores.join("・");
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
(function () {
  "use strict";
  if (window.ykImageGalleryV1) return;

  var genericSelector = ".yk-feature__image img,.yk-pickup__image img,.yk-payment-image img,.yk-store-card > img,.yk-card > img,.yk-preview-item-dialog__image";
  var previousFocus = null;
  var activeGallery = null;
  var lightboxItems = [];
  var lightboxIndex = 0;
  var scale = 1;
  var translateX = 0;
  var translateY = 0;
  var pointers = {};
  var dragStart = null;
  var pinchStart = null;
  var pointerMoved = false;
  var suppressClickUntil = 0;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function wrapIndex(index, length) {
    return length ? (index % length + length) % length : 0;
  }

  function preload(source) {
    if (!source) return;
    var nextImage = new Image();
    nextImage.src = source;
  }

  function keepThumbVisible(container, thumb) {
    if (!container || !thumb) return;
    var left = thumb.offsetLeft;
    var right = left + thumb.offsetWidth;
    if (left < container.scrollLeft) container.scrollLeft = left;
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth;
  }

  function selectGalleryItem(state, requestedIndex, options) {
    if (!state || !state.items.length) return;
    options = options || {};
    var index = wrapIndex(requestedIndex, state.items.length);
    var item = state.items[index];
    state.index = index;
    state.mainImage.src = item.source;
    state.mainImage.alt = item.alt;
    state.mainButton.setAttribute("data-yk-lightbox", item.source);
    state.mainButton.setAttribute("data-yk-lightbox-alt", item.alt);
    state.thumbs.forEach(function (thumb, thumbIndex) {
      thumb.setAttribute("aria-current", thumbIndex === index ? "true" : "false");
    });
    state.count.textContent = (index + 1) + " / " + state.items.length;
    if (options.keepThumb !== false) keepThumbVisible(state.thumbStrip, state.thumbs[index]);
    if (state.items.length > 1) preload(state.items[wrapIndex(index + 1, state.items.length)].source);
  }

  var dialog = document.createElement("dialog");
  dialog.className = "yk-lightbox";
  dialog.setAttribute("aria-label", "画像拡大表示");
  dialog.innerHTML = '<div class="yk-lightbox__inner"><div class="yk-lightbox__stage" data-yk-lightbox-stage><img class="yk-lightbox__image" alt="" draggable="false"></div><button class="yk-lightbox__nav yk-lightbox__nav--prev" type="button" data-yk-lightbox-prev aria-label="前の画像">&#8249;</button><button class="yk-lightbox__nav yk-lightbox__nav--next" type="button" data-yk-lightbox-next aria-label="次の画像">&#8250;</button><output class="yk-lightbox__count" data-yk-lightbox-count aria-live="polite"></output><div class="yk-lightbox__controls"><button class="yk-lightbox__control" type="button" data-yk-zoom-out aria-label="縮小" title="縮小">&#8722;</button><button class="yk-lightbox__control" type="button" data-yk-zoom-reset aria-label="全体表示に戻す" title="全体表示に戻す">&#8634;</button><button class="yk-lightbox__control" type="button" data-yk-zoom-in aria-label="拡大" title="拡大">+</button><button class="yk-lightbox__control yk-lightbox__close" type="button" aria-label="画像拡大表示を閉じる" title="閉じる">&times;</button></div><p class="yk-lightbox__caption"></p></div>';
  document.body.appendChild(dialog);

  var stage = dialog.querySelector("[data-yk-lightbox-stage]");
  var image = dialog.querySelector(".yk-lightbox__image");
  var caption = dialog.querySelector(".yk-lightbox__caption");
  var closeButton = dialog.querySelector(".yk-lightbox__close");
  var zoomOutButton = dialog.querySelector("[data-yk-zoom-out]");
  var resetButton = dialog.querySelector("[data-yk-zoom-reset]");
  var zoomInButton = dialog.querySelector("[data-yk-zoom-in]");
  var previousButton = dialog.querySelector("[data-yk-lightbox-prev]");
  var nextButton = dialog.querySelector("[data-yk-lightbox-next]");
  var lightboxCount = dialog.querySelector("[data-yk-lightbox-count]");

  function pointerList() {
    return Object.keys(pointers).map(function (key) { return pointers[key]; });
  }

  function clampPan() {
    if (scale <= 1.001) {
      translateX = 0;
      translateY = 0;
      return;
    }
    var maxX = Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2);
    var maxY = Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2);
    translateX = clamp(translateX, -maxX, maxX);
    translateY = clamp(translateY, -maxY, maxY);
  }

  function renderView() {
    clampPan();
    image.style.transform = "translate3d(" + translateX + "px," + translateY + "px,0) scale(" + scale + ")";
    dialog.setAttribute("data-yk-scale", scale <= 1.001 ? "1" : "zoomed");
    zoomOutButton.disabled = scale <= 1.001;
    resetButton.disabled = scale <= 1.001;
    zoomInButton.disabled = scale >= 5;
  }

  function resetView() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    renderView();
  }

  function setScale(nextScale, clientX, clientY) {
    var oldScale = scale;
    var next = clamp(nextScale, 1, 5);
    if (Math.abs(next - oldScale) < .001) return;
    var rect = stage.getBoundingClientRect();
    var originX = typeof clientX === "number" ? clientX - rect.left - rect.width / 2 : 0;
    var originY = typeof clientY === "number" ? clientY - rect.top - rect.height / 2 : 0;
    var ratio = next / oldScale;
    translateX = originX - (originX - translateX) * ratio;
    translateY = originY - (originY - translateY) * ratio;
    scale = next;
    renderView();
  }

  function updateLightboxNavigation() {
    var multiple = lightboxItems.length > 1;
    previousButton.hidden = !multiple;
    nextButton.hidden = !multiple;
    lightboxCount.hidden = !multiple;
    lightboxCount.textContent = multiple ? (lightboxIndex + 1) + " / " + lightboxItems.length : "";
  }

  function showLightboxItem(requestedIndex) {
    if (!lightboxItems.length) return;
    lightboxIndex = wrapIndex(requestedIndex, lightboxItems.length);
    var item = lightboxItems[lightboxIndex];
    if (activeGallery) selectGalleryItem(activeGallery, lightboxIndex);
    image.src = item.source;
    image.alt = item.alt;
    caption.textContent = item.alt;
    resetView();
    updateLightboxNavigation();
    if (lightboxItems.length > 1) preload(lightboxItems[wrapIndex(lightboxIndex + 1, lightboxItems.length)].source);
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else {
      dialog.removeAttribute("open");
      document.body.classList.remove("yk-lightbox-open");
    }
  }

  function openDialog(trigger, items, index, owner) {
    var sourceImage = trigger && trigger.matches && trigger.matches("img") ? trigger : trigger && trigger.querySelector ? trigger.querySelector("img") : null;
    var source = trigger && trigger.getAttribute ? trigger.getAttribute("data-yk-lightbox") : "";
    source = source || (sourceImage && (sourceImage.currentSrc || sourceImage.src));
    var alt = trigger && trigger.getAttribute ? trigger.getAttribute("data-yk-lightbox-alt") : "";
    alt = alt || (sourceImage && sourceImage.alt) || "画像";
    lightboxItems = items && items.length ? items.slice() : source ? [{ source: source, alt: alt }] : [];
    if (!lightboxItems.length) return;
    activeGallery = owner || null;
    previousFocus = document.activeElement;
    document.body.classList.add("yk-lightbox-open");
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    showLightboxItem(index || 0);
    closeButton.focus();
  }

  function createPageControl(className, dataAttribute, label, symbol) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "yk-item-gallery__control " + className;
    button.setAttribute(dataAttribute, "");
    button.setAttribute("aria-label", label);
    button.innerHTML = symbol;
    return button;
  }

  function initializeGallery(gallery) {
    if (!gallery || gallery.dataset.ykItemGalleryReady) return;
    var mainButton = gallery.querySelector("[data-yk-item-gallery-open]");
    var mainImage = gallery.querySelector("[data-yk-item-gallery-main]");
    var thumbStrip = gallery.querySelector(".yk-item__thumbs");
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll("[data-yk-item-gallery-thumb]"));
    var viewport = gallery.querySelector(".yk-item-gallery__viewport");
    if (!mainButton || !mainImage || !thumbStrip || !viewport || !thumbs.length) return;
    gallery.dataset.ykItemGalleryReady = "true";
    mainButton.dataset.ykZoomReady = "true";
    var title = mainImage.alt || "商品";
    var items = thumbs.map(function (thumb, index) {
      return {
        source: thumb.getAttribute("data-yk-item-gallery-source") || (thumb.querySelector("img") || {}).src || "",
        alt: title + (thumbs.length > 1 ? " 画像" + (index + 1) : "")
      };
    }).filter(function (item) { return item.source; });
    if (!items.length) return;
    var previous = createPageControl("yk-item-gallery__control--prev", "data-yk-item-gallery-prev", "前の画像", "&#8249;");
    var next = createPageControl("yk-item-gallery__control--next", "data-yk-item-gallery-next", "次の画像", "&#8250;");
    var count = document.createElement("output");
    count.className = "yk-item-gallery__count";
    count.setAttribute("data-yk-item-gallery-count", "");
    count.setAttribute("aria-live", "polite");
    viewport.appendChild(previous);
    viewport.appendChild(next);
    viewport.appendChild(count);
    var state = {
      root: gallery,
      viewport: viewport,
      mainButton: mainButton,
      mainImage: mainImage,
      thumbStrip: thumbStrip,
      thumbs: thumbs,
      items: items,
      previous: previous,
      next: next,
      count: count,
      index: 0,
      suppressMainClickUntil: 0
    };
    gallery.ykGalleryState = state;
    var multiple = items.length > 1;
    previous.hidden = !multiple;
    next.hidden = !multiple;
    count.hidden = !multiple;
    thumbStrip.hidden = !multiple;
    thumbs.forEach(function (thumb, index) {
      thumb.addEventListener("click", function (event) {
        event.preventDefault();
        selectGalleryItem(state, index);
      });
    });
    previous.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      selectGalleryItem(state, state.index - 1);
    });
    next.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      selectGalleryItem(state, state.index + 1);
    });
    mainButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (Date.now() < state.suppressMainClickUntil) return;
      openDialog(mainButton, state.items, state.index, state);
    });
    mainButton.addEventListener("keydown", function (event) {
      if (!multiple || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      selectGalleryItem(state, state.index + (event.key === "ArrowRight" ? 1 : -1));
    });
    var swipeStart = null;
    mainButton.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse") return;
      swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    mainButton.addEventListener("pointerup", function (event) {
      if (!swipeStart || swipeStart.id !== event.pointerId || !multiple) {
        swipeStart = null;
        return;
      }
      var deltaX = event.clientX - swipeStart.x;
      var deltaY = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
      state.suppressMainClickUntil = Date.now() + 450;
      selectGalleryItem(state, state.index + (deltaX < 0 ? 1 : -1));
    });
    mainButton.addEventListener("pointercancel", function () { swipeStart = null; });
    selectGalleryItem(state, 0, { keepThumb: false });
  }

  function enhance(root) {
    var images = [];
    if (root.matches && root.matches(genericSelector)) images.push(root);
    if (root.querySelectorAll) images = images.concat(Array.prototype.slice.call(root.querySelectorAll(genericSelector)));
    images.forEach(function (item) {
      if (item.dataset.ykZoomReady) return;
      item.dataset.ykZoomReady = "true";
      item.classList.add("yk-zoomable");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-label", (item.alt || "画像") + "を拡大表示");
    });
    var galleries = [];
    if (root.matches && root.matches("[data-yk-item-gallery]")) galleries.push(root);
    if (root.querySelectorAll) galleries = galleries.concat(Array.prototype.slice.call(root.querySelectorAll("[data-yk-item-gallery]")));
    galleries.forEach(initializeGallery);
  }

  document.querySelectorAll(".yk-store-grid,.yk-grid-2").forEach(function (grid) {
    var entries = [];
    Array.prototype.forEach.call(grid.children, function (card) {
      var cardImage = Array.prototype.find.call(card.children || [], function (child) { return child.tagName === "IMG"; });
      if (!cardImage) return;
      var heading = card.querySelector("h2,h3");
      entries.push({ image: cardImage, label: heading ? heading.textContent.trim() : cardImage.alt });
    });
    if (entries.length < 2) return;
    var gallery = document.createElement("div");
    gallery.className = "yk-store-gallery";
    gallery.setAttribute("aria-label", "店舗画像。タップすると拡大表示できます");
    entries.forEach(function (entry) {
      var button = document.createElement("button");
      var thumb = entry.image.cloneNode(false);
      var label = document.createElement("span");
      button.type = "button";
      button.className = "yk-gallery-button";
      button.setAttribute("data-yk-lightbox", entry.image.currentSrc || entry.image.src);
      button.setAttribute("data-yk-lightbox-alt", entry.image.alt || entry.label);
      button.setAttribute("aria-label", entry.label + "の画像を拡大表示");
      label.textContent = entry.label;
      button.appendChild(thumb);
      button.appendChild(label);
      gallery.appendChild(button);
    });
    grid.parentNode.insertBefore(gallery, grid);
    grid.classList.add("yk-has-mobile-gallery");
  });

  image.addEventListener("load", resetView);
  zoomOutButton.addEventListener("click", function (event) { event.stopPropagation(); setScale(scale / 1.35); });
  resetButton.addEventListener("click", function (event) { event.stopPropagation(); resetView(); });
  zoomInButton.addEventListener("click", function (event) { event.stopPropagation(); setScale(scale * 1.35); });
  closeButton.addEventListener("click", function (event) { event.stopPropagation(); closeDialog(); });
  previousButton.addEventListener("click", function (event) { event.stopPropagation(); showLightboxItem(lightboxIndex - 1); });
  nextButton.addEventListener("click", function (event) { event.stopPropagation(); showLightboxItem(lightboxIndex + 1); });
  image.addEventListener("dblclick", function (event) {
    event.preventDefault();
    event.stopPropagation();
    setScale(scale > 1.001 ? 1 : 2.2, event.clientX, event.clientY);
  });
  stage.addEventListener("wheel", function (event) {
    if (!dialog.open) return;
    event.preventDefault();
    setScale(scale * (event.deltaY < 0 ? 1.16 : 1 / 1.16), event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    if (stage.setPointerCapture) stage.setPointerCapture(event.pointerId);
    var active = pointerList();
    pointerMoved = false;
    if (active.length === 1) {
      dragStart = { x: event.clientX, y: event.clientY, translateX: translateX, translateY: translateY };
      pinchStart = null;
    } else if (active.length === 2) {
      var dx = active[1].x - active[0].x;
      var dy = active[1].y - active[0].y;
      pinchStart = {
        distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)),
        centerX: (active[0].x + active[1].x) / 2,
        centerY: (active[0].y + active[1].y) / 2,
        scale: scale,
        translateX: translateX,
        translateY: translateY
      };
    }
  });
  stage.addEventListener("pointermove", function (event) {
    if (!pointers[event.pointerId]) return;
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    var active = pointerList();
    if (active.length >= 2 && pinchStart) {
      var dx = active[1].x - active[0].x;
      var dy = active[1].y - active[0].y;
      var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      var centerX = (active[0].x + active[1].x) / 2;
      var centerY = (active[0].y + active[1].y) / 2;
      var rect = stage.getBoundingClientRect();
      var nextScale = clamp(pinchStart.scale * distance / pinchStart.distance, 1, 5);
      var ratio = nextScale / pinchStart.scale;
      var localX = pinchStart.centerX - rect.left - rect.width / 2 - pinchStart.translateX;
      var localY = pinchStart.centerY - rect.top - rect.height / 2 - pinchStart.translateY;
      scale = nextScale;
      translateX = centerX - rect.left - rect.width / 2 - localX * ratio;
      translateY = centerY - rect.top - rect.height / 2 - localY * ratio;
      pointerMoved = true;
      stage.dataset.ykDragging = "true";
      renderView();
    } else if (active.length === 1 && dragStart) {
      var moveX = event.clientX - dragStart.x;
      var moveY = event.clientY - dragStart.y;
      if (Math.abs(moveX) > 4 || Math.abs(moveY) > 4) pointerMoved = true;
      if (scale > 1.001) {
        translateX = dragStart.translateX + moveX;
        translateY = dragStart.translateY + moveY;
        stage.dataset.ykDragging = "true";
        renderView();
      }
    }
  });
  function releasePointer(event) {
    var released = pointers[event.pointerId] || { x: event.clientX, y: event.clientY };
    var wasSingle = Object.keys(pointers).length === 1;
    if (pointers[event.pointerId]) delete pointers[event.pointerId];
    if (stage.releasePointerCapture && stage.hasPointerCapture && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (wasSingle && dragStart && scale <= 1.001 && lightboxItems.length > 1) {
      var deltaX = released.x - dragStart.x;
      var deltaY = released.y - dragStart.y;
      if (Math.abs(deltaX) >= 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        showLightboxItem(lightboxIndex + (deltaX < 0 ? 1 : -1));
        pointerMoved = true;
      }
    }
    if (pointerMoved) suppressClickUntil = Date.now() + 350;
    stage.dataset.ykDragging = "false";
    var active = pointerList();
    pinchStart = null;
    if (active.length === 1) dragStart = { x: active[0].x, y: active[0].y, translateX: translateX, translateY: translateY };
    else dragStart = null;
  }
  stage.addEventListener("pointerup", releasePointer);
  stage.addEventListener("pointercancel", releasePointer);
  stage.addEventListener("click", function (event) {
    if (Date.now() < suppressClickUntil || event.target !== stage) return;
    closeDialog();
  });
  dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDialog(); });
  dialog.addEventListener("close", function () {
    document.body.classList.remove("yk-lightbox-open");
    image.removeAttribute("src");
    pointers = {};
    dragStart = null;
    pinchStart = null;
    lightboxItems = [];
    activeGallery = null;
    resetView();
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  });
  document.addEventListener("click", function (event) {
    var trigger = event.target.closest ? event.target.closest("[data-yk-lightbox]," + genericSelector) : null;
    if (!trigger || trigger === image || trigger.matches("[data-yk-item-gallery-open]")) return;
    event.preventDefault();
    openDialog(trigger);
  });
  document.addEventListener("keydown", function (event) {
    if (dialog.open) {
      if (event.key === "ArrowLeft" && lightboxItems.length > 1) {
        event.preventDefault();
        showLightboxItem(lightboxIndex - 1);
      } else if (event.key === "ArrowRight" && lightboxItems.length > 1) {
        event.preventDefault();
        showLightboxItem(lightboxIndex + 1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setScale(scale * 1.35);
      } else if (event.key === "-") {
        event.preventDefault();
        setScale(scale / 1.35);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches && event.target.matches(genericSelector)) {
      event.preventDefault();
      openDialog(event.target);
    }
  });
  window.addEventListener("resize", function () { if (dialog.open) renderView(); });
  enhance(document);
  if ("MutationObserver" in window) {
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, function (node) {
          if (node.nodeType === 1) enhance(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.ykImageGalleryV1 = true;
})();
