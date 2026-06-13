require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Evidence = require("../models/Evidence");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");

const GAME_ID = process.env.GAME_ID || "isekai_lucas_main";
const EVENT_TEMPLATE_ID = "forest_edge_odd_tracks";
const EVIDENCE_ID = "evidence_forest_gray_hair_sample_d16";
const REPORT_LOG_ID = "log_repair_forest_tracks_evidence_reported_d16";

async function repairForestEvidenceProgress() {
  await connectDB();

  const gameState = await GameState.findOne({ gameId: GAME_ID });
  if (!gameState) throw new Error(`No existe GameState para ${GAME_ID}.`);

  const event = await WorldEvent.findOne({
    gameId: GAME_ID,
    templateId: EVENT_TEMPLATE_ID,
    status: { $in: ["scheduled", "active"] },
  }).sort({ startDay: -1, createdAt: -1 });

  if (!event) throw new Error("No se encontro evento activo/programado de rastros raros.");

  const evidence = await Evidence.findOneAndUpdate(
    { gameId: GAME_ID, evidenceId: EVIDENCE_ID },
    {
      $set: {
        evidenceId: EVIDENCE_ID,
        gameId: GAME_ID,
        characterId: "char_lucas",
        name: "Mechon de pelo gris oscuro del borde del bosque",
        summary:
          "Muestra rigida y aspera recogida en una rama baja quebrada durante la investigacion de rastros raros en el borde del Bosque de los Susurros. Fue mostrada a Garrick y Mara como evidencia no concluyente.",
        type: "sample",
        status: "reported",
        holderType: "character",
        holderId: "char_lucas",
        containerItemId: "item_mochila_basica",
        locationId: "loc_hoshimori_guild",
        sourceEventId: event.eventId,
        relatedEventIds: [event.eventId],
        reportedToNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
        visibleToNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
        condition: "guardado",
        integrity: 90,
        collectedDay: 16,
        collectedTime: "09:10",
        observations: [
          {
            day: 16,
            time: "09:10",
            locationId: "loc_hoshimori_forest_whispers_edge",
            summary:
              "Lucas encontro el mechon enganchado en una rama baja quebrada junto al rastro de pezuna y arrastre.",
            byCharacterId: "char_lucas",
            certainty: "confirmed",
            tags: ["forest_tracks", "hair_sample", "collected"],
          },
          {
            day: 16,
            time: "11:20",
            locationId: "loc_hoshimori_guild",
            summary:
              "Garrick y Mara recibieron el reporte y vieron la muestra; la registraron como evidencia util pero no concluyente.",
            byCharacterId: "char_lucas",
            certainty: "confirmed",
            tags: ["guild_report", "evidence_reported"],
          },
        ],
        tags: [
          "forest_tracks",
          "hair_sample",
          "evidence_collected",
          "evidence_reported",
          "guild_report",
          "evidence_status_reported",
        ],
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true }
  ).lean();

  event.progress = {
    ...(event.progress?.toObject ? event.progress.toObject() : event.progress || {}),
    stage: "reported_partial_evidence",
    statusLabel: "evidencia parcial reportada",
    summary:
      "Lucas encontro marcas de pezuna y arrastre, ramas bajas quebradas y un mechon de pelo gris oscuro. Informo al gremio y mostro la muestra, pero la criatura o causa sigue sin identificar.",
    confidence: "partial",
    nextAction:
      "El gremio puede revisar la evidencia, comparar rastros o preparar una verificacion con mas seguridad antes de internarse.",
    clueIds: Array.from(new Set([...(event.progress?.clueIds || []), "clue_forest_hoof_drag_tracks_d16"])),
    evidenceIds: Array.from(new Set([...(event.progress?.evidenceIds || []), evidence.evidenceId])),
    reportIds: Array.from(new Set([...(event.progress?.reportIds || []), REPORT_LOG_ID])),
    lastUpdatedDay: 16,
    lastUpdatedTime: "11:20",
    updatedByCharacterId: "char_lucas",
  };
  event.tags = Array.from(new Set([...(event.tags || []), "event_progress_reported", "evidence_reported"]));
  await event.save();

  await EventLog.findOneAndUpdate(
    { gameId: GAME_ID, logId: REPORT_LOG_ID },
    {
      $set: {
        logId: REPORT_LOG_ID,
        gameId: GAME_ID,
        day: 16,
        timeStart: "11:20",
        timeEnd: "11:20",
        locationId: "loc_hoshimori_guild",
        type: "forest_tracks_evidence_progress_repair",
        summary:
          "Reparacion tecnica: la muestra de pelo gris del bosque queda como Evidence formal y el evento de rastros raros marca progreso parcial reportado al gremio.",
        involvedCharacterIds: ["char_lucas"],
        involvedNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
        involvedFactionIds: ["faction_hoshimori_guild"],
        visibility: "hidden",
        source: "backend_validation",
        tags: [
          "repair",
          "evidence",
          "forest_tracks",
          "world_event_progress",
          "action_family_report",
        ],
        mechanicalChanges: {
          evidence: [
            {
              op: "report",
              evidenceId: evidence.evidenceId,
              status: evidence.status,
            },
          ],
          worldEvents: [
            {
              eventId: event.eventId,
              progress: event.progress,
            },
          ],
          narrativeTracking: {
            actionFamily: "report",
            actionFingerprint: "report:loc_guild:npc_garrick_thorne,npc_mara_vell",
          },
        },
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        gameId: GAME_ID,
        eventId: event.eventId,
        evidenceId: evidence.evidenceId,
        progressStage: event.progress.stage,
      },
      null,
      2
    )
  );
}

repairForestEvidenceProgress()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
