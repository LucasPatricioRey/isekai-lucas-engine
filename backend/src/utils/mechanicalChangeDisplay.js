const FORMAT_RULE_ID = "format.mechanical_changes";

const STAT_LABELS = {
  life: "Vida",
  satiety: "Saciedad",
  energy: "Energ\u00eda",
  mp: "MP",
};

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function numberOrUnknown(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "?";
}

function signedNumber(value) {
  const number = numberOrZero(value);
  return `${number >= 0 ? "+" : ""}${number}`;
}

function formatCopper(totalCopper = 0) {
  const total = Math.max(0, numberOrZero(totalCopper));
  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const copper = total % 100;
  return `${gold} oro, ${silver} plata, ${copper} cobre`;
}

function signedCopper(deltaCopper = 0) {
  return `${signedNumber(deltaCopper)} cobre`;
}

function getItemQuantity(item) {
  if (!item) return 0;
  return numberOrZero(item.quantity);
}

function itemName(change = {}) {
  return change.itemName || change.name || change.itemId || "item";
}

function buildMoneyDisplayLines(change = {}) {
  if (change.before === undefined || change.after === undefined) return [];
  const delta = change.delta !== undefined ? change.delta : numberOrZero(change.after) - numberOrZero(change.before);
  return [`Dinero: ${formatCopper(change.before)}\u2192${formatCopper(change.after)} (${signedCopper(delta)}).`];
}

function buildInventoryDisplayLines(change = {}) {
  const beforeQty = getItemQuantity(change.before);
  const afterQty = getItemQuantity(change.after);
  const delta = afterQty - beforeQty;
  return [`Inventario ${itemName(change)}: ${beforeQty}\u2192${afterQty} (${signedNumber(delta)}).`];
}

function buildShopStockDisplayLines(change = {}) {
  const label = `${change.shopName || change.shopId || "shop"}/${change.itemName || change.itemId || "item"}`;
  const lines = [];
  const beforeQty = numberOrZero(change.before?.quantity);
  const afterQty = numberOrZero(change.after?.quantity);
  const deltaQty =
    change.deltaQuantity !== undefined ? numberOrZero(change.deltaQuantity) : afterQty - beforeQty;
  lines.push(`Stock ${label}: ${beforeQty}\u2192${afterQty} (${signedNumber(deltaQty)}).`);

  if (
    change.before?.currentPriceCopper !== undefined &&
    change.after?.currentPriceCopper !== undefined &&
    numberOrZero(change.before.currentPriceCopper) !== numberOrZero(change.after.currentPriceCopper)
  ) {
    const beforePrice = numberOrZero(change.before.currentPriceCopper);
    const afterPrice = numberOrZero(change.after.currentPriceCopper);
    lines.push(`Precio ${label}: ${beforePrice} cobre\u2192${afterPrice} cobre (${signedCopper(afterPrice - beforePrice)}).`);
  }

  return lines;
}

function buildStatDisplayLine(statKey, stat = {}) {
  if (stat.before === undefined || stat.after === undefined) return "";
  const label = STAT_LABELS[statKey] || statKey;
  const max = statKey === "life" || statKey === "satiety" || statKey === "energy" ? "/100" : "";
  const delta = stat.delta !== undefined ? stat.delta : numberOrZero(stat.after) - numberOrZero(stat.before);
  const suffix = stat.labelAfter ? ` - ${stat.labelAfter}` : "";
  return `${label}: ${numberOrUnknown(stat.before)}${max}\u2192${numberOrUnknown(stat.after)}${max} (${signedNumber(delta)})${suffix}.`;
}

function buildLucasStatusDisplayLines(lucasStatus = {}) {
  const lines = [];
  for (const statKey of ["life", "satiety", "energy", "mp"]) {
    const line = buildStatDisplayLine(statKey, lucasStatus[statKey]);
    if (line) lines.push(line);
  }
  if (Array.isArray(lucasStatus.addInjuries) && lucasStatus.addInjuries.length > 0) {
    lines.push(`Heridas agregadas: ${lucasStatus.addInjuries.length}.`);
  }
  if (Array.isArray(lucasStatus.addConditions) && lucasStatus.addConditions.length > 0) {
    lines.push(`Condiciones agregadas: ${lucasStatus.addConditions.length}.`);
  }
  return lines;
}

function buildActivityCostDisplayLines(activityCost = {}) {
  return [
    buildStatDisplayLine("satiety", activityCost.satiety),
    buildStatDisplayLine("energy", activityCost.energy),
  ].filter(Boolean);
}

function describeBiologicalActivity(activity = {}) {
  const label = activity.label || activity.category || "actividad";
  return `${numberOrUnknown(activity.minutes)} min ${label}`;
}

function buildBiologicalClockDisplayLines(change = {}) {
  const lines = [];

  for (const block of change.processedBlocks || []) {
    const activities = (block.activities || []).map(describeBiologicalActivity).join(", ");
    if (activities) {
      lines.push(`Bloque biol\u00f3gico procesado ${block.blockStart || "?"}-${block.blockEnd || "?"}: ${activities}.`);
    }
  }

  for (const pending of change.pendingCreated || []) {
    lines.push(
      `Acumulador biol\u00f3gico pendiente: ${numberOrUnknown(pending.minutes)} min ${pending.category || "actividad"} en bloque ${pending.blockStart || "?"}-${pending.blockEnd || "?"}.`
    );
  }

  return lines;
}

function buildGuildRegistrationDisplayLines(change = {}) {
  const beforeStatus =
    change.before?.registrationStatus ||
    (change.before?.formalGuildRegistrationPending === true ? "pending" : "");
  const afterStatus =
    change.after?.registrationStatus ||
    (change.after?.formalGuildRegistrationPending === true ? "pending" : "complete");
  const lines = [];

  if (beforeStatus || afterStatus) {
    lines.push(`Registro del gremio: ${beforeStatus || "unknown"}\u2192${afterStatus || "unknown"}.`);
  }

  if (
    change.before?.formalGuildRegistrationPending !== undefined &&
    change.after?.formalGuildRegistrationPending !== undefined &&
    change.before.formalGuildRegistrationPending !== change.after.formalGuildRegistrationPending
  ) {
    lines.push(
      `Registro pendiente: ${Boolean(change.before.formalGuildRegistrationPending)}\u2192${Boolean(change.after.formalGuildRegistrationPending)}.`
    );
  }

  return lines;
}

function ensureDisplayLines(change = {}, displayLines = [], ruleId = FORMAT_RULE_ID) {
  const lines = displayLines.filter(Boolean);
  return {
    ...change,
    displayLine: change.displayLine || lines[0] || "",
    displayLines: Array.isArray(change.displayLines) && change.displayLines.length > 0 ? change.displayLines : lines,
    formatRuleId: change.formatRuleId || ruleId,
  };
}

function withMoneyDisplay(change = {}) {
  return ensureDisplayLines(change, buildMoneyDisplayLines(change));
}

function withInventoryDisplay(change = {}) {
  return ensureDisplayLines(change, buildInventoryDisplayLines(change));
}

function withShopStockDisplay(change = {}) {
  return ensureDisplayLines(change, buildShopStockDisplayLines(change));
}

function withLucasStatusDisplay(change = {}) {
  return ensureDisplayLines(change, buildLucasStatusDisplayLines(change));
}

function withActivityCostDisplay(change = {}) {
  return ensureDisplayLines(change, buildActivityCostDisplayLines(change));
}

function withBiologicalClockDisplay(change = {}) {
  return ensureDisplayLines(change, buildBiologicalClockDisplayLines(change), "biology.accumulators");
}

function withEvidenceDisplay(change = {}) {
  const lines = Array.isArray(change.displayLines) && change.displayLines.length > 0
    ? change.displayLines
    : [change.displayLine].filter(Boolean);
  return ensureDisplayLines(change, lines, "events.evidence_progress");
}

function withGuildRegistrationDisplay(change = {}) {
  return ensureDisplayLines(change, buildGuildRegistrationDisplayLines(change));
}

function collectChangeLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectChangeLines(entry));
  }
  const lines = [];
  if (Array.isArray(value.displayLines) && value.displayLines.length > 0) {
    lines.push(...value.displayLines.filter(Boolean));
  }
  if (value.displayLine && lines.length === 0) lines.push(value.displayLine);
  if (Array.isArray(value.rewardLines)) lines.push(...value.rewardLines.filter(Boolean));
  if (Array.isArray(value.consequenceLines)) lines.push(...value.consequenceLines.filter(Boolean));
  return lines;
}

function buildMechanicalChangeDisplay(changes = {}) {
  const displayLines = [
    ...collectChangeLines(changes.money),
    ...collectChangeLines(changes.lucasStatus),
    ...collectChangeLines(changes.activityCost),
    ...collectChangeLines(changes.biologicalClock),
    ...collectChangeLines(changes.inventory),
    ...collectChangeLines(changes.shopStocks),
    ...collectChangeLines(changes.evidence),
    ...collectChangeLines(changes.missions),
    ...collectChangeLines(changes.commitments),
    ...collectChangeLines(changes.factions),
    ...collectChangeLines(changes.guildRegistration),
  ];

  return {
    ruleId: FORMAT_RULE_ID,
    title: "Cambios relevantes",
    displayLines,
    copyInstruction:
      "Copiar estas lineas mecanicas bajo Cambios relevantes; no resumir ni ocultar before/after/delta.",
  };
}

function attachMechanicalChangeDisplay(changes = {}) {
  if (changes.money) changes.money = withMoneyDisplay(changes.money);
  if (changes.lucasStatus) changes.lucasStatus = withLucasStatusDisplay(changes.lucasStatus);
  if (changes.activityCost) changes.activityCost = withActivityCostDisplay(changes.activityCost);
  if (changes.biologicalClock) changes.biologicalClock = withBiologicalClockDisplay(changes.biologicalClock);
  if (Array.isArray(changes.inventory)) changes.inventory = changes.inventory.map(withInventoryDisplay);
  if (Array.isArray(changes.shopStocks)) changes.shopStocks = changes.shopStocks.map(withShopStockDisplay);
  if (Array.isArray(changes.evidence)) changes.evidence = changes.evidence.map(withEvidenceDisplay);
  if (changes.guildRegistration) changes.guildRegistration = withGuildRegistrationDisplay(changes.guildRegistration);

  const display = buildMechanicalChangeDisplay(changes);
  if (display.displayLines.length > 0) {
    changes.mechanicalChangeDisplay = display;
  }
  return changes;
}

module.exports = {
  FORMAT_RULE_ID,
  attachMechanicalChangeDisplay,
  buildMechanicalChangeDisplay,
  buildMoneyDisplayLines,
  formatCopper,
  withActivityCostDisplay,
  withBiologicalClockDisplay,
  withInventoryDisplay,
  withMoneyDisplay,
  withShopStockDisplay,
};
