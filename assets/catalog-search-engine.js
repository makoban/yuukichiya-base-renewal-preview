(function () {
  "use strict";

  var PRODUCT_INTENTS = [
    "socks", "footwear", "indoor_shoes", "gym_shoes", "sandals", "gymwear",
    "jersey", "uniform", "shirt", "shorts", "pants", "skirt", "outerwear",
    "headwear", "bag", "bag_cover", "rainwear", "swimwear", "swim_accessory",
    "helmet", "chopsticks", "school_lunch_set", "cutlery", "school_commute",
    "school_start"
  ];

  function normalize(value) {
    var text = String(value || "");
    try { text = text.normalize("NFKC"); } catch (error) {}
    return text.toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, function (char) {
        return String.fromCharCode(char.charCodeAt(0) - 0x60);
      })
      .replace(/じ(?:ゃ|や|ぁ)(?:ー+)?(?:じ|ぢ)(?:ー)?/g, "じゃーじ")
      .replace(/しゃーじ/g, "じゃーじ")
      .replace(/(?:体操|体そう|たいそ(?:う|ー)?|体そー)(?:服|ふく|ぶく|ふ|着|ぎ)/g, "体操服")
      .replace(/せいふく/g, "制服")
      .replace(/(?:上|うわ)(?:履き|ばき|はき)/g, "上履き")
      .replace(/たいいくかんしゅーず/g, "体育館しゅーず")
      .replace(/上依/g, "上衣")
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

  function fuzzyContains(text, token) {
    if (text.indexOf(token) !== -1) return true;
    if (token.length < 3 || /[a-z0-9]/.test(token)) return false;
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

  function canonicalSchoolName(value) {
    var name = normalize(value).replace(/\s+/g, "");
    if (/小$/.test(name)) return name + "学校";
    if (/中$/.test(name)) return name + "学校";
    if (/高$/.test(name)) return name.slice(0, -1) + "高校";
    return name;
  }

  function basicSchoolAliases(name) {
    var value = compact(name);
    var aliases = [
      value,
      value.replace(/高等学校/g, "高校"),
      value.replace(/小学校/g, "小"),
      value.replace(/中学校/g, "中"),
      value.replace(/高等学校/g, "高").replace(/高校/g, "高"),
      value.replace(/幼稚園/g, "幼")
    ];
    var composite = value.match(/^(.+?)(?:高等学校|高校)附属中学校$/);
    if (composite) {
      aliases = aliases.concat([
        composite[1] + "高校",
        composite[1] + "高",
        composite[1] + "附属中学校",
        composite[1] + "附属中"
      ]);
    }
    return unique(aliases.filter(function (alias) { return alias.length >= 3; }));
  }

  function schoolTypes(name) {
    var types = [];
    if (/幼稚園|保育園|こども園|幼$/.test(name)) types.push("school_preschool");
    if (/小学校|小$/.test(name)) types.push("school_primary");
    if (/中学校|中$/.test(name)) types.push("school_middle");
    if (/高等学校|高校|高$/.test(name)) types.push("school_high");
    return types;
  }

  function extractSchoolNames(title) {
    var names = [];
    normalize(title).split(" ").forEach(function (token) {
      var cleaned = token.replace(/^(?:旧たいぷ|旧もでる|旧型|処分品|訳あり品|新)+/, "");
      var full = cleaned.match(/^([\u3040-\u30ff\u3400-\u9fff\u3005\u30fc]{2,20}?(?:幼稚園|保育園|こども園|小学校|中学校|高等学校|高校))/);
      if (full) names.push(full[1]);
      var shortName = cleaned.match(/^([\u3040-\u30ff\u3400-\u9fff\u3005\u30fc]{2,12}?[小中高])(?=$|旧|新|男子|女子|半袖|長袖|じゃーじ|体操服|tしゃつ|はーふぱんつ|すとれーとぱんつ|上履き)/);
      if (shortName) names.push(shortName[1]);
    });
    return unique(names.map(canonicalSchoolName));
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
          var normalized = normalize(alias);
          return {
            normalized: normalized,
            compact: compact(alias),
            tokens: normalized.split(" ").map(compact).filter(Boolean)
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

    function allProducts() {
      return typeof options.getAllProducts === "function" ? options.getAllProducts() || [] : [];
    }

    function productSchoolText() {
      return typeof options.getProductSchoolText === "function" ? options.getProductSchoolText() || {} : {};
    }

    function productConditions() {
      return typeof options.getProductConditions === "function" ? options.getProductConditions() || {} : {};
    }

    function conditionText(id) {
      var condition = productConditions()[String(id)] || {};
      var values = [];
      (condition.options || []).forEach(function (option) {
        (option.values || []).forEach(function (value) {
          values.push(String(value).replace(/[¥￥]\s*[\d,]+/g, ""));
        });
      });
      return values.join(" ");
    }

    function getSchoolEntries() {
      if (schoolEntries) return schoolEntries;
      var names = Object.keys(searchCatalog()).map(canonicalSchoolName);
      allProducts().forEach(function (product) {
        names = names.concat(extractSchoolNames(product.t));
      });
      names = unique(names);
      var entries = names.map(function (name) {
        var aliases = basicSchoolAliases(name);
        var configured = config.schoolAliases && config.schoolAliases[name];
        if (!configured && config.schoolAliases) {
          Object.keys(config.schoolAliases).some(function (key) {
            if (compact(key) !== compact(name)) return false;
            configured = config.schoolAliases[key];
            return true;
          });
        }
        aliases = aliases.concat((configured || []).map(compact));
        return {
          name: name,
          key: compact(name),
          compact: compact(name),
          aliases: unique(aliases).sort(function (a, b) { return b.length - a.length; }),
          types: schoolTypes(name)
        };
      });
      var merged = [];
      entries.forEach(function (entry) {
        var existing = merged.find(function (candidate) {
          return candidate.aliases.some(function (alias) { return entry.aliases.indexOf(alias) !== -1; });
        });
        if (!existing) {
          merged.push(entry);
          return;
        }
        existing.aliases = unique(existing.aliases.concat(entry.aliases)).sort(function (a, b) { return b.length - a.length; });
        existing.types = unique(existing.types.concat(entry.types));
      });
      schoolEntries = merged;
      return schoolEntries;
    }

    function querySchoolFragments(queryNormalized, queryCompact) {
      var fragments = [];
      queryNormalized.split(" ").forEach(function (token) {
        var tokenCompact = compact(token);
        if (tokenCompact.length >= 4 && /(?:校|園)$/.test(tokenCompact)) fragments.push(tokenCompact);
        var full = tokenCompact.match(/^(.{2,20}?(?:幼稚園|保育園|こども園|小学校|中学校|高等学校|高校))/);
        if (full) fragments.push(full[1]);
      });
      var noSpace = queryCompact.match(/^(.{2,20}?(?:幼稚園|保育園|こども園|小学校|中学校|高等学校|高校))/);
      if (noSpace) fragments.push(noSpace[1]);
      return unique(fragments);
    }

    function findSchools(queryNormalized, queryCompact) {
      var exact = [];
      var schoolLikeFragments = querySchoolFragments(queryNormalized, queryCompact);
      getSchoolEntries().forEach(function (entry) {
        var matchedAlias = entry.aliases.find(function (alias) {
          if (queryCompact.indexOf(alias) === -1) return false;
          return !schoolLikeFragments.some(function (fragment) {
            return fragment !== alias && fragment.indexOf(alias) === 0;
          });
        });
        if (matchedAlias) exact.push({ entry: entry, matched: matchedAlias, distance: 0 });
      });
      if (exact.length) {
        exact.sort(function (a, b) { return b.matched.length - a.matched.length; });
        return exact.filter(function (match, index) {
          return !exact.slice(0, index).some(function (selected) {
            return selected.matched.indexOf(match.matched) !== -1;
          });
        });
      }
      var candidates = [];
      schoolLikeFragments.forEach(function (fragment) {
        getSchoolEntries().forEach(function (entry) {
          entry.aliases.forEach(function (alias) {
            var limit = alias.length >= 8 ? 2 : 1;
            if (Math.abs(fragment.length - alias.length) > limit) return;
            var distance = editDistance(fragment, alias);
            if (distance <= limit) candidates.push({ entry: entry, matched: fragment, distance: distance });
          });
        });
      });
      if (!candidates.length) return [];
      candidates.sort(function (a, b) {
        return a.distance - b.distance || b.matched.length - a.matched.length;
      });
      var bestDistance = candidates[0].distance;
      var best = unique(candidates.filter(function (candidate) {
        return candidate.distance === bestDistance;
      }).map(function (candidate) { return candidate.entry.key; }));
      if (best.length !== 1) return [];
      return [candidates.find(function (candidate) { return candidate.entry.key === best[0]; })];
    }

    function findConcepts(queryNormalized, queryCompact) {
      var candidates = [];
      concepts.forEach(function (concept) {
        concept.aliases.forEach(function (alias) {
          if (queryCompact.indexOf(alias.compact) !== -1) candidates.push({ concept: concept, alias: alias });
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
      var schoolMatches = findSchools(normalized, queryCompact);
      var conceptQueryCompact = queryCompact;
      schoolMatches.forEach(function (match) {
        [match.matched].concat(match.entry.aliases).sort(function (a, b) { return b.length - a.length; }).forEach(function (part) {
          if (conceptQueryCompact.indexOf(part) !== -1) conceptQueryCompact = conceptQueryCompact.replace(part, "");
        });
      });
      var conceptMatches = findConcepts(normalized, conceptQueryCompact);
      var matchedParts = [];
      conceptMatches.forEach(function (match) {
        match.concept.aliases.forEach(function (alias) {
          if (queryCompact.indexOf(alias.compact) === -1) return;
          matchedParts.push(alias.compact);
          matchedParts = matchedParts.concat(alias.tokens);
        });
      });
      schoolMatches.forEach(function (match) {
        matchedParts.push(match.matched);
        matchedParts = matchedParts.concat(match.entry.aliases.filter(function (alias) {
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
        if (remaining && stopWords.indexOf(remaining) === -1) tokens.push(remaining);
      });
      parsedKey = normalized;
      parsedValue = {
        normalized: normalized,
        compact: queryCompact,
        concepts: conceptMatches.map(function (match) { return match.concept; }),
        schools: schoolMatches.map(function (match) { return match.entry; }),
        tokens: unique(tokens)
      };
      return parsedValue;
    }

    function productDoc(product) {
      var id = String(product.id);
      if (productCache[id]) return productCache[id];
      var normalizedTitle = normalize(product.t);
      var normalizedVariants = normalize([product.v].concat(product.vs || []).join(" "));
      var normalizedConditions = normalize(conditionText(id));
      var title = compact(product.t);
      var variants = compact([product.v].concat(product.vs || []).join(" "));
      var conditions = compact(conditionText(id));
      var schools = compact(productSchoolText()[id] || "");
      var idCompact = compact(id);
      var associatedSchools = [];
      var conceptTitle = title;
      getSchoolEntries().forEach(function (entry) {
        var categoryMatch = schools.indexOf(entry.compact) !== -1;
        var titleAlias = entry.aliases.find(function (alias) { return title.indexOf(alias) !== -1; });
        if (!categoryMatch && !titleAlias) return;
        associatedSchools.push({ entry: entry, titleAlias: titleAlias || "", category: categoryMatch });
        if (titleAlias) conceptTitle = conceptTitle.split(titleAlias).join("");
      });
      var conceptText = conceptTitle + variants + conditions;
      var matchedConcepts = {};
      concepts.forEach(function (concept) {
        if (/^school_(?:primary|middle|high|preschool)$/.test(concept.id)) return;
        if (concept.id === "bag" && title.indexOf("baginrain") !== -1) return;
        if (concept.aliases.some(function (alias) { return conceptText.indexOf(alias.compact) !== -1; })) {
          matchedConcepts[concept.id] = true;
        }
      });
      associatedSchools.forEach(function (school) {
        school.entry.types.forEach(function (type) { matchedConcepts[type] = true; });
      });
      var gymExclude = /水着|すいむ|上履き|上靴|体育館?(?:しゅーず|シューズ)|さんだる|すりっぱ|雨合羽|れいん|helmet/;
      var gymFamily = !gymExclude.test(conceptTitle) && /体操服|体育着|体育服|運動着|じゃーじ|tしゃつ|丸首しゃつ|はーふぱんつ|すとれーとぱんつ|短ぱん|しょーとぱんつ/.test(conceptTitle);
      var uniformExclude = /体操|体育|じゃーじ|tしゃつ|はーふぱんつ|すとれーとぱんつ|短ぱん|水着|すいむ|雨合羽|れいん|上履き|上靴|しゅーず|さんだる|すりっぱ|へるめっと|ばっぐ|かばん/;
      var uniformFamily = !uniformExclude.test(conceptTitle) && /制服|学生服|標準服|せーらー|ぶれざー|学らん|詰襟|詰衿|通園服|園内服|おーばーぶらうす|ぶらうす|にっとしゃつ|かったーしゃつ|ぷりーつ.*すかーと|夏すかーと|すらっくす|りぼん|棒たい|ねくたい|衿かばー/.test(conceptTitle);
      if (gymFamily && /体操服|体育着|体育服|運動着/.test(conceptTitle)) matchedConcepts.gymwear = true;
      if (uniformFamily) matchedConcepts.uniform = true;
      productCache[id] = {
        id: idCompact,
        title: title,
        variants: variants,
        conditions: conditions,
        normalizedVariants: normalizedVariants + " " + normalizedConditions,
        schools: schools,
        searchable: [title, variants, conditions, schools].join(""),
        combined: [title, variants, conditions, schools, idCompact].join(""),
        concepts: matchedConcepts,
        associatedSchools: associatedSchools,
        gymFamily: gymFamily,
        uniformFamily: uniformFamily
      };
      return productCache[id];
    }

    function schoolScore(doc, school) {
      var match = doc.associatedSchools.find(function (candidate) { return candidate.entry.key === school.key; });
      if (!match) return -1;
      return match.titleAlias ? 270 : 195;
    }

    function standaloneAsciiToken(text, token) {
      if (!/^[a-z]$/.test(token)) return false;
      var escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:$|[^a-z0-9])", "i").test(text);
    }

    function tokenScore(doc, token) {
      if (doc.id === token) return 220;
      if (standaloneAsciiToken(doc.normalizedVariants, token)) return 95;
      if (doc.title === token) return 190;
      if (doc.title.indexOf(token) === 0) return 145;
      if (doc.title.indexOf(token) !== -1) return 120;
      if (doc.schools.indexOf(token) !== -1) return 105;
      if (doc.variants.indexOf(token) !== -1) return 90;
      if (doc.conditions.indexOf(token) !== -1) return 85;
      if (doc.id.indexOf(token) !== -1) return 75;
      return fuzzyContains(doc.title + doc.schools, token) ? 35 : -1;
    }

    function isProductIntent(concept) {
      return PRODUCT_INTENTS.indexOf(concept.id) !== -1;
    }

    function relatedConceptMatch(doc, concept, parsed) {
      if (concept.id === "gymwear") {
        var scoped = parsed.schools.length || parsed.concepts.some(function (candidate) {
          return /^school_(?:primary|middle|high|preschool)$/.test(candidate.id) || candidate.id === "jersey";
        });
        if (scoped && doc.gymFamily) return true;
      }
      if (concept.allowRelatedResults) {
        return concept.related.some(function (relatedId) { return doc.concepts[relatedId]; });
      }
      if (!isProductIntent(concept) && /^(summer|winter|boys|girls|unisex)$/.test(concept.id)) {
        return concept.related.some(function (relatedId) { return doc.concepts[relatedId]; });
      }
      return false;
    }

    function conceptScore(doc, concept, parsed) {
      if (doc.concepts[concept.id]) {
        var familyBoost = concept.id === "chopsticks" && doc.title.indexOf("はしせっと") !== -1 ? 35 : 0;
        var titleMatch = concept.aliases.some(function (alias) { return doc.title.indexOf(alias.compact) !== -1; });
        var variantMatch = concept.aliases.some(function (alias) {
          return doc.variants.indexOf(alias.compact) !== -1 || doc.conditions.indexOf(alias.compact) !== -1;
        });
        if (titleMatch) return 185 + familyBoost;
        if (variantMatch) return 145 + familyBoost;
        return 160 + familyBoost;
      }
      return relatedConceptMatch(doc, concept, parsed) ? 105 : -1;
    }

    function score(product, query) {
      var parsed = parseQuery(query);
      if (!parsed.compact) return -1;
      var doc = productDoc(product);
      var result = product.s === false ? 0 : 5;
      if (doc.title.indexOf(parsed.compact) !== -1) result += 320;
      else if (doc.combined.indexOf(parsed.compact) !== -1) result += 130;
      for (var schoolIndex = 0; schoolIndex < parsed.schools.length; schoolIndex += 1) {
        var currentSchoolScore = schoolScore(doc, parsed.schools[schoolIndex]);
        if (currentSchoolScore < 0) return -1;
        result += currentSchoolScore;
      }
      for (var conceptIndex = 0; conceptIndex < parsed.concepts.length; conceptIndex += 1) {
        var currentConceptScore = conceptScore(doc, parsed.concepts[conceptIndex], parsed);
        if (currentConceptScore < 0) return -1;
        result += currentConceptScore;
      }
      for (var tokenIndex = 0; tokenIndex < parsed.tokens.length; tokenIndex += 1) {
        var currentTokenScore = tokenScore(doc, parsed.tokens[tokenIndex]);
        if (currentTokenScore < 0) return -1;
        result += currentTokenScore;
      }
      var chopsticksOnly = parsed.concepts.some(function (concept) { return concept.id === "chopsticks"; });
      if (chopsticksOnly && parsed.tokens.indexOf("単品") !== -1 && doc.title.indexOf("はしけーす") === 0) return -1;
      if (!parsed.schools.length && !parsed.concepts.length && !parsed.tokens.length) return -1;
      return result;
    }

    function reset() {
      productCache = {};
      schoolEntries = null;
      parsedKey = "";
      parsedValue = null;
    }

    return { score: score, reset: reset, parseQuery: parseQuery };
  }

  window.ykCatalogSearchEngine = {
    version: "20260804.2",
    createSearchEngine: createSearchEngine,
    normalize: normalize,
    compact: compact
  };
  window.ykStorefrontExtras = window.ykStorefrontExtras || {};
  window.ykStorefrontExtras.createSearchEngine = createSearchEngine;
})();
