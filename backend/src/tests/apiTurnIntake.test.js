const { after, before, describe, it } = require("node:test");

const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const EventLog = require("../models/EventLog");
const {
  assert,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");
const { classifyTurn } = require("../services/turnIntakeService");

let tempGameId = "";
let tempLocationId = "";
let tempNpcId = "";

async function cleanupFixture() {
  if (!tempGameId) return;
  await Promise.all([
    GameState.deleteMany({ gameId: tempGameId }),
    Location.deleteMany({ locationId: tempLocationId }),
    Npc.deleteMany({ npcId: tempNpcId }),
    NpcMemory.deleteMany({ npcId: tempNpcId }),
    KnowledgeRecord.deleteMany({ gameId: tempGameId }),
    EventLog.deleteMany({ gameId: tempGameId }),
  ]);
  tempGameId = "";
  tempLocationId = "";
  tempNpcId = "";
}

async function createFixture() {
  await cleanupFixture();
  const suffix = Date.now();
  tempGameId = `test_turn_intake_${suffix}`;
  tempLocationId = `loc_test_turn_intake_${suffix}`;
  tempNpcId = `npc_test_lira_${suffix}`;

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for turn intake tests.");

  const gameState = {
    ...base,
    _id: undefined,
    gameId: tempGameId,
    currentDay: 19,
    time: "12:00",
    block: "Mediod\u00eda",
    locationId: tempLocationId,
    activeEventIds: [],
    activeMissionIds: [],
    flags: {},
  };
  delete gameState.createdAt;
  delete gameState.updatedAt;

  await GameState.create(gameState);
  await Location.create({
    locationId: tempLocationId,
    name: "Sala social de prueba",
    type: "inn_room",
    regionId: "region_hoshimori",
    dangerLevel: "safe",
    visibleNpcIds: [tempNpcId],
    probableNpcIds: [],
    tags: ["testSuite"],
  });
  await Npc.create({
    npcId: tempNpcId,
    name: "Lira Test",
    role: "mesera de prueba",
    currentLocationId: tempLocationId,
    currentTask: "ordenando tazas",
    availability: {
      status: "available",
      reason: "",
    },
    routineBase: [
      {
        timeStart: "06:00",
        timeEnd: "12:00",
        locationId: tempLocationId,
        task: "trabajo de sala y preparacion",
      },
      {
        timeStart: "12:00",
        timeEnd: "21:30",
        locationId: tempLocationId,
        task: "atencion de sala y cierre menor",
      },
      {
        timeStart: "21:30",
        timeEnd: "06:00",
        locationId: tempLocationId,
        task: "descansando",
      },
    ],
    personality: ["prudente", "observadora"],
    speechStyle: "frases breves, baja la voz antes de contradecir",
    values: ["respeto por el trabajo"],
    tolerates: ["silencios incomodos"],
    rejects: ["presion publica"],
    relationshipWithLucas: {
      trust: 31,
      familiarity: 18,
      respect: 22,
      affection: 5,
      suspicion: 4,
      fear: 0,
      jealousy: 0,
      socialDebt: 0,
    },
    socialProfile: {
      boundaries: ["no exponerla frente a clientes"],
    },
    emotionalProfile: {
      defaultMood: "reservada, atenta a no estorbar",
      coreDrives: ["hacer bien su tarea"],
      coreFears: ["quedar en evidencia"],
      visibleTells: ["aprieta el borde de una taza cuando duda"],
      contradiction: "quiere ayudar, pero teme llamar la atencion",
    },
    flags: {
      dialogueDirector: {
        schemaVersion: "npc_dialogue_director_v1",
        cadence: "corta las frases cuando hay gente cerca",
        emotionalRule: "responde primero al gesto de respeto o presion",
        reactFirst: "mide si Lucas la expone antes de contestar",
        sampleBeats: ["mira la taza antes de responder"],
        avoid: ["no sonar confiada de golpe"],
      },
    },
  });
  await NpcMemory.create({
    memoryId: `mem_${tempNpcId}_${suffix}`,
    npcId: tempNpcId,
    fact: "Lucas saludo a Lira con calma en una escena de prueba.",
    summary: "Lucas puede ser cuidadoso con el espacio de Lira.",
    sourceType: "saw",
    certainty: "confirmed",
    emotionalWeight: "low",
    privacyLevel: "private",
    canShare: false,
    createdDay: 19,
    createdTime: "11:00",
    importance: "normal",
    tags: ["testSuite"],
  });
}

describe("turn intake API", () => {
  before(startApi);
  after(async () => {
    await cleanupFixture();
    await stopApi();
  });

  it("returns a social read-only packet for simple NPC conversation", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas saluda a Lira Test.",
      aiClassification: {
        intent: "social",
        domains: ["social"],
      },
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.readOnly, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "narrateOnly");
    assert.equal(response.data.narratorPacket.packetProfile, "social_scene");
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.equal(response.data.narratorPacket.socialPacket.targetPresence.canNarrateDirectly, true);
    assert.equal(response.data.narratorPacket.socialPacket.mutationBoundary.includes("No modificar"), true);
    assert.equal(response.data.directorPacket.schemaVersion, "turn_director_readonly_v1");
    assert.equal(response.data.directorPacket.actionPolicy.gptShouldNotCall.includes("getNpcFull"), true);
  });

  it("keeps calm NPC comments on the social read-only route without treating location nouns as travel", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le hace un comentario tranquilo a Lira Test sobre lo silenciosa que quedo la posada.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "narrateOnly");
    assert.equal(response.data.route.domains.includes("travel"), false);
    assert.equal(response.data.narratorPacket.packetProfile, "social_scene");
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.ok(
      response.data.narratorPacket.displayBundle.stateLines.some((line) =>
        line === "NPCs visibles/cerca: Lira Test."
      )
    );
  });

  it("classifies simple Roberto questions as social read-only instead of work fallback", () => {
    const route = classifyTurn({
      text: "Lucas le pregunta a Roberto si todavia queda mucho por cerrar.",
    });

    assert.equal(route.intent, "social_scene");
    assert.equal(route.supported, true);
    assert.equal(route.needsMutation, false);
    assert.equal(route.suggestedOperation, "narrateOnly");
    assert.equal(route.domains.includes("work"), false);
  });

  it("classifies NPC work-topic questions as social read-only", () => {
    const route = classifyTurn({
      text: "Lucas le pregunta a Joren Pell si siempre trabaja hasta tan tarde.",
    });

    assert.equal(route.intent, "social_scene");
    assert.deepEqual(route.domains, ["social"]);
    assert.equal(route.supported, true);
    assert.equal(route.needsMutation, false);
    assert.equal(route.suggestedOperation, "narrateOnly");
  });

  it("keeps labor permission requests out of social read-only intake", () => {
    const route = classifyTurn({
      text: "Lucas le pregunta a Roberto si puede trabajar mañana durante el turno.",
    });

    assert.equal(route.intent, "social");
    assert.equal(route.supported, false);
    assert.equal(route.suggestedOperation, "getCompactContext");
  });

  it("returns a resolver request for partial work instead of fallback tool hunting", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas se incorpora al turno de tarde, trabaja 45 minutos con intensidad normal y evita seguir hablando de la tardanza.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.readOnly, true);
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, true);
    assert.equal(response.data.route.suggestedOperation, "resolveTurn");
    assert.equal(response.data.directorPacket.mode, "resolver_ready");
    assert.equal(response.data.resolverPacket.resolverRequest.actionFamily, "job_shift");
    assert.equal(response.data.resolverPacket.resolverRequest.sequence.length, 1);
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[0].type, "work_segment");
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[0].minutes, 45);
    assert.equal(response.data.directorPacket.actionPolicy.gptShouldCall.includes("resolveTurn"), true);
    assert.equal(response.data.directorPacket.actionPolicy.gptShouldNotCall.includes("getCompactContext"), true);
  });

  it("returns a resolver request for rest plus urgent travel", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas dedica 10 minutos a descansar, despues vuelve corriendo a toda velocidad a la posada.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.suggestedOperation, "resolveTurn");
    assert.deepEqual(
      response.data.resolverPacket.resolverRequest.sequence.map((step) => step.type),
      ["rest", "travel"]
    );
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[0].minutes, 10);
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[1].toLocationId, "loc_hoshimori_grulla_azul");
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[1].pace, "full_speed");
  });

  it("allows simple travel to the guild even though guild is a mission-adjacent word", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas camina al gremio.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.suggestedOperation, "resolveTurn");
    assert.equal(response.data.resolverPacket.resolverRequest.actionFamily, "travel");
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[0].type, "travel");
    assert.equal(response.data.resolverPacket.resolverRequest.sequence[0].toLocationId, "loc_hoshimori_guild");
  });

  it("does not build a common resolver request for magic practice", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas descansa 10 minutos y practica meditacion de mana durante una hora.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.supported, false);
    assert.equal(response.data.route.suggestedOperation, "resolveTurn_or_existing_flow");
    assert.equal(response.data.resolverPacket, undefined);
  });

  it("returns a social packet for simple questions about a visible NPC current task", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le pregunta a Lira Test que esta haciendo.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "narrateOnly");
    assert.equal(response.data.narratorPacket.packetProfile, "social_scene");
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
  });

  it("returns a social packet for NPC work-topic questions without getNpcFull fallback", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le pregunta a Lira Test si siempre trabaja hasta tan tarde.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.deepEqual(response.data.route.domains, ["social"]);
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "narrateOnly");
    assert.equal(response.data.narratorPacket.packetProfile, "social_scene");
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.equal(response.data.narratorPacket.socialPacket.questionContext.type, "work_pattern");
    assert.equal(
      response.data.narratorPacket.socialPacket.questionContext.routineBrief.typicalStart.time,
      "06:00"
    );
  });

  it("resolves continuity social schedule questions without naming the NPC", async () => {
    await createFixture();
    await EventLog.create({
      logId: `log_${tempGameId}_latest_social`,
      gameId: tempGameId,
      day: 19,
      timeStart: "11:55",
      timeEnd: "12:00",
      locationId: tempLocationId,
      type: "social",
      summary: "Lucas converso con Lira Test en voz baja.",
      involvedNpcIds: [tempNpcId],
      visibility: "private",
      source: "player_action",
      tags: ["social"],
    });

    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "y si tuvieras que decirme un horario, a que hora arrancas a trabajar?",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.equal(response.data.directorPacket.backendResolved.continuityTargetNpcId, tempNpcId);
    assert.match(response.data.directorPacket.backendResolved.continuitySource, /latestSocialLog/);
    assert.equal(response.data.directorPacket.questionContext.type, "routine_schedule");
    assert.equal(response.data.directorPacket.questionContext.routineBrief.typicalStart.time, "06:00");
    assert.equal(response.data.directorPacket.actionPolicy.gptShouldNotCall.includes("getCompactContext"), true);
  });

  it("accepts explicit lastTargetNpcId for continuity questions", async () => {
    await createFixture();
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "a que hora arrancas a trabajar normalmente?",
      lastTargetNpcId: tempNpcId,
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.equal(response.data.directorPacket.backendResolved.continuitySource, "request.lastTargetNpcId");
    assert.equal(response.data.directorPacket.questionContext.routineBrief.typicalStart.time, "06:00");
  });

  it("allows read-only microtalk with a nearby probable NPC in the current scene scope", async () => {
    await createFixture();
    await Location.updateOne(
      { locationId: tempLocationId },
      { $set: { visibleNpcIds: [], probableNpcIds: [tempNpcId] } }
    );
    await Npc.updateOne({ npcId: tempNpcId }, { $set: { currentLocationId: "" } });

    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le pregunta a Lira Test si todavia queda mucho por cerrar.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "narrateOnly");
    assert.equal(response.data.narratorPacket.socialPacket.targetNpc.name, "Lira Test");
    assert.equal(response.data.narratorPacket.socialPacket.targetPresence.scope, "nearby_probable");
    assert.equal(response.data.narratorPacket.socialPacket.targetPresence.canNarrateDirectly, true);
  });

  it("does not keep the scene in a private room after a latest log says Lucas came downstairs", async () => {
    await createFixture();
    await EventLog.create({
      logId: `log_${tempGameId}_downstairs`,
      gameId: tempGameId,
      day: 19,
      timeStart: "22:10",
      locationId: tempLocationId,
      type: "social",
      summary: "Lucas bajo desde su cuarto para buscar a Lira Test y conversa un rato en voz baja.",
      involvedNpcIds: [tempNpcId],
      visibility: "private",
      source: "player_action",
    });

    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le hace un comentario tranquilo a Lira Test sobre lo silenciosa que quedo la posada.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.narratorPacket.state.narrativeLocation.privacy, "location_scope");
    assert.equal(
      response.data.narratorPacket.state.narrativeLocation.displayName,
      "Sala social de prueba"
    );
    assert.equal(response.data.narratorPacket.socialPacket.targetPresence.canNarrateDirectly, true);
  });

  it("does not infer private room from stale room logs after the clock has advanced", async () => {
    await createFixture();
    await GameState.updateOne({ gameId: tempGameId }, { $set: { time: "22:10", block: "Noche" } });
    await EventLog.create({
      logId: `log_${tempGameId}_stale_room`,
      gameId: tempGameId,
      day: 19,
      timeStart: "20:30",
      timeEnd: "21:55",
      locationId: tempLocationId,
      type: "magic_practice",
      summary: "Lucas sube a su cuarto, cierra la puerta y practica meditacion de mana acostado en la cama.",
      visibility: "private",
      source: "player_action",
    });

    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le hace un comentario tranquilo a Lira Test sobre lo silenciosa que quedo la posada.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.intent, "social_scene");
    assert.equal(response.data.route.supported, true);
    assert.equal(response.data.narratorPacket.state.narrativeLocation.privacy, "location_scope");
    assert.equal(response.data.narratorPacket.socialPacket.targetPresence.canNarrateDirectly, true);
  });

  it("routes complex social requests to the existing fallback flow", async () => {
    const response = await post("/api/turn/intake", {
      gameId: tempGameId,
      text: "Lucas le pide permiso a Lira Test para practicar magia.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.route.supported, false);
    assert.equal(response.data.route.needsMutation, false);
    assert.equal(response.data.route.suggestedOperation, "getCompactContext");
  });
});
