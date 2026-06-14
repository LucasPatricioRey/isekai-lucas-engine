const PHASE_ABBREVIATIONS = {
  principiante: "P",
  novato: "N",
  competente: "C",
  experto: "E",
  maestro: "M",
  legendario: "L",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numberOrUnknown(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "?";
}

function getPhaseAbbreviation(phase) {
  const normalized = normalizeText(phase);
  if (PHASE_ABBREVIATIONS[normalized]) return PHASE_ABBREVIATIONS[normalized];
  const first = String(phase || "").trim().charAt(0).toUpperCase();
  return first || "?";
}

function formatSkillRank(snapshot = {}) {
  return `${getPhaseAbbreviation(snapshot.phase)}.N${numberOrUnknown(snapshot.level)}`;
}

function formatSkillExp(snapshot = {}) {
  return `${numberOrUnknown(snapshot.exp)}/${numberOrUnknown(snapshot.expToNext)}`;
}

function getSkillDelta(change = {}) {
  if (Number.isFinite(Number(change.effectiveExpDelta))) return Math.round(Number(change.effectiveExpDelta));
  if (Number.isFinite(Number(change.expDelta))) return Math.round(Number(change.expDelta));
  if (Number.isFinite(Number(change.progression?.expDelta))) return Math.round(Number(change.progression.expDelta));
  return 0;
}

function getBeforeAfter(change = {}) {
  return {
    before: change.before || change.progression?.before || null,
    after: change.after || change.progression?.after || null,
  };
}

function hasSkillLevelUp(change = {}) {
  const { before, after } = getBeforeAfter(change);
  if (Array.isArray(change.levelUps) && change.levelUps.length > 0) return true;
  if (Array.isArray(change.progression?.levelUps) && change.progression.levelUps.length > 0) return true;
  if (!before || !after) return false;
  return before.phase !== after.phase || Number(before.level) !== Number(after.level);
}

function buildSkillProgressLine(change = {}) {
  const { before, after } = getBeforeAfter(change);
  const skillName = change.name || change.skillName || change.skillId || "Habilidad";
  const delta = getSkillDelta(change);

  if (!before || !after) {
    return `${skillName} EXP +${delta}`;
  }

  return `${skillName} ${formatSkillRank(before)} ${formatSkillExp(before)}\u2192${formatSkillRank(after)} ${formatSkillExp(after)} (+${delta})`;
}

function buildSkillLevelUpLine(change = {}) {
  const levelUp = hasSkillLevelUp(change);
  if (!levelUp) return "Subida de nivel/fase: no.";

  const { before, after } = getBeforeAfter(change);
  const skillName = change.name || change.skillName || change.skillId || "Habilidad";
  if (!before || !after) return "Subida de nivel/fase: s\u00ed.";

  return `Subida de nivel/fase: s\u00ed (${skillName} ${formatSkillRank(before)}\u2192${formatSkillRank(after)}).`;
}

function withSkillProgressDisplay(change = {}) {
  const displayLine = buildSkillProgressLine(change);
  const levelUpDisplayLine = buildSkillLevelUpLine(change);

  return {
    ...change,
    displayLine,
    displayLines: [displayLine, levelUpDisplayLine],
    levelUpDisplayLine,
    hasLevelUp: hasSkillLevelUp(change),
    formatRuleId: "format.skill_progress",
  };
}

function buildSkillProgressDisplay(skillChanges = []) {
  const changes = skillChanges.map((change) =>
    change.displayLine && Array.isArray(change.displayLines) ? change : withSkillProgressDisplay(change)
  );
  const levelUpDetails = changes
    .filter((change) => change.hasLevelUp)
    .map((change) => change.levelUpDisplayLine);

  return {
    ruleId: "format.skill_progress",
    title: "Progreso obtenido",
    displayLines: changes.map((change) => change.displayLine),
    levelUpLine: `Subida de nivel/fase: ${levelUpDetails.length > 0 ? "s\u00ed" : "no"}.`,
    levelUpDetails,
    copyInstruction:
      "Copiar displayLines bajo Progreso obtenido y levelUpLine/levelUpDetails bajo Subida de nivel/fase.",
  };
}

module.exports = {
  buildSkillProgressDisplay,
  buildSkillProgressLine,
  buildSkillLevelUpLine,
  formatSkillRank,
  withSkillProgressDisplay,
};
