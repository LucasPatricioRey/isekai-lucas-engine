const {
  SOCIAL_RELATIONSHIP_FIELDS,
  normalizeRelationship,
  relationshipBand,
} = require("../services/socialLedgerService");
const { summarizeNpcSocialProfile } = require("../services/socialProfileService");
const { buildSocialConsequenceHintEffect } = require("../services/dailyEventSocialService");
const { evaluateSocialRelationshipState } = require("../services/socialRelationshipStateService");
const { summarizeContractSchedule } = require("../services/jobScheduleService");
const { buildDailyEventNotice, getDailyEventTemplateId } = require("./worldEventPresentation");

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function toIntQuery(value, fallback, min = 0, max = 100) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function queryBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(Array.isArray(value) ? value[0] : value).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalized);
}

function buildCompactProfileContract({ profile = "player_scene", includeTechnicalSummary = false } = {}) {
  const currentProfile = String(profile || "player_scene");
  const gameplayReady = currentProfile === "player_scene";

  return {
    schemaVersion: "compact_profile_contract_v1",
    contractStrength: "mandatory_profile_gate",
    currentProfile,
    requiredForPlayerNarration: "player_scene",
    gameplayReady,
    policy: gameplayReady
      ? "This profile is valid for final in-game narration, NPC dialogue and HUD."
      : "Do not write final player-facing narration from this profile. Call getCompactContext with profile=player_scene first.",
    includeTechnicalSummary: Boolean(includeTechnicalSummary),
    profileUses: {
      player_scene: "normal gameplay narration, NPC dialogue, social texture and final HUD",
      mechanical_turn: "mechanical inspection before preview/mutation; reread player_scene before final prose",
      minimal_header: "technical/ping/status checks only; not enough for visible scene narration",
      debug_audit: "technical/admin audit only; not for immersive player output",
    },
  };
}

function truncateText(value, maxLength = 700) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function normalizeForMatch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textHasAny(text, patterns = []) {
  const normalized = normalizeForMatch(text);
  return patterns.some((pattern) => normalized.includes(normalizeForMatch(pattern)));
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function isExpiredAt(entity, currentDay, currentTime) {
  if (!entity || entity.expiresDay === null || entity.expiresDay === undefined) return false;
  if (entity.expiresDay < currentDay) return true;
  if (entity.expiresDay > currentDay) return false;
  if (!entity.expiresTime) return false;
  return timeToMinutes(currentTime) >= timeToMinutes(entity.expiresTime);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time || "00:00");
}

function missionExpirationState(mission, currentDay, currentTime) {
  if (!mission?.expiresDay) {
    return {
      key: "none",
      minutesUntil: null,
      expired: false,
      urgency: "none",
      label: "Sin vencimiento formal.",
    };
  }

  const expiresAt = toAbsoluteMinutes(mission.expiresDay, mission.expiresTime || "23:59");
  const currentAt = toAbsoluteMinutes(currentDay, currentTime);
  const minutesUntil = expiresAt - currentAt;

  if (minutesUntil <= 0) {
    return {
      key: "expired",
      minutesUntil: 0,
      expired: true,
      urgency: "warning",
      label: "Vencida por tiempo de partida.",
    };
  }

  if (minutesUntil <= 180) {
    return {
      key: "due_soon",
      minutesUntil,
      expired: false,
      urgency: "warning",
      label: "Vence pronto.",
    };
  }

  if (Number(mission.expiresDay) === Number(currentDay)) {
    return {
      key: "today",
      minutesUntil,
      expired: false,
      urgency: "info",
      label: "Vence hoy.",
    };
  }

  return {
    key: "future",
    minutesUntil,
    expired: false,
    urgency: "none",
    label: "Vencimiento futuro.",
  };
}

function missionActionState(mission, currentDay, currentTime) {
  if (!mission) return null;
  const expiration = missionExpirationState(mission, currentDay, currentTime);
  const proofStatus = mission.proofStatus || "not_required";
  const proofRequired = Boolean(mission.proofRequired && proofStatus !== "not_required");
  const base = {
    expiration,
    blocksReward: false,
    requiresFormalClosure: false,
    recommendedAction: "",
  };

  if (expiration.expired && ["available", "accepted"].includes(mission.status)) {
    return {
      ...base,
      key: mission.status === "accepted" ? "accepted_expired" : "available_expired",
      urgency: "warning",
      requiresFormalClosure: true,
      recommendedAction:
        mission.status === "accepted"
          ? "Resolver como fail/expire segun la ficcion antes de pagar recompensa."
          : "No ofrecer como opcion vigente; expirar formalmente si aparece en tablero.",
    };
  }

  if (mission.status === "available") {
    return {
      ...base,
      key: expiration.key === "due_soon" ? "available_expiring_soon" : "available",
      urgency: expiration.urgency === "warning" ? "info" : "none",
      recommendedAction:
        expiration.key === "due_soon"
          ? "Avisar que vence pronto si Lucas puede verlo en cartelera."
          : "Disponible solo si Lucas la consulta o el contexto la hace visible.",
    };
  }

  if (mission.status === "accepted") {
    if (proofStatus === "submitted") {
      return {
        ...base,
        key: "awaiting_verification",
        urgency: "info",
        blocksReward: true,
        recommendedAction: "Verificar prueba/reporte antes de completar o pagar.",
      };
    }

    if (proofStatus === "verified" || !proofRequired) {
      return {
        ...base,
        key: "ready_to_complete",
        urgency: "info",
        recommendedAction: "Puede completarse formalmente y pagar recompensa una sola vez.",
      };
    }

    if (proofStatus === "rejected") {
      return {
        ...base,
        key: "proof_rejected",
        urgency: "warning",
        blocksReward: true,
        requiresFormalClosure: true,
        recommendedAction: "Corregir prueba, fallar la mision o dejar consecuencia formal; no pagar.",
      };
    }

    return {
      ...base,
      key: "needs_report",
      urgency: expiration.urgency === "warning" ? "warning" : "info",
      blocksReward: proofRequired,
      recommendedAction: proofRequired
        ? "Conseguir o presentar prueba/reporte antes de verificar."
        : "Reportar el resultado antes de completar.",
    };
  }

  if (mission.status === "completed") {
    return {
      ...base,
      key: "completed",
      urgency: "none",
      recommendedAction: "No pagar ni completar otra vez.",
    };
  }

  if (["failed", "expired", "withdrawn", "blocked"].includes(mission.status)) {
    return {
      ...base,
      key: mission.status,
      urgency: mission.status === "blocked" ? "info" : "none",
      recommendedAction: "No tratar como mision activa salvo auditoria tecnica.",
    };
  }

  return {
    ...base,
    key: mission.status || "unknown",
    urgency: "info",
    recommendedAction: "Revisar estado de mision antes de narrar recompensas.",
  };
}

function isWeatherStale(weather, currentDay, currentTime) {
  if (!weather || weather.expectedUntilDay === null || weather.expectedUntilDay === undefined) return false;
  if (weather.expectedUntilDay < currentDay) return true;
  if (weather.expectedUntilDay > currentDay) return false;
  if (!weather.expectedUntilTime) return false;
  return timeToMinutes(currentTime) >= timeToMinutes(weather.expectedUntilTime);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stockAvailableQuantity(stock = {}) {
  const quantity = Number(stock.quantity || 0);
  const reserved = Number(stock.reservedQuantity || 0);
  return Math.max(0, quantity - reserved);
}

function summarizeStockPressure(stock, shop, item, reason) {
  return {
    shopId: stock.shopId,
    shopName: shop?.name || stock.shopId,
    itemId: stock.itemId,
    itemName: item?.name || stock.itemId,
    quantity: Number(stock.quantity || 0),
    reservedQuantity: Number(stock.reservedQuantity || 0),
    availableQuantity: stockAvailableQuantity(stock),
    currentPriceCopper: Number(stock.currentPriceCopper || stock.basePriceCopper || item?.basePriceCopper || 0),
    scarcityFlags: stock.scarcityFlags || [],
    reason,
  };
}

function isSupplyPressureEvent(event = {}) {
  const tags = toArray(event.tags).map(normalizeKey);
  const type = normalizeKey(event.type);
  return (
    type === "supply_delay" ||
    tags.includes("supplies") ||
    tags.includes("supply_delay") ||
    tags.includes("weather_aftereffect") ||
    tags.includes("market_pressure")
  );
}

function isTravelPressureEvent(event = {}) {
  const tags = toArray(event.tags).map(normalizeKey);
  const type = normalizeKey(event.type);
  return (
    ["travel_disruption", "road_problem", "weather_aftereffect"].includes(type) ||
    tags.some((tag) =>
      [
        "travel",
        "route",
        "road",
        "mud",
        "barro",
        "weather",
        "forest",
        "wilderness",
        "camino",
      ].includes(tag)
    )
  );
}

function weatherBaseTravelMultiplier(weather = {}) {
  const condition = normalizeKey(weather.currentCondition);
  if (["heavy_rain", "storm", "tormenta", "lluvia_fuerte"].includes(condition)) return 1.5;
  if (["light_rain", "rain", "lluvia", "lluvia_leve", "bad_weather", "mal_clima", "mud", "barro"].includes(condition)) {
    return 1.25;
  }
  return 1;
}

function weatherVisibilityWarnings(weather = {}) {
  const condition = normalizeKey(weather.currentCondition);
  const warnings = [];
  if (["fog", "niebla"].includes(condition)) warnings.push("Visibilidad reducida en exteriores.");
  if (Number(weather.intensity || 0) >= 3) warnings.push("Clima intenso: evitar resolver viaje sin preview.");
  return warnings;
}

function configuredWeatherMultiplier(weather = {}) {
  return toArray(weather.effects)
    .filter((effect) => effect?.type === "travel_time_multiplier")
    .map((effect) => Number(effect.value || 1))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((total, value) => total * value, 1);
}

function buildWorldFrictionSummary({
  location = null,
  weather = null,
  shops = [],
  shopStocks = [],
  items = [],
  events = [],
} = {}) {
  const itemById = new Map(toArray(items).map((item) => [item.itemId, item]));
  const shopById = new Map(toArray(shops).map((shop) => [shop.shopId, shop]));
  const eventList = toArray(events).filter(Boolean);
  const supplyEvents = eventList.filter(isSupplyPressureEvent);
  const travelEvents = eventList.filter(isTravelPressureEvent);
  const pressureTags = unique(
    eventList.flatMap((event) => [
      event.type,
      event.eventLayer,
      event.status,
      ...toArray(event.tags),
    ]).map(normalizeKey)
  );

  const lowStock = [];
  const outOfStock = [];
  const supplyDelayed = [];

  for (const stock of toArray(shopStocks)) {
    const shop = shopById.get(stock.shopId);
    const item = itemById.get(stock.itemId);
    const available = stockAvailableQuantity(stock);
    const scarcityFlags = stock.scarcityFlags || [];

    if (available <= 0) {
      outOfStock.push(summarizeStockPressure(stock, shop, item, "out_of_stock"));
    } else if (available <= 2) {
      lowStock.push(summarizeStockPressure(stock, shop, item, "low_stock"));
    }

    if (scarcityFlags.includes("supply_delay_active") || supplyEvents.length > 0) {
      supplyDelayed.push(summarizeStockPressure(stock, shop, item, "supply_delay_context"));
    }
  }

  const weatherMultiplier = weather ? weatherBaseTravelMultiplier(weather) * configuredWeatherMultiplier(weather) : 1;
  const weatherWarnings = weather ? weatherVisibilityWarnings(weather) : [];
  const weatherStale = Boolean(weather?.staleByCurrentTime);
  const currentDanger = location?.dangerLevel || "unknown";
  const locationNotSafe = currentDanger && !["safe", "unknown"].includes(currentDanger);
  const economyPressure =
    lowStock.length > 0 || outOfStock.length > 0 || supplyDelayed.length > 0 || supplyEvents.length > 0;
  const travelPressure =
    weatherMultiplier > 1 || weatherWarnings.length > 0 || weatherStale || travelEvents.length > 0 || locationNotSafe;

  const guidance = [
    weatherStale ? "Refrescar clima antes de viajes o escenas exteriores." : "",
    weatherMultiplier > 1 ? "Usar previewTravel antes de rutas exteriores; el clima puede alargar trayectos." : "",
    travelEvents.length > 0 ? "Hay eventos/rumores de ruta: no convertirlos en encuentro automatico sin causa." : "",
    economyPressure ? "Validar stock y dinero antes de compras; no asumir suministros infinitos." : "",
    locationNotSafe ? "La ubicacion tiene peligro no seguro; pedir preview o confirmar riesgo antes de saltos largos." : "",
  ].filter(Boolean);

  return {
    schemaVersion: "world_friction_v1",
    economy: {
      nearbyShopCount: toArray(shops).length,
      operationalShopCount: toArray(shops).filter((shop) => shop.status === "operational").length,
      lowStock: lowStock.slice(0, 8),
      outOfStock: outOfStock.slice(0, 8),
      supplyDelayed: supplyDelayed.slice(0, 8),
      affectedBySupplyEvents: supplyEvents.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        status: event.status,
      })).slice(0, 5),
      hasPressure: economyPressure,
    },
    weather: weather
      ? {
          condition: weather.currentCondition,
          intensity: weather.intensity,
          staleByCurrentTime: weatherStale,
          exteriorTravelTimeMultiplier: Number(weatherMultiplier.toFixed(2)),
          warnings: weatherWarnings,
        }
      : null,
    travel: {
      currentLocationId: location?.locationId || "",
      currentDangerLevel: currentDanger,
      affectedByTravelEvents: travelEvents.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        status: event.status,
      })).slice(0, 5),
      shouldPreviewTravel: travelPressure,
      hasPressure: travelPressure,
    },
    activePressureTags: pressureTags.slice(0, 12),
    guidance,
    globalGuidance: guidance.length
      ? "Hay friccion de mundo activa: validar compras/viajes/clima antes de resolver consecuencias mecanicas."
      : "Sin friccion significativa de economia, clima o viaje en el contexto compacto.",
  };
}

function commitmentDueStatus(commitment, currentDay, currentTime) {
  if (!commitment?.dueDay) return "unscheduled";
  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");

  if (currentAbs > dueAbs) return "overdue";
  if (currentAbs === dueAbs) return "due_now";
  if (dueAbs - currentAbs <= 180) return "due_soon";
  return "future";
}

function commitmentNextCheckStatus(commitment, currentDay, currentTime) {
  if (!commitment?.nextCheckDay) return "none";
  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const checkAbs =
    (Number(commitment.nextCheckDay || 1) - 1) * 1440 + timeToMinutes(commitment.nextCheckTime || "23:59");

  if (currentAbs > checkAbs) return "review_overdue";
  if (currentAbs === checkAbs) return "review_now";
  if (checkAbs - currentAbs <= 180) return "review_soon";
  return "future";
}

function commitmentDormantStatus(commitment, currentDay, currentTime) {
  if (!commitment?.conditionSummary && !commitment?.dormantUntilDay) return "none";
  if (!commitment?.dormantUntilDay) return "conditional";

  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dormantAbs =
    (Number(commitment.dormantUntilDay || 1) - 1) * 1440 + timeToMinutes(commitment.dormantUntilTime || "23:59");

  return currentAbs >= dormantAbs ? "wake_due" : "dormant";
}

function commitmentOverdueMinutes(commitment, currentDay, currentTime) {
  if (!commitment?.dueDay) return 0;
  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");
  return Math.max(0, currentAbs - dueAbs);
}

function isTrackablePromiseCommitment(commitment = {}) {
  if (!commitment) return false;
  if (commitment.promiseType && commitment.promiseType !== "none") return true;
  if (commitment.promiseStrength && commitment.promiseStrength !== "none") return true;
  return ["promise", "obligation", "appointment", "follow_up", "mission_intention"].includes(commitment.type);
}

function defaultCommitmentFailureSeverity(commitment = {}) {
  if (commitment.failureSeverity) return commitment.failureSeverity;
  if (commitment.priority === "critical") return "major";
  if (commitment.priority === "high") return "moderate";
  if (["job", "obligation", "appointment", "promise", "mission_intention"].includes(commitment.type)) return "minor";
  return "none";
}

function defaultCommitmentFailureConsequence(commitment = {}) {
  if (commitment.failureConsequence) return commitment.failureConsequence;
  if (commitment.type === "job") return "Puede afectar la confianza laboral, la paga futura o la estabilidad del contrato.";
  if (commitment.type === "promise") return "Puede bajar confianza o familiaridad con los NPCs afectados si se incumple sin explicacion.";
  if (commitment.type === "obligation") return "Puede generar deuda social, molestia o perdida de fiabilidad.";
  if (commitment.type === "appointment") return "Puede hacer perder la oportunidad o exigir disculpa/reprogramacion.";
  if (commitment.type === "mission_intention") return "Puede dejar pasar una oportunidad del gremio o cambiar la disponibilidad del encargo.";
  if (commitment.type === "secret") return "Puede exponer informacion privada si no se maneja con cuidado.";
  return "";
}

function commitmentUrgency(commitment, currentDay, currentTime) {
  if (!commitment || ["fulfilled", "failed", "cancelled", "expired"].includes(commitment.status)) return "closed";

  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  let dueUrgency = "";
  if (commitment.dueDay) {
    const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");
    const graceMinutes = Math.max(0, Number(commitment.graceMinutes || 0));
    const minutesUntilDue = dueAbs - currentAbs;

    if (currentAbs > dueAbs + graceMinutes) dueUrgency = "consequence_ready";
    else if (currentAbs > dueAbs) dueUrgency = "overdue_in_grace";
    else if (currentAbs === dueAbs) dueUrgency = "due_now";
    else if (minutesUntilDue <= 60) dueUrgency = "due_soon";
    else if (minutesUntilDue <= 180) dueUrgency = "upcoming";
    else dueUrgency = "future";
  }

  if (["consequence_ready", "overdue_in_grace", "due_now"].includes(dueUrgency)) return dueUrgency;

  const nextCheckStatus = commitmentNextCheckStatus(commitment, currentDay, currentTime);
  if (nextCheckStatus === "review_overdue") return "review_overdue";
  if (nextCheckStatus === "review_now") return "review_due";
  if (nextCheckStatus === "review_soon") return "review_soon";

  if (dueUrgency) return dueUrgency;
  const dormantStatus = commitmentDormantStatus(commitment, currentDay, currentTime);
  if (dormantStatus === "wake_due") return "review_due";
  if (dormantStatus === "dormant" || dormantStatus === "conditional") return "conditional_dormant";
  if (commitment.requiresExplicitResolution || isTrackablePromiseCommitment(commitment)) return "needs_schedule";
  return commitment.priority === "critical" || commitment.priority === "high" ? "tracked" : "open";
}

function buildCommitmentRecommendedAction({ urgency, type, promiseType, promiseStrength, requiresExplicitResolution }) {
  if (urgency === "consequence_ready") return "Cerrar con fulfill/fail/cancel/expire antes de avanzar escenas largas.";
  if (urgency === "overdue_in_grace") return "Resolver o reprogramar pronto; todavia esta dentro del margen de gracia.";
  if (urgency === "due_now") return "Atender ahora, cumplirlo o reprogramarlo formalmente.";
  if (urgency === "due_soon" || urgency === "upcoming") return "Tenerlo presente en la narracion y evitar saltos largos que lo ignoren.";
  if (urgency === "review_overdue" || urgency === "review_due") {
    if (promiseType === "soft_estimate" || promiseStrength === "soft") {
      return "Revisar ahora: confirmar avance, explicar demora o fijar nuevo nextCheck; no tratarlo como incumplimiento duro sin causa.";
    }
    return "Revisar ahora: cumplir, explicar bloqueo, reprogramar nextCheck o cerrar formalmente.";
  }
  if (urgency === "review_soon") return "Recordar la revision cercana y evitar saltos largos que la ignoren.";
  if (urgency === "needs_schedule") return "Agregar dueDay/dueTime o nextCheckDay/nextCheckTime, o cerrarlo si ya no aplica.";
  if (urgency === "conditional_dormant") return "Mantenerlo dormido hasta que se cumpla la condicion o llegue su revision.";
  if (requiresExplicitResolution) return "No dejarlo solo en logs; cerrarlo formalmente cuando cambie su estado.";
  if (type === "secret") return "Respetar privacidad y conocimiento NPC.";
  return "Mantener como pendiente hasta que Lucas lo atienda o lo descarte.";
}

function buildCommitmentConsequencePreview(commitment, currentDay, currentTime) {
  const urgency = commitmentUrgency(commitment, currentDay, currentTime);
  const severity = defaultCommitmentFailureSeverity(commitment);
  const graceMinutes = Math.max(0, Number(commitment?.graceMinutes || 0));
  const overdueMinutes = commitmentOverdueMinutes(commitment, currentDay, currentTime);
  const pastGrace = urgency === "consequence_ready";
  const requiresExplicitResolution = Boolean(
    commitment?.requiresExplicitResolution ||
      severity !== "none" ||
      (commitment?.targetNpcIds || []).length > 0 ||
      isTrackablePromiseCommitment(commitment)
  );

  return {
    severity,
    summary: truncateText(defaultCommitmentFailureConsequence(commitment), 350),
    successSummary: truncateText(commitment?.successConsequence || "", 350),
    graceMinutes,
    overdueMinutes,
    pastGrace,
    requiresExplicitResolution,
    recommendedAction: buildCommitmentRecommendedAction({
      urgency,
      type: commitment?.type || "plan",
      promiseType: commitment?.promiseType || "none",
      promiseStrength: commitment?.promiseStrength || "none",
      requiresExplicitResolution,
    }),
  };
}

function summarizeStat(stat) {
  if (!stat) return null;
  return {
    current: stat.current,
    max: stat.max,
    label: stat.label || "",
  };
}

function summarizeInventoryEntry(entry, item) {
  return {
    itemId: entry.itemId,
    name: item?.name || entry.itemId,
    type: item?.type || "",
    subtype: item?.subtype || "",
    quantity: entry.quantity,
    equipped: Boolean(entry.equipped),
    condition: entry.condition || "",
    notes: entry.notes || "",
    rarity: item?.rarity || "",
    basePriceCopper: item?.basePriceCopper ?? 0,
    tags: item?.tags || [],
  };
}

function summarizeInventory(inventory, itemDocs = []) {
  const itemById = new Map(itemDocs.map((item) => [item.itemId, item]));
  return (inventory || []).map((entry) => summarizeInventoryEntry(entry, itemById.get(entry.itemId)));
}

function summarizeSkill(skill) {
  return {
    skillId: skill.skillId,
    name: skill.name,
    phase: skill.phase,
    level: skill.level,
    exp: skill.exp,
    expToNext: skill.expToNext,
  };
}

function moneyBreakdown(totalCopper = 0) {
  const copper = Math.max(0, Number(totalCopper) || 0);
  return {
    totalCopper: copper,
    gold: Math.floor(copper / 10000),
    silver: Math.floor((copper % 10000) / 100),
    copper: copper % 100,
  };
}

function summarizeLucasState(gameState, character, itemDocs = []) {
  const status = gameState?.lucasStatus || {};
  const inventory = summarizeInventory(gameState?.inventory || [], itemDocs);

  return {
    characterId: gameState?.characterId || character?.characterId || "",
    name: character?.name || "",
    life: summarizeStat(status.life),
    satiety: summarizeStat(status.satiety),
    energy: summarizeStat(status.energy),
    mp: summarizeStat(status.mp),
    money: moneyBreakdown(gameState?.moneyCopper || 0),
    inventory,
    equipped: inventory.filter((entry) => entry.equipped),
    skills: (gameState?.skills || []).map(summarizeSkill),
    conditions: status.conditions || [],
    injuries: status.injuries || [],
    activeMissionIds: gameState?.activeMissionIds || [],
  };
}

function summarizeGameState(gameState) {
  if (!gameState) return null;
  return {
    gameId: gameState.gameId,
    currentDay: gameState.currentDay,
    diegeticDate: gameState.diegeticDate,
    block: gameState.block,
    time: gameState.time,
    locationId: gameState.locationId,
    characterId: gameState.characterId,
    activeEventIds: gameState.activeEventIds || [],
    activeMissionIds: gameState.activeMissionIds || [],
    flags: gameState.flags || {},
  };
}

function summarizeLocation(location) {
  if (!location) return null;
  return {
    locationId: location.locationId,
    name: location.name,
    type: location.type || "",
    regionId: location.regionId || "",
    parentLocationId: location.parentLocationId || "",
    ownerNpcId: location.ownerNpcId || "",
    controllingFactionId: location.controllingFactionId || "",
    currentStatus: location.currentStatus || "",
    dangerLevel: location.dangerLevel || "",
    openHours: location.openHours || [],
    activeEffects: location.activeEffects || [],
    visibleNpcIds: location.visibleNpcIds || [],
    probableNpcIds: location.probableNpcIds || [],
    tags: location.tags || [],
  };
}

function buildNpcVoiceProfile(npc) {
  if (!npc) return null;
  const personality = unique(npc.personality || []).slice(0, 6);
  const values = unique(npc.values || []).slice(0, 5);
  const tolerates = unique(npc.tolerates || []).slice(0, 5);
  const rejects = unique(npc.rejects || []).slice(0, 5);
  const socialProfile = npc.socialProfile || {};
  const boundaries = unique(socialProfile.boundaries || []).slice(0, 5);
  const speechStyle = truncateText(npc.speechStyle || "", 180);
  const isDry =
    /seco|seca|breve|aspero|fria|formal|directa|directo/i.test(
      `${speechStyle} ${personality.join(" ")}`
    );
  const isWarm =
    /amable|calida|gentil|afectuosa|simpatica|suave|maternal/i.test(
      `${speechStyle} ${personality.join(" ")}`
    );
  const isInstitutional = (npc.factionLinks || []).some((link) =>
    ["faction_hoshimori_guild", "faction_hoshimori_guard"].includes(link.factionId)
  );

  return {
    speechStyle,
    personality,
    values,
    tolerates,
    rejects,
    boundaries,
    dialogueGuidance: [
      speechStyle ? `Voz: ${speechStyle}.` : "",
      isDry
        ? "Seco no significa pobre ni identico: frases compactas con subtexto, imagen concreta del peligro, silencios, gestos practicos o humor breve."
        : "",
      isWarm ? "La calidez debe sentirse en pequenos gestos y no solo en agradecimientos repetidos." : "",
      isInstitutional
        ? "Distinguir registro confirmado, inferencia y rumor; no convertir datos mecanicos en certeza diegetica."
        : "",
      "No hacer que sus reacciones giren siempre alrededor de Lucas; usar rol, rutina, intereses y cansancio propios.",
    ].filter(Boolean),
    avoid: [
      "repetir la misma frase de aprobacion o advertencia en escenas similares",
      "dar informacion que no tenga fuente diegetica clara",
      "convertir ayuda rutinaria en emocion fuerte sin motivo social suficiente",
    ],
  };
}

function summarizeNpcEmotionalProfile(npc) {
  if (!npc) return null;
  const profile = npc.emotionalProfile || {};
  const coreDrives = unique(profile.coreDrives || []).slice(0, 3);
  const coreFears = unique(profile.coreFears || []).slice(0, 3);
  const softSpots = unique(profile.softSpots || []).slice(0, 3);
  const stressors = unique(profile.stressors || []).slice(0, 4);
  const visibleTells = unique(profile.visibleTells || []).slice(0, 4);
  const sceneHooks = unique(profile.sceneHooks || []).slice(0, 4);

  return {
    schemaVersion: profile.schemaVersion || "emotional_profile_v1",
    defaultMood: truncateText(profile.defaultMood || "", 100),
    coreDrives,
    coreFears,
    pride: truncateText(profile.pride || "", 120),
    softSpots,
    stressors,
    visibleTells,
    copingStyle: truncateText(profile.copingStyle || "", 120),
    contradiction: truncateText(profile.contradiction || "", 160),
    sceneHooks,
    rule: "No revelar interioridad privada; usar solo gestos, ritmo, elecciones y silencios.",
  };
}

function relationshipDialogueRegister(relationship = {}, relationshipState = null) {
  const stanceKey = relationshipState?.stance?.key || "";
  const trust = Number(relationship.trust) || 0;
  const familiarity = Number(relationship.familiarity) || 0;
  const respect = Number(relationship.respect) || 0;
  const suspicion = Number(relationship.suspicion) || 0;
  const fear = Number(relationship.fear) || 0;

  if (fear >= 50) {
    return {
      key: "fearful_distance",
      label: "distancia por miedo",
      guidance: "Responde con cautela defensiva; no narrar obediencia como confianza.",
    };
  }
  if (suspicion >= 50 || stanceKey === "closed_suspicious") {
    return {
      key: "suspicious_guarded",
      label: "sospecha activa",
      guidance: "Pregunta, mide contradicciones y limita informacion; el subtexto pesa mas que la cordialidad.",
    };
  }
  if (trust >= 70 && familiarity >= 25 && respect >= 25) {
    return {
      key: "trusted_personal",
      label: "trato personal confiado",
      guidance: "Puede hablar con mas matiz, memoria y calidez, sin volverlo romance automatico.",
    };
  }
  if (trust >= 50 || relationshipState?.accessScore >= 55) {
    return {
      key: "reliable_warm",
      label: "trato fiable",
      guidance: "Puede colaborar y mostrar familiaridad practica; el afecto fuerte requiere escena concreta.",
    };
  }
  if (respect >= 25 && trust < 35) {
    return {
      key: "respects_competence",
      label: "respeta competencia, no intimidad",
      guidance: "Reconoce esfuerzo o utilidad sin abrir secretos ni sonar cercano de golpe.",
    };
  }
  if (trust <= 9 && familiarity <= 9) {
    return {
      key: "stranger_public",
      label: "trato de desconocido",
      guidance: "Mantener distancia social, preguntas basicas y tono acorde al rol publico.",
    };
  }

  return {
    key: "cautious_open",
    label: "apertura cauta",
    guidance: "Puede conversar y reaccionar a la escena, pero evita intimidad o favores grandes.",
  };
}

function emotionalTemperatureForDialogue(relationship = {}, npc = {}) {
  const drivers = [];
  const personalityText = `${(npc.personality || []).join(" ")} ${npc.speechStyle || ""}`;
  const suspicion = Number(relationship.suspicion) || 0;
  const fear = Number(relationship.fear) || 0;
  const jealousy = Number(relationship.jealousy) || 0;
  const affection = Number(relationship.affection) || 0;
  const trust = Number(relationship.trust) || 0;
  const respect = Number(relationship.respect) || 0;

  if (suspicion >= 25) drivers.push("sospecha");
  if (fear >= 25) drivers.push("miedo");
  if (jealousy >= 25) drivers.push("celos/tension comparativa");
  if (respect >= 25) drivers.push("respeto");
  if (trust >= 25) drivers.push("confianza");
  if (affection >= 25) drivers.push("calidez personal");
  if (textHasAny(personalityText, ["nerviosa", "timida", "reservada", "inseguro"])) drivers.push("contencion/inseguridad");
  if (textHasAny(personalityText, ["seco", "aspero", "frontal", "directo"])) drivers.push("dureza verbal");
  if (textHasAny(personalityText, ["charlatan", "dramatica", "energetica", "vendedor"])) drivers.push("expresividad");

  if (fear >= 50 || suspicion >= 50) {
    return { key: "tense", label: "tenso", drivers: drivers.slice(0, 4) };
  }
  if (affection >= 25 || trust >= 50) {
    return { key: "warm", label: "calido contenido", drivers: drivers.slice(0, 4) };
  }
  if (respect >= 25 || trust >= 25) {
    return { key: "engaged", label: "atento", drivers: drivers.slice(0, 4) };
  }
  if (drivers.includes("expresividad")) {
    return { key: "expressive", label: "expresivo", drivers: drivers.slice(0, 4) };
  }
  return { key: "neutral", label: "neutral/cotidiano", drivers: drivers.slice(0, 4) };
}

function buildDialogueMovesForNpc(npc = {}, relationship = {}) {
  const text = `${(npc.personality || []).join(" ")} ${npc.speechStyle || ""} ${(npc.values || []).join(" ")}`;
  const moves = [];

  if (textHasAny(text, ["seco", "aspero", "frontal", "directo", "grunon"])) {
    moves.push("Usar frases compactas con filo practico, pero no lineas vacias: incluir causa, imagen concreta del peligro o subtexto visible.");
  }
  if (textHasAny(text, ["formal", "institucional", "ordenada", "precisa", "burocratica", "procedimiento"])) {
    moves.push("Hablar desde procedimiento, registro o responsabilidad; separar hecho confirmado de inferencia.");
  }
  if (textHasAny(text, ["amable", "gentil", "compasivo", "maternal", "calida", "suave"])) {
    moves.push("Mostrar calidez en acciones concretas y preguntas pequenas, no solo en elogios genericos.");
  }
  if (textHasAny(text, ["nerviosa", "timida", "reservada", "inseguro"])) {
    moves.push("Dejar silencios, miradas evitadas o correcciones timidas; no volverlo discurso seguro de golpe.");
  }
  if (textHasAny(text, ["charlatan", "dramatica", "vendedor", "energetica", "cuenta historias"])) {
    moves.push("Permitir ritmo mas vivo, exageracion controlada, interrupciones o remates que busquen reaccion.");
  }
  if (textHasAny(text, ["misteriosa", "intuitiva", "reflexivo", "pausado"])) {
    moves.push("Responder con preguntas, observaciones laterales o verdades incompletas sin inventar secretos.");
  }
  if (textHasAny(text, ["competitivo", "ambiciosa", "quiere demostrar", "reconocimiento"])) {
    moves.push("Convertir la charla en pequeno desafio, comparacion o oportunidad de quedar bien.");
  }
  if ((Number(relationship.trust) || 0) < 15) {
    moves.push("Con poca confianza, el NPC debe pedir contexto o mantenerse practico antes de mostrar interes fuerte.");
  } else if ((Number(relationship.trust) || 0) >= 50) {
    moves.push("Con confianza alta, puede usar memoria compartida o una broma privada suave si encaja.");
  }
  if (npc.emotionalProfile?.contradiction || (npc.emotionalProfile?.visibleTells || []).length > 0) {
    moves.push("En escenas importantes, acompanar el dialogo con un gesto o decision que revele el subtexto sin explicarlo.");
  }

  return unique(moves).slice(0, 3);
}

function publicMaskForNpc(npc = {}) {
  const text = `${(npc.personality || []).join(" ")} ${npc.speechStyle || ""} ${(npc.values || []).join(" ")} ${npc.role || ""}`;

  if (textHasAny(text, ["formal", "institucional", "ordenada", "burocratica", "procedimiento"])) {
    return "se protege con procedimiento, precision y distancia institucional";
  }
  if (textHasAny(text, ["seco", "aspero", "frontal", "directo", "grunon"])) {
    return "se protege con dureza practica, ordenes cortantes y correcciones concretas";
  }
  if (textHasAny(text, ["amable", "gentil", "compasivo", "maternal", "calida", "suave"])) {
    return "se protege cuidando lo practico antes de mostrar preocupacion directa";
  }
  if (textHasAny(text, ["nerviosa", "timida", "reservada", "inseguro"])) {
    return "se protege bajando la mirada, ocupando las manos o contestando demasiado rapido";
  }
  if (textHasAny(text, ["charlatan", "dramatica", "vendedor", "energetica", "cuenta historias"])) {
    return "se protege con ruido social, humor, venta o energia antes de admitir tension";
  }
  if (textHasAny(text, ["misteriosa", "intuitiva", "reflexivo", "pausado"])) {
    return "se protege con pausas, preguntas laterales y verdades incompletas";
  }
  if (textHasAny(text, ["competitivo", "ambiciosa", "quiere demostrar", "reconocimiento"])) {
    return "se protege convirtiendo la escena en desafio, comparacion o prueba de valor";
  }

  return "se protege con su rol, su tarea actual y una distancia social razonable";
}

function resistanceMoveForNpc(npc = {}, relationship = {}, pressure = null) {
  const text = `${(npc.personality || []).join(" ")} ${npc.speechStyle || ""} ${(npc.values || []).join(" ")} ${npc.role || ""}`;
  const suspicion = Number(relationship.suspicion) || 0;
  const fear = Number(relationship.fear) || 0;

  if (fear >= 25) return "mantener distancia fisica y pedir senales claras de seguridad";
  if (suspicion >= 25) return "medir contradicciones antes de conceder informacion o ayuda";
  if (["busy", "on_task"].includes(pressure?.key)) return "defender su tiempo, tarea o responsabilidad antes de responder de lleno";
  if (textHasAny(text, ["formal", "institucional", "procedimiento"])) return "pedir datos, fuente o procedimiento antes de dejarse arrastrar por emocion";
  if (textHasAny(text, ["seco", "aspero", "frontal", "directo", "grunon"])) return "corregir el error visible antes de aceptar la intencion de Lucas";
  if (textHasAny(text, ["amable", "gentil", "calida", "suave"])) return "cuidar con un gesto pequeno sin entregar intimidad de golpe";
  if (textHasAny(text, ["nerviosa", "timida", "reservada", "inseguro"])) return "dudar, acomodarse o pedir permiso antes de decir lo que realmente piensa";
  if (textHasAny(text, ["charlatan", "dramatica", "vendedor", "energetica"])) return "desviar con humor, oferta o exageracion antes de tocar el punto sensible";
  if (textHasAny(text, ["competitivo", "ambiciosa", "reconocimiento"])) return "convertir la respuesta en reto, condicion o pequena competencia";

  return "poner una condicion practica antes de avanzar la escena";
}

function objectAnchorForNpc(npc = {}) {
  const text = `${npc.role || ""} ${npc.currentTask || ""} ${(npc.personality || []).join(" ")}`;

  if (textHasAny(text, ["instructor", "guardia", "combate", "entren", "arma", "patrulla"])) {
    return "pies, funda, vara, correa, polvo del patio o distancia entre cuerpos";
  }
  if (textHasAny(text, ["gremio", "registro", "mostrador", "documento", "procedimiento"])) {
    return "papeles, sello, mostrador, carpetas o el peso de una pausa institucional";
  }
  if (textHasAny(text, ["posada", "taberna", "cocina", "mesera", "dueno", "trabaja"])) {
    return "bandeja, taza, trapo, mesa, monedas, delantal o ruido de cocina";
  }
  if (textHasAny(text, ["mercader", "mercado", "tienda", "stock", "vende"])) {
    return "bolsa, balanza, caja, genero, moneda o mercancia que cambia de manos";
  }
  if (textHasAny(text, ["templo", "sanador", "cura", "oracion"])) {
    return "agua, cuentas, banco, vendas, lampara o silencio de templo";
  }
  if (textHasAny(text, ["herrero", "forja", "hierro", "yunque"])) {
    return "martillo, ceniza, metal caliente, cuero o herramienta que no se suelta";
  }

  return "manos, ropa, herramienta de tarea, mueble cercano o ruido del lugar; no convertirlo en item mecanico";
}

function buildNpcDramaticRole(npc = {}, relationshipInput = null) {
  if (!npc) return null;
  const relationship = normalizeRelationship(relationshipInput || npc.relationshipWithLucas || {});
  const relationshipState = evaluateSocialRelationshipState(relationship);
  const register = relationshipDialogueRegister(relationship, relationshipState);
  const pressure = currentDialoguePressure(npc);
  const emotionalProfile = summarizeNpcEmotionalProfile(npc);
  const coreDrive = emotionalProfile?.coreDrives?.[0] || "";
  const coreFear = emotionalProfile?.coreFears?.[0] || "";
  const visibleTell = emotionalProfile?.visibleTells?.[0] || "una pausa, mirada o decision visible cambia el peso de la escena";
  const softSpot = emotionalProfile?.softSpots?.[0] || emotionalProfile?.pride || "algo que respeta";
  const sceneHook = emotionalProfile?.sceneHooks?.[0] || "";
  const mask = publicMaskForNpc(npc);
  const resistance = resistanceMoveForNpc(npc, relationship, pressure);

  return {
    schemaVersion: "npc_dramatic_role_v1",
    publicMask: truncateText(mask, 130),
    sceneWant: truncateText(
      pressure?.key && pressure.key !== "available"
        ? `${pressure.summary} Quiere sostener eso antes de girar hacia Lucas.`
        : coreDrive
          ? `Quiere ${coreDrive}.`
          : "Quiere proteger su rol, su tiempo o su imagen publica.",
      105
    ),
    hiddenPressure: truncateText(
      coreFear
        ? `gesto/limite si roza su miedo a ${coreFear}; no explicar pensamiento privado.`
        : "gesto, limite o pausa: insinuar presion sin explicar pensamiento privado.",
      95
    ),
    resistanceMove: truncateText(resistance, 90),
    vulnerabilityTell: truncateText(visibleTell, 75),
    objectAnchor: truncateText(objectAnchorForNpc(npc), 90),
    beatLadder: [
      "Mascara: rol, tarea o defensa publica.",
      `Friccion: ${truncateText(resistance, 60)}.`,
      `Grieta: si toca ${truncateText(softSpot, 45)}, gesto sin confesion.`,
      sceneHook ? `Giro: ${truncateText(sceneHook, 60)}.` : "Giro: limite, condicion o apertura pequena.",
    ].slice(0, 4),
    relationshipGate: truncateText(register.guidance, 90),
    rule: "No narrar pensamiento privado; convertirlo en gesto, silencio, objeto o decision.",
  };
}

function buildDialogueAvoidForNpc(npc = {}, relationship = {}) {
  const avoids = [
    "no sonar intercambiable con otros NPCs",
    "no explicar mecanicas ni HUD en boca del NPC",
  ];
  const rejects = unique(npc.rejects || []);
  const boundaries = unique(npc.socialProfile?.boundaries || []);
  const combined = [...rejects, ...boundaries].slice(0, 3);

  if (combined.length > 0) {
    avoids.push(`evitar cruzar sus limites sin consecuencia: ${combined.join(", ")}`);
  }
  if ((Number(relationship.suspicion) || 0) >= 25) {
    avoids.push("no aceptar contradicciones de Lucas sin marcar duda o distancia");
  }
  if ((Number(relationship.fear) || 0) >= 25) {
    avoids.push("no confundir miedo con ternura, respeto o confianza");
  }

  return unique(avoids).slice(0, 4);
}

function summarizeNpcDialogueDirector(npc = {}) {
  const director = npc.flags?.dialogueDirector || null;
  if (!director || director.schemaVersion !== "npc_dialogue_director_v1") return null;

  const speechPatterns = director.speechPatterns && typeof director.speechPatterns === "object"
    ? Object.fromEntries(
        Object.entries(director.speechPatterns)
          .slice(0, 2)
          .map(([key, value]) => [key, truncateText(value || "", 65)])
      )
    : {};

  return {
    schemaVersion: "npc_dialogue_director_v1",
    cadence: truncateText(director.cadence || "", 75),
    emotionalRule: truncateText(director.emotionalRule || "", 90),
    reactFirst: truncateText(director.reactFirst || "", 80),
    speechPatterns,
    sceneRules: unique(director.sceneRules || []).slice(0, 1).map((line) => truncateText(line, 80)),
    sampleBeats: unique(director.sampleBeats || []).slice(0, 1).map((line) => truncateText(line, 80)),
    avoid: unique(director.avoid || []).slice(0, 2).map((line) => truncateText(line, 70)),
    rule:
      "Reacciona primero al tono de Lucas; mecanica exacta va al HUD/Cambios, no como manual.",
  };
}

function currentDialoguePressure(npc = {}) {
  const status = npc.availability?.status || "";
  const task = truncateText(npc.currentTask || "", 120);
  if (["busy", "working"].includes(status)) {
    return {
      key: "busy",
      summary: task ? `Ocupado/a: ${task}.` : "Ocupado/a con su rutina.",
      guidance: "Puede interrumpir, contestar mientras trabaja o cortar una charla larga.",
    };
  }
  if (status === "absent" || status === "traveling") {
    return {
      key: "not_available",
      summary: npc.availability?.reason || "No esta disponible.",
      guidance: "No tratarlo como presente salvo que el contexto lo ubique en escena.",
    };
  }
  if (task) {
    return {
      key: "on_task",
      summary: task,
      guidance: "Su dialogo debe rozar su tarea, interes propio o interrupcion actual.",
    };
  }
  return {
    key: "available",
    summary: "Disponible para escena breve si corresponde.",
    guidance: "Puede participar, pero no debe absorber la escena sin motivo.",
  };
}

function buildNpcDialogueProfile(npc, relationshipInput = null) {
  if (!npc) return null;
  const relationship = normalizeRelationship(relationshipInput || npc.relationshipWithLucas || {});
  const relationshipState = evaluateSocialRelationshipState(relationship);
  const register = relationshipDialogueRegister(relationship, relationshipState);
  const emotionalTemperature = emotionalTemperatureForDialogue(relationship, npc);
  const pressure = currentDialoguePressure(npc);
  const socialProfile = summarizeNpcSocialProfile(npc);
  const emotionalProfile = summarizeNpcEmotionalProfile(npc);
  const dialogueDirector = summarizeNpcDialogueDirector(npc);

  return {
    schemaVersion: "dialogue_profile_v1",
    speechRhythm: truncateText(npc.speechStyle || "voz cotidiana segun rol y personalidad", 140),
    dialogueDirector,
    relationshipRegister: register,
    emotionalTemperature,
    currentPressure: pressure,
    dramaticRole: buildNpcDramaticRole(npc, relationship),
    emotionalSubtext: emotionalProfile
      ? {
          defaultMood: emotionalProfile.defaultMood,
          coreDrives: emotionalProfile.coreDrives.slice(0, 1),
          coreFears: emotionalProfile.coreFears.slice(0, 1),
          visibleTells: emotionalProfile.visibleTells.slice(0, 2),
          contradiction: truncateText(emotionalProfile.contradiction, 120),
          rule: emotionalProfile.rule,
        }
      : null,
    subtextSeed: truncateText(
      [
        socialProfile.values?.length ? `valora ${socialProfile.values.slice(0, 3).join(", ")}` : "",
        socialProfile.rejects?.length ? `rechaza ${socialProfile.rejects.slice(0, 3).join(", ")}` : "",
        emotionalProfile?.coreDrives?.length ? `busca ${emotionalProfile.coreDrives.slice(0, 2).join(", ")}` : "",
        emotionalProfile?.coreFears?.length ? `teme ${emotionalProfile.coreFears.slice(0, 2).join(", ")}` : "",
        relationshipState?.stance?.summary || "",
      ]
        .filter(Boolean)
        .join("; "),
      220
    ),
    dialogueMoves: buildDialogueMovesForNpc(npc, relationship),
    avoid: buildDialogueAvoidForNpc(npc, relationship),
    rule: "Cada linea debe tener intencion y conocimiento permitido.",
  };
}

function summarizeNpc(npc) {
  if (!npc) return null;
  const relationship = normalizeRelationship(npc.relationshipWithLucas || {});
  const relationshipState = evaluateSocialRelationshipState(relationship);
  return {
    npcId: npc.npcId,
    name: npc.name,
    role: npc.role || "",
    currentLocationId: npc.currentLocationId || "",
    currentTask: npc.currentTask || "",
    availability: npc.availability || {},
    persistenceLevel: npc.persistenceLevel || "",
    socialProfile: summarizeNpcSocialProfile(npc),
    emotionalProfile: summarizeNpcEmotionalProfile(npc),
    voiceProfile: buildNpcVoiceProfile(npc),
    dialogueProfile: buildNpcDialogueProfile(npc, relationship),
    relationshipWithLucas: relationship,
    relationshipBands: {
      trust: relationshipBand(relationship.trust),
      familiarity: relationshipBand(relationship.familiarity),
      affection: relationshipBand(relationship.affection),
      suspicion: relationshipBand(relationship.suspicion),
      respect: relationshipBand(relationship.respect),
      fear: relationshipBand(relationship.fear),
      jealousy: relationshipBand(relationship.jealousy),
    },
    relationshipState,
    factionLinks: npc.factionLinks || [],
    knownPublicFacts: npc.knownPublicFacts || [],
    flags: npc.flags || {},
  };
}

function summarizeNpcPresenceRef(npc) {
  if (!npc) return null;
  const availability = npc.availability || {};

  return {
    npcId: npc.npcId,
    name: npc.name,
    currentLocationId: npc.currentLocationId || "",
    currentTask: truncateText(npc.currentTask || "", 160),
    availability: {
      status: availability.status || "",
      reason: truncateText(availability.reason || "", 160),
    },
  };
}

function npcPresenceRank(npcId, npcPresence = {}) {
  const groups = [
    ["same_room", npcPresence.sameRoom || npcPresence.visible || []],
    ["same_building", npcPresence.sameBuilding || []],
    ["probable", npcPresence.probable || []],
    ["relevant", npcPresence.relevant || []],
  ];

  for (const [key, list] of groups) {
    if (toArray(list).some((entry) => entry?.npcId === npcId)) return key;
  }

  return "nearby";
}

function firstNpcMemoryForCapsule(npcId, memories = []) {
  return toArray(memories).find((memory) => memory?.npcId === npcId) || null;
}

function buildDialogueSceneCapsules({
  nearbyNpcs = [],
  npcPresence = {},
  relevantNpcMemories = [],
  maxNpcs = 6,
} = {}) {
  const presentPriority = {
    same_room: 0,
    same_building: 1,
    probable: 2,
    relevant: 3,
    nearby: 4,
  };
  const sortedNpcs = toArray(nearbyNpcs)
    .filter(Boolean)
    .map((npc) => ({
      npc,
      presence: npcPresenceRank(npc.npcId, npcPresence),
    }))
    .sort((left, right) => {
      const rankDiff = (presentPriority[left.presence] ?? 9) - (presentPriority[right.presence] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      return String(left.npc.name || left.npc.npcId).localeCompare(String(right.npc.name || right.npc.npcId));
    })
    .slice(0, maxNpcs);

  const capsules = sortedNpcs.map(({ npc, presence }) => {
    const livingLayer = npc.flags?.livingLayer || {};
    const dialogueProfile = npc.dialogueProfile || {};
    const dialogueDirector = dialogueProfile.dialogueDirector || {};
    const dramaticRole = dialogueProfile.dramaticRole || {};
    const emotionalProfile = npc.emotionalProfile || {};
    const memory = firstNpcMemoryForCapsule(npc.npcId, relevantNpcMemories);
    const sampleBeats = unique(dialogueDirector.sampleBeats || []);

    return {
      npcId: npc.npcId,
      name: npc.name,
      presence,
      voice: truncateText(dialogueProfile.speechRhythm || npc.voiceProfile?.speechStyle || "", 60),
      cadence: truncateText(dialogueDirector.cadence || "", 70),
      mask: truncateText(dramaticRole.publicMask || "", 70),
      wantsNow: truncateText(livingLayer.currentConcern || dramaticRole.sceneWant || npc.currentTask || "", 80),
      pressure: truncateText(livingLayer.scenePressure || dialogueProfile.currentPressure?.summary || "", 70),
      reactFirst: truncateText(dialogueDirector.reactFirst || "", 80),
      emotionalRule: truncateText(dialogueDirector.emotionalRule || "", 90),
      memoryToUse: memory
        ? {
            memoryId: memory.memoryId,
            summary: truncateText(memory.summary || memory.fact || "", 85),
            certainty: memory.certainty || "",
          }
        : null,
      gestureAnchor: truncateText(
        dramaticRole.vulnerabilityTell || emotionalProfile.visibleTells?.[0] || livingLayer.dialogueTexture || "",
        60
      ),
      sampleTone: truncateText(sampleBeats[0] || livingLayer.dialogueExample || "", 95),
      avoid: unique(dialogueDirector.avoid || []).slice(0, 2).map((line) => truncateText(line, 70)),
    };
  });

  return {
    schemaVersion: "dialogue_scene_capsules_v1",
    guidance:
      "Prioridad: reaccion emocional visible -> voz del NPC -> dato. No usar NPC como manual; mecanica exacta va en HUD/Cambios.",
    capsules,
  };
}

function findNpcKnowledgeEntry(npcId, npcKnowledgeContext = {}) {
  return toArray(npcKnowledgeContext?.perNpc).find((entry) => entry?.npcId === npcId) || null;
}

function summarizeKnowledgeBoundaryForNpc(entry = null) {
  const knownRecords = toArray(entry?.knownRecords).slice(0, 1).map((record) => ({
    knowledgeId: record.knowledgeId,
    factKey: record.factKey,
    summary: truncateText(record.summary || record.fact || "", 80),
    certainty: record.certainty || "",
    canShare: Boolean(record.canShare),
  }));
  const knownMemories = toArray(entry?.knownMemories).slice(0, 1).map((memory) => ({
    memoryId: memory.memoryId,
    summary: truncateText(memory.summary || memory.fact || "", 80),
    certainty: memory.certainty || "",
    canShare: Boolean(memory.canShare),
  }));
  const exactSchedule = entry?.jobAvailability?.exactSchedule || null;
  const warnings = [];

  if (entry && Number(entry.knownRecordCount || 0) === 0 && Number(entry.knownMemoryCount || 0) === 0) {
    warnings.push("Sin registro/memoria relevante: no afirmar datos privados, horarios exactos ni secretos.");
  }
  if (exactSchedule?.canInfer && !exactSchedule?.canStateAsFact) {
    warnings.push("Puede inferir disponibilidad laboral, pero no decir horario exacto como hecho confirmado.");
  }
  if (toArray(knownRecords).some((record) => !record.canShare)) {
    warnings.push("Hay datos que el NPC puede saber pero no compartir directamente.");
  }

  return {
    knownRecords,
    knownMemories,
    canStateExactSchedule: Boolean(exactSchedule?.canStateAsFact),
    warnings: warnings.slice(0, 2),
    rule: "Certeza solo con fuente diegetica; si falta: duda, pregunta, rumor o silencio.",
  };
}

function capsuleByNpcId(dialogueSceneCapsules = null) {
  const map = new Map();
  for (const capsule of toArray(dialogueSceneCapsules?.capsules)) {
    if (capsule?.npcId && !map.has(capsule.npcId)) map.set(capsule.npcId, capsule);
  }
  return map;
}

function orderedNpcsForNarration({ nearbyNpcs = [], npcPresence = {}, dialogueSceneCapsules = null, maxNpcs = 3 } = {}) {
  const byNpcId = new Map(toArray(nearbyNpcs).filter(Boolean).map((npc) => [npc.npcId, npc]));
  const orderedIds = [];

  for (const capsule of toArray(dialogueSceneCapsules?.capsules)) {
    if (capsule?.npcId && !orderedIds.includes(capsule.npcId)) orderedIds.push(capsule.npcId);
  }
  for (const group of [npcPresence?.sameRoom, npcPresence?.visible, npcPresence?.sameBuilding, npcPresence?.probable]) {
    for (const entry of toArray(group)) {
      if (entry?.npcId && !orderedIds.includes(entry.npcId)) orderedIds.push(entry.npcId);
    }
  }
  for (const npc of toArray(nearbyNpcs)) {
    if (npc?.npcId && !orderedIds.includes(npc.npcId)) orderedIds.push(npc.npcId);
  }

  return orderedIds
    .map((npcId) => byNpcId.get(npcId))
    .filter(Boolean)
    .slice(0, maxNpcs);
}

function buildNpcNarrationContract(npc = {}, { capsule = null, npcKnowledgeContext = {}, socialRhythm = null } = {}) {
  const dialogueProfile = npc.dialogueProfile || {};
  const dialogueDirector = dialogueProfile.dialogueDirector || {};
  const dramaticRole = dialogueProfile.dramaticRole || {};
  const emotionalProfile = npc.emotionalProfile || {};
  const relationshipState = npc.relationshipState || {};
  const knowledgeEntry = findNpcKnowledgeEntry(npc.npcId, npcKnowledgeContext);
  const saturated = toArray(socialRhythm?.saturatedNpcIds).includes(npc.npcId);

  return {
    npcId: npc.npcId,
    name: npc.name,
    presence: capsule?.presence || "nearby",
    contractStrength: "mandatory_if_npc_speaks",
    canonicalSource: "Mongo: dialogueSceneCapsules, profiles, relacion y conocimiento.",
    mustUse: unique([
      capsule?.reactFirst || dialogueDirector.reactFirst,
      capsule?.gestureAnchor || dramaticRole.vulnerabilityTell || emotionalProfile.visibleTells?.[0],
      capsule?.wantsNow || dramaticRole.sceneWant || npc.currentTask,
      capsule?.pressure || dialogueProfile.currentPressure?.summary,
      capsule?.sampleTone ? `sample tone: ${capsule.sampleTone}` : "",
    ])
      .filter(Boolean)
      .slice(0, 2)
      .map((line) => truncateText(line, 90)),
    voiceRule: truncateText(
      [
        capsule?.voice || dialogueProfile.speechRhythm || npc.voiceProfile?.speechStyle,
        capsule?.cadence || dialogueDirector.cadence,
        dialogueProfile.relationshipRegister?.guidance,
      ]
        .filter(Boolean)
        .join(" | "),
      150
    ),
    relationshipGate: {
      stance: relationshipState.stance?.key || "",
      accessScore: relationshipState.accessScore,
      guidance: truncateText(
        relationshipState.narrativeGuidance?.[0] ||
          dialogueProfile.relationshipRegister?.guidance ||
          "El trato debe seguir confianza, respeto, sospecha, miedo y familiaridad actuales.",
        100
      ),
    },
    knowledgeBoundary: summarizeKnowledgeBoundaryForNpc(knowledgeEntry),
    improvisationLimits: {
      canImproviseWithin: [
        "voz, gesto, silencio, humor, cansancio, tarea, objeto",
      ],
      cannotImprovise: [
        "mecanicas, recompensas, romance, secretos, permisos, violencia fuera de perfil o datos sin fuente",
      ],
    },
    repetitionRule: saturated
      ? "Saturado hoy: usar continuidad/gesto/memoria; no delta rutinario."
      : "Variar por objeto, tarea, limite, cansancio o subtexto.",
    avoid: unique([
      "no explicar HUD, numeros, backend ni reglas como manual",
      ...toArray(capsule?.avoid),
      ...toArray(dialogueDirector.avoid),
      ...toArray(dialogueProfile.avoid),
      "no sonar intercambiable con otros NPCs",
      "no cerrar pedidos, bromas, conflicto o entrenamiento con una sola frase neutra",
    ])
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => truncateText(line, 80)),
  };
}

function buildSceneNarrationContract({
  dialogueSceneCapsules = null,
  nearbyNpcs = [],
  npcPresence = {},
  npcKnowledgeContext = null,
  relationshipDynamics = null,
  dramaticContext = null,
  socialRhythm = null,
  maxNpcs = 3,
} = {}) {
  const capsuleMap = capsuleByNpcId(dialogueSceneCapsules);
  const selectedNpcs = orderedNpcsForNarration({
    nearbyNpcs,
    npcPresence,
    dialogueSceneCapsules,
    maxNpcs,
  });
  const npcContracts = selectedNpcs.map((npc) =>
    buildNpcNarrationContract(npc, {
      capsule: capsuleMap.get(npc.npcId) || null,
      npcKnowledgeContext,
      socialRhythm,
    })
  );

  return {
    schemaVersion: "scene_narration_contract_v1",
    contractStrength: "mandatory_for_player_scene",
    authority:
      "Mongo/context compact is live canon for NPC voice, presence, relation and knowledge.",
    sourcePriority: [
      "scene.narrationContract.npcContracts",
      "scene.dialogueSceneCapsules",
      "dialogueDirector/emotionalProfile/relationshipState",
      "npcKnowledgeContext",
    ],
    lineIntentOptions: ["medir", "cuidar", "presionar", "ocultar", "corregir", "negociar", "provocar"],
    dialogueFormatContract: {
      ruleId: "format.dialogue_direct",
      requiredFormat: 'Nombre: "mensaje"',
      allowedFallback: 'Rol: "mensaje" solo para NPC generico o desconocido',
      forbidden: [
        "em dash/raya as direct dialogue marker",
        "dialogue bullets without speaker label",
        "speakerless quoted replies",
      ],
    },
    usePolicy: {
      ifNpcSpeaks:
        "Use NPC contract first; short lines need gesture/subtext/consequence.",
      ifNpcPresentButSilent:
        "Show task, glance, object, distance or refusal when relevant.",
      ifNoNpcContract:
        "Use body/place/object anchors; do not invent named NPCs.",
      mechanicsBoundary:
        "NPC prose cannot grant money, EXP, loot, wounds, healing, mission completion, romance, permissions or knowledge.",
    },
    requiredSceneBeats: [
      "open with body/place/object pressure",
      "answer tone before practical fact",
      "speaking NPC uses one mustUse",
      "clear next decision, then HUD",
    ],
    genericDialogueBans: [
      "no single neutral reply as whole NPC response",
      "no interchangeable filler",
      "no rule/manual speech in NPC mouth",
      "no omniscient certainty without source",
      "no em dash/raya direct dialogue",
    ],
    npcContracts,
    groupContract: {
      relationshipDynamicsAvailable: Boolean(relationshipDynamics?.count),
      pairCount: Number(relationshipDynamics?.count) || 0,
      rule: relationshipDynamics?.count
        ? "Use glance/interruption/alliance/silence; never reveal privateSubtext."
        : "Do not force group banter without nearby relationship data.",
    },
    dramaticMode: {
      sceneMode: dramaticContext?.emotionalScene?.sceneMode || "",
      paragraphTarget: dramaticContext?.emotionalScene?.paragraphTarget || "",
      emotionalQuestion: dramaticContext?.emotionalScene?.emotionalQuestion || "",
    },
    preOutputChecklist: [
      "HUD final; copy displayBundle when available",
      "no meta/backend/tool/action wording",
      "Name: \"dialogue\" for direct NPC speech",
      "never use em dash/raya for NPC dialogue",
      "each NPC line has intent/pressure",
    ],
  };
}

const CORE_RULE_LOOKUP_IDS = [
  "authority.backend_state",
  "action.scene_flow",
  "format.response_hud_exact",
];

function ruleSearchPath(ruleIds = []) {
  const uniqueRuleIds = unique(ruleIds).slice(0, 12);
  return `/api/search/docs?ruleId=${uniqueRuleIds.join(",")}&limit=${uniqueRuleIds.length || 1}`;
}

function addRuleLookup(active, seen, ruleId, trigger) {
  if (!ruleId || seen.has(ruleId)) return;
  seen.add(ruleId);
  active.push({
    ruleId,
    trigger: truncateText(trigger, 32),
  });
}

function buildRuleLookupContract({
  npcPresence = {},
  nearbyNpcs = [],
  narrationContract = null,
  worldFriction = null,
  weather = null,
  jobContract = null,
  activeMissions = [],
  availableMissionPreview = [],
  missionAgenda = null,
  carriedEvidence = [],
  pendingCommitments = [],
  commitmentAgenda = null,
  activeCombatEncounters = [],
  activeRumors = [],
  minorRumors = [],
  backgroundEvents = [],
  guildState = null,
  pendingBiology = [],
  alerts = [],
} = {}) {
  const active = [];
  const seen = new Set();
  const nearbyNpcCount = toArray(nearbyNpcs).length;
  const speakingNpcCount =
    toArray(narrationContract?.npcContracts).length ||
    toArray(npcPresence?.visible).length ||
    nearbyNpcCount;
  const hasMissionPressure =
    toArray(activeMissions).length > 0 ||
    toArray(availableMissionPreview).length > 0 ||
    Number(missionAgenda?.readyToComplete?.length || 0) > 0 ||
    Number(missionAgenda?.proofRejected?.length || 0) > 0;
  const hasCommitmentPressure =
    toArray(pendingCommitments).length > 0 ||
    Number(commitmentAgenda?.dueSoon?.length || 0) > 0 ||
    Number(commitmentAgenda?.reviewDue?.length || 0) > 0 ||
    Number(commitmentAgenda?.needsSchedule?.length || 0) > 0;
  const hasFactions =
    Boolean(guildState?.schemaVersion || guildState?.guildRegistrationStatus) ||
    hasMissionPressure;
  const hasRumorOrFactionFlow =
    toArray(activeRumors).length > 0 ||
    toArray(minorRumors).length > 0 ||
    toArray(backgroundEvents).length > 0;
  const hasWorldFriction =
    Boolean(worldFriction?.economy?.hasPressure) ||
    Boolean(worldFriction?.travel?.hasPressure) ||
    Boolean(weather?.staleByCurrentTime);
  const alertTypes = new Set(toArray(alerts).map((alert) => alert?.type).filter(Boolean));

  if (speakingNpcCount > 0) {
    addRuleLookup(active, seen, "format.dialogue_direct", "npc_dialogue");
    addRuleLookup(active, seen, "narration.dialogue_hud_boundary", "voice_vs_hud");
    addRuleLookup(active, seen, "npc.knowledge_boundaries", "npc_knowledge");
    addRuleLookup(active, seen, "npc.scene_presence_agency", "npc_presence");
  }

  if (nearbyNpcCount > 0) {
    addRuleLookup(active, seen, "social.relationship_logic", "nearby_npcs");
  }

  if (hasMissionPressure) {
    addRuleLookup(active, seen, "missions.guild_rewards_registration", "missions");
    addRuleLookup(active, seen, "events.evidence_progress", "event_proof");
  }

  if (toArray(carriedEvidence).length > 0) {
    addRuleLookup(active, seen, "inventory.evidence_boundary", "evidence");
  }

  if (hasCommitmentPressure) {
    addRuleLookup(active, seen, "commitment.promises", "commitment");
  }

  if (jobContract) {
    addRuleLookup(active, seen, "jobs.attendance_consequences", "job");
    if (jobContract.includesMeals || toArray(jobContract.mealBenefits).length > 0) {
      addRuleLookup(active, seen, "job.contract_meals", "job_meal");
    }
  }

  if (hasWorldFriction) {
    addRuleLookup(active, seen, "travel.world_friction_preview", "friction");
    if (worldFriction?.economy?.hasPressure) {
      addRuleLookup(active, seen, "economy.trade_stock_property", "economy");
    }
  }

  if (toArray(activeCombatEncounters).length > 0) {
    addRuleLookup(active, seen, "combat.backend_resolves", "combat");
    addRuleLookup(active, seen, "combat.recovery_detail", "recovery");
  }

  if (hasFactions) {
    addRuleLookup(active, seen, "factions.institutional_vs_personal", "faction");
  }

  if (hasRumorOrFactionFlow) {
    addRuleLookup(active, seen, "rumors.reputation_factions", "rumor");
  }

  if (toArray(pendingBiology).length > 0 || alertTypes.has("pending_biology") || alertTypes.has("stale_pending_biology")) {
    addRuleLookup(active, seen, "biology.accumulators", "biology");
  }

  const activeRuleIds = active.map((entry) => entry.ruleId);
  const mustSearchRuleIds = unique([...CORE_RULE_LOOKUP_IDS, ...activeRuleIds]).slice(0, 16);
  const searchBatches = [
    {
      name: "core_turn",
      path: ruleSearchPath(CORE_RULE_LOOKUP_IDS),
    },
  ];

  if (activeRuleIds.length > 0) {
    searchBatches.push({
      name: "active_scene",
      path: ruleSearchPath(activeRuleIds.slice(0, 12)),
    });
  }

  return {
    schemaVersion: "rule_lookup_contract_v1",
    contractStrength: "mandatory_for_final_response_and_blocking_before_mutation",
    source: "WorldDocumentIndex/searchDocs",
    policy:
      "Search core/active ruleIds before final gameplay; before preview/mutation it blocks.",
    alwaysReadRuleIds: CORE_RULE_LOOKUP_IDS,
    activeRuleLookups: activeRuleIds.slice(0, 12),
    mustSearchBeforeFinalRuleIds: CORE_RULE_LOOKUP_IDS,
    mustSearchBeforeMutationRuleIds: mustSearchRuleIds,
    searchBatches,
    turnRoutingPolicy: {
      pureQuestionOrTalk: "read/no mutation",
      simpleTimedActivity: "resolveTurn.sequence[type=activity]",
      travelRestWaitCheck: "resolveTurn.sequence[type=travel/rest/wait/environment_check]",
      partialWork: "resolveTurn actionFamily=job_shift sequence[type=work_segment]",
      attendanceOrLateness: "resolveTurn sequence[type=job_attendance/job_late]",
      fullJobShift: "completeJobShift",
      economyStockInventory: "applyTurn/economy tools",
      magicPractice: "magic preview/applyTurn",
      missionOrEvidence: "missionPatch/evidencePatches",
      combat: "combat Action",
    },
    preFinalResponseOrder: "getCompactContext(player_scene)->contracts->searchDocs core/active->scene+HUD",
    preMutationOrder: "getCompactContext->searchDocs->preview/details->mutate->reread->displayBundle/HUD",
  };
}

function relationshipPressureForScene(relationship = {}) {
  const trust = Number(relationship.trust) || 0;
  const familiarity = Number(relationship.familiarity) || 0;
  const tension = Number(relationship.tension) || 0;

  if (tension >= 55) {
    return {
      key: "open_tension",
      label: "tension visible",
      guidance: "Puede haber silencios tensos, respuestas cortantes o terceros notando incomodidad.",
    };
  }
  if (trust >= 65 && familiarity >= 60 && tension <= 20) {
    return {
      key: "easy_coordination",
      label: "coordinacion fluida",
      guidance: "Pueden completarse frases, repartirse tareas o corregirse sin dramatismo.",
    };
  }
  if (familiarity >= 55 && tension >= 25) {
    return {
      key: "familiar_friction",
      label: "roce familiar",
      guidance: "Se conocen lo suficiente para pincharse o anticipar defectos sin romper la escena.",
    };
  }
  if (trust >= 45) {
    return {
      key: "functional_trust",
      label: "confianza funcional",
      guidance: "Pueden apoyarse en tareas practicas aunque no compartan intimidad.",
    };
  }
  return {
    key: "loose_acquaintance",
    label: "trato suelto",
    guidance: "Usar cordialidad publica o distancia; no asumir complicidad fuerte.",
  };
}

function summarizeNpcRelationship(relationship, npcById = new Map()) {
  if (!relationship) return null;
  const pressure = relationshipPressureForScene(relationship);
  const left = npcById.get(relationship.npcAId);
  const right = npcById.get(relationship.npcBId);

  return {
    relationshipId: relationship.relationshipId,
    npcIds: [relationship.npcAId, relationship.npcBId].filter(Boolean),
    npcNames: [left?.name || relationship.npcAId, right?.name || relationship.npcBId].filter(Boolean),
    type: relationship.type || "",
    trustBand: relationshipBand(relationship.trust),
    familiarityBand: relationshipBand(relationship.familiarity),
    tensionBand: relationshipBand(relationship.tension),
    pressure,
    emotionalTone: truncateText(relationship.emotionalTone || "", 90),
    publicSummary: truncateText(relationship.publicSummary || "", 150),
    publicTensionReason: truncateText(relationship.publicTensionReason || "", 120),
    privateSubtext: truncateText(relationship.privateSubtext || "", 120),
    interactionHints: unique(relationship.interactionHints || []).slice(0, 3),
    boundaries: unique(relationship.boundaries || []).slice(0, 2),
    knownToLucas: Boolean(relationship.knownToLucas),
    rule: "No revelar privateSubtext como dato sabido por Lucas; usarlo solo como gesto, pausa o decision.",
  };
}

function buildSceneRelationshipDynamics({ relationships = [], nearbyNpcs = [], npcPresence = null } = {}) {
  const npcById = new Map(toArray(nearbyNpcs).map((npc) => [npc.npcId, npc]));
  const nearbyIds = new Set(npcById.keys());
  const sameRoomIds = new Set(toArray(npcPresence?.sameRoom || npcPresence?.visible).map((npc) => npc.npcId));
  const summarized = toArray(relationships)
    .filter((relationship) => nearbyIds.has(relationship.npcAId) && nearbyIds.has(relationship.npcBId))
    .map((relationship) => {
      const summary = summarizeNpcRelationship(relationship, npcById);
      const bothSameRoom = summary?.npcIds.every((npcId) => sameRoomIds.has(npcId));
      return {
        ...summary,
        currentlySharedScene: Boolean(bothSameRoom),
      };
    })
    .sort((left, right) => {
      if (left.currentlySharedScene !== right.currentlySharedScene) return left.currentlySharedScene ? -1 : 1;
      const leftTension = Number(relationships.find((rel) => rel.relationshipId === left.relationshipId)?.tension || 0);
      const rightTension = Number(relationships.find((rel) => rel.relationshipId === right.relationshipId)?.tension || 0);
      return rightTension - leftTension;
    })
    .slice(0, 8);

  return {
    schemaVersion: "scene_relationship_dynamics_v1",
    count: summarized.length,
    pairs: summarized,
    guidance: summarized.length
      ? "Usar estas relaciones para que los NPCs reaccionen entre ellos, no solo a Lucas."
      : "Sin relaciones NPC-NPC relevantes en escena compacta.",
  };
}

function summarizeNonZeroDeltas(deltas = {}) {
  const summary = {};
  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const value = Number(deltas[field]) || 0;
    if (value !== 0) summary[field] = value;
  }
  return summary;
}

function summarizeNpcSocialLedger(entry) {
  if (!entry) return null;
  return {
    ledgerId: entry.ledgerId,
    npcId: entry.npcId,
    day: entry.day,
    time: entry.time,
    actionType: entry.actionType || "",
    reason: truncateText(entry.reason || "", 400),
    requestedDeltas: summarizeNonZeroDeltas(entry.requestedDeltas),
    appliedDeltas: summarizeNonZeroDeltas(entry.appliedDeltas),
    capWarnings: entry.caps?.warnings || [],
    sourceEventId: entry.sourceEventId || "",
    sourceMissionId: entry.sourceMissionId || "",
    tags: entry.tags || [],
  };
}

function summarizeMission(mission, currentDay, currentTime) {
  if (!mission) return null;
  const actionState = missionActionState(mission, currentDay, currentTime);
  return {
    missionId: mission.missionId,
    title: mission.title,
    description: truncateText(mission.description, 900),
    status: mission.status,
    rank: mission.rank,
    riskLevel: mission.riskLevel,
    clientNpcId: mission.clientNpcId || "",
    locationId: mission.locationId || "",
    sourceFactionId: mission.sourceFactionId || "",
    reward: mission.reward || {},
    mgReward: mission.mgReward || 0,
    requirements: mission.requirements || [],
    proofRequired: mission.proofRequired || "",
    proofStatus: mission.proofStatus || "",
    postedDay: mission.postedDay,
    postedTime: mission.postedTime,
    expiresDay: mission.expiresDay,
    expiresTime: mission.expiresTime || "",
    expiredByCurrentTime: isExpiredAt(mission, currentDay, currentTime),
    actionState,
    acceptedByCharacterId: mission.acceptedByCharacterId || "",
    acceptedDay: mission.acceptedDay,
    completedDay: mission.completedDay,
    boardVisibility: mission.boardVisibility || null,
    flags: mission.flags || {},
  };
}

function summarizeEventLog(log, options = {}) {
  if (!log) return null;
  const includeMechanicalChanges = Boolean(options.includeMechanicalChanges);
  const summary = {
    logId: log.logId,
    day: log.day,
    timeStart: log.timeStart,
    timeEnd: log.timeEnd || "",
    locationId: log.locationId || "",
    type: log.type,
    summary: truncateText(log.summary, options.summaryMaxLength || 900),
    involvedCharacterIds: log.involvedCharacterIds || [],
    involvedNpcIds: log.involvedNpcIds || [],
    involvedFactionIds: log.involvedFactionIds || [],
    visibility: log.visibility || "",
    source: log.source || "",
    tags: log.tags || [],
  };
  if (includeMechanicalChanges) summary.mechanicalChanges = log.mechanicalChanges || {};
  return summary;
}

function summarizeNpcMemory(memory) {
  if (!memory) return null;
  return {
    memoryId: memory.memoryId,
    npcId: memory.npcId,
    fact: truncateText(memory.fact, 800),
    summary: truncateText(memory.summary, 500),
    sourceType: memory.sourceType,
    certainty: memory.certainty,
    emotionalWeight: memory.emotionalWeight,
    privacyLevel: memory.privacyLevel,
    canShare: memory.canShare,
    createdDay: memory.createdDay,
    createdTime: memory.createdTime,
    importance: memory.importance,
    tags: memory.tags || [],
  };
}

function summarizeRumor(rumor) {
  if (!rumor) return null;
  return {
    rumorId: rumor.rumorId,
    content: truncateText(rumor.content, 700),
    source: rumor.source || "",
    sourceType: rumor.sourceType || "",
    certainty: rumor.certainty || "",
    distortionLevel: rumor.distortionLevel,
    locationIds: rumor.locationIds || [],
    createdDay: rumor.createdDay,
    createdTime: rumor.createdTime,
    expiresDay: rumor.expiresDay,
    status: rumor.status,
    tags: rumor.tags || [],
  };
}

function isDebugNarrativeTag(tag = "") {
  const normalized = String(tag || "").toLowerCase();
  return (
    normalized === "admin_fix" ||
    normalized.includes("repair") ||
    normalized.includes("test") ||
    normalized.startsWith("former_") ||
    normalized.startsWith("debug_")
  );
}

function narrativeTags(tags = []) {
  return (tags || []).filter((tag) => !isDebugNarrativeTag(tag));
}

function summarizeWorldEvent(event) {
  if (!event) return null;
  const storedEffects = event.effects || [];
  const templateId = getDailyEventTemplateId(event);
  const tags = event.tags || [];
  const countsAsMainEvent =
    event.countsAsMainEvent === true ||
    (event.countsAsMainEvent !== false && tags.includes("daily_event") && !event.eventLayer);
  const eventLayer = event.eventLayer || (countsAsMainEvent ? "main_event" : "background");
  const relevantEffects = storedEffects
    .filter((effect) =>
      [
        "daily_event_rolls",
        "consequence_if_ignored",
        "consequence_applied",
        "social_consequence_rules",
        "social_consequence_applied",
        "event_resolution",
        "event_progress",
      ].includes(effect.type)
    );

  if (
    countsAsMainEvent &&
    !storedEffects.some((effect) => effect.type === "social_consequence_rules")
  ) {
    relevantEffects.push(buildSocialConsequenceHintEffect(event));
  }

  return {
    eventId: event.eventId,
    gameId: event.gameId || "isekai_lucas_main",
    templateId,
    rolls: event.rolls || {},
    title: event.title,
    type: event.type,
    eventLayer,
    countsAsMainEvent,
    blocksMainEventGeneration:
      ["scheduled", "active"].includes(event.status) &&
      (event.blocksMainEventGeneration === true || countsAsMainEvent),
    scope: event.scope,
    status: event.status,
    resolution: event.resolution || {},
    progress: event.progress
      ? {
          stage: event.progress.stage || "",
          statusLabel: event.progress.statusLabel || "",
          summary: truncateText(event.progress.summary || "", 450),
          confidence: event.progress.confidence || "unknown",
          nextAction: truncateText(event.progress.nextAction || "", 300),
          clueIds: (event.progress.clueIds || []).slice(0, 8),
          evidenceIds: (event.progress.evidenceIds || []).slice(0, 8),
          reportIds: (event.progress.reportIds || []).slice(0, 8),
          lastUpdatedDay: event.progress.lastUpdatedDay || null,
          lastUpdatedTime: event.progress.lastUpdatedTime || "",
          updatedByCharacterId: event.progress.updatedByCharacterId || "",
        }
      : {},
    startDay: event.startDay,
    startTime: event.startTime,
    endDay: event.endDay,
    endTime: event.endTime || "",
    affectedLocationIds: event.affectedLocationIds || [],
    affectedNpcIds: event.affectedNpcIds || [],
    severity: event.severity,
    visibility: event.visibility,
    dailyEventNotice: countsAsMainEvent ? buildDailyEventNotice(event) : null,
    cause: truncateText(event.cause || "", 500),
    effects: relevantEffects.slice(0, 6),
    tags: narrativeTags(tags),
  };
}

function summarizeCommitment(commitment, currentDay, currentTime) {
  if (!commitment) return null;
  const dueStatus = commitmentDueStatus(commitment, currentDay, currentTime);
  const nextCheckStatus = commitmentNextCheckStatus(commitment, currentDay, currentTime);
  const dormantStatus = commitmentDormantStatus(commitment, currentDay, currentTime);
  const urgency = commitmentUrgency(commitment, currentDay, currentTime);
  return {
    commitmentId: commitment.commitmentId,
    gameId: commitment.gameId || "isekai_lucas_main",
    characterId: commitment.characterId || "char_lucas",
    title: commitment.title,
    summary: truncateText(commitment.summary || "", 700),
    type: commitment.type || "plan",
    promiseType: commitment.promiseType || "none",
    promiseStrength: commitment.promiseStrength || "none",
    status: commitment.status || "pending",
    priority: commitment.priority || "normal",
    failureSeverity: defaultCommitmentFailureSeverity(commitment),
    failureConsequence: truncateText(commitment.failureConsequence || "", 350),
    successConsequence: truncateText(commitment.successConsequence || "", 350),
    graceMinutes: Math.max(0, Number(commitment.graceMinutes || 0)),
    requiresExplicitResolution: Boolean(commitment.requiresExplicitResolution),
    visibility: commitment.visibility || "private",
    createdDay: commitment.createdDay,
    createdTime: commitment.createdTime,
    dueDay: commitment.dueDay,
    dueTime: commitment.dueTime || "",
    dueStatus,
    urgency,
    windowStartDay: commitment.windowStartDay,
    windowStartTime: commitment.windowStartTime || "",
    windowEndDay: commitment.windowEndDay,
    windowEndTime: commitment.windowEndTime || "",
    nextCheckDay: commitment.nextCheckDay,
    nextCheckTime: commitment.nextCheckTime || "",
    nextCheckStatus,
    blockerSummary: truncateText(commitment.blockerSummary || "", 350),
    conditionSummary: truncateText(commitment.conditionSummary || "", 350),
    dormantUntilDay: commitment.dormantUntilDay,
    dormantUntilTime: commitment.dormantUntilTime || "",
    dormantStatus,
    targetNpcIds: commitment.targetNpcIds || [],
    relatedNpcIds: commitment.relatedNpcIds || [],
    relatedLocationIds: commitment.relatedLocationIds || [],
    relatedMissionIds: commitment.relatedMissionIds || [],
    relatedEventIds: commitment.relatedEventIds || [],
    speakerNpcId: commitment.speakerNpcId || "",
    responsibleNpcId: commitment.responsibleNpcId || "",
    responsibleFactionId: commitment.responsibleFactionId || "",
    resolution: commitment.resolution || {},
    sourceEventLogId: commitment.sourceEventLogId || "",
    tags: commitment.tags || [],
    consequencePreview: buildCommitmentConsequencePreview(commitment, currentDay, currentTime),
  };
}

function summarizeWeather(weather, currentDay, currentTime) {
  if (!weather) return null;
  return {
    weatherId: weather.weatherId,
    regionId: weather.regionId,
    currentCondition: weather.currentCondition,
    intensity: weather.intensity,
    startedDay: weather.startedDay,
    startedTime: weather.startedTime,
    expectedUntilDay: weather.expectedUntilDay,
    expectedUntilTime: weather.expectedUntilTime || "",
    staleByCurrentTime: isWeatherStale(weather, currentDay, currentTime),
    effects: weather.effects || [],
    source: weather.source || "",
    tags: weather.tags || [],
  };
}

function summarizeJobContract(contract, gameState = null) {
  if (!contract) return null;
  const schedule = summarizeContractSchedule(contract, gameState);
  return {
    contractId: contract.contractId,
    jobId: contract.jobId,
    title: contract.title,
    employerNpcId: contract.employerNpcId,
    locationId: contract.locationId,
    status: contract.status,
    startDay: contract.startDay,
    pay: contract.pay || {},
    includesMeals: Boolean(contract.includesMeals),
    mealBenefits: contract.mealBenefits || [],
    shifts: (contract.shifts || []).map((shift) => ({
      ...shift,
      scheduleStatus: schedule?.shifts?.find((entry) => entry.shiftId === shift.shiftId) || null,
    })),
    schedule,
    typicalTasks: contract.typicalTasks || [],
    absenceRules: contract.absenceRules || [],
    tags: contract.tags || [],
  };
}

function summarizeCombatEncounter(encounter) {
  if (!encounter) return null;
  return {
    encounterId: encounter.encounterId,
    status: encounter.status,
    locationId: encounter.locationId,
    enemyId: encounter.enemyId,
    enemyName: encounter.enemyName,
    enemyStatus: encounter.enemyStatus || {},
    currentRound: encounter.currentRound,
    startedDay: encounter.startedDay,
    startedTime: encounter.startedTime,
    reason: encounter.reason || "",
  };
}

function statPercent(stat) {
  const current = Number(stat?.current);
  const max = Number(stat?.max);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((current / max) * 100);
}

function buildBodyAnchor({ satietyPercent = null, energyPercent = null, lifePercent = null, injuries = [] } = {}) {
  if (lifePercent !== null && lifePercent < 75) return "dolor, proteccion del cuerpo y respiracion medida";
  if (toArray(injuries).length > 0) return "heridas, rigidez o cuidado involuntario de la zona lastimada";
  if (satietyPercent !== null && satietyPercent <= 45) return "hambre en paciencia, manos, estomago y decisiones practicas";
  if (energyPercent !== null && energyPercent <= 40) return "cansancio en respiracion, postura, lentitud y tolerancia";
  return "cuerpo presente sin convertir cada gesto en mecanica";
}

function buildPlaceAnchor(location = null, weather = null) {
  const locationText = `${location?.type || ""} ${(location?.tags || []).join(" ")} ${location?.name || ""}`;
  const weatherText = `${weather?.currentCondition || ""} ${weather?.summary || ""}`;

  if (textHasAny(locationText, ["private_room", "lucas", "habitacion", "rest"])) {
    return "madera quieta, manta, mochila, luz baja y sonidos lejanos de posada";
  }
  if (textHasAny(locationText, ["patio", "training", "entren", "yard"])) {
    return "polvo, madera, cuero, voces del gremio y distancia fisica del entrenamiento";
  }
  if (textHasAny(locationText, ["guild", "gremio", "records", "missions", "registro"])) {
    return "papeles, sello, mostrador, carpetas y pausas de procedimiento";
  }
  if (textHasAny(locationText, ["inn", "posada", "tavern", "grulla", "cocina"])) {
    return "vajilla, madera gastada, olor a comida, pasos de servicio y conversaciones cortadas";
  }
  if (textHasAny(locationText, ["market", "mercado", "shop", "tienda"])) {
    return "monedas, tela, cajas, pregones, miradas de compra y stock a la vista";
  }
  if (textHasAny(locationText, ["forest", "bosque", "road", "camino", "gate", "puerta"])) {
    return "barro, hojas, viento, distancia de ruta y sonidos que obligan a mirar dos veces";
  }
  if (textHasAny(locationText, ["temple", "templo", "shrine", "santuario"])) {
    return "agua, piedra fria, lamparas, silencio y pasos contenidos";
  }
  if (textHasAny(weatherText, ["rain", "lluvia", "storm", "tormenta"])) {
    return "humedad, ropa pesada, suelo inseguro y ruido de lluvia";
  }

  return "un objeto, sonido u olor propio del lugar debe cargar parte de la emocion";
}

function buildEmotionalSceneDirector({
  currentLocation = null,
  sameRoom = [],
  highestSeverity = "quiet",
  primarySource = null,
  satietyPercent = null,
  energyPercent = null,
  lifePercent = null,
  injuries = [],
  weather = null,
  relationshipDynamics = null,
} = {}) {
  const hasNpc = toArray(sameRoom).length > 0;
  const hasGroup = toArray(sameRoom).length >= 2 || Number(relationshipDynamics?.count) > 0;
  const important = ["high", "medium"].includes(highestSeverity) || hasNpc;
  const locationName = currentLocation?.name || "la escena";

  return {
    schemaVersion: "emotional_scene_director_v1",
    sceneMode: important ? "dramatized_scene" : "living_brief",
    paragraphTarget: important ? "3-6 parrafos antes del HUD si hay NPC/decision" : "1-3 parrafos vivos antes del HUD",
    emotionalQuestion: primarySource
      ? `Que mascara, limite o deseo visible se tensa en ${locationName} por ${primarySource.key}?`
      : `Que pequeno cambio visible hace que ${locationName} no se sienta estatica?`,
    beatEngine: [
      "Anzuelo: objeto/gesto/sonido/cuerpo; no resumen.",
      "Mascara: NPC protege rol, tarea, orgullo o limite.",
      "Presion: Lucas mueve pausa, mirada, objeto, distancia, tono o decision.",
      "Grieta: apertura, rechazo honesto, condicion o pregunta; no explicar interior.",
      "Salida: proxima decision clara y luego HUD.",
    ],
    sensoryAnchors: {
      body: buildBodyAnchor({ satietyPercent, energyPercent, lifePercent, injuries }),
      place: buildPlaceAnchor(currentLocation, weather),
      social: hasGroup
        ? "miradas cruzadas, interrupciones, alianzas pequenas y silencios entre NPCs"
        : hasNpc
          ? "distancia fisica, manos ocupadas, ritmo de voz y objeto de tarea del NPC"
          : "cuerpo de Lucas, lugar, clima y objetivos abiertos",
    },
    dialogueShape: {
      importantNpcScene: "2-5 intervenciones con gesto/subtexto si hay respuesta emocional.",
      lineRule: "La linea puede ser breve, pero debe respirar: pausa, deseo, miedo, prueba, limite, oferta o consecuencia.",
      noFlatReply:
        "No una sola frase minima ni respuesta neutra en pedido, broma, entrenamiento, conflicto o decision; reaccion emocional primero.",
    },
    slowBurnRule: "Confianza, miedo, respeto o perdon avanzan por microcambios y backend.",
    boundary: "Solo estado confirmado/subtexto visible; no mecanicas, secretos ni mente privada.",
  };
}

function buildDramaticContext({
  gameState = null,
  lucasSummary = null,
  currentLocation = null,
  npcPresence = null,
  nearbyNpcs = [],
  relationshipDynamics = null,
  mainEvent = null,
  missionAgenda = null,
  pendingCommitments = [],
  worldFriction = null,
  socialRhythm = null,
  weather = null,
  activeCombatEncounters = [],
} = {}) {
  const sources = [];
  const satietyPercent = statPercent(lucasSummary?.satiety);
  const energyPercent = statPercent(lucasSummary?.energy);
  const lifePercent = statPercent(lucasSummary?.life);
  const injuries = toArray(lucasSummary?.injuries);
  const conditions = toArray(lucasSummary?.conditions);
  const sameRoom = toArray(npcPresence?.sameRoom || npcPresence?.visible);
  const sameBuilding = toArray(npcPresence?.sameBuilding);
  const visibleNpcIds = sameRoom.map((npc) => npc.npcId).filter(Boolean);
  const openMissionCount = toArray(missionAgenda?.next).length;
  const dueCommitments = toArray(pendingCommitments).filter((commitment) =>
    ["consequence_ready", "overdue_in_grace", "due_now", "due_soon", "upcoming"].includes(commitment.urgency)
  );
  const socialSaturatedIds = toArray(socialRhythm?.saturatedNpcIds);
  const combatActive = toArray(activeCombatEncounters).some((encounter) => encounter.status === "active");

  if (combatActive) {
    sources.push({
      key: "active_combat",
      severity: "high",
      summary: "Hay combate activo; backend decide rolls, dano, moral, heridas y consecuencias.",
    });
  }
  if (mainEvent && ["scheduled", "active"].includes(mainEvent.status)) {
    sources.push({
      key: "main_event",
      severity: mainEvent.severity === "major" || mainEvent.severity === "high" ? "high" : "medium",
      summary: truncateText(`${mainEvent.title || "Evento principal activo"}: ${mainEvent.progress?.summary || mainEvent.cause || ""}`, 180),
    });
  }
  if (lifePercent !== null && lifePercent < 75) {
    sources.push({ key: "wounded_body", severity: lifePercent < 45 ? "high" : "medium", summary: "Lucas no esta fisicamente entero." });
  }
  if (injuries.length > 0) {
    sources.push({
      key: "injuries",
      severity: "medium",
      summary: `Heridas presentes: ${injuries.slice(0, 3).map((injury) => injury.label || injury.type || injury.injuryId || "herida").join(", ")}.`,
    });
  }
  if (satietyPercent !== null && satietyPercent <= 45) {
    sources.push({
      key: "hunger",
      severity: satietyPercent <= 25 ? "high" : "medium",
      summary: "El hambre debe sentirse en cuerpo, paciencia y decisiones practicas.",
    });
  }
  if (energyPercent !== null && energyPercent <= 40) {
    sources.push({
      key: "fatigue",
      severity: energyPercent <= 20 ? "high" : "medium",
      summary: "El cansancio debe afectar ritmo, respiracion y tolerancia a esfuerzos.",
    });
  }
  if (conditions.length > 0) {
    sources.push({
      key: "conditions",
      severity: "medium",
      summary: `Condiciones activas: ${conditions.slice(0, 3).map((condition) => condition.label || condition.type || condition).join(", ")}.`,
    });
  }
  if (openMissionCount > 0) {
    sources.push({
      key: "mission_pressure",
      severity: toArray(missionAgenda?.acceptedExpired).length || toArray(missionAgenda?.proofRejected).length ? "high" : "medium",
      summary: "Hay agenda de misiones que puede presionar prioridades; no resolver recompensas por narracion.",
    });
  }
  if (dueCommitments.length > 0) {
    sources.push({
      key: "commitment_pressure",
      severity: dueCommitments.some((commitment) => commitment.consequencePreview?.pastGrace) ? "high" : "medium",
      summary: "Hay compromisos cercanos o vencidos; evitar saltos largos que los ignoren.",
    });
  }
  if (worldFriction?.travel?.hasPressure || worldFriction?.economy?.hasPressure) {
    sources.push({
      key: "world_friction",
      severity: "medium",
      summary: truncateText((worldFriction.guidance || []).join(" "), 180) || "Hay friccion de mundo activa.",
    });
  }
  if (weather?.staleByCurrentTime) {
    sources.push({
      key: "weather_stale",
      severity: "low",
      summary: "El clima requiere refresco antes de viajes o escenas exteriores largas.",
    });
  }
  if (sameRoom.length >= 2) {
    sources.push({
      key: "group_presence",
      severity: "low",
      summary: "Hay varios NPCs en escena; usar miradas, interrupciones y alianzas pequenas.",
    });
  }
  if (relationshipDynamics?.count > 0) {
    sources.push({
      key: "npc_relationship_dynamics",
      severity: "low",
      summary: "Hay relaciones NPC-NPC relevantes; los presentes deben reaccionar tambien entre ellos.",
    });
  }
  if (socialSaturatedIds.length > 0) {
    sources.push({
      key: "social_repetition",
      severity: "low",
      summary: "Hay interacciones sociales repetidas hoy; variar foco sin forzar deltas.",
    });
  }

  const highestSeverity = sources.some((source) => source.severity === "high")
    ? "high"
    : sources.some((source) => source.severity === "medium")
      ? "medium"
      : sources.length
        ? "low"
        : "quiet";
  const primarySource = sources[0] || null;
  const locationName = currentLocation?.name || gameState?.locationId || "la escena";
  const groupMode =
    sameRoom.length >= 3
      ? "small_group"
      : sameRoom.length === 2
        ? "two_npcs_present"
        : sameRoom.length === 1
          ? "one_on_one"
          : sameBuilding.length > 0
            ? "nearby_offscreen"
            : "solo_or_transit";
  const dramaticQuestion = primarySource
    ? `Que cambia ahora en ${locationName} por ${primarySource.key}?`
    : `Que detalle vivo de ${locationName} empuja la proxima decision de Lucas?`;
  const emotionalScene = buildEmotionalSceneDirector({
    currentLocation,
    sameRoom,
    highestSeverity,
    primarySource,
    satietyPercent,
    energyPercent,
    lifePercent,
    injuries,
    weather,
    relationshipDynamics,
  });

  return {
    schemaVersion: "dramatic_context_v1",
    outputContract: {
      narrativeFirst: true,
      hudRequired: true,
      hudPosition: "after_scene",
      hudPolicy:
        "Primero escena novelada con dialogo vivo; al final mantener HUD con dia/hora/lugar/vida/saciedad/energia/MP/dinero/evento/NPCs/cambios relevantes.",
      mechanicsBoundary:
        "La prosa dramatiza estado confirmado; no inventa rolls, EXP, dinero, loot, dano, curacion, relaciones ni cierre de eventos.",
      socialChangeDisplay:
        "En Cambios relevantes copiar displayLines de changes.npcRelationships con antes->despues y delta; nunca resumir cambios sociales solo como +N.",
    },
    sceneTension: {
      level: highestSeverity,
      sources: sources.slice(0, 7),
      dramaticQuestion,
    },
    styleDirectives: [
      "Abrir desde sensacion, gesto, interrupcion o presion concreta; evitar resumen plano si hay NPCs o tension.",
      "Usar microacciones y subtexto: respiracion, manos, miradas, tareas, silencios, objetos y reaccion del entorno.",
      "Construir escena con anzuelo, mascara, presion, grieta visible y salida; no saltar directo a resumen si hay respuesta emocional.",
      "La rutina puede ser breve, pero debe dejar una pequena consecuencia emocional, social o fisica si el estado lo permite.",
      "No convertir todo en exposicion; separar escena dramatica del HUD mecanico final.",
    ],
    dialogueDirectives: [
      "Si scene.dialogueSceneCapsules existe, usar esas capsulas como guia prioritaria para voz, gesto, presion, cadence/reactFirst y ejemplo de tono.",
      "Si dialogueDirector existe, el NPC responde primero al tono emocional de Lucas; despues al hecho. El dato mecanico exacto va en Cambios/HUD.",
      "No usar NPCs como manual de reglas, contrato, inventario o backend: convertir reglas en lenguaje humano, objeto visible, pausa o consecuencia practica.",
      "Aplicar dialogueProfile y emotionalProfile de cada NPC: ritmo, registro por confianza, temperatura emocional, subtexto visible, limites y movimientos.",
      "Cada linea de dialogo necesita intencion: medir, cuidar, presionar, ocultar, corregir, negociar, provocar o revelar algo permitido.",
      "En pedidos directos de Lucas, entrenamiento, conflicto o decision social, evitar resolver al NPC con una sola frase minima; usar 2-4 beats de dialogo/gesto si la escena lo permite.",
      "Si hay varios NPCs, alternar respuestas breves, interrupciones y silencios; no hacer que todos esperen turno de forma artificial.",
      "Si scene.relationshipDynamics trae pares relevantes, usar roces, alianzas, bromas o silencios entre NPCs sin revelar privateSubtext como conocimiento de Lucas.",
      "Respetar npcKnowledgeContext: certeza solo con fuente diegetica; inferencias deben sonar como duda, pregunta o rumor.",
      "Ningun NPC debe recitar HUD, numeros o reglas del backend salvo interfaz administrativa explicita.",
    ],
    emotionalScene,
    groupDynamics: {
      mode: groupMode,
      sameRoomNpcIds: visibleNpcIds.slice(0, 8),
      sameBuildingNpcIds: sameBuilding.map((npc) => npc.npcId).filter(Boolean).slice(0, 8),
      relationshipDynamicsAvailable: Boolean(relationshipDynamics?.count),
      relationshipPairCount: Number(relationshipDynamics?.count) || 0,
      guidance:
        groupMode === "solo_or_transit"
          ? "Sin NPC visible fuerte: usar lugar, clima, cuerpo de Lucas y objetivos abiertos para sostener interes."
          : "Los NPCs presentes tienen agenda propia; sus reacciones deben nacer de rol, personalidad, confianza y tarea actual.",
    },
    npcDialogueProfilesAvailable: toArray(nearbyNpcs).some((npc) => npc?.dialogueProfile?.schemaVersion === "dialogue_profile_v1"),
  };
}

function summarizeEvidence(evidence) {
  if (!evidence) return null;

  return {
    evidenceId: evidence.evidenceId,
    gameId: evidence.gameId || "isekai_lucas_main",
    characterId: evidence.characterId || "char_lucas",
    name: evidence.name,
    summary: truncateText(evidence.summary || "", 500),
    type: evidence.type || "other",
    status: evidence.status || "observed",
    holderType: evidence.holderType || "none",
    holderId: evidence.holderId || "",
    containerItemId: evidence.containerItemId || "",
    locationId: evidence.locationId || "",
    sourceEventId: evidence.sourceEventId || "",
    sourceMissionId: evidence.sourceMissionId || "",
    relatedEventIds: (evidence.relatedEventIds || []).slice(0, 8),
    relatedMissionIds: (evidence.relatedMissionIds || []).slice(0, 8),
    reportedToNpcIds: (evidence.reportedToNpcIds || []).slice(0, 8),
    visibleToNpcIds: (evidence.visibleToNpcIds || []).slice(0, 8),
    condition: evidence.condition || "",
    integrity: Number.isFinite(Number(evidence.integrity)) ? Number(evidence.integrity) : null,
    collectedDay: evidence.collectedDay || null,
    collectedTime: evidence.collectedTime || "",
    observations: (evidence.observations || []).slice(-4).map((observation) => ({
      day: observation.day || null,
      time: observation.time || "",
      locationId: observation.locationId || "",
      summary: truncateText(observation.summary || "", 300),
      byCharacterId: observation.byCharacterId || "",
      byNpcId: observation.byNpcId || "",
      certainty: observation.certainty || "unknown",
      tags: observation.tags || [],
    })),
    tags: evidence.tags || [],
  };
}

module.exports = {
  unique,
  toIntQuery,
  queryBoolean,
  buildCompactProfileContract,
  truncateText,
  timeToMinutes,
  isExpiredAt,
  isWeatherStale,
  summarizeStat,
  summarizeInventory,
  summarizeSkill,
  moneyBreakdown,
  summarizeLucasState,
  summarizeGameState,
  summarizeLocation,
  buildNpcVoiceProfile,
  buildNpcDialogueProfile,
  buildNpcDramaticRole,
  buildDialogueSceneCapsules,
  buildSceneNarrationContract,
  buildRuleLookupContract,
  summarizeNpcEmotionalProfile,
  summarizeNpcRelationship,
  buildSceneRelationshipDynamics,
  buildDramaticContext,
  summarizeNpc,
  summarizeNpcPresenceRef,
  summarizeNpcSocialLedger,
  summarizeMission,
  summarizeEventLog,
  summarizeNpcMemory,
  summarizeRumor,
  summarizeWorldEvent,
  summarizeCommitment,
  summarizeEvidence,
  summarizeWeather,
  buildWorldFrictionSummary,
  summarizeJobContract,
  summarizeCombatEncounter,
  missionActionState,
  missionExpirationState,
};
