const fs = require("fs");

function patchFile(filePath, patchFn) {
  let text = fs.readFileSync(filePath, "utf8");
  const next = patchFn(text);
  fs.writeFileSync(filePath, next, "utf8");
}

/**
 * 1) searchController: agregar EnemyTemplate y CombatEncounter a /api/search/db
 */
patchFile("src/controllers/searchController.js", (text) => {
  if (!text.includes('const EnemyTemplate = require("../models/EnemyTemplate");')) {
    text = text.replace(
      'const Faction = require("../models/Faction");',
      'const Faction = require("../models/Faction");\nconst EnemyTemplate = require("../models/EnemyTemplate");\nconst CombatEncounter = require("../models/CombatEncounter");'
    );
  }

  if (!text.includes("enemyTemplates,")) {
    text = text.replace(
      `    factions,
  ] = await Promise.all([`,
      `    factions,
    enemyTemplates,
    combatEncounters,
  ] = await Promise.all([`
    );

    text = text.replace(
      `    Faction.find({
      $or: [
        { factionId: regex },
        { name: regex },
        { type: regex },
        { goals: regex },
        { knownFactsAboutLucas: regex },
      ],
    }).limit(10).lean(),
  ]);`,
      `    Faction.find({
      $or: [
        { factionId: regex },
        { name: regex },
        { type: regex },
        { goals: regex },
        { knownFactsAboutLucas: regex },
      ],
    }).limit(10).lean(),

    EnemyTemplate.find({
      $or: [
        { enemyId: regex },
        { name: regex },
        { type: regex },
        { dangerLevel: regex },
        { rankHint: regex },
        { behavior: regex },
        { zones: regex },
        { signals: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    CombatEncounter.find({
      $or: [
        { encounterId: regex },
        { enemyId: regex },
        { enemyName: regex },
        { status: regex },
        { locationId: regex },
      ],
    }).limit(10).lean(),
  ]);`
    );

    text = text.replace(
      `      factions,
    },
  });`,
      `      factions,
      enemyTemplates,
      combatEncounters,
    },
  });`
    );
  }

  return text;
});

/**
 * 2) contextController: agregar activeCombatEncounters a context/full
 */
patchFile("src/controllers/contextController.js", (text) => {
  if (!text.includes('const CombatEncounter = require("../models/CombatEncounter");')) {
    text = text.replace(
      'const RoutineOverride = require("../models/RoutineOverride");',
      'const RoutineOverride = require("../models/RoutineOverride");\nconst CombatEncounter = require("../models/CombatEncounter");'
    );
  }

  if (!text.includes("activeCombatEncounters")) {
    text = text.replace(
      `      routineOverrides,
    ] = await Promise.all([`,
      `      routineOverrides,
      activeCombatEncounters,
    ] = await Promise.all([`
    );

    text = text.replace(
      `      RoutineOverride.find({
        npcId: { $in: nearbyNpcIds },
        day: gameState.currentDay,
        status: { $in: ["scheduled", "active"] },
      })
        .sort({ timeStart: 1 })
        .limit(30)
        .lean(),
    ]);`,
      `      RoutineOverride.find({
        npcId: { $in: nearbyNpcIds },
        day: gameState.currentDay,
        status: { $in: ["scheduled", "active"] },
      })
        .sort({ timeStart: 1 })
        .limit(30)
        .lean(),

      CombatEncounter.find({
        gameId,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);`
    );

    text = text.replace(
      `        routineOverrides,
        recentEventLogs,
        coherenceWarnings: [],`,
      `        routineOverrides,
        activeCombatEncounters,
        recentEventLogs,
        coherenceWarnings: [],`
    );
  }

  return text;
});

/**
 * 3) combatService/controller/routes: endpoint combates activos
 */
patchFile("src/services/combatService.js", (text) => {
  if (!text.includes("async function listActiveEncounters")) {
    text = text.replace(
      `async function getEncounter(encounterId) {`,
      `async function listActiveEncounters({ gameId = "isekai_lucas_main" } = {}) {
  return CombatEncounter.find({
    gameId,
    status: "active",
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function getEncounter(encounterId) {`
    );

    text = text.replace(
      `  startEncounter,
  getEncounter,
  applyCombatRound,`,
      `  startEncounter,
  listActiveEncounters,
  getEncounter,
  applyCombatRound,`
    );
  }

  return text;
});

patchFile("src/controllers/combatController.js", (text) => {
  if (!text.includes("listActiveEncounters")) {
    text = text.replace(
      `  startEncounter,
  getEncounter,
  applyCombatRound,`,
      `  startEncounter,
  listActiveEncounters,
  getEncounter,
  applyCombatRound,`
    );

    text = text.replace(
      `async function getEncounterController(req, res) {`,
      `async function listActiveEncountersController(req, res) {
  try {
    const encounters = await listActiveEncounters({
      gameId: req.query.gameId || "isekai_lucas_main",
    });

    return res.json({
      ok: true,
      encounters,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getEncounterController(req, res) {`
    );

    text = text.replace(
      `  startEncounterController,
  getEncounterController,
  applyCombatRoundController,`,
      `  startEncounterController,
  listActiveEncountersController,
  getEncounterController,
  applyCombatRoundController,`
    );
  }

  return text;
});

patchFile("src/routes/combatRoutes.js", (text) => {
  if (!text.includes('router.get("/encounters/active"')) {
    text = text.replace(
      `router.post("/encounters/start", requireApiKey, startEncounterController);
router.get("/encounters/:encounterId", requireApiKey, getEncounterController);`,
      `router.post("/encounters/start", requireApiKey, startEncounterController);
router.get("/encounters/active", requireApiKey, listActiveEncountersController);
router.get("/encounters/:encounterId", requireApiKey, getEncounterController);`
    );

    text = text.replace(
      `  startEncounterController,
  getEncounterController,
  applyCombatRoundController,`,
      `  startEncounterController,
  listActiveEncountersController,
  getEncounterController,
  applyCombatRoundController,`
    );
  }

  return text;
});

/**
 * 4) smoke test: probar combates activos
 */
patchFile("src/utils/smokeTestRender.js", (text) => {
  if (!text.includes("/api/combat/encounters/active")) {
    text = text.replace(
      `  const combatEnemies = await request("/api/combat/enemies");
  if (!combatEnemies.ok) throw new Error("combat enemies fallo");
  if (!Array.isArray(combatEnemies.enemies)) throw new Error("combat enemies no devolvio enemies");
  console.log("OK /api/combat/enemies");`,
      `  const combatEnemies = await request("/api/combat/enemies");
  if (!combatEnemies.ok) throw new Error("combat enemies fallo");
  if (!Array.isArray(combatEnemies.enemies)) throw new Error("combat enemies no devolvio enemies");
  console.log("OK /api/combat/enemies");

  const activeCombats = await request("/api/combat/encounters/active");
  if (!activeCombats.ok) throw new Error("combat active encounters fallo");
  if (!Array.isArray(activeCombats.encounters)) throw new Error("combat active encounters no devolvio encounters");
  console.log("OK /api/combat/encounters/active");`
    );
  }

  return text;
});

console.log("Final hardening aplicado: search, context, active combat endpoint y smoke.");
