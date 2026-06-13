const assert = require("node:assert/strict");
const test = require("node:test");

const { buildNpcKnowledgeContext } = require("../services/knowledgeService");
const { summarizeNpc } = require("../utils/responseShaping");

const mara = {
  npcId: "npc_mara_vell",
  name: "Mara Vell",
  factionLinks: [{ factionId: "faction_hoshimori_guild", role: "escribana" }],
  personality: ["ordenada", "precisa", "algo fria"],
  speechStyle: "formal, seca, muy concreta",
  values: ["registros", "pruebas", "puntualidad"],
  tolerates: ["formularios completos"],
  rejects: ["papeles incompletos", "excusas"],
};

const yara = {
  npcId: "npc_yara_mils",
  name: "Yara Mils",
  factionLinks: [{ factionId: "faction_grulla_azul", role: "ayudante" }],
  personality: ["amable", "nerviosa", "trabajadora", "timida"],
  speechStyle: "suave, frases cortas cuando se siente observada",
  values: ["sentirse util", "que respeten su esfuerzo"],
  tolerates: ["ayuda genuina", "compania tranquila"],
  rejects: ["presion", "burla publica"],
};

test("guild staff can infer but cannot state Lucas exact job schedule without a knowledge record", () => {
  const context = buildNpcKnowledgeContext({
    nearbyNpcs: [mara],
    knowledgeRecords: [],
    jobContract: { contractId: "job_grulla_lucas", title: "Ayudante de posada" },
    guildState: { factionId: "faction_hoshimori_guild" },
  });

  const entry = context.perNpc[0].jobAvailability;
  assert.equal(entry.publicWorkKnown, true);
  assert.equal(entry.institutionalCanAskAvailability, true);
  assert.equal(entry.exactSchedule.canInfer, true);
  assert.equal(entry.exactSchedule.canStateAsFact, false);
  assert.match(entry.recommendedWording, /inferir disponibilidad laboral/);
  assert.deepEqual(context.scheduleUnconfirmedNpcIds, ["npc_mara_vell"]);
});

test("confirmed institutional knowledge lets guild staff state an exact schedule as fact", () => {
  const context = buildNpcKnowledgeContext({
    nearbyNpcs: [mara],
    knowledgeRecords: [
      {
        knowledgeId: "knowledge_lucas_schedule_guild",
        gameId: "isekai_lucas_main",
        status: "active",
        subjectType: "job_contract",
        subjectId: "job_grulla_lucas",
        factKey: "lucas_job_schedule_change",
        fact: "Lucas no trabaja el turno de manana y conserva el turno de tarde.",
        sourceType: "institutional_record",
        certainty: "confirmed",
        visibility: "semi_private",
        holderFactionIds: ["faction_hoshimori_guild"],
      },
    ],
    jobContract: { contractId: "job_grulla_lucas", title: "Ayudante de posada" },
    guildState: { factionId: "faction_hoshimori_guild" },
  });

  const entry = context.perNpc[0].jobAvailability;
  assert.equal(entry.exactSchedule.canStateAsFact, true);
  assert.equal(entry.exactSchedule.knowledgeId, "knowledge_lucas_schedule_guild");
  assert.deepEqual(context.scheduleUnconfirmedNpcIds, []);
});

test("private NPC knowledge does not leak to unrelated NPCs", () => {
  const context = buildNpcKnowledgeContext({
    nearbyNpcs: [mara, yara],
    knowledgeRecords: [
      {
        knowledgeId: "knowledge_lucas_schedule_yara",
        gameId: "isekai_lucas_main",
        status: "active",
        subjectType: "job_contract",
        subjectId: "job_grulla_lucas",
        factKey: "lucas_job_schedule_change",
        fact: "Lucas le conto a Yara que dejara el turno de manana.",
        sourceType: "told_by_lucas",
        certainty: "confirmed",
        visibility: "private",
        holderNpcIds: ["npc_yara_mils"],
      },
    ],
    jobContract: { contractId: "job_grulla_lucas", title: "Ayudante de posada" },
    guildState: { factionId: "faction_hoshimori_guild" },
  });

  const maraEntry = context.perNpc.find((entry) => entry.npcId === "npc_mara_vell").jobAvailability;
  const yaraEntry = context.perNpc.find((entry) => entry.npcId === "npc_yara_mils").jobAvailability;

  assert.equal(maraEntry.exactSchedule.canStateAsFact, false);
  assert.equal(yaraEntry.exactSchedule.canStateAsFact, true);
});

test("confirmed npc memory can carry prior schedule knowledge without a KnowledgeRecord", () => {
  const context = buildNpcKnowledgeContext({
    nearbyNpcs: [yara],
    relevantNpcMemories: [
      {
        memoryId: "memory_yara_schedule_change",
        npcId: "npc_yara_mils",
        fact: "Lucas told Yara he will stop working morning shifts and keep afternoon work.",
        summary: "Lucas explained his schedule change to Yara.",
        sourceType: "told_by_lucas",
        certainty: "confirmed",
        tags: ["job_schedule_change"],
        createdDay: 15,
        createdTime: "13:10",
      },
    ],
    knowledgeRecords: [],
    jobContract: { contractId: "job_grulla_lucas", title: "Ayudante de posada" },
    guildState: { factionId: "faction_hoshimori_guild" },
  });

  const entry = context.perNpc[0].jobAvailability;
  assert.equal(entry.exactSchedule.canStateAsFact, true);
  assert.equal(entry.exactSchedule.memoryId, "memory_yara_schedule_change");
  assert.deepEqual(context.scheduleUnconfirmedNpcIds, []);
});

test("mechanical-only knowledge never becomes NPC certainty", () => {
  const context = buildNpcKnowledgeContext({
    nearbyNpcs: [mara],
    knowledgeRecords: [
      {
        knowledgeId: "knowledge_mechanical_schedule",
        gameId: "isekai_lucas_main",
        status: "active",
        subjectType: "job_contract",
        factKey: "lucas_job_schedule_change",
        fact: "Mechanical test schedule.",
        sourceType: "system",
        certainty: "confirmed",
        visibility: "mechanical_only",
        holderFactionIds: ["faction_hoshimori_guild"],
      },
    ],
    jobContract: { contractId: "job_grulla_lucas", title: "Ayudante de posada" },
    guildState: { factionId: "faction_hoshimori_guild" },
  });

  assert.equal(context.perNpc[0].jobAvailability.exactSchedule.canStateAsFact, false);
});

test("npc summaries expose compact voice guidance for narration variety", () => {
  const summary = summarizeNpc(mara);

  assert.equal(summary.voiceProfile.speechStyle, "formal, seca, muy concreta");
  assert(summary.voiceProfile.dialogueGuidance.some((line) => /registro confirmado/.test(line)));
  assert(summary.voiceProfile.avoid.some((line) => /fuente diegetica/.test(line)));
  assert.equal(summary.dialogueProfile.schemaVersion, "dialogue_profile_v1");
  assert.equal(summary.dialogueProfile.relationshipRegister.key, "stranger_public");
  assert.equal(summary.dialogueProfile.emotionalTemperature.key, "neutral");
  assert(summary.dialogueProfile.dialogueMoves.some((line) => /procedimiento|registro/.test(line)));
  assert(summary.dialogueProfile.rule.includes("intencion"));
});
