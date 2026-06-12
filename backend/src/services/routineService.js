const Npc = require("../models/Npc");
const RoutineOverride = require("../models/RoutineOverride");

function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function isTimeInRange(currentTime, startTime, endTime) {
  if (!currentTime || !startTime || !endTime) return false;

  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === end) return false;

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
}

function inferAvailability(task) {
  const value = String(task || "").toLowerCase();

  if (value.includes("durmiendo")) return "sleeping";
  if (value.includes("viajando")) return "traveling";
  if (
    value.includes("atendiendo") ||
    value.includes("supervisando") ||
    value.includes("descansando") ||
    value.includes("disponible")
  ) {
    return "available";
  }

  return "busy";
}

function findRoutineEntry(routineBase, time) {
  return (routineBase || []).find((entry) =>
    isTimeInRange(time, entry.timeStart, entry.timeEnd)
  );
}

async function findRoutineOverride(npcId, day, time, session = null) {
  const query = RoutineOverride.find({
    npcId,
    day,
    status: { $in: ["scheduled", "active"] },
  }).lean();

  if (session) query.session(session);

  const overrides = await query;

  return overrides
    .filter((override) => isTimeInRange(time, override.timeStart, override.timeEnd))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
}

async function syncNpcRoutines({ day, time, session = null }) {
  const query = Npc.find({});

  if (session) query.session(session);

  const npcs = await query.exec();

  const updated = [];
  const skipped = [];

  for (const npc of npcs) {
    const override = await findRoutineOverride(npc.npcId, day, time, session);
    const routine = override || findRoutineEntry(npc.routineBase, time);

    if (!routine) {
      skipped.push({
        npcId: npc.npcId,
        name: npc.name,
        reason: "sin rutina aplicable para esta hora",
      });
      continue;
    }

    const nextLocationId = routine.locationId;
    const nextTask = routine.task;
    const nextStatus = inferAvailability(nextTask);
    const nextReason = override
      ? `Override de rutina vigente para Dia ${day} ${time}`
      : `Rutina base vigente para ${time}`;

    const changed =
      npc.currentLocationId !== nextLocationId ||
      npc.currentTask !== nextTask ||
      npc.availability?.status !== nextStatus ||
      npc.availability?.reason !== nextReason;

    if (!changed) {
      skipped.push({
        npcId: npc.npcId,
        name: npc.name,
        reason: "sin cambios",
      });
      continue;
    }

    const before = {
      currentLocationId: npc.currentLocationId,
      currentTask: npc.currentTask,
      availability: npc.availability,
    };

    npc.currentLocationId = nextLocationId;
    npc.currentTask = nextTask;
    npc.availability = {
      status: nextStatus,
      reason: nextReason,
    };

    await npc.save({ session });

    updated.push({
      npcId: npc.npcId,
      name: npc.name,
      before,
      after: {
        currentLocationId: npc.currentLocationId,
        currentTask: npc.currentTask,
        availability: npc.availability,
      },
      source: override ? "override" : "routineBase",
    });
  }

  return {
    day,
    time,
    updatedCount: updated.length,
    skippedCount: skipped.length,
    updated,
  };
}

module.exports = {
  syncNpcRoutines,
  isTimeInRange,
};
