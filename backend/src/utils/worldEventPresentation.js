function getDailyEventTemplateId(event = {}) {
  if (event.templateId) return event.templateId;
  const templateTag = (event.tags || []).find((entry) => String(entry).startsWith("daily_event_template_"));
  return templateTag ? templateTag.replace("daily_event_template_", "") : "";
}

function isDailyEvent(event = {}) {
  if (event.countsAsMainEvent === false) return false;
  if (event.eventLayer && event.eventLayer !== "main_event") return false;
  return (event.tags || []).includes("daily_event");
}

function findEffectValue(event = {}, type) {
  const effect = (event.effects || []).find((entry) => entry.type === type);
  return effect?.value || {};
}

function blockFromStartTime(startTime = "") {
  if (startTime >= "06:00" && startTime < "12:00") return "Manana";
  if (startTime >= "12:00" && startTime < "14:00") return "Mediodia";
  if (startTime >= "14:00" && startTime < "18:00") return "Tarde";
  return "Noche";
}

function getDailyEventRollInfo(event = {}) {
  const effectRolls = findEffectValue(event, "daily_event_rolls");
  return {
    ...effectRolls,
    ...(event.rolls || {}),
  };
}

function formatDayTime(day, time) {
  if (!day && !time) return "";
  if (!day) return String(time || "");
  if (!time) return `Dia ${day}`;
  return `Dia ${day}, ${time}`;
}

function statusLabel(status = "") {
  if (status === "scheduled") return "programado";
  if (status === "active") return "activo";
  if (status === "resolved") return "resuelto";
  if (status === "expired") return "vencido";
  if (status === "consequences_applied") return "con consecuencias aplicadas";
  if (status === "cancelled") return "cancelado";
  return status || "desconocido";
}

function importanceLabel(event = {}, rolls = {}) {
  if (rolls.importance === "important" || event.severity === "major" || event.severity === "critical") {
    return "importante";
  }
  return "menor";
}

function buildDailyEventNotice(event = {}) {
  if (!event || !isDailyEvent(event)) return null;

  const rolls = getDailyEventRollInfo(event);
  const block = rolls.block || blockFromStartTime(event.startTime || rolls.startTime || "");
  const startTime = event.startTime || rolls.startTime || "";
  const startsAt = formatDayTime(event.startDay, startTime);
  const endsAt = formatDayTime(event.endDay, event.endTime);
  const importance = importanceLabel(event, rolls);
  const status = statusLabel(event.status);
  const title = event.title || "Evento diario";

  return {
    title,
    block,
    startDay: event.startDay || null,
    startTime,
    endDay: event.endDay || null,
    endTime: event.endTime || "",
    startsAt,
    endsAt,
    importance,
    status: event.status || "",
    statusLabel: status,
    text: `Evento diario: ${title}. Aparece en ${block} (${startsAt}) y dura hasta ${endsAt}. Importancia: ${importance}. Estado: ${status}.`,
  };
}

module.exports = {
  buildDailyEventNotice,
  getDailyEventTemplateId,
};
