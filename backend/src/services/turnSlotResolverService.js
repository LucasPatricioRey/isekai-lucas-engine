function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function wordsFromId(value = "") {
  return normalizeText(value)
    .replace(/^loc[_:-]?/g, "")
    .replace(/^item[_:-]?/g, "")
    .replace(/^technique[_:-]?/g, "")
    .replace(/^shop[_:-]?/g, "")
    .replace(/[_:-]+/g, " ");
}

const STOP_ALIASES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "un",
  "una",
  "y",
  "en",
  "a",
  "al",
  "local",
  "safe",
  "low",
  "medium",
  "high",
  "operational",
  "other",
  "food",
  "basic",
  "lucas",
]);

function usableAlias(alias = "") {
  const text = normalizeText(alias);
  if (text.length < 3 || STOP_ALIASES.has(text)) return "";
  return text;
}

function phraseAliases(value = "") {
  const normalized = normalizeText(value).replace(/[_:-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ").filter((word) => word && !STOP_ALIASES.has(word));
  const aliases = [normalized];
  if (words.length > 1) aliases.push(words.join(" "));
  aliases.push(...words.filter((word) => word.length >= 5));
  for (let index = 0; index < words.length - 1; index += 1) {
    aliases.push(`${words[index]} ${words[index + 1]}`);
  }
  return unique(aliases.map(usableAlias));
}

function semanticLocationAliases(location = {}) {
  const source = normalizeText(`${location.locationId || ""} ${location.name || ""} ${(location.tags || []).join(" ")}`);
  const aliases = [];
  if (/\b(grulla|inn|posada|tavern)\b/.test(source)) aliases.push("posada", "grulla azul", "la grulla");
  if (/\b(guild|gremio)\b/.test(source)) aliases.push("gremio", "guild");
  if (/\b(market|mercado)\b/.test(source)) aliases.push("mercado");
  if (/\b(plaza)\b/.test(source)) aliases.push("plaza");
  if (/\b(temple|templo|serene|llama)\b/.test(source)) aliases.push("templo", "llama serena");
  if (/\b(forest|bosque|whispers|susurros)\b/.test(source)) aliases.push("bosque", "bosque de los susurros", "susurros");
  if (/\b(patio)\b/.test(source)) aliases.push("patio", "patio del gremio");
  if (/\b(room|cuarto|habitacion)\b/.test(source)) aliases.push("cuarto", "habitacion", "cuarto de lucas");
  if (/\b(cocina|kitchen)\b/.test(source)) aliases.push("cocina");
  if (/\b(comedor|dining)\b/.test(source)) aliases.push("comedor", "sala");
  return aliases;
}

function aliasesForLocation(location = {}) {
  return unique([
    ...phraseAliases(location.name || ""),
    ...phraseAliases(wordsFromId(location.locationId || "")),
    ...asArray(location.tags).flatMap(phraseAliases),
    ...semanticLocationAliases(location).map(usableAlias),
  ]);
}

function aliasPattern(alias = "") {
  const escaped = escapeRegExp(normalizeText(alias)).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`);
}

function buildDestinationAliases(locations = []) {
  return (locations || [])
    .map((location) => {
      const aliases = aliasesForLocation(location).sort((left, right) => right.length - left.length);
      return {
        locationId: location.locationId,
        name: location.name || location.locationId,
        parentLocationId: location.parentLocationId || "",
        aliases,
        patterns: aliases.map(aliasPattern),
      };
    })
    .filter((entry) => entry.locationId && entry.patterns.length > 0)
    .sort((left, right) => {
      const leftMax = left.aliases[0]?.length || 0;
      const rightMax = right.aliases[0]?.length || 0;
      return rightMax - leftMax;
    });
}

function textContainsAlias(text = "", aliases = []) {
  const normalized = normalizeText(text);
  return aliases.some((alias) => alias && new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(normalized));
}

function aliasesForNamedEntity(entity = {}, idField = "id") {
  return unique([
    ...phraseAliases(entity.name || ""),
    ...phraseAliases(wordsFromId(entity[idField] || "")),
    ...asArray(entity.tags).flatMap(phraseAliases),
  ]);
}

function scoreMagicTechnique({ text = "", technique = {}, plan = {} } = {}) {
  const normalized = normalizeText(text);
  const source = normalizeText(
    `${technique.techniqueId || ""} ${technique.name || ""} ${(technique.tags || []).join(" ")} ${technique.kind || ""}`
  );
  let score = 0;
  if (plan.techniqueId && technique.techniqueId === plan.techniqueId) score += 100;
  if (textContainsAlias(normalized, aliasesForNamedEntity(technique, "techniqueId"))) score += 30;
  if (/\b(meditacion|medita)\b/.test(normalized) && /\b(meditacion|meditation|medita)\b/.test(source)) score += 35;
  if (/\b(respiracion|respira)\b/.test(normalized) && /\b(respiracion|breathing|respira)\b/.test(source)) score += 35;
  if (/\b(flujo interno|sentir flujo|percibir flujo|flujo)\b/.test(normalized) && /\b(flujo|flow|sense)\b/.test(source)) {
    score += 35;
  }
  if (/\bmana\b/.test(normalized) && /\bmana\b/.test(source)) score += 10;
  if (technique.isRealSpell || technique.isOffensive) score -= 80;
  if (["practice", "exercise", "theory"].includes(technique.kind)) score += 8;
  if (["safe", "basic"].includes(technique.difficulty)) score += 6;
  return score;
}

function resolveSafeMagicPracticeSlot({ text = "", plan = {}, context = {} } = {}) {
  const candidates = (context.magicTechniques || []).filter((technique) => technique.status === "available");
  const ranked = candidates
    .map((technique) => ({
      technique,
      score: scoreMagicTechnique({ text, technique, plan }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.technique || null;
  if (!selected && plan.techniqueId) {
    return {
      resolved: false,
      plan,
      technique: null,
      source: "plan_unverified",
    };
  }
  if (!selected) {
    return {
      resolved: false,
      plan,
      technique: null,
      source: "not_found",
    };
  }
  return {
    resolved: true,
    plan: {
      ...plan,
      techniqueId: selected.techniqueId,
    },
    technique: selected,
    source: selected.techniqueId === plan.techniqueId ? "mongo_verified_plan" : "mongo_alias",
  };
}

function stockRows(context = {}) {
  const shopsById = new Map((context.shops || []).map((shop) => [shop.shopId, shop]));
  const itemsById = new Map((context.items || []).map((item) => [item.itemId, item]));
  return (context.shopStocks || [])
    .map((stock) => ({
      stock,
      shop: shopsById.get(stock.shopId) || null,
      item: itemsById.get(stock.itemId) || null,
    }))
    .filter((row) => row.shop && row.item && row.item.type === "food" && Number(row.stock.quantity || 0) > 0);
}

function scoreMealRow({ text = "", row = {}, plan = {}, gameState = {} } = {}) {
  const normalized = normalizeText(text);
  const { shop, item, stock } = row;
  const itemSource = normalizeText(`${item.itemId || ""} ${item.name || ""} ${item.subtype || ""} ${(item.tags || []).join(" ")}`);
  const shopSource = normalizeText(`${shop.shopId || ""} ${shop.name || ""} ${shop.type || ""} ${(shop.tags || []).join(" ")}`);
  let score = 0;
  if (plan.shopId && shop.shopId === plan.shopId) score += 25;
  if (plan.itemId && item.itemId === plan.itemId) score += 100;
  if (textContainsAlias(normalized, aliasesForNamedEntity(item, "itemId"))) score += 35;
  if (textContainsAlias(normalized, aliasesForNamedEntity(shop, "shopId"))) score += 15;
  if (/\bsopa\b/.test(normalized) && /\bsopa\b/.test(itemSource)) score += 50;
  if (/\b(comida normal|plato normal|comida|plato)\b/.test(normalized)) {
    if (/\b(comida|plato|normal|racion)\b/.test(itemSource)) score += 35;
    if (stock.quality === "normal") score += 8;
  }
  if (shop.locationId && [gameState.locationId, row.parentLocationId].includes(shop.locationId)) score += 5;
  if (shop.services?.food || shop.type === "inn" || shop.type === "food") score += 10;
  if (/\b(posada|grulla)\b/.test(normalized) && /\b(grulla|inn|posada)\b/.test(shopSource)) score += 10;
  return score;
}

function resolveSimpleMealPurchaseSlot({ text = "", plan = {}, gameState = {}, context = {} } = {}) {
  const rows = stockRows(context);
  const ranked = rows
    .map((row) => ({
      ...row,
      score: scoreMealRow({ text, row, plan, gameState }),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) return scoreDiff;
      return Number(right.item.satietyBonus || 0) - Number(left.item.satietyBonus || 0);
    });
  const selected = ranked[0] || null;
  if (!selected && plan.shopId && plan.itemId) {
    return {
      resolved: false,
      plan,
      stock: null,
      item: null,
      source: "plan_unverified",
    };
  }
  if (!selected) {
    return {
      resolved: false,
      plan,
      stock: null,
      item: null,
      source: "not_found",
    };
  }
  return {
    resolved: true,
    plan: {
      ...plan,
      shopId: selected.stock.shopId,
      itemId: selected.stock.itemId,
    },
    stock: selected.stock,
    item: selected.item,
    shop: selected.shop,
    source:
      selected.stock.shopId === plan.shopId && selected.stock.itemId === plan.itemId
        ? "mongo_verified_plan"
        : "mongo_alias",
  };
}

module.exports = {
  aliasesForLocation,
  buildDestinationAliases,
  normalizeText,
  resolveSafeMagicPracticeSlot,
  resolveSimpleMealPurchaseSlot,
};
