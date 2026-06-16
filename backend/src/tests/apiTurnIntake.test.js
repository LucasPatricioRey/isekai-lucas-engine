const { after, before, describe, it } = require("node:test");

const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const {
  assert,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

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
