const { formatCopper } = require("./mechanicalChangeDisplay");

const SCHEMA_VERSION = "turn_display_bundle_v1";

const SOCIAL_FIELD_LABELS = {
  trust: "Confianza",
  familiarity: "Familiaridad",
  affection: "Afecto",
  suspicion: "Sospecha",
  respect: "Respeto",
  fear: "Miedo",
  jealousy: "Celos",
  socialDebt: "Deuda social",
};

function numberOrUnknown(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "?";
}

function signedNumber(value = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "+0";
  const rounded = Math.round(number);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
}

function uniqueLines(lines = []) {
  const seen = new Set();
  const result = [];

  for (const line of lines) {
    const text = String(line || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectDisplayLines(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => collectDisplayLines(entry));
  if (typeof value !== "object") return [];

  const lines = [];
  if (Array.isArray(value.displayLines)) lines.push(...value.displayLines);
  if (value.displayLine && lines.length === 0) lines.push(value.displayLine);
  if (Array.isArray(value.rewardLines)) lines.push(...value.rewardLines);
  if (Array.isArray(value.consequenceLines)) lines.push(...value.consequenceLines);
  return lines.filter(Boolean);
}

function formatDiegeticDate(date = {}) {
  const day = date.day ?? "?";
  const month = date.month || "?";
  const year = date.year ?? "?";
  return `${day} de ${month}, A\u00f1o ${year}`;
}

function formatHeader(changes = {}, gameState = {}) {
  const day = gameState.currentDay ?? changes.time?.dayAfter ?? "?";
  const before = changes.time?.before;
  const after = gameState.time || changes.time?.after || "?";
  const range = before && before !== after ? `${before}\u2192${after}` : after;
  return `## D\u00eda ${day}\u2014${range}`;
}

function formatLocationLine({ location = null, gameState = {} } = {}) {
  const locationName = location?.name || gameState.locationName || gameState.locationId || "?";
  return `**Ubicaci\u00f3n:** ${locationName}`;
}

function buildTimeAndLocationLines(changes = {}) {
  const lines = [];
  if (changes.time?.before || changes.time?.after) {
    const fromDay = changes.time.dayBefore;
    const toDay = changes.time.dayAfter;
    const dayPrefix = fromDay && toDay && fromDay !== toDay ? `D\u00eda ${fromDay} ` : "";
    const daySuffix = fromDay && toDay && fromDay !== toDay ? ` D\u00eda ${toDay}` : "";
    lines.push(`Tiempo: ${dayPrefix}${changes.time.before || "?"}\u2192${daySuffix}${changes.time.after || "?"}.`);
  }
  if (changes.location?.before || changes.location?.after) {
    const before = changes.location.beforeName || changes.location.before || "?";
    const after = changes.location.locationName || changes.location.after || "?";
    lines.push(`Traslado: ${before}\u2192${after}.`);
  }
  return lines;
}

function formatMpLine(mpChange = {}, gameState = {}) {
  if (mpChange.before === undefined || mpChange.after === undefined) return "";
  const max = gameState.lucasStatus?.mp?.max || gameState.lucasStatus?.mp?.afterMax || "";
  const maxSuffix = max ? `/${numberOrUnknown(max)}` : "";
  const delta = mpChange.delta !== undefined ? mpChange.delta : Number(mpChange.after) - Number(mpChange.before);
  return `MP: ${numberOrUnknown(mpChange.before)}${maxSuffix}\u2192${numberOrUnknown(mpChange.after)}${maxSuffix} (${signedNumber(delta)}).`;
}

function buildMagicPracticeLines(changes = {}, gameState = {}) {
  const practices = toArray(changes.magicPractice);
  if (practices.length === 0) return [];

  const lines = [];
  for (const practice of practices) {
    if (practice.techniqueName || practice.minutes) {
      lines.push(
        `Pr\u00e1ctica m\u00e1gica: ${practice.techniqueName || practice.techniqueId || "t\u00e9cnica"} (${numberOrUnknown(practice.minutes)} min).`
      );
    }

    const mpLine = formatMpLine(practice.mp, gameState);
    if (mpLine) lines.push(mpLine);

    if (practice.mechanicalEffect?.displayLine) lines.push(practice.mechanicalEffect.displayLine);
    if (Array.isArray(practice.mechanicalEffect?.displayLines)) lines.push(...practice.mechanicalEffect.displayLines);

    lines.push(
      `Efecto m\u00e1gico visible: ${
        practice.canProduceVisibleEffect || practice.mechanicalEffect?.applied ? "seg\u00fan efecto validado por backend" : "ninguno"
      }.`
    );
    lines.push(`Hechizos nuevos: ${practice.unlocks?.willLearnSpell ? "ver magicPatches" : "ninguno"}.`);
  }

  return uniqueLines(lines);
}

function buildSkillLines(changes = {}) {
  const display = changes.skillProgressDisplay;
  if (!display) return [];

  return uniqueLines([
    ...(display.displayLines || []),
    display.levelUpLine,
    ...(display.levelUpDetails || []),
  ]);
}

function buildSocialLines(changes = {}) {
  const lines = [];

  for (const relationship of toArray(changes.npcRelationships)) {
    const npcName = relationship.name || relationship.npcName || relationship.npcId || "NPC";
    if (Array.isArray(relationship.fieldChanges) && relationship.fieldChanges.length > 0) {
      for (const fieldChange of relationship.fieldChanges) {
        const label = fieldChange.label || SOCIAL_FIELD_LABELS[fieldChange.field] || fieldChange.field || "V\u00ednculo";
        lines.push(
          `${label} ${npcName}: ${numberOrUnknown(fieldChange.before)}\u2192${numberOrUnknown(fieldChange.after)} (${signedNumber(fieldChange.appliedDelta)}).`
        );
      }
    } else {
      for (const line of collectDisplayLines(relationship)) {
        lines.push(`${npcName}: ${line}`);
      }
    }

    lines.push(...(relationship.milestoneLines || []));
  }

  return uniqueLines(lines);
}

function buildJobShiftLines(changes = {}) {
  const lines = [];

  if (changes.ledger?.shiftId) {
    lines.push(`Turno laboral completado: ${changes.ledger.shiftId}.`);
  }

  if (changes.pay?.before !== undefined && changes.pay?.after !== undefined) {
    const delta = changes.pay.delta !== undefined
      ? changes.pay.delta
      : Number(changes.pay.after) - Number(changes.pay.before);
    lines.push(`Dinero: ${formatCopper(changes.pay.before)}\u2192${formatCopper(changes.pay.after)} (${signedNumber(delta)} cobre).`);
  }

  lines.push(...collectDisplayLines(changes.physicalBreakdown));

  const coveredPending = toArray(changes.biologicalClock?.coveredPendingAccumulations);
  if (coveredPending.length > 0) {
    lines.push(`Acumuladores biol\u00f3gicos cubiertos por turno laboral: ${coveredPending.length}.`);
  }

  if (Number(changes.missionExpiry?.expiredCount || 0) > 0) {
    lines.push(`Misiones disponibles expiradas por avance de tiempo: ${Number(changes.missionExpiry.expiredCount)}.`);
  }

  return uniqueLines(lines);
}

function buildOtherChangeLines(changes = {}) {
  const explicitKeys = [
    "magic",
    "knowledge",
    "npcMemories",
    "rumors",
    "worldEvents",
    "worldEventSocialConsequences",
    "dailyEvents",
    "missionExpiry",
    "weather",
    "jobContracts",
    "locations",
    "routineSync",
    "autoCheckpoint",
  ];

  return uniqueLines(explicitKeys.flatMap((key) => collectDisplayLines(changes[key])));
}

function statCurrentLine(label, stat = {}) {
  const current = numberOrUnknown(stat.current);
  const max = numberOrUnknown(stat.max);
  const suffix = stat.label ? `\u2014${stat.label}` : "";
  return `${label}: ${current}/${max}${suffix}`;
}

function formatSituationSentence(value = "", fallback = "turno actualizado") {
  const text = String(value || fallback || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return `${fallback}.`;
  if (/[!?]$/.test(text)) return text;
  return `${text.replace(/\.+$/g, "")}.`;
}

function buildStateLines({ gameState = {}, location = null, nearbyNpcs = [], activeEvents = [], actionSummary = "" } = {}) {
  const status = gameState.lucasStatus || {};
  const date = formatDiegeticDate(gameState.diegeticDate || {});
  const visibleNpcNames = uniqueLines(
    nearbyNpcs
      .filter((npc) => !npc.presenceScope || npc.presenceScope === "visible")
      .map((npc) => npc.name || npc.npcId)
  );
  const nearbyNpcNames = uniqueLines(
    nearbyNpcs
      .filter((npc) => npc.presenceScope && npc.presenceScope !== "visible")
      .map((npc) => npc.name || npc.npcId)
  );
  const activeEventNames = uniqueLines(activeEvents.map((event) => event.title || event.eventId));
  const npcPresenceText = (() => {
    if (visibleNpcNames.length > 0 && nearbyNpcNames.length > 0) {
      return `${visibleNpcNames.join(", ")}; cerca/probables: ${nearbyNpcNames.join(", ")}`;
    }
    if (visibleNpcNames.length > 0) return visibleNpcNames.join(", ");
    if (nearbyNpcNames.length > 0) return `cerca/probables: ${nearbyNpcNames.join(", ")}`;
    return "ninguno confirmado por el bundle";
  })();

  return [
    `D\u00eda: ${gameState.currentDay ?? "?"}\u2014${date}`,
    `Bloque: ${gameState.block || "?"}`,
    `Hora: ${gameState.time || "?"}`,
    `Ubicaci\u00f3n: ${location?.name || gameState.locationName || gameState.locationId || "?"}`,
    statCurrentLine("Vida", status.life),
    statCurrentLine("Saciedad", status.satiety),
    statCurrentLine("Energ\u00eda", status.energy),
    statCurrentLine("MP", status.mp),
    `Dinero: ${formatCopper(gameState.moneyCopper || 0)}`,
    `Evento activo: ${activeEventNames.length > 0 ? activeEventNames.join(", ") : "ninguno"}`,
    `Situaci\u00f3n: ${formatSituationSentence(actionSummary)}`,
    `NPCs visibles/cerca: ${npcPresenceText}.`,
  ];
}

function truncateHudText(value = "", maxLength = 160) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function buildContextHudContract({
  gameState = {},
  location = null,
  nearbyNpcs = [],
  activeEvents = [],
  latestEventLog = null,
  profile = "player_scene",
} = {}) {
  const latestSummary = truncateHudText(latestEventLog?.summary || "", 140);
  const actionSummary = latestSummary
    ? `ultimo registro visible: ${latestSummary}`
    : "sin cambios mecanicos nuevos; describir la situacion visible sin inventar cambios";
  const headerLines = [
    formatHeader({}, gameState),
    formatLocationLine({ location, gameState }),
  ];
  const stateLines = buildStateLines({
    gameState,
    location,
    nearbyNpcs,
    activeEvents,
    actionSummary,
  });

  return {
    schemaVersion: "hud_contract_v1",
    contractStrength: "mandatory_for_every_player_response",
    source: "context/compact",
    profile,
    ruleIds: [
      "format.response_hud_exact",
      "format.mechanical_changes",
      "format.skill_progress",
      "format.social_changes",
    ],
    copyPolicy:
      "No displayBundle? use exact HUD labels/order here; never rename fields or invent changes.",
    responseOrder: "header->narration->Cambios relevantes if needed->Estado actual->Alertas if real",
    sectionNames: {
      changes: "### Cambios relevantes",
      state: "## Estado actual",
      alerts: "### Alertas",
    },
    exactStateFieldOrder: [
      "D\u00eda",
      "Bloque",
      "Hora",
      "Ubicaci\u00f3n",
      "Vida",
      "Saciedad",
      "Energ\u00eda",
      "MP",
      "Dinero",
      "Evento activo",
      "Situaci\u00f3n",
      "NPCs visibles/cerca",
    ],
    forbiddenStateFieldRenames: [
      "Evento visible para Lucas",
      "Pendiente practico",
      "NPCs cerca",
      "Estado guardado",
    ],
    noMutationChangeLine: "Sin cambios mecanicos nuevos. No avanzo el tiempo.",
    headerLines,
    stateLines,
  };
}

function buildChangeGroups({ changes = {}, gameState = {} } = {}) {
  const groups = [
    {
      id: "time_location",
      title: "Tiempo y ubicaci\u00f3n",
      lines: buildTimeAndLocationLines(changes),
    },
    {
      id: "mechanical",
      title: "Mec\u00e1nica",
      lines: collectDisplayLines(changes.mechanicalChangeDisplay),
    },
    {
      id: "skills",
      title: "Progreso obtenido",
      lines: buildSkillLines(changes),
    },
    {
      id: "social",
      title: "V\u00ednculos sociales",
      lines: buildSocialLines(changes),
    },
    {
      id: "magic",
      title: "Magia",
      lines: buildMagicPracticeLines(changes, gameState),
    },
    {
      id: "job_shift",
      title: "Trabajo",
      lines: buildJobShiftLines(changes),
    },
    {
      id: "other",
      title: "Otros cambios",
      lines: buildOtherChangeLines(changes),
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      lines: uniqueLines(group.lines),
    }))
    .filter((group) => group.lines.length > 0);
}

function renderBundleLines({ headerLines = [], changeGroups = [], stateLines = [], alertLines = [] } = {}) {
  const lines = [...headerLines, ""];

  if (changeGroups.length > 0) {
    lines.push("### Cambios relevantes");
    for (const group of changeGroups) {
      if (group.id === "skills") {
        lines.push("Progreso obtenido:");
      } else if (changeGroups.length > 1 && group.title) {
        lines.push(`${group.title}:`);
      }
      lines.push(...group.lines);
    }
    lines.push("");
  }

  lines.push("## Estado actual", ...stateLines);

  if (alertLines.length > 0) {
    lines.push("", "### Alertas", ...alertLines);
  }

  return lines;
}

function buildTurnDisplayBundle({
  changes = {},
  gameState = {},
  location = null,
  nearbyNpcs = [],
  activeEvents = [],
  actionSummary = "",
  alertLines = [],
} = {}) {
  const headerLines = [
    formatHeader(changes, gameState),
    formatLocationLine({ location, gameState }),
  ];
  const changeGroups = buildChangeGroups({ changes, gameState });
  const changeLines = uniqueLines(changeGroups.flatMap((group) => group.lines));
  const stateLines = buildStateLines({
    gameState,
    location,
    nearbyNpcs,
    activeEvents,
    actionSummary,
  });
  const renderLines = renderBundleLines({
    headerLines,
    changeGroups,
    stateLines,
    alertLines,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    ruleIds: [
      "format.response_hud_exact",
      "format.mechanical_changes",
      "format.skill_progress",
      "format.social_changes",
    ],
    copyInstruction:
      "Copiar renderLines como contrato de HUD final. No reconstruir deltas, EXP, vinculos, MP, dinero, hora ni estado actual a mano.",
    headerLines,
    changeGroups,
    changeLines,
    stateLines,
    alertLines,
    renderLines,
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildTurnDisplayBundle,
  buildContextHudContract,
  buildChangeGroups,
  buildMagicPracticeLines,
  buildJobShiftLines,
  buildSkillLines,
  buildSocialLines,
  buildStateLines,
  renderBundleLines,
};
