require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");
const { eventGameFilter, isMainEvent } = require("../services/dailyEventSchedulerService");

const WRITE = process.argv.includes("--write") || process.env.WRITE_DAILY_EVENT_REPAIR === "true";

const FACTIONS = [
  {
    factionId: "faction_hoshimori_innkeepers",
    name: "Posaderos de Hoshimori",
    type: "shop",
    scope: "local",
    regionIds: ["region_hoshimori"],
    goals: ["hospitalidad estable", "clientes seguros", "suministros constantes"],
    resources: ["posadas", "cocinas", "habitaciones", "contactos de viajeros"],
    relationshipWithLucas: {
      reputation: 10,
      trust: 10,
      suspicion: 0,
      accessLevel: "basic",
      notes: "Lucas es conocido principalmente por su trabajo en La Grulla Azul.",
    },
  },
  {
    factionId: "faction_hoshimori_merchants",
    name: "Comerciantes de Hoshimori",
    type: "merchant",
    scope: "local",
    regionIds: ["region_hoshimori"],
    goals: ["precios estables", "rutas abiertas", "stock suficiente"],
    resources: ["puestos", "mercado", "red local de intercambio"],
    relationshipWithLucas: {
      reputation: 0,
      trust: 0,
      suspicion: 0,
      accessLevel: "basic",
      notes: "Lucas todavia no tiene reputacion comercial fuerte.",
    },
  },
  {
    factionId: "faction_hoshimori_guard",
    name: "Guardia local de Hoshimori",
    type: "guard",
    scope: "local",
    regionIds: ["region_hoshimori"],
    goals: ["orden local", "rutas seguras", "respuesta ante amenazas"],
    resources: ["puesto de guardia", "patrullas", "reportes de ruta"],
    relationshipWithLucas: {
      reputation: 0,
      trust: 0,
      suspicion: 0,
      accessLevel: "basic",
      notes: "Lucas todavia no tiene historial formal con la guardia.",
    },
  },
];

const NPC_ID_REPLACEMENTS = {
  npc_pavo_miret: "npc_pavo",
  npc_irma_solan: "npc_irma",
  npc_mara_quent: "npc_mara_vell",
  npc_sael_lyren: "npc_sael_nyra",
};

const LOCATION_ID_REPLACEMENTS = {
  loc_hoshimori_mill_road: "loc_hoshimori_road_to_mill",
  loc_hoshimori_forest_edge: "loc_hoshimori_forest_whispers_edge",
};

const KNOWN_RESOLVED_EVENT_IDS = [
  "event_isekai_lucas_main_d11_daily_npc_small_favor",
];

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function replaceIds(values, replacements) {
  return unique((values || []).map((value) => replacements[value] || value));
}

async function upsertFactions() {
  const operations = FACTIONS.map((faction) => ({
    updateOne: {
      filter: { factionId: faction.factionId },
      update: { $set: faction },
      upsert: true,
    },
  }));

  if (WRITE) {
    const result = await Faction.bulkWrite(operations);
    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    };
  }

  return {
    wouldUpsert: FACTIONS.map((faction) => faction.factionId),
  };
}

async function repairWorldEventReferences() {
  const events = await WorldEvent.find({}).select("eventId affectedNpcIds affectedLocationIds").lean();
  const updates = [];

  for (const event of events) {
    const affectedNpcIds = replaceIds(event.affectedNpcIds, NPC_ID_REPLACEMENTS);
    const affectedLocationIds = replaceIds(event.affectedLocationIds, LOCATION_ID_REPLACEMENTS);
    const changed =
      JSON.stringify(affectedNpcIds) !== JSON.stringify(event.affectedNpcIds || []) ||
      JSON.stringify(affectedLocationIds) !== JSON.stringify(event.affectedLocationIds || []);

    if (changed) {
      updates.push({
        eventId: event.eventId,
        affectedNpcIds,
        affectedLocationIds,
      });
    }
  }

  if (WRITE) {
    for (const update of updates) {
      await WorldEvent.updateOne(
        { eventId: update.eventId },
        {
          $set: {
            affectedNpcIds: update.affectedNpcIds,
            affectedLocationIds: update.affectedLocationIds,
          },
          $addToSet: { tags: "admin_reference_repair" },
        }
      );
    }
  }

  return {
    count: updates.length,
    updates,
  };
}

async function resolveKnownCompletedEvents() {
  const events = await WorldEvent.find({
    eventId: { $in: KNOWN_RESOLVED_EVENT_IDS },
    status: { $in: ["scheduled", "active"] },
  })
    .select("eventId status")
    .lean();

  if (WRITE) {
    await WorldEvent.updateMany(
      {
        eventId: { $in: events.map((event) => event.eventId) },
      },
      {
        $set: { status: "resolved" },
        $addToSet: {
          tags: {
            $each: ["event_resolved", "admin_fix"],
          },
        },
      }
    );
  }

  return {
    count: events.length,
    events,
  };
}

async function reconcileGameStateActiveEvents() {
  const gameStates = await GameState.find({}).select("gameId activeEventIds").lean();
  const updates = [];

  for (const gameState of gameStates) {
    const activeEvents = await WorldEvent.find({
      ...eventGameFilter(gameState.gameId),
      status: "active",
    })
      .select("eventId tags eventLayer countsAsMainEvent blocksMainEventGeneration")
      .lean();
    const activeEventIds = unique(activeEvents.filter(isMainEvent).map((event) => event.eventId));
    const changed = JSON.stringify(activeEventIds) !== JSON.stringify(gameState.activeEventIds || []);

    if (changed) {
      updates.push({
        gameId: gameState.gameId,
        before: gameState.activeEventIds || [],
        after: activeEventIds,
      });
    }
  }

  if (WRITE) {
    for (const update of updates) {
      await GameState.updateOne({ gameId: update.gameId }, { $set: { activeEventIds: update.after } });
    }
  }

  return {
    count: updates.length,
    updates,
  };
}

async function main() {
  await connectDB();

  const result = {
    mode: WRITE ? "write" : "dry-run",
    factions: await upsertFactions(),
    referenceRepair: await repairWorldEventReferences(),
    resolvedEvents: await resolveKnownCompletedEvents(),
    activeEventIds: await reconcileGameStateActiveEvents(),
  };

  console.log(JSON.stringify(result, null, 2));

  if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_DAILY_EVENT_REPAIR=true to apply.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Daily event integrity repair failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
