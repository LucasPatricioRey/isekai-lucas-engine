try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; API checks need API_KEY from environment when protected.
}

const fs = require("fs");
const path = require("path");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const COMPACT_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-compact.json");
const ADMIN_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin.json");
const ADMIN_EXTRA_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin-extra.json");
const MATRIX_PATH = path.join(DOCS_DIR, "gpt-actions-operation-matrix.md");

const EXPECTED_STATE = {
  minDay: 10,
};

const EXPECTED_MONEY_COPPER =
  process.env.EXPECTED_MONEY_COPPER !== undefined ? Number(process.env.EXPECTED_MONEY_COPPER) : null;
const EXPECTED_MP_CURRENT =
  process.env.EXPECTED_MP_CURRENT !== undefined ? Number(process.env.EXPECTED_MP_CURRENT) : null;
const EXPECTED_ACTIVE_COMBAT_COUNT =
  process.env.EXPECTED_ACTIVE_COMBAT_COUNT !== undefined
    ? Number(process.env.EXPECTED_ACTIVE_COMBAT_COUNT)
    : null;

function endpoint(routePath) {
  return `${BASE_URL}${routePath}`;
}

async function request(routePath, options = {}) {
  const response = await fetch(endpoint(routePath), {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`${routePath} failed with HTTP ${response.status}`);
    error.response = data;
    throw error;
  }

  return data;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  if (!ok) issues.push(`${label}: got ${actual}, expected ${expected}`);
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectOperations(openapi) {
  const operations = [];
  for (const [routePath, item] of Object.entries(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (item[method]) operations.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return operations;
}

function summarizeGameState(context) {
  const gameState = context.context?.gameState || {};
  const lucas = context.context?.lucas || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: lucas.money?.totalCopper,
    mpCurrent: lucas.mp?.current,
    activeMissionIds: gameState.activeMissionIds || [],
  };
}

function collectOperationIds(openapi) {
  const operationIds = [];
  for (const pathItem of Object.values(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]?.operationId) operationIds.push(pathItem[method].operationId);
    }
  }
  return operationIds;
}

async function checkCompactEndpoints(issues) {
  const [
    context,
    characterState,
    fern,
    docs,
    pavoStock,
    missionBoard,
    routes,
    travelPreview,
    activityPreview,
    magicTechniques,
    skillPreview,
    magicPracticePreview,
    weather,
    activeCombats,
    socialImpact,
  ] = await Promise.all([
    request("/api/context/compact"),
    request("/api/characters/char_lucas/state"),
    request("/api/search/db?q=Fern"),
    request("/api/search/docs?q=romance"),
    request("/api/economy/shops/shop_pavo_food_stall/stock"),
    request("/api/missions/board"),
    request("/api/travel/routes"),
    request("/api/travel/preview", {
      method: "POST",
      body: JSON.stringify({
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_guild",
        conditions: {
          ignoreCurrentWeather: true,
          startTime: "12:40",
        },
      }),
    }),
    request("/api/needs/activity-cost/preview", {
      method: "POST",
      body: JSON.stringify({
        category: "viaje_caminata_suave",
        minutes: 20,
      }),
    }),
    request("/api/magic/techniques"),
    request("/api/progression/skills/preview", {
      method: "POST",
      body: JSON.stringify({
        skillId: "skill_mana",
        category: "practica_basica_1h_solo",
        expDelta: 4,
        currentEnergy: 80,
        modifiers: { aquaBlessing: true },
      }),
    }),
    request("/api/magic/practice/preview", {
      method: "POST",
      body: JSON.stringify({
        techniqueId: "technique_mana_breathing_basic",
        minutes: 30,
      }),
    }),
    request("/api/weather/current?regionId=region_hoshimori"),
    request("/api/combat/encounters/active"),
    request("/api/npcs/social/impact/preview", {
      method: "POST",
      body: JSON.stringify({
        npcId: "npc_yara_mils",
        actionSummary: "Lucas ayuda a Yara respetando su espacio durante el turno.",
        factors: {
          witnessedByNpc: true,
          mattersToNpc: true,
          fitsPersonality: true,
          helpedNpc: true,
          respectsBoundaries: true,
          practicalConsequence: true,
          withinExpectedDuty: true,
          importance: "meaningful",
        },
      }),
    }),
  ]);

  section("Compact Critical Endpoints");
  assertCondition(issues, "context/compact OK", context.ok === true && context.compact === true);
  const contextBytes = JSON.stringify(context).length;
  assertCondition(
    issues,
    "context/compact stays under GPT Actions response budget",
    contextBytes < 100000,
    `${contextBytes}/100000 bytes`
  );
  assertCondition(issues, "context/compact has socialLedgerToday", Array.isArray(context.context?.socialLedgerToday));
  assertCondition(
    issues,
    "context/compact exposes NPC social profiles",
    (context.context?.scene?.nearbyNpcs || []).some((npc) => npc.socialProfile?.values?.length > 0)
  );
  assertCondition(
    issues,
    "context/compact exposes effective relationship states",
    (context.context?.scene?.nearbyNpcs || []).some(
      (npc) => npc.relationshipState?.schemaVersion === "social_state_v1"
    )
  );
  assertCondition(
    issues,
    "context/compact exposes dramaticContext",
    context.context?.dramaticContext?.schemaVersion === "dramatic_context_v1"
  );
  assertCondition(
    issues,
    "context/compact dramaticContext keeps HUD required",
    context.context?.dramaticContext?.outputContract?.hudRequired === true
  );
  assertCondition(
    issues,
    "context/compact exposes emotional scene director",
    context.context?.dramaticContext?.emotionalScene?.schemaVersion === "emotional_scene_director_v1"
  );
  assertCondition(
    issues,
    "emotional scene director exposes beat engine",
    (context.context?.dramaticContext?.emotionalScene?.beatEngine || []).some((line) => /Mascara/.test(line))
  );
  assertCondition(
    issues,
    "context/compact exposes NPC dialogue profiles",
    (context.context?.scene?.nearbyNpcs || []).some(
      (npc) => npc.dialogueProfile?.schemaVersion === "dialogue_profile_v1"
    )
  );
  assertCondition(
    issues,
    "context/compact exposes NPC emotional profiles",
    (context.context?.scene?.nearbyNpcs || []).some(
      (npc) => npc.emotionalProfile?.schemaVersion === "emotional_profile_v1"
    )
  );
  assertCondition(
    issues,
    "context/compact exposes NPC emotional subtext in dialogue profiles",
    (context.context?.scene?.nearbyNpcs || []).some((npc) => npc.dialogueProfile?.emotionalSubtext?.rule)
  );
  assertCondition(
    issues,
    "context/compact exposes NPC dramatic roles",
    (context.context?.scene?.nearbyNpcs || []).some(
      (npc) => npc.dialogueProfile?.dramaticRole?.schemaVersion === "npc_dramatic_role_v1"
    )
  );
  assertCondition(
    issues,
    "context/compact exposes scene relationship dynamics",
    context.context?.scene?.relationshipDynamics?.schemaVersion === "scene_relationship_dynamics_v1"
  );
  assertCondition(
    issues,
    "dramaticContext points to emotionalProfile",
    (context.context?.dramaticContext?.dialogueDirectives || []).some((line) => /emotionalProfile/.test(line))
  );
  assertCondition(issues, "character state has HP", Boolean(characterState.state?.life?.max));
  assertCondition(issues, "character state has MP", Boolean(characterState.state?.mp?.max));
  assertCondition(issues, "search/db returns Fern", (fern.results?.npcs || []).length > 0);
  assertCondition(issues, "search/docs returns docs", (docs.results || []).length > 0);
  assertCondition(issues, "Pavo stock has rows", (pavoStock.stocks || []).length > 0);
  assertCondition(issues, "mission board returns a playable mission array", Array.isArray(missionBoard.missions));
  assertCondition(issues, "routes has rows", (routes.routes || []).length >= 20);
  assertEqual(issues, "travel preview Grulla->Guild minutes", travelPreview.preview?.timing?.finalMinutes, 20);
  assertEqual(issues, "travel preview satiety delta", travelPreview.preview?.biologicalCostPreview?.satietyDelta, -1);
  assertEqual(issues, "travel preview energy delta", travelPreview.preview?.biologicalCostPreview?.energyDelta, -2);
  assertEqual(issues, "activity preview satiety delta", activityPreview.preview?.totalDelta?.satiety, -1);
  assertEqual(issues, "activity preview energy delta", activityPreview.preview?.totalDelta?.energy, -2);
  assertCondition(issues, "magic techniques has entries", (magicTechniques.techniques || []).length >= 6);
  assertCondition(issues, "skill preview is dryRun", skillPreview.dryRun === true);
  assertEqual(issues, "skill preview applies Aqua to mana", skillPreview.preview?.validation?.effectiveExpDelta, 40);
  assertCondition(issues, "magic practice preview can practice", magicPracticePreview.preview?.canPractice === true);
  assertCondition(
    issues,
    "magic practice preview is dryRun",
    magicPracticePreview.preview?.projectedMp?.willMutate === false
  );
  assertCondition(issues, "weather current exists", Boolean(weather.weather?.weatherId));
  assertCondition(issues, "context weather is current", context.context?.weather?.staleByCurrentTime !== true);
  assertCondition(issues, "social impact preview suggests patch", Boolean(socialImpact.preview?.suggestedPatch?.npcId));
  assertCondition(
    issues,
    "social impact preview suggests familiarity",
    (socialImpact.preview?.suggestedPatch?.familiarityDelta || 0) >= 1
  );
  assertCondition(issues, "social impact preview has actionType", Boolean(socialImpact.preview?.suggestedPatch?.actionType));
  assertCondition(issues, "social impact preview has daily caps", Boolean(socialImpact.preview?.evaluation?.caps?.daily));
  assertCondition(
    issues,
    "social impact preview projects relationship state",
    socialImpact.preview?.evaluation?.projectedRelationship?.relationshipState?.schemaVersion === "social_state_v1"
  );
  assertCondition(
    issues,
    "social impact preview has NPC profile fit",
    Boolean(socialImpact.preview?.evaluation?.socialProfile?.profileFit)
  );
  assertCondition(issues, "social impact preview is dryRun", socialImpact.dryRun === true);

  const gameState = summarizeGameState(context);
  const activeCombatList = activeCombats.encounters || [];
  const currentDailyEvent =
    context.context?.mainEvent ||
    context.context?.currentDailyEvent ||
    (context.context?.activeEvents || []).find(
      (event) =>
        event.countsAsMainEvent !== false &&
        (!event.eventLayer || event.eventLayer === "main_event") &&
        (event.tags || []).includes("daily_event")
    );
  const dailyEventRequired = timeToMinutes(gameState.time) >= timeToMinutes("06:00");
  assertCondition(
    issues,
    "main daily event exposed after morning begins",
    !dailyEventRequired || Boolean(currentDailyEvent?.eventId),
    currentDailyEvent?.eventId || ""
  );
  assertCondition(
    issues,
    "daily event exposes social consequence rules",
    !currentDailyEvent?.eventId ||
      (currentDailyEvent.effects || []).some((effect) => effect.type === "social_consequence_rules"),
    currentDailyEvent?.eventId || ""
  );
  if (currentDailyEvent?.status === "scheduled") {
    assertCondition(
      issues,
      "scheduled daily event is in scheduledEvents",
      (context.context?.scheduledEvents || []).some((event) => event.eventId === currentDailyEvent.eventId),
      currentDailyEvent.eventId
    );
  }
  if (currentDailyEvent?.status === "active") {
    assertCondition(
      issues,
      "active daily event is in activeEvents",
      (context.context?.activeEvents || []).some((event) => event.eventId === currentDailyEvent.eventId),
      currentDailyEvent.eventId
    );
  }

  section("Canon State");
  console.log(
    JSON.stringify(
      {
        gameState,
        activeCombatCount: activeCombatList.length,
      },
      null,
      2
    )
  );

  assertCondition(issues, "day is playable canon", gameState.currentDay >= EXPECTED_STATE.minDay, String(gameState.currentDay));
  assertCondition(issues, "time has HH:MM format", /^([01]\d|2[0-3]):[0-5]\d$/.test(gameState.time || ""), gameState.time);
  assertCondition(issues, "locationId exists", Boolean(gameState.locationId), gameState.locationId);
  if (EXPECTED_MONEY_COPPER === null) {
    assertCondition(issues, "moneyCopper is non-negative number", Number.isFinite(gameState.moneyCopper) && gameState.moneyCopper >= 0, String(gameState.moneyCopper));
  } else {
    assertEqual(issues, "moneyCopper", gameState.moneyCopper, EXPECTED_MONEY_COPPER);
  }

  if (EXPECTED_MP_CURRENT === null) {
    assertCondition(issues, "MP current is non-negative number", Number.isFinite(gameState.mpCurrent) && gameState.mpCurrent >= 0, String(gameState.mpCurrent));
  } else {
    assertEqual(issues, "MP current", gameState.mpCurrent, EXPECTED_MP_CURRENT);
  }

  assertCondition(issues, "activeMissionIds is array", Array.isArray(gameState.activeMissionIds), String(gameState.activeMissionIds?.length || 0));
  if (EXPECTED_ACTIVE_COMBAT_COUNT === null) {
    assertCondition(issues, "active combat count is non-negative", activeCombatList.length >= 0, String(activeCombatList.length));
  } else {
    assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_ACTIVE_COMBAT_COUNT);
  }
}

async function main() {
  const issues = [];

  console.log("GPT Builder compact readiness audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: compact OpenAPI + read-only/preview endpoint checks.");

  section("Files");
  for (const filePath of [COMPACT_OPENAPI_PATH, ADMIN_OPENAPI_PATH, ADMIN_EXTRA_OPENAPI_PATH, MATRIX_PATH]) {
    assertCondition(issues, path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"), fs.existsSync(filePath));
  }

  const compact = readJson(COMPACT_OPENAPI_PATH);
  const admin = readJson(ADMIN_OPENAPI_PATH);
  const adminExtra = readJson(ADMIN_EXTRA_OPENAPI_PATH);
  const compactOps = collectOperations(compact);
  const adminOps = collectOperations(admin);
  const adminExtraOps = collectOperations(adminExtra);
  const compactOperationIds = new Set(collectOperationIds(compact));
  const adminExtraDuplicates = collectOperationIds(adminExtra).filter((operationId) =>
    compactOperationIds.has(operationId)
  );

  section("Schema Shape");
  assertCondition(issues, "compact operation count within limit", compactOps.length <= 30, String(compactOps.length));
  assertCondition(issues, "compact includes context/compact", compactOps.includes("GET /api/context/compact"));
  assertCondition(issues, "compact excludes context/full", !compactOps.includes("GET /api/context/full"));
  assertCondition(issues, "compact includes character state", compactOps.includes("GET /api/characters/{characterId}/state"));
  assertCondition(issues, "compact has missionPatch", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.missionPatch));
  assertCondition(issues, "compact has evidencePatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.evidencePatches));
  assertCondition(issues, "compact has skillPatch", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.skillPatch));
  assertCondition(issues, "compact has magicPractice", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.magicPractice));
  assertCondition(issues, "compact has magicPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.magicPatches));
  assertCondition(issues, "compact has shopStockPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.shopStockPatches));
  assertCondition(issues, "compact has npcMemoryPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.npcMemoryPatches));
  assertCondition(issues, "compact has npcRelationshipPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.npcRelationshipPatches));
  assertCondition(issues, "compact has factionReputationPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.factionReputationPatches));
  assertCondition(issues, "compact has actionFamily", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.actionFamily));
  assertCondition(issues, "compact has jobContractPatch", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.jobContractPatch));
  assertCondition(
    issues,
    "compact travel preview supports multi-segment pathfinding",
    Boolean(compact.paths?.["/api/travel/preview"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties?.allowMultiSegment)
  );
  assertCondition(issues, "compact includes social impact preview", compactOps.includes("POST /api/npcs/social/impact/preview"));
  assertCondition(issues, "compact applyTurn is non-consequential for fluid gameplay", compact.paths?.["/api/turn/apply"]?.post?.["x-openai-isConsequential"] === false);
  assertCondition(issues, "compact completeJobShift is non-consequential for fluid gameplay", compact.paths?.["/api/jobs/shifts/{shiftId}/complete"]?.post?.["x-openai-isConsequential"] === false);
  assertCondition(
    issues,
    "compact ApplyTurnRequest is strict",
    compact.components?.schemas?.ApplyTurnRequest?.additionalProperties === false
  );
  assertCondition(
    issues,
    "compact skillPatch requires category and reason",
    compact.components?.schemas?.SkillPatchItem?.required?.includes("category") &&
      compact.components?.schemas?.SkillPatchItem?.required?.includes("reason")
  );
  assertCondition(
    issues,
    "compact skill preview has usable request body",
    Boolean(
      compact.paths?.["/api/progression/skills/preview"]?.post?.requestBody?.content?.["application/json"]?.schema
    ) &&
      ["skillId", "expDelta", "category"].every((field) =>
        compact.components?.schemas?.PreviewSkillProgressionRequest?.required?.includes(field)
      )
  );
  assertCondition(
    issues,
    "compact magic practice preview has usable request body",
    Boolean(
      compact.paths?.["/api/magic/practice/preview"]?.post?.requestBody?.content?.["application/json"]?.schema
    ) &&
      ["techniqueId", "minutes"].every((field) =>
        compact.components?.schemas?.PreviewMagicPracticeRequest?.required?.includes(field)
      ) &&
      Boolean(compact.components?.schemas?.PreviewMagicPracticeRequest?.properties?.modifiers)
  );
  assertCondition(
    issues,
    "compact magicPractice apply item is usable",
    Boolean(compact.components?.schemas?.MagicPracticeApplyItem) &&
      ["techniqueId", "minutes", "reason"].every((field) =>
        compact.components?.schemas?.MagicPracticeApplyItem?.required?.includes(field)
      )
  );
  assertCondition(
    issues,
    "compact missionPatch supports formal completion",
    ["verify", "complete", "fail", "expire"].every((op) =>
      compact.components?.schemas?.MissionPatchItem?.properties?.op?.enum?.includes(op)
    )
  );
  assertCondition(
    issues,
    "compact supports event progress patches",
    Boolean(compact.components?.schemas?.WorldEventPatchItem?.properties?.progress)
  );
  assertCondition(issues, "compact excludes checkpoint list", !compact.paths?.["/api/checkpoints"]?.get);
  assertCondition(issues, "compact excludes checkpoint create", !compact.paths?.["/api/checkpoints"]?.post);
  assertCondition(issues, "compact excludes rollback", !compact.paths?.["/api/checkpoints/{checkpointId}/rollback"]);
  assertCondition(issues, "compact excludes direct accept mission", !compact.paths?.["/api/missions/{missionId}/accept"]);
  assertCondition(issues, "compact excludes direct report mission", !compact.paths?.["/api/missions/{missionId}/report"]);
  assertCondition(issues, "admin schema has only GET operations", adminOps.every((operation) => operation.startsWith("GET ")));
  assertEqual(issues, "admin extra operation count", adminExtraOps.length, 11);
  assertCondition(issues, "admin extra has only GET operations", adminExtraOps.every((operation) => operation.startsWith("GET ")));
  assertCondition(issues, "admin extra includes state audit", adminExtraOps.includes("GET /api/context/audit-state"));
  assertCondition(issues, "admin extra includes world event list", adminExtraOps.includes("GET /api/world/events"));
  assertCondition(issues, "admin extra includes world event detail", adminExtraOps.includes("GET /api/world/events/{eventId}"));
  assertCondition(issues, "admin extra operationIds do not duplicate compact", adminExtraDuplicates.length === 0, adminExtraDuplicates.join(", "));

  await checkCompactEndpoints(issues);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("GPT compact readiness audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("GPT compact readiness audit OK. No state was mutated.");
}

main().catch((error) => {
  console.error("GPT compact readiness audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});
