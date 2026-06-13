const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const GameState = require("../models/GameState");
const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");
const Npc = require("../models/Npc");
const { previewBiologicalClockBlock } = require("./biologicalClockService");
const {
  EXP_TO_NEXT_BY_PHASE,
  PHASE_ORDER,
  previewSkillProgression,
} = require("./skillProgressionService");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const DEFAULT_CHARACTER_ID = "char_lucas";

function toPlain(value) {
  if (!value) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

function phaseRank(phase) {
  const index = PHASE_ORDER.indexOf(phase);
  return index === -1 ? -1 : index;
}

function skillMeetsRequirement(skill, requirement) {
  if (!skill) return false;

  const skillPhaseRank = phaseRank(skill.phase);
  const requiredPhaseRank = phaseRank(requirement.minPhase || "Principiante");

  if (skillPhaseRank < requiredPhaseRank) return false;
  if (skillPhaseRank > requiredPhaseRank) return true;

  return Number(skill.level || 0) >= Number(requirement.minLevel || 1);
}

function getMpCost(technique) {
  const mpCost = technique.mpCost || {};
  if (Number.isFinite(Number(mpCost.fixed))) return Number(mpCost.fixed);
  if (Number.isFinite(Number(mpCost.min))) return Number(mpCost.min);
  return 0;
}

function toVirtualSkill(expSuggestion) {
  return {
    skillId: expSuggestion.skillId,
    name: expSuggestion.skillName || expSuggestion.skillId,
    phase: "Principiante",
    level: 1,
    exp: 0,
    expToNext: EXP_TO_NEXT_BY_PHASE.Principiante,
    virtualPreviewOnly: true,
  };
}

function summarizeGameState(gameState) {
  return {
    gameId: gameState.gameId,
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    mp: gameState.lucasStatus?.mp,
    satiety: gameState.lucasStatus?.satiety,
    energy: gameState.lucasStatus?.energy,
    knownSpells: gameState.flags?.knownSpells || [],
  };
}

async function listMagicDisciplines(filters = {}) {
  const query = {};
  if (filters.type) query.type = filters.type;
  if (filters.parentDisciplineId) query.parentDisciplineId = filters.parentDisciplineId;

  return MagicDiscipline.find(query).sort({ order: 1, name: 1 }).lean();
}

async function listMagicTechniques(filters = {}) {
  const query = {};
  if (filters.disciplineId) query.disciplineId = filters.disciplineId;
  if (filters.kind) query.kind = filters.kind;
  if (filters.status) query.status = filters.status;

  return MagicTechnique.find(query).sort({ difficulty: 1, name: 1 }).lean();
}

async function getMagicTechnique(techniqueId, { session = null } = {}) {
  const query = MagicTechnique.findOne({ techniqueId });
  if (session) query.session(session);
  const technique = await query.lean();

  if (!technique) {
    const error = new Error(`No existe tecnica magica con id: ${techniqueId}`);
    error.statusCode = 404;
    throw error;
  }

  return technique;
}

async function getCharacterMagicKnowledgeMap(characterId, { session = null } = {}) {
  const query = CharacterMagicKnowledge.find({
    characterId,
    status: { $in: ["practicing", "known", "mastered"] },
  })
    .select("techniqueId status");
  if (session) query.session(session);
  const knowledge = await query.lean();

  return new Map(knowledge.map((entry) => [entry.techniqueId, entry.status]));
}

async function getCharacterKnownTechniqueIds(characterId, options = {}) {
  return new Set((await getCharacterMagicKnowledgeMap(characterId, options)).keys());
}

function getBlockingReasons({ technique, gameState, knownTechniqueIds, knownTechniqueStatusMap = new Map(), minutes }) {
  const reasons = [];
  const skillsById = new Map((gameState.skills || []).map((skill) => [skill.skillId, skill]));
  const knownStatus = knownTechniqueStatusMap.get(technique.techniqueId) || "";
  const knownLockedTemplate = technique.status === "locked_template" && ["known", "mastered"].includes(knownStatus);

  if (technique.status !== "available" && !knownLockedTemplate) {
    reasons.push(`La tecnica esta marcada como ${technique.status}.`);
  }

  if (Number(minutes) < technique.minMinutes || Number(minutes) > technique.maxMinutes) {
    reasons.push(`La duracion debe estar entre ${technique.minMinutes} y ${technique.maxMinutes} minutos.`);
  }

  for (const requirement of technique.requirements?.skills || []) {
    if (!skillMeetsRequirement(skillsById.get(requirement.skillId), requirement)) {
      reasons.push(
        `Requiere ${requirement.skillId} ${requirement.minPhase || "Principiante"} N${requirement.minLevel || 1}.`
      );
    }
  }

  for (const knownTechniqueId of technique.requirements?.knownTechniqueIds || []) {
    if (!knownTechniqueIds.has(knownTechniqueId)) {
      reasons.push(`Requiere conocer ${knownTechniqueId}.`);
    }
  }

  const mpCost = getMpCost(technique);
  const currentMp = gameState.lucasStatus?.mp?.current ?? 0;
  if (mpCost > currentMp) {
    reasons.push(`MP insuficiente: requiere ${mpCost}, actual ${currentMp}.`);
  }

  if (technique.canUnlockAutomatically) {
    reasons.push("La tecnica no puede desbloquearse automaticamente en preview.");
  }

  return reasons;
}

function buildSelfTrainingGuidance({
  technique,
  canPractice,
  blockingReasons,
  guide,
  requestedMinutes,
  skillPreviews,
  knownTechniqueStatusMap = new Map(),
}) {
  const kind = technique.kind || "practice";
  const isSpell = kind === "spell";
  const hasGuide = Boolean(guide);
  const knownStatus = knownTechniqueStatusMap.get(technique.techniqueId) || "";
  const formallyKnownSpell = isSpell && ["known", "mastered"].includes(knownStatus);
  const stage =
    isSpell
      ? formallyKnownSpell
        ? "spell_known"
        : "spell_locked"
      : kind === "theory"
        ? "theory"
        : kind === "trick"
          ? "first_control"
          : "foundation_control";

  const safeSolo = canPractice && !hasGuide && !isSpell;
  const nextSkillMilestone = (skillPreviews || []).find((preview) => preview.levelUps?.length > 0) || null;
  const guidance = [
    hasGuide
      ? "Practica guiada: puede corregir errores pequenos, pero no permite saltar requisitos."
      : "Practica autodidacta: avance lento, seguro y sin desbloqueos automaticos.",
    isSpell
      ? "Hechizo: no debe narrarse como usable si el backend no lo marco como conocido/desbloqueado."
      : "Sin hechizo visible: narrar sensaciones internas, respiracion, pulso de mana y control.",
    requestedMinutes > 30
      ? "Sesion larga: vigilar energia, hambre y frustracion; conviene dividir entrenamientos."
      : "Sesion corta/media: adecuada para control basico sin forzar el cuerpo.",
  ];

  if (!canPractice) {
    guidance.push("Bloqueado: resolver requisitos antes de otorgar EXP o progreso narrativo fuerte.");
  }

  return {
    schemaVersion: "magic_self_training_v1",
    mode: hasGuide ? "guided" : "solo",
    stage,
    canPracticeSoloSafely: safeSolo,
    canProduceVisibleEffect: canPractice && isSpell && (technique.status === "available" || formallyKnownSpell),
    shouldLearnSpell: false,
    safePracticeLimitMinutes: Math.min(Number(technique.maxMinutes || requestedMinutes || 30), hasGuide ? 60 : 30),
    nextMilestone: nextSkillMilestone
      ? {
          skillId: nextSkillMilestone.skillId,
          levelUps: nextSkillMilestone.levelUps,
          reason: "La practica podria empujar esta habilidad si luego se aplica una mutacion validada.",
        }
      : {
          skillId: "",
          levelUps: [],
          reason: "Acumular practicas basicas antes de esperar un salto claro.",
        },
    blockingReasons,
    guidance,
  };
}

async function previewMagicPractice({
  gameId = DEFAULT_GAME_ID,
  characterId = DEFAULT_CHARACTER_ID,
  techniqueId,
  minutes = null,
  guidedByNpcId = "",
  modifiers = {},
  gameStateOverride = null,
  antiFarmingContextByKey = {},
  session = null,
} = {}) {
  const gameStateQuery = GameState.findOne({ gameId });
  if (session) gameStateQuery.session(session);
  const [loadedGameState, technique, knownTechniqueStatusMap] = await Promise.all([
    gameStateOverride
      ? Promise.resolve(toPlain(gameStateOverride))
      : gameStateQuery.lean(),
    getMagicTechnique(techniqueId, { session }),
    getCharacterMagicKnowledgeMap(characterId, { session }),
  ]);
  const gameState = loadedGameState;
  const knownTechniqueIds = new Set(knownTechniqueStatusMap.keys());

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  let guide = null;
  if (guidedByNpcId) {
    guide = await Npc.findOne({ npcId: guidedByNpcId }).select("npcId name role").lean();
    if (!guide) {
      const error = new Error(`No existe NPC guia con id: ${guidedByNpcId}`);
      error.statusCode = 404;
      throw error;
    }
  }

  const requestedMinutes = Number(minutes || technique.defaultMinutes);
  const blockingReasons = getBlockingReasons({
    technique,
    gameState,
    knownTechniqueIds,
    knownTechniqueStatusMap,
    minutes: requestedMinutes,
  });
  const mpCost = getMpCost(technique);
  const canPractice = blockingReasons.length === 0;
  const biologicalPreview = previewBiologicalClockBlock({
    activities: [
      {
        category: technique.activityCategory,
        minutes: requestedMinutes,
      },
    ],
    currentStatus: {
      satiety: gameState.lucasStatus?.satiety?.current,
      energy: gameState.lucasStatus?.energy?.current,
    },
  });

  const skillPreviews = [];

  if (canPractice) {
    const skillsById = new Map((gameState.skills || []).map((skill) => [skill.skillId, skill]));

    for (const expSuggestion of technique.expSuggestions || []) {
      const liveSkill = skillsById.get(expSuggestion.skillId);

      if (!liveSkill && !expSuggestion.allowVirtualSkillPreview) {
        skillPreviews.push({
          skillId: expSuggestion.skillId,
          blocked: true,
          blockedReason: "La habilidad no existe en GameState y la tecnica no permite preview virtual.",
        });
        continue;
      }

      const scale = requestedMinutes / Number(technique.defaultMinutes || requestedMinutes || 1);
      const baseExp = Math.max(0, Math.round(Number(expSuggestion.baseExp || 0) * scale));
      const preview = previewSkillProgression({
        skill: liveSkill || toVirtualSkill(expSuggestion),
        expDelta: baseExp,
        reason: expSuggestion.reason || technique.name,
        category: expSuggestion.category,
        modifiers: {
          ...(modifiers || {}),
          aquaBlessing: true,
          hasMaster: Boolean(guide),
        },
        currentEnergy: gameState.lucasStatus?.energy?.current,
        antiFarmingContext: antiFarmingContextByKey[`${expSuggestion.skillId}:${expSuggestion.category}`] || undefined,
      });

      skillPreviews.push({
        skillId: expSuggestion.skillId,
        skillName: expSuggestion.skillName || liveSkill?.name || expSuggestion.skillId,
        virtualPreviewOnly: !liveSkill,
        baseExp,
        ...preview,
      });
    }
  }

  return {
    dryRun: true,
    canPractice,
    blockedReason: blockingReasons.join(" "),
    blockingReasons,
    technique,
    guide,
    minutes: requestedMinutes,
    mpCost,
    projectedMp: {
      before: gameState.lucasStatus?.mp?.current ?? 0,
      delta: canPractice ? -mpCost : 0,
      after: canPractice ? Math.max(0, (gameState.lucasStatus?.mp?.current ?? 0) - mpCost) : gameState.lucasStatus?.mp?.current ?? 0,
      willMutate: false,
    },
    biologicalPreview,
    skillPreviews,
    selfTrainingGuidance: buildSelfTrainingGuidance({
      technique,
      canPractice,
      blockingReasons,
      guide,
      requestedMinutes,
      skillPreviews,
      knownTechniqueStatusMap,
    }),
    unlocks: {
      willUnlockTechnique: false,
      willLearnSpell: false,
      reason: "G11 solo calcula preview; no desbloquea tecnicas ni hechizos.",
    },
    gameState: summarizeGameState(gameState),
  };
}

module.exports = {
  getCharacterKnownTechniqueIds,
  getMagicTechnique,
  listMagicDisciplines,
  listMagicTechniques,
  previewMagicPractice,
};
