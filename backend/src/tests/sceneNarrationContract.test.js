const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDialogueSceneCapsules,
  buildSceneNarrationContract,
  summarizeNpc,
  summarizeNpcPresenceRef,
} = require("../utils/responseShaping");

const mara = {
  npcId: "npc_mara_vell",
  name: "Mara Vell",
  role: "escribana del gremio",
  currentLocationId: "loc_hoshimori_guild",
  currentTask: "ordena expedientes y sella formularios de primera hora",
  availability: { status: "busy", reason: "mostrador abierto" },
  factionLinks: [{ factionId: "faction_hoshimori_guild", role: "escribana" }],
  personality: ["ordenada", "precisa", "algo fria"],
  speechStyle: "formal, seca, muy concreta",
  values: ["registros", "pruebas", "puntualidad"],
  tolerates: ["formularios completos"],
  rejects: ["papeles incompletos", "excusas"],
  socialProfile: {
    values: ["registros limpios", "pruebas verificables"],
    rejects: ["improvisacion sin fuente"],
    boundaries: ["no acepta atajos administrativos"],
  },
  emotionalProfile: {
    defaultMood: "controlada y seca",
    coreDrives: ["mantener registros limpios", "separar prueba de rumor"],
    coreFears: ["errores formales"],
    visibleTells: ["endereza papeles", "baja la voz cuando esta irritada"],
    contradiction: "Parece fria, pero usa el orden para evitar injusticias.",
  },
  flags: {
    dialogueDirector: {
      schemaVersion: "npc_dialogue_director_v1",
      cadence: "frases cortas, ordenadas, sin suavizar el procedimiento",
      emotionalRule: "si Lucas llega ansioso, primero enfria la escena con precision",
      reactFirst: "deja el sello suspendido un segundo antes de responder",
      sampleBeats: ["Mara corrige una palabra antes de mirar a Lucas."],
      avoid: ["no sonar maternal", "no convertir procedimiento en charla calida"],
    },
  },
};

test("scene narration contract makes Mongo NPC context the mandatory first source", () => {
  const maraSummary = summarizeNpc(mara);
  const presence = {
    visible: [summarizeNpcPresenceRef(maraSummary)],
    sameRoom: [summarizeNpcPresenceRef(maraSummary)],
  };
  const dialogueSceneCapsules = buildDialogueSceneCapsules({
    nearbyNpcs: [maraSummary],
    npcPresence: presence,
    relevantNpcMemories: [
      {
        memoryId: "mem_mara_lucas_report",
        npcId: "npc_mara_vell",
        summary: "Lucas entrego un reporte incompleto una vez y acepto corregirlo.",
        certainty: "confirmed",
      },
    ],
  });

  const contract = buildSceneNarrationContract({
    dialogueSceneCapsules,
    nearbyNpcs: [maraSummary],
    npcPresence: presence,
    npcKnowledgeContext: {
      perNpc: [
        {
          npcId: "npc_mara_vell",
          name: "Mara Vell",
          knownRecordCount: 0,
          knownMemoryCount: 1,
          knownMemories: [
            {
              memoryId: "mem_mara_lucas_report",
              summary: "Lucas acepto corregir un reporte incompleto.",
              certainty: "confirmed",
              canShare: true,
            },
          ],
        },
      ],
    },
    relationshipDynamics: { count: 0 },
    dramaticContext: {
      emotionalScene: {
        sceneMode: "dramatized_scene",
        paragraphTarget: "3-6 parrafos",
        emotionalQuestion: "Que protege Mara con el procedimiento?",
      },
    },
  });

  assert.equal(contract.schemaVersion, "scene_narration_contract_v1");
  assert.equal(contract.contractStrength, "mandatory_for_player_scene");
  assert.match(contract.authority, /Mongo\/context compact/);
  assert.equal(contract.sourcePriority[0], "scene.narrationContract.npcContracts");
  assert.equal(contract.npcContracts.length, 1);
  assert.equal(contract.npcContracts[0].name, "Mara Vell");
  assert.match(contract.npcContracts[0].canonicalSource, /dialogueSceneCapsules/);
  assert.ok(contract.npcContracts[0].mustUse.some((line) => /sello/.test(line)));
  assert.match(contract.npcContracts[0].voiceRule, /frases cortas/);
  assert.ok(contract.npcContracts[0].avoid.some((line) => /manual|HUD|reglas/.test(line)));
  assert.ok(contract.genericDialogueBans.some((line) => /single neutral/.test(line)));
  assert.equal(contract.dialogueFormatContract.ruleId, "format.dialogue_direct");
  assert.match(contract.dialogueFormatContract.requiredFormat, /Nombre/);
  assert.ok(contract.dialogueFormatContract.forbidden.some((line) => /em dash/.test(line)));
  assert.match(contract.npcContracts[0].knowledgeBoundary.rule, /fuente diegetica/);
  assert.ok(contract.preOutputChecklist.some((line) => /Name:/.test(line)));
  assert.ok(contract.preOutputChecklist.some((line) => /em dash/.test(line)));
});

test("scene narration contract blocks exact private facts when knowledge is only inferable", () => {
  const maraSummary = summarizeNpc(mara);
  const contract = buildSceneNarrationContract({
    nearbyNpcs: [maraSummary],
    npcPresence: {
      visible: [summarizeNpcPresenceRef(maraSummary)],
      sameRoom: [summarizeNpcPresenceRef(maraSummary)],
    },
    npcKnowledgeContext: {
      perNpc: [
        {
          npcId: "npc_mara_vell",
          name: "Mara Vell",
          knownRecordCount: 0,
          knownMemoryCount: 0,
          jobAvailability: {
            exactSchedule: {
              canInfer: true,
              canStateAsFact: false,
            },
          },
        },
      ],
    },
  });

  const boundary = contract.npcContracts[0].knowledgeBoundary;
  assert.equal(boundary.canStateExactSchedule, false);
  assert.ok(boundary.warnings.some((warning) => /horario exacto/.test(warning)));
  assert.ok(contract.npcContracts[0].improvisationLimits.cannotImprovise.some((line) => /secretos/.test(line)));
});
