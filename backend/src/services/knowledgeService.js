const KnowledgeRecord = require("../models/KnowledgeRecord");

const VALID_OPS = new Set(["create", "update", "retire", "dispute"]);
const JOB_SCHEDULE_FACT_KEYS = new Set([
  "lucas_job_schedule",
  "lucas_job_shift_schedule",
  "lucas_job_availability",
  "lucas_job_schedule_change",
]);

function createId(prefix = "knowledge") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function validationError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return Array.from(new Set(toArray(values).filter(Boolean)));
}

function normalizeKnowledgePatches(patches) {
  if (patches === undefined || patches === null) return [];
  return Array.isArray(patches) ? patches : [patches];
}

function listNpcFactionIds(npc = {}) {
  return unique(toArray(npc.factionLinks).map((link) => link.factionId));
}

function isFactionScopedKnowledge(record = {}) {
  if (!record || record.status !== "active") return false;
  if (record.visibility === "public") return true;
  if (record.flags?.allowFactionKnowledge === true || record.flags?.factionScope === "institutional") return true;
  return (
    record.visibility === "semi_private" &&
    ["institutional_record", "public_record", "system"].includes(record.sourceType)
  );
}

function isDirectKnowledge(record = {}, npc = {}) {
  if (!record || record.status !== "active") return false;
  if (record.visibility === "mechanical_only") return false;
  if (record.visibility === "public") return true;
  if (toArray(record.holderNpcIds).includes(npc.npcId)) return true;
  const npcFactionIds = listNpcFactionIds(npc);
  return (
    isFactionScopedKnowledge(record) &&
    toArray(record.holderFactionIds).some((factionId) => npcFactionIds.includes(factionId))
  );
}

function canStateAsCertainty(record = {}) {
  return Boolean(
    record &&
      record.status === "active" &&
      ["confirmed", "probable"].includes(record.certainty) &&
      record.sourceType !== "inference"
  );
}

function isJobScheduleMemory(memory = {}) {
  const tags = toArray(memory.tags);
  const text = `${memory.fact || ""} ${memory.summary || ""}`.toLowerCase();
  return Boolean(
    tags.some((tag) =>
      ["job", "job_schedule", "job_schedule_change", "availability", "work", "fact_lucas_job_schedule"].includes(tag)
    ) ||
      /turno|horario|trabaj|disponibilidad|manana|tarde/.test(text)
  );
}

function canStateMemoryAsCertainty(memory = {}) {
  return Boolean(
    memory &&
      ["confirmed", "probable"].includes(memory.certainty) &&
      memory.sourceType !== "inference"
  );
}

function neutralizeCharacterPerspective(value = "") {
  return String(value || "")
    .replace(/^Lucas sabe por .+? que\s+/i, "")
    .replace(/^Lucas sabe que\s+/i, "")
    .replace(/^Lucas sabe\s+/i, "")
    .trim();
}

function summarizeKnowledgeRecord(record = {}, options = {}) {
  const fact = options.perspective === "npc" ? neutralizeCharacterPerspective(record.fact) : record.fact;
  const summary = options.perspective === "npc"
    ? neutralizeCharacterPerspective(record.summary || record.fact || "")
    : record.summary || "";

  return {
    knowledgeId: record.knowledgeId,
    factKey: record.factKey,
    fact,
    summary,
    subjectType: record.subjectType,
    subjectId: record.subjectId || "",
    sourceType: record.sourceType,
    certainty: record.certainty,
    visibility: record.visibility,
    holderNpcIds: toArray(record.holderNpcIds).slice(0, 8),
    holderFactionIds: toArray(record.holderFactionIds).slice(0, 8),
    canShare: Boolean(record.canShare),
    createdDay: record.createdDay,
    createdTime: record.createdTime,
    tags: toArray(record.tags).slice(0, 8),
  };
}

function summarizeNpcMemoryAsKnowledge(memory = {}) {
  return {
    memoryId: memory.memoryId,
    factKey: toArray(memory.tags).find((tag) => String(tag).startsWith("fact_")) || "",
    fact: memory.fact,
    summary: memory.summary || "",
    sourceType: memory.sourceType,
    certainty: memory.certainty,
    privacyLevel: memory.privacyLevel,
    canShare: Boolean(memory.canShare),
    createdDay: memory.createdDay,
    createdTime: memory.createdTime,
    tags: toArray(memory.tags).slice(0, 8),
  };
}

function chooseBestJobScheduleRecord(records = [], npc = {}) {
  const visibleRecords = records
    .filter((record) => JOB_SCHEDULE_FACT_KEYS.has(record.factKey))
    .filter((record) => isDirectKnowledge(record, npc));

  const score = {
    confirmed: 4,
    probable: 3,
    rumor: 2,
    doubtful: 1,
  };

  return visibleRecords.sort((left, right) => {
    const scoreDiff = (score[right.certainty] || 0) - (score[left.certainty] || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (right.createdDay || 0) - (left.createdDay || 0);
  })[0] || null;
}

function chooseBestJobScheduleMemory(memories = [], npc = {}) {
  const visibleMemories = memories
    .filter((memory) => memory.npcId === npc.npcId)
    .filter(isJobScheduleMemory);

  const score = {
    confirmed: 4,
    probable: 3,
    rumor: 2,
    doubtful: 1,
  };

  return visibleMemories.sort((left, right) => {
    const scoreDiff = (score[right.certainty] || 0) - (score[left.certainty] || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (right.createdDay || 0) - (left.createdDay || 0);
  })[0] || null;
}

function buildJobKnowledgeEntry({ npc, records = [], memories = [], jobContract = null, guildState = null }) {
  const bestRecord = chooseBestJobScheduleRecord(records, npc);
  const bestMemory = chooseBestJobScheduleMemory(memories, npc);
  const npcFactionIds = listNpcFactionIds(npc);
  const isGuildStaff = Boolean(guildState?.factionId && npcFactionIds.includes(guildState.factionId));
  const publicWorkKnown = Boolean(jobContract && jobContract.flags?.publicWorkKnown !== false);
  const exactScheduleConfirmed = canStateAsCertainty(bestRecord) || canStateMemoryAsCertainty(bestMemory);
  const exactScheduleInferred = bestRecord?.sourceType === "inference" || bestMemory?.sourceType === "inference";

  let recommendedWording = "No afirmar horario exacto; si hace falta, preguntar o hablar como suposicion.";
  if (exactScheduleConfirmed) {
    recommendedWording = "Puede afirmar el dato de horario si la fuente encaja con la escena.";
  } else if (exactScheduleInferred || isGuildStaff) {
    recommendedWording = "Puede inferir disponibilidad laboral, pero debe decirlo como suposicion o dato a confirmar.";
  } else if (publicWorkKnown) {
    recommendedWording = "Puede saber que Lucas trabaja en la posada, pero no el cambio exacto de turnos.";
  }

  return {
    npcId: npc.npcId,
    name: npc.name,
    publicWorkKnown,
    institutionalCanAskAvailability: isGuildStaff,
    exactSchedule: {
      canStateAsFact: exactScheduleConfirmed,
      canInfer: Boolean(exactScheduleInferred || isGuildStaff || publicWorkKnown),
      certainty: bestRecord?.certainty || bestMemory?.certainty || "not_established",
      sourceType: bestRecord?.sourceType || bestMemory?.sourceType || "",
      knowledgeId: bestRecord?.knowledgeId || "",
      memoryId: bestMemory?.memoryId || "",
    },
    matchingMemories: memories
      .filter((memory) => memory.npcId === npc.npcId)
      .filter(isJobScheduleMemory)
      .slice(0, 3)
      .map(summarizeNpcMemoryAsKnowledge),
    recommendedWording,
  };
}

function buildNpcKnowledgeContext({
  nearbyNpcs = [],
  relevantNpcMemories = [],
  knowledgeRecords = [],
  jobContract = null,
  guildState = null,
} = {}) {
  const activeRecords = toArray(knowledgeRecords).filter((record) => record.status === "active");
  const perNpc = toArray(nearbyNpcs).slice(0, 10).map((npc) => {
    const directRecords = activeRecords.filter((record) => isDirectKnowledge(record, npc));
    const knownMemories = toArray(relevantNpcMemories)
      .filter((memory) => memory.npcId === npc.npcId)
      .slice(0, 3)
      .map(summarizeNpcMemoryAsKnowledge);
    return {
      npcId: npc.npcId,
      name: npc.name,
      knownRecords: directRecords
        .slice(0, 5)
        .map((record) => summarizeKnowledgeRecord(record, { perspective: "npc" })),
      knownMemoryCount: knownMemories.length,
      knownMemories,
      jobAvailability: buildJobKnowledgeEntry({
        npc,
        records: activeRecords,
        memories: relevantNpcMemories,
        jobContract,
        guildState,
      }),
    };
  });

  const scheduleUnconfirmedNpcIds = perNpc
    .filter((entry) => !entry.jobAvailability.exactSchedule.canStateAsFact)
    .map((entry) => entry.npcId);

  return {
    schemaVersion: "npc_knowledge_context_v1",
    globalGuidance:
      "Separar conocimiento del backend de conocimiento diegetico. Si un NPC no tiene fuente, solo puede inferir, preguntar o admitir incertidumbre.",
    mechanicalOnlyBoundaries: [
      jobContract
        ? "El contrato/horario laboral de Lucas aparece por necesidad mecanica; no todos los NPCs lo saben como hecho confirmado."
        : "",
    ].filter(Boolean),
    scheduleUnconfirmedNpcIds,
    perNpc,
  };
}

function buildKnowledgePayload(gameState, patch) {
  if (!patch.factKey || !String(patch.factKey).trim()) {
    throw validationError("knowledgePatches.factKey es obligatorio.");
  }
  if (!patch.subjectType) {
    throw validationError("knowledgePatches.subjectType es obligatorio.");
  }
  if (!patch.fact && !patch.summary) {
    throw validationError("knowledgePatches.fact o summary es obligatorio.");
  }
  if (!patch.sourceType) {
    throw validationError("knowledgePatches.sourceType es obligatorio.");
  }
  if (!patch.certainty) {
    throw validationError("knowledgePatches.certainty es obligatorio.");
  }

  return {
    knowledgeId: patch.knowledgeId || createId("knowledge"),
    gameId: patch.gameId || gameState.gameId || "isekai_lucas_main",
    subjectType: patch.subjectType,
    subjectId: patch.subjectId || "",
    factKey: patch.factKey,
    fact: patch.fact || patch.summary,
    summary: patch.summary || patch.fact || "",
    sourceType: patch.sourceType,
    sourceId: patch.sourceId || "",
    certainty: patch.certainty,
    visibility: patch.visibility || "private",
    holderNpcIds: unique(patch.holderNpcIds),
    holderFactionIds: unique(patch.holderFactionIds),
    holderCharacterIds: unique(patch.holderCharacterIds),
    canShare: Boolean(patch.canShare),
    shareConditions: unique(patch.shareConditions),
    createdDay: patch.createdDay || gameState.currentDay,
    createdTime: patch.createdTime || gameState.time,
    lastConfirmedDay: patch.lastConfirmedDay || gameState.currentDay,
    lastConfirmedTime: patch.lastConfirmedTime || gameState.time,
    expiresDay: patch.expiresDay || null,
    expiresTime: patch.expiresTime || "",
    relatedNpcIds: unique(patch.relatedNpcIds),
    relatedFactionIds: unique(patch.relatedFactionIds),
    relatedLocationIds: unique(patch.relatedLocationIds),
    relatedMissionIds: unique(patch.relatedMissionIds),
    relatedEventIds: unique(patch.relatedEventIds),
    relatedEvidenceIds: unique(patch.relatedEvidenceIds),
    relatedJobContractIds: unique(patch.relatedJobContractIds),
    status: patch.status || "active",
    tags: unique(patch.tags),
    flags: patch.flags || {},
  };
}

async function applyKnowledgePatches(gameState, knowledgePatches, session = null) {
  const patches = normalizeKnowledgePatches(knowledgePatches);
  const results = [];

  for (const patch of patches) {
    const op = patch.op || "create";
    if (!VALID_OPS.has(op)) throw validationError("knowledgePatches.op no soportado.", { op });

    if (op === "create") {
      const payload = buildKnowledgePayload(gameState, patch);
      const existing = await KnowledgeRecord.findOne({ knowledgeId: payload.knowledgeId }).session(session);
      if (existing && !patch.allowExisting) {
        throw validationError("knowledgePatches.knowledgeId ya existe.", { knowledgeId: payload.knowledgeId });
      }
      if (!existing) {
        await KnowledgeRecord.create([payload], { session });
      }
      results.push({
        op,
        knowledgeId: payload.knowledgeId,
        factKey: payload.factKey,
        certainty: payload.certainty,
        visibility: payload.visibility,
        alreadyExists: Boolean(existing),
        displayLines: [`Conocimiento registrado: ${payload.factKey} (${payload.certainty}).`],
      });
      continue;
    }

    if (!patch.knowledgeId) {
      throw validationError("knowledgePatches.knowledgeId es obligatorio para update/retire/dispute.");
    }

    const record = await KnowledgeRecord.findOne({
      gameId: patch.gameId || gameState.gameId || "isekai_lucas_main",
      knowledgeId: patch.knowledgeId,
    }).session(session);
    if (!record) throw validationError("knowledgePatches.knowledgeId no existe.", { knowledgeId: patch.knowledgeId });

    const before = summarizeKnowledgeRecord(record);
    if (op === "retire") record.status = "retired";
    if (op === "dispute") record.status = "disputed";
    if (op === "update") {
      const mutableFields = [
        "fact",
        "summary",
        "sourceType",
        "sourceId",
        "certainty",
        "visibility",
        "holderNpcIds",
        "holderFactionIds",
        "holderCharacterIds",
        "canShare",
        "shareConditions",
        "expiresDay",
        "expiresTime",
        "tags",
        "flags",
      ];
      for (const field of mutableFields) {
        if (patch[field] !== undefined) record[field] = Array.isArray(record[field]) ? unique(patch[field]) : patch[field];
      }
      record.lastConfirmedDay = patch.lastConfirmedDay || gameState.currentDay;
      record.lastConfirmedTime = patch.lastConfirmedTime || gameState.time;
    }

    await record.save({ session });
    results.push({
      op,
      knowledgeId: record.knowledgeId,
      before,
      after: summarizeKnowledgeRecord(record),
      displayLines: [`Conocimiento actualizado: ${record.factKey} (${record.status}).`],
    });
  }

  return results;
}

module.exports = {
  JOB_SCHEDULE_FACT_KEYS,
  applyKnowledgePatches,
  buildNpcKnowledgeContext,
  summarizeKnowledgeRecord,
};
