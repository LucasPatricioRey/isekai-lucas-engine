try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Character = require("../models/Character");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcRelationship = require("../models/NpcRelationship");
const responseShaping = require("./responseShaping");

const SCENARIOS = [
  {
    id: "eddan_training_correction",
    label: "Eddan corrects dagger fundamentals",
    locationId: "loc_hoshimori_guild_patio",
    time: "09:40",
    prompt:
      "Lucas le pide a Eddan seguir practicando daga, pero quiere que lo corrija de verdad y sin sparring real.",
    sameRoomNpcIds: ["npc_eddan_rusk"],
    expectedNpcIds: ["npc_eddan_rusk"],
    expectedGroupMode: "one_on_one",
    minRelationshipPairs: 0,
    placeAnchorPattern: /polvo|cuero|entrenamiento|patio/i,
    npcAnchorPattern: /pies|funda|vara|correa|polvo|distancia/i,
    npcOverrides: {
      npc_eddan_rusk: {
        currentTask: "corrigiendo fundamentos de daga y distancia sin contacto real",
        availability: { status: "busy", reason: "en mitad de una correccion de entrenamiento" },
      },
    },
  },
  {
    id: "grulla_evening_group",
    label: "La Grulla Azul group service scene",
    locationId: "loc_hoshimori_grulla_azul_comedor",
    time: "21:05",
    prompt:
      "Lucas vuelve al comedor de La Grulla Azul al cierre y le pregunta a Yara si necesita ayuda, con Roberto y Fern cerca.",
    sameRoomNpcIds: ["npc_roberto_valen", "npc_yara_mils", "npc_fern"],
    expectedNpcIds: ["npc_roberto_valen", "npc_yara_mils", "npc_fern"],
    expectedGroupMode: "small_group",
    minRelationshipPairs: 3,
    placeAnchorPattern: /vajilla|madera|comida|servicio|conversaciones/i,
    npcAnchorPattern: /bandeja|taza|trapo|mesa|monedas|delantal|cocina/i,
    npcOverrides: {
      npc_roberto_valen: {
        currentTask: "cerrando servicio de noche y revisando cuentas",
        availability: { status: "busy", reason: "cerrando la sala sin dejar de mirar a sus trabajadores" },
      },
      npc_yara_mils: {
        currentLocationId: "loc_hoshimori_grulla_azul_comedor",
        currentTask: "recogiendo platos tarde y tratando de no equivocarse frente a Roberto",
        availability: { status: "busy", reason: "en servicio de cierre, visible en comedor" },
      },
      npc_fern: {
        currentLocationId: "loc_hoshimori_grulla_azul_comedor",
        currentTask: "ordenando tazas y suavizando el ritmo del cierre",
        availability: { status: "busy", reason: "de paso por el comedor durante cierre" },
      },
    },
  },
  {
    id: "guild_report_pressure",
    label: "Guild evidence and registration pressure",
    locationId: "loc_hoshimori_guild",
    time: "15:30",
    prompt:
      "Lucas pregunta a Garrick y Mara por el estado del registro y por el mechon gris reportado del borde del bosque.",
    sameRoomNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
    expectedNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
    expectedGroupMode: "two_npcs_present",
    minRelationshipPairs: 1,
    placeAnchorPattern: /papeles|sello|mostrador|carpetas|procedimiento/i,
    npcAnchorPattern: /papeles|sello|mostrador|carpetas|institucional/i,
    npcOverrides: {
      npc_garrick_thorne: {
        currentTask: "revisando evidencia parcial y riesgo de ruta del bosque",
        availability: { status: "available", reason: "en mostrador, pero midiendo riesgos antes de prometer algo" },
      },
      npc_mara_vell: {
        currentTask: "atendiendo registros y pruebas sin cerrar conclusiones incompletas",
        availability: { status: "busy", reason: "con archivos abiertos y sello pendiente" },
      },
    },
  },
  {
    id: "lucas_private_fatigue",
    label: "Solo fatigue scene in Lucas room",
    locationId: "loc_hoshimori_lucas_room",
    time: "23:10",
    prompt:
      "Lucas se queda solo en su habitacion al final del dia, cansado, con el asunto del bosque todavia abierto.",
    sameRoomNpcIds: [],
    expectedNpcIds: [],
    expectedGroupMode: "solo_or_transit",
    minRelationshipPairs: 0,
    placeAnchorPattern: /madera|manta|mochila|luz baja|posada/i,
    lucasStatusPatch: {
      energy: { current: 30, max: 100 },
      satiety: { current: 58, max: 100 },
    },
  },
];

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function plainClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function applyScenarioState(gameState, scenario) {
  const scenarioState = plainClone(gameState);
  scenarioState.locationId = scenario.locationId;
  scenarioState.time = scenario.time;

  if (scenario.lucasStatusPatch) {
    scenarioState.lucasStatus = {
      ...(scenarioState.lucasStatus || {}),
      ...scenario.lucasStatusPatch,
    };
  }

  return scenarioState;
}

function overrideNpcForScenario(npc, scenario) {
  const copy = plainClone(npc);
  const override = scenario.npcOverrides?.[copy.npcId] || {};
  copy.currentLocationId = override.currentLocationId || scenario.locationId;
  copy.currentTask = override.currentTask || copy.currentTask || "";
  copy.availability = override.availability || copy.availability || {
    status: "available",
    reason: `visible for C17 playtest scenario ${scenario.id}`,
  };
  return copy;
}

function compactNpcLine(npc) {
  const role = npc.dialogueProfile?.dramaticRole || {};
  return `${npc.name}: mask=${role.publicMask || "n/a"} | resistance=${role.resistanceMove || "n/a"}`;
}

async function buildScenarioCapsule({ gameState, lucas, locationsById, npcsById, relationships, scenario }) {
  const scenarioState = applyScenarioState(gameState, scenario);
  const currentLocation = locationsById.get(scenario.locationId);
  const scenarioNpcs = scenario.sameRoomNpcIds
    .map((npcId) => npcsById.get(npcId))
    .filter(Boolean)
    .map((npc) => responseShaping.summarizeNpc(overrideNpcForScenario(npc, scenario)));

  const npcPresence = {
    visible: scenarioNpcs,
    sameRoom: scenarioNpcs,
    sameBuilding: [],
  };
  const relationshipDynamics = responseShaping.buildSceneRelationshipDynamics({
    relationships,
    nearbyNpcs: scenarioNpcs,
    npcPresence,
  });
  const lucasSummary = responseShaping.summarizeLucasState(scenarioState, lucas, []);
  const dramaticContext = responseShaping.buildDramaticContext({
    gameState: responseShaping.summarizeGameState(scenarioState),
    lucasSummary,
    currentLocation: responseShaping.summarizeLocation(currentLocation),
    nearbyNpcs: scenarioNpcs,
    npcPresence,
    relationshipDynamics,
  });

  return {
    scenario,
    currentLocation,
    scenarioNpcs,
    relationshipDynamics,
    lucasSummary,
    dramaticContext,
  };
}

function validateNpcRoles(issues, scenario, scenarioNpcs) {
  const npcById = new Map(scenarioNpcs.map((npc) => [npc.npcId, npc]));

  for (const npcId of scenario.expectedNpcIds) {
    const npc = npcById.get(npcId);
    assertCondition(issues, `${scenario.id} includes expected NPC ${npcId}`, Boolean(npc));
    if (!npc) continue;

    const profile = npc.dialogueProfile || {};
    const role = profile.dramaticRole || {};
    const emotionalProfile = npc.emotionalProfile || {};

    assertCondition(
      issues,
      `${scenario.id} ${npc.name} has dialogue profile`,
      profile.schemaVersion === "dialogue_profile_v1"
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} has dramatic role`,
      role.schemaVersion === "npc_dramatic_role_v1"
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} has usable dialogue moves`,
      (profile.dialogueMoves || []).length >= 2,
      `${(profile.dialogueMoves || []).length} moves`
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} has visible tells`,
      (emotionalProfile.visibleTells || []).length >= 2,
      `${(emotionalProfile.visibleTells || []).length} tells`
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} role is not a flat one-liner`,
      Boolean(role.publicMask) &&
        Boolean(role.sceneWant) &&
        Boolean(role.hiddenPressure) &&
        Boolean(role.resistanceMove) &&
        Boolean(role.vulnerabilityTell) &&
        (role.beatLadder || []).length >= 4
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} object anchor fits scene`,
      scenario.npcAnchorPattern ? scenario.npcAnchorPattern.test(role.objectAnchor || "") : true,
      role.objectAnchor || ""
    );
    assertCondition(
      issues,
      `${scenario.id} ${npc.name} keeps private-thought boundary`,
      /No narrar pensamiento privado/.test(role.rule || "")
    );
  }
}

function validateScenarioCapsule(issues, capsule) {
  const { scenario, currentLocation, scenarioNpcs, relationshipDynamics, dramaticContext } = capsule;
  const emotionalScene = dramaticContext.emotionalScene || {};

  section(`C17 Scenario: ${scenario.id}`);
  console.log(`Prompt: ${scenario.prompt}`);
  console.log(`Location: ${currentLocation?.name || scenario.locationId}`);
  console.log(`NPCs: ${scenarioNpcs.map((npc) => npc.name).join(", ") || "(none)"}`);
  console.log(`Place anchor: ${emotionalScene.sensoryAnchors?.place || "n/a"}`);
  console.log(`Group mode: ${dramaticContext.groupDynamics?.mode}`);
  if (scenarioNpcs.length > 0) {
    for (const npc of scenarioNpcs) console.log(`Role: ${compactNpcLine(npc)}`);
  }

  assertCondition(issues, `${scenario.id} location exists`, Boolean(currentLocation));
  assertCondition(
    issues,
    `${scenario.id} dramaticContext schema exists`,
    dramaticContext.schemaVersion === "dramatic_context_v1"
  );
  assertCondition(
    issues,
    `${scenario.id} keeps narrative first and HUD final`,
    dramaticContext.outputContract?.narrativeFirst === true && dramaticContext.outputContract?.hudRequired === true
  );
  assertCondition(
    issues,
    `${scenario.id} emotional scene director exists`,
    emotionalScene.schemaVersion === "emotional_scene_director_v1"
  );
  assertCondition(
    issues,
    `${scenario.id} beat engine is present`,
    (emotionalScene.beatEngine || []).length >= 5 && (emotionalScene.beatEngine || []).some((line) => /Mascara/.test(line))
  );
  assertCondition(
    issues,
    `${scenario.id} blocks flat NPC replies`,
    /No una sola frase minima/.test(emotionalScene.dialogueShape?.noFlatReply || "")
  );
  assertCondition(
    issues,
    `${scenario.id} separates mechanics from prose`,
    /no mecanicas/.test(emotionalScene.boundary || "") &&
      /no inventa/.test(dramaticContext.outputContract?.mechanicsBoundary || "")
  );
  assertCondition(
    issues,
    `${scenario.id} group mode matches expected`,
    dramaticContext.groupDynamics?.mode === scenario.expectedGroupMode,
    dramaticContext.groupDynamics?.mode || ""
  );
  assertCondition(
    issues,
    `${scenario.id} relationship pairs meet expectation`,
    Number(relationshipDynamics.count || 0) >= scenario.minRelationshipPairs,
    String(relationshipDynamics.count || 0)
  );
  assertCondition(
    issues,
    `${scenario.id} place anchor fits scene`,
    scenario.placeAnchorPattern.test(emotionalScene.sensoryAnchors?.place || ""),
    emotionalScene.sensoryAnchors?.place || ""
  );

  if (scenario.expectedNpcIds.length === 0) {
    assertCondition(issues, `${scenario.id} has no same-room NPCs`, scenarioNpcs.length === 0);
    assertCondition(
      issues,
      `${scenario.id} solo scene still has body/place/social anchors`,
      Boolean(emotionalScene.sensoryAnchors?.body) &&
        Boolean(emotionalScene.sensoryAnchors?.place) &&
        Boolean(emotionalScene.sensoryAnchors?.social)
    );
  } else {
    assertCondition(
      issues,
      `${scenario.id} exposes NPC dialogue profiles`,
      dramaticContext.npcDialogueProfilesAvailable === true
    );
    validateNpcRoles(issues, scenario, scenarioNpcs);
  }

  const capsuleBytes = Buffer.byteLength(
    JSON.stringify({
      dramaticContext,
      nearbyNpcs: scenarioNpcs,
      relationshipDynamics,
    }),
    "utf8"
  );
  const maxCapsuleBytes = 18000 + scenarioNpcs.length * 8000;
  assertCondition(
    issues,
    `${scenario.id} scenario capsule stays compact`,
    capsuleBytes <= maxCapsuleBytes,
    `${capsuleBytes}/${maxCapsuleBytes} bytes`
  );
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:narrative-scene-playtest.");
  }

  await connectDB();

  const issues = [];
  const gameId = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
  const requiredLocationIds = SCENARIOS.map((scenario) => scenario.locationId);
  const requiredNpcIds = Array.from(new Set(SCENARIOS.flatMap((scenario) => scenario.sameRoomNpcIds)));
  const [gameState, lucas, locations, npcs, relationships] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    Character.findOne({ characterId: "char_lucas" }).lean(),
    Location.find({ locationId: { $in: requiredLocationIds } }).lean(),
    Npc.find({ npcId: { $in: requiredNpcIds } }).lean(),
    NpcRelationship.find({}).sort({ npcAId: 1, npcBId: 1 }).lean(),
  ]);

  section("C17 Narrative Scene Playtest Audit");
  console.log(`GameId: ${gameId}`);
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Live state is read only; scenarios are in-memory projections.`);

  assertCondition(issues, "live GameState exists", Boolean(gameState));
  assertCondition(issues, "Lucas character exists", Boolean(lucas));
  assertCondition(issues, "required locations exist", locations.length === requiredLocationIds.length, `${locations.length}/${requiredLocationIds.length}`);
  assertCondition(issues, "required NPCs exist", npcs.length === requiredNpcIds.length, `${npcs.length}/${requiredNpcIds.length}`);

  const locationsById = new Map(locations.map((location) => [location.locationId, location]));
  const npcsById = new Map(npcs.map((npc) => [npc.npcId, npc]));

  if (gameState && lucas) {
    for (const scenario of SCENARIOS) {
      const capsule = await buildScenarioCapsule({
        gameState,
        lucas,
        locationsById,
        npcsById,
        relationships,
        scenario,
      });
      validateScenarioCapsule(issues, capsule);
    }
  }

  await mongoose.disconnect();

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Narrative scene playtest audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("Narrative scene playtest audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("Narrative scene playtest audit failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
