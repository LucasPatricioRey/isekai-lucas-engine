require("dotenv").config({ quiet: true });

const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");

const connectDB = require("../config/db");

const Checkpoint = require("../models/Checkpoint");
const Commitment = require("../models/Commitment");
const EventLog = require("../models/EventLog");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const Location = require("../models/Location");
const Mission = require("../models/Mission");
const NpcMemory = require("../models/NpcMemory");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const Shop = require("../models/Shop");
const WeatherState = require("../models/WeatherState");
const WorldDocumentIndex = require("../models/WorldDocumentIndex");
const WorldEvent = require("../models/WorldEvent");
const { CRITICAL_RULE_CARDS_VERSION, criticalRuleCards } = require("../seeds/criticalRuleCards");

const GAME_ID = "isekai_lucas_main";
const SOURCE = "c22_mongo_state_repair";
const CURRENT_DAY = 18;
const CURRENT_TIME = "10:05";

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function withoutTechnicalTags(tags = []) {
  return unique(
    tags.filter((tag) => !/(admin|repair|fix|debug|former|duplicate|test|continuity_bug)/i.test(String(tag)))
  );
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text, maxLength = 1200) {
  const chunks = [];
  const sections = text.split(/\n(?=## )/g);

  for (const section of sections) {
    if (section.length <= maxLength) {
      chunks.push(section.trim());
      continue;
    }

    for (let i = 0; i < section.length; i += maxLength) {
      chunks.push(section.slice(i, i + maxLength).trim());
    }
  }

  return chunks.filter(Boolean);
}

function extractVersion(content) {
  const match = String(content || "").match(/^Versi(?:o|ó|Ã³)n:\s*(.+)$/imu);
  return match ? match[1].trim() : "sin_version";
}

function item(itemId, data) {
  return {
    itemId,
    name: data.name,
    type: data.type,
    subtype: data.subtype || "",
    description: data.description || "",
    stackable: data.stackable ?? false,
    basePriceCopper: data.basePriceCopper ?? 0,
    satietyBonus: 0,
    energyBonus: 0,
    mpBonus: 0,
    durability: data.durability || { max: null, defaultCurrent: null },
    rarity: data.rarity || "common",
    legalStatus: data.legalStatus || "legal",
    tags: unique(["c22", "hoshimori", SOURCE, ...(data.tags || [])]),
  };
}

function faction(factionId, data) {
  return {
    factionId,
    name: data.name,
    type: data.type || "other",
    scope: data.scope || "local",
    regionIds: data.regionIds || ["region_hoshimori"],
    goals: data.goals || [],
    resources: data.resources || [],
    relationshipWithLucas: data.relationshipWithLucas || {
      reputation: 0,
      trust: 0,
      suspicion: 0,
      institutionalCredit: 0,
      merit: 0,
      accessLevel: "basic",
      notes: "Base institucional local creada por reparacion C22.",
    },
    knownFactsAboutLucas: data.knownFactsAboutLucas || [],
    activePolicies: data.activePolicies || [],
    conflicts: data.conflicts || [],
    allies: data.allies || [],
    rivals: data.rivals || [],
    flags: {
      ...(data.flags || {}),
      source: SOURCE,
      c22: true,
    },
  };
}

function mission(missionId, data) {
  return {
    missionId,
    templateId: data.templateId,
    title: data.title,
    description: data.description,
    sourceFactionId: data.sourceFactionId || "faction_hoshimori_guild",
    clientNpcId: data.clientNpcId || "",
    locationId: data.locationId,
    rank: data.rank || "Porcelana",
    requirements: data.requirements || [],
    reward: data.reward || { moneyCopper: 0, items: [], other: "" },
    mgReward: data.mgReward ?? 1,
    riskLevel: data.riskLevel || "low",
    status: "available",
    postedDay: CURRENT_DAY,
    postedTime: "10:05",
    expiresDay: data.expiresDay,
    expiresTime: data.expiresTime || "18:00",
    acceptedByCharacterId: "",
    acceptedDay: null,
    completedDay: null,
    proofRequired: data.proofRequired || "reporte verificable",
    proofStatus: data.proofStatus || "pending",
    consequencesIfIgnored: data.consequencesIfIgnored || [],
    relatedEventIds: data.relatedEventIds || [],
    flags: {
      c22: true,
      ...(data.flags || {}),
    },
  };
}

async function upsertItems() {
  const items = [
    item("item_ropa_comun_viajero", {
      name: "Ropa comun de viajero",
      type: "armor",
      subtype: "common_clothes",
      description: "Ropa comun de viaje usada por Lucas. No protege de golpes serios.",
      basePriceCopper: 70,
      durability: { max: 45, defaultCurrent: 38 },
      tags: ["clothing", "travel", "starter", "non_magic"],
    }),
    item("item_botas_simples", {
      name: "Botas simples",
      type: "armor",
      subtype: "boots",
      description: "Botas simples y funcionales para caminos de pueblo y barro ligero.",
      basePriceCopper: 90,
      durability: { max: 50, defaultCurrent: 42 },
      tags: ["clothing", "boots", "travel", "starter", "non_magic"],
    }),
    item("item_nota_horarios_grulla_azul", {
      name: "Nota de horarios de La Grulla Azul",
      type: "document",
      subtype: "work_schedule_note",
      description: "Nota simple con horarios oficiales de turnos de La Grulla Azul.",
      basePriceCopper: 0,
      durability: { max: null, defaultCurrent: null },
      tags: ["document", "work", "schedule", "grulla_azul", "non_trade"],
    }),
  ];

  const result = { upserted: 0, matched: 0 };
  for (const entry of items) {
    const update = await Item.updateOne(
      { itemId: entry.itemId },
      { $set: entry },
      { upsert: true }
    );
    result.upserted += update.upsertedCount || 0;
    result.matched += update.matchedCount || 0;
  }
  return result;
}

async function upsertFactions() {
  const factions = [
    faction("faction_hoshimori_temple", {
      name: "Templo de la Llama Serena de Hoshimori",
      type: "temple",
      goals: ["ofrecer reposo, consejo y primeros auxilios sin prometer milagros"],
      resources: ["sala tranquila", "vendajes", "infusiones", "red comunitaria"],
      activePolicies: ["no curas gratis ni milagros garantizados", "mantener el templo como refugio"],
    }),
    faction("faction_hoshimori_council", {
      name: "Consejo local de Hoshimori",
      type: "village",
      goals: ["mantener registros locales", "mediar conflictos menores", "coordinar con guardia y gremio"],
      resources: ["archivo local", "escribanos", "autoridad administrativa limitada"],
      activePolicies: ["preferir registro escrito y testigos antes que rumores"],
    }),
  ];

  const result = { upserted: 0, matched: 0 };
  for (const entry of factions) {
    const update = await Faction.updateOne(
      { factionId: entry.factionId },
      { $set: entry },
      { upsert: true }
    );
    result.upserted += update.upsertedCount || 0;
    result.matched += update.matchedCount || 0;
  }

  await Shop.updateOne(
    { shopId: "shop_temple_serene_flame_services" },
    { $set: { factionId: "faction_hoshimori_temple" } }
  );
  await Location.updateOne(
    { locationId: "loc_hoshimori_temple_serene_flame" },
    { $set: { controllingFactionId: "faction_hoshimori_temple" } }
  );
  await Location.updateOne(
    { locationId: "loc_hoshimori_council_records" },
    { $set: { controllingFactionId: "faction_hoshimori_council" } }
  );

  return result;
}

async function repairEvents() {
  const routeThreatId = "event_debug_job_patch_1781242453981_d10_daily_route_threat_report";
  const marketEventId = "event_remote_social_phase1_1781075954993_d12_daily_market_price_argument";
  const forestEventId = "event_isekai_lucas_main_d13_daily_forest_edge_odd_tracks";

  const routeThreat = await WorldEvent.findOne({ eventId: routeThreatId }).lean();
  const routeThreatTags = withoutTechnicalTags(routeThreat?.tags || []);

  await WorldEvent.updateOne(
    { eventId: routeThreatId },
    {
      $set: {
        status: "cancelled",
        eventLayer: "background",
        countsAsMainEvent: false,
        blocksMainEventGeneration: false,
        resolution: {
          ...(routeThreat?.resolution || {}),
          status: "superseded",
          day: CURRENT_DAY,
          time: CURRENT_TIME,
          summary:
            "Archivado por reparacion C22: era un evento principal activo huerfano no listado en GameState y quedo reemplazado por el evento canonico del bosque.",
          source: SOURCE,
        },
        tags: unique([...routeThreatTags, "superseded_background"]),
      },
    }
  );

  const marketEvent = await WorldEvent.findOne({ eventId: marketEventId }).lean();
  await WorldEvent.updateOne(
    { eventId: marketEventId },
    {
      $set: {
        status: "active",
        eventLayer: "minor_rumor",
        countsAsMainEvent: false,
        blocksMainEventGeneration: false,
        tags: unique([...withoutTechnicalTags(marketEvent?.tags || []), "minor_rumor", "market"]),
        progress: {
          ...(marketEvent?.progress || {}),
          stage: "active_background_tension",
          statusLabel: "rumor de mercado activo",
          summary:
            "La discusion menor de precios quedo como tension de fondo del mercado; no bloquea eventos principales.",
          confidence: "rumor",
          nextAction: "Puede aparecer como ruido social si Lucas pasa por el mercado.",
          lastUpdatedDay: CURRENT_DAY,
          lastUpdatedTime: CURRENT_TIME,
          updatedByCharacterId: "system",
        },
      },
    }
  );

  const forestEvent = await WorldEvent.findOne({ eventId: forestEventId }).lean();
  await WorldEvent.updateOne(
    { eventId: forestEventId },
    { $set: { tags: withoutTechnicalTags(forestEvent?.tags || []) } }
  );

  const lioraEvent = await WorldEvent.findOne({
    eventId: "event_isekai_lucas_main_d14_daily_liora_herb_label",
  }).lean();
  await WorldEvent.updateOne(
    { eventId: "event_isekai_lucas_main_d14_daily_liora_herb_label" },
    {
      $set: {
        tags: unique([...withoutTechnicalTags(lioraEvent?.tags || []), "minor_rumor", "market_herbs"]),
        eventLayer: "minor_rumor",
        countsAsMainEvent: false,
        blocksMainEventGeneration: false,
      },
    }
  );

  const finishedEvents = await WorldEvent.find({ status: { $in: ["resolved", "cancelled", "expired"] } })
    .select("eventId tags")
    .lean();
  for (const event of finishedEvents) {
    await WorldEvent.updateOne(
      { eventId: event.eventId },
      { $set: { tags: withoutTechnicalTags(event.tags || []) } }
    );
  }

  await GameState.updateOne(
    { gameId: GAME_ID },
    {
      $set: {
        activeEventIds: [forestEventId],
      },
    }
  );

  return { cancelledMainEvent: routeThreatId, activatedMinorEvent: marketEventId, keptMainEvent: forestEventId };
}

async function deleteFutureTestLedgers() {
  const result = await NpcSocialLedger.deleteMany({
    day: { $gt: CURRENT_DAY },
    ledgerId: /^social_test_daily_event_/,
  });
  return { deleted: result.deletedCount || 0 };
}

async function repairMemoryLocations() {
  const replacements = {
    loc_hoshimori_forest_edge: "loc_hoshimori_forest_whispers_edge",
    loc_hoshimori_mill_road: "loc_hoshimori_road_to_mill",
  };
  let touched = 0;

  for (const [from, to] of Object.entries(replacements)) {
    const memories = await NpcMemory.find({ relatedLocationIds: from }).lean();
    for (const memory of memories) {
      const nextLocations = unique((memory.relatedLocationIds || []).map((id) => (id === from ? to : id)));
      await NpcMemory.updateOne(
        { memoryId: memory.memoryId },
        { $set: { relatedLocationIds: nextLocations } }
      );
      touched += 1;
    }
  }

  return { touched };
}

async function repairConditionalCommitment() {
  const commitmentId = "commitment_1781307485247_pfes8o";
  const result = await Commitment.updateOne(
    { commitmentId },
    {
      $set: {
        status: "active",
        priority: "low",
        nextCheckDay: 30,
        nextCheckTime: "09:00",
        dormantUntilDay: 30,
        dormantUntilTime: "09:00",
        requiresExplicitResolution: true,
        responsibleNpcId: "npc_roberto_valen",
        responsibleFactionId: "faction_grulla_azul",
        relatedNpcIds: ["npc_roberto_valen", "npc_yara_mils", "npc_fern"],
        relatedLocationIds: ["loc_hoshimori_grulla_azul"],
        conditionSummary:
          "Dormida hasta que Lucas tenga fama, registro o reconocimiento suficiente para atraer clientes de forma creible.",
        blockerSummary:
          "No exige accion inmediata: solo revisar si Lucas logra reconocimiento publico o avance formal como aventurero.",
        tags: unique(["c22", SOURCE, "conditional_long_term", "grulla_azul", "social_promise"]),
      },
    }
  );

  return { matched: result.matchedCount || 0, modified: result.modifiedCount || 0 };
}

async function upsertDay18Missions() {
  const entries = [
    mission("mission_d18_guild_forest_evidence_followup", {
      templateId: "template_forest_evidence_followup",
      title: "Comparar evidencia del borde del bosque",
      description:
        "Ayudar al gremio a comparar la muestra gris y los rastros reportados con marcas conocidas, sin internarse en el bosque.",
      clientNpcId: "npc_garrick_thorne",
      locationId: "loc_hoshimori_guild",
      rank: "Cobre",
      requirements: [
        "registro o autorizacion temporal del gremio",
        "no salir solo al bosque",
        "usar evidencia ya reportada",
      ],
      reward: { moneyCopper: 90, items: [], other: "Credito institucional si el reporte resulta util." },
      mgReward: 4,
      riskLevel: "low",
      expiresDay: 20,
      expiresTime: "18:00",
      proofRequired: "comparacion escrita o confirmacion de Garrick/Mara sobre la evidencia",
      consequencesIfIgnored: ["el gremio revisara la muestra mas tarde sin ayuda de Lucas"],
      relatedEventIds: ["event_isekai_lucas_main_d13_daily_forest_edge_odd_tracks"],
      flags: { missionType: "evidence_review", noCombatRequired: true, evidenceIds: ["evidence_forest_gray_hair_sample_d16"] },
    }),
    mission("mission_d18_liora_label_check", {
      templateId: "template_market_label_check",
      title: "Revisar etiqueta dudosa de hierbas",
      description:
        "Confirmar con Liora y Maelis si una etiqueta de hierbas esta mal copiada o si hubo confusion de lote.",
      sourceFactionId: "faction_hoshimori_merchants",
      clientNpcId: "npc_liora",
      locationId: "loc_hoshimori_liora_stall",
      rank: "Porcelana",
      requirements: ["hablar con calma", "no acusar sin prueba", "comparar etiqueta y lote"],
      reward: { moneyCopper: 55, items: [], other: "Descuento menor futuro si Liora queda conforme." },
      mgReward: 1,
      riskLevel: "none",
      expiresDay: 19,
      expiresTime: "18:00",
      proofRequired: "confirmacion de Liora o Maelis sobre la etiqueta",
      consequencesIfIgnored: ["el rumor seguira como ruido de mercado"],
      relatedEventIds: ["event_isekai_lucas_main_d14_daily_liora_herb_label"],
      flags: { missionType: "market_check", noCombatRequired: true },
    }),
    mission("mission_d18_mill_road_condition_report", {
      templateId: "template_mill_road_condition_report",
      title: "Estado del Camino del Molino",
      description:
        "Recoger un reporte simple sobre barro, ruedas y paso seguro entre la entrada del pueblo y el molino.",
      clientNpcId: "npc_tessa",
      locationId: "loc_hoshimori_road_to_mill",
      rank: "Porcelana",
      requirements: ["ir de dia", "no perseguir rastros", "volver si aparece peligro"],
      reward: { moneyCopper: 75, items: [], other: "" },
      mgReward: 2,
      riskLevel: "low",
      expiresDay: 19,
      expiresTime: "16:00",
      proofRequired: "reporte de dos tramos: barro, ruedas o paso seguro",
      consequencesIfIgnored: ["los viajeros dependeran de rumores de ruta"],
      flags: { missionType: "road_report", noCombatRequired: true, routeIds: ["route_hoshimori_road_to_mill"] },
    }),
    mission("mission_d18_temple_bandage_restock", {
      templateId: "template_temple_bandage_restock",
      title: "Reposicion menor de vendajes del templo",
      description:
        "Llevar o confirmar vendajes limpios entre Liora y el Templo de la Llama Serena.",
      sourceFactionId: "faction_hoshimori_temple",
      clientNpcId: "npc_maelis",
      locationId: "loc_hoshimori_temple_serene_flame",
      rank: "Porcelana",
      requirements: ["no usar suministros", "entregar a Maelis o Narek", "mantener el paquete limpio"],
      reward: { moneyCopper: 45, items: [], other: "Agradecimiento del templo." },
      mgReward: 1,
      riskLevel: "none",
      expiresDay: 20,
      expiresTime: "12:00",
      proofRequired: "confirmacion de Maelis o Narek",
      consequencesIfIgnored: ["el templo hara la reposicion con otro recadero"],
      flags: { missionType: "supply_delivery", noCombatRequired: true, requiredItemIds: ["item_vendaje_limpio"] },
    }),
  ];

  let upserted = 0;
  let matched = 0;
  for (const entry of entries) {
    const result = await Mission.updateOne(
      { missionId: entry.missionId },
      { $set: entry },
      { upsert: true }
    );
    upserted += result.upsertedCount || 0;
    matched += result.matchedCount || 0;
  }
  return { upserted, matched, missionIds: entries.map((entry) => entry.missionId) };
}

async function compactContextHeavyRecords() {
  const withdrawnMissionId = "mission_d18_temple_bandage_restock";
  await Mission.updateOne(
    { missionId: withdrawnMissionId },
    {
      $set: {
        status: "withdrawn",
        proofStatus: "not_required",
        flags: {
          c22: true,
          archivedReason: "optional_context_budget_task",
        },
      },
    }
  );

  const compactedCommitments = [];
  const registration = await Commitment.updateOne(
    { commitmentId: "commitment_1781302539341_t1v381" },
    {
      $set: {
        summary:
          "Lucas ya completo su parte del registro. Falta cierre interno de Mara/Garrick; debe revisarse pronto y resolverse con causa concreta.",
        blockerSummary:
          "Pendiente administrativo interno; si no hay objecion, cerrar registro en escena.",
        failureConsequence:
          "Si el gremio demora sin causa, Lucas puede exigir explicacion formal o elevar el reclamo.",
        successConsequence:
          "Lucas queda registrado como aspirante y puede recibir encargos bajo reglas del gremio.",
      },
    }
  );
  if (registration.matchedCount) compactedCommitments.push("commitment_1781302539341_t1v381");

  const lodging = await Commitment.updateOne(
    { commitmentId: "commitment_1781307703892_cviq2t" },
    {
      $set: {
        summary:
          "Lucas tiene alojamiento mensual en La Grulla Azul hasta Dia 46 por la noche.",
        failureConsequence:
          "Si no renueva ni cierra el trato, pierde continuidad de alojamiento y debe arreglar deuda o salida.",
        successConsequence:
          "Alojamiento renovado o cerrado sin deuda pendiente.",
      },
    }
  );
  if (lodging.matchedCount) compactedCommitments.push("commitment_1781307703892_cviq2t");

  return {
    withdrawnMissionId,
    compactedCommitments,
  };
}

async function reindexDocuments() {
  const docsDir = path.join(__dirname, "../../docs");
  const files = [
    { fileName: "rules_engine.md", source: "rules_engine" },
    { fileName: "world_bible.md", source: "world_bible" },
  ];

  await WorldDocumentIndex.deleteMany({ source: { $in: ["rules_engine", "world_bible"] } });

  const docsToInsert = [];
  let rulesEngineVersion = "sin_version";
  for (const file of files) {
    const fullPath = path.join(docsDir, file.fileName);
    const content = await fs.readFile(fullPath, "utf8");
    const version = extractVersion(content);
    if (file.source === "rules_engine") rulesEngineVersion = version;
    const chunks = chunkText(content);

    chunks.forEach((chunk, index) => {
      const firstLine = chunk.split("\n")[0] || file.fileName;
      const title = firstLine.replace(/^#+\s*/, "");
      docsToInsert.push({
        docId: `${file.source}_${index + 1}`,
        source: file.source,
        section: title,
        title,
        ruleId: "",
        domain: "",
        priority: "reference",
        appliesTo: [],
        must: [],
        never: [],
        template: "",
        content: chunk,
        searchText: normalizeSearchText(`${file.source} ${title} ${chunk}`),
        tags: [file.source, file.fileName.replace(".md", "")],
        version,
      });
    });
  }

  for (const card of criticalRuleCards) {
    const title = `Rule card: ${card.ruleId}`;
    const structuredText = [
      title,
      `Domain: ${card.domain}`,
      `Priority: ${card.priority}`,
      `Applies to: ${(card.appliesTo || []).join(", ")}`,
      `Must: ${(card.must || []).join(" | ")}`,
      `Never: ${(card.never || []).join(" | ")}`,
      card.template ? `Template: ${card.template}` : "",
      card.content,
    ]
      .filter(Boolean)
      .join("\n");

    docsToInsert.push({
      docId: `rule_${card.ruleId.replace(/[^a-z0-9_]+/gi, "_")}`,
      source: "rules_engine",
      section: title,
      title,
      ruleId: card.ruleId,
      domain: card.domain,
      priority: card.priority,
      appliesTo: card.appliesTo || [],
      must: card.must || [],
      never: card.never || [],
      template: card.template || "",
      content: structuredText,
      searchText: normalizeSearchText(
        [
          "rules_engine rule_card",
          card.ruleId,
          card.domain,
          card.priority,
          ...(card.appliesTo || []),
          ...(card.must || []),
          ...(card.never || []),
          card.template || "",
          card.content || "",
          ...(card.tags || []),
        ].join(" ")
      ),
      tags: ["rules_engine", "rule_card", ...(card.tags || [])],
      version: `${rulesEngineVersion}; ${CRITICAL_RULE_CARDS_VERSION}`,
    });
  }

  if (docsToInsert.length > 0) await WorldDocumentIndex.insertMany(docsToInsert);
  return { inserted: docsToInsert.length };
}

async function retainCheckpoints() {
  const autoCheckpoints = await Checkpoint.find({ gameId: GAME_ID, auto: true })
    .sort({ createdAt: -1 })
    .select("_id checkpointId")
    .lean();
  const keep = new Set(autoCheckpoints.slice(0, 20).map((checkpoint) => String(checkpoint._id)));
  const deleteIds = autoCheckpoints
    .filter((checkpoint) => !keep.has(String(checkpoint._id)))
    .map((checkpoint) => checkpoint._id);

  if (deleteIds.length === 0) return { deleted: 0, retainedAuto: autoCheckpoints.length };
  const result = await Checkpoint.deleteMany({ _id: { $in: deleteIds } });
  return { deleted: result.deletedCount || 0, retainedAuto: keep.size };
}

async function retainWeather() {
  const rows = await WeatherState.find({ regionId: "region_hoshimori" })
    .sort({ startedDay: -1, startedTime: -1, createdAt: -1 })
    .select("_id weatherId expectedUntilDay expectedUntilTime")
    .lean();
  const keepIds = new Set(rows.slice(0, 8).map((row) => String(row._id)));
  const deleteIds = rows.filter((row) => !keepIds.has(String(row._id))).map((row) => row._id);
  if (deleteIds.length === 0) return { deleted: 0, retained: rows.length };
  const result = await WeatherState.deleteMany({ _id: { $in: deleteIds } });
  return { deleted: result.deletedCount || 0, retained: keepIds.size };
}

async function writeRepairLog(summary) {
  await EventLog.updateOne(
    { logId: "log_c22_mongo_state_repair_d18_1005" },
    {
      $set: {
        logId: "log_c22_mongo_state_repair_d18_1005",
        gameId: GAME_ID,
        day: CURRENT_DAY,
        timeStart: CURRENT_TIME,
        timeEnd: CURRENT_TIME,
        locationId: "loc_hoshimori_guild",
        type: "state_hygiene_repair",
        summary:
          "Reparacion C22 de Mongo: eventos principales, ledgers de test, items, facciones, memorias, promesa condicional, cartelera, documentos, clima y checkpoints.",
        involvedCharacterIds: ["char_lucas"],
        involvedNpcIds: [],
        involvedFactionIds: ["faction_hoshimori_guild"],
        mechanicalChanges: {
          source: SOURCE,
          appliedDay: CURRENT_DAY,
          appliedTime: CURRENT_TIME,
          sections: Object.keys(summary),
          note: "Resumen compacto; el detalle completo queda en salida de consola del repair local.",
        },
        visibility: "hidden",
        source: "system_correction",
        tags: ["c22", SOURCE, "state_hygiene"],
      },
    },
    { upsert: true }
  );
}

async function repairMongoStateC22() {
  await connectDB();

  const summary = {};
  summary.items = await upsertItems();
  summary.factions = await upsertFactions();
  summary.events = await repairEvents();
  summary.deletedFutureTestLedgers = await deleteFutureTestLedgers();
  summary.memoryLocations = await repairMemoryLocations();
  summary.conditionalCommitment = await repairConditionalCommitment();
  summary.day18Missions = await upsertDay18Missions();
  summary.contextCompaction = await compactContextHeavyRecords();
  summary.documentIndex = await reindexDocuments();
  summary.weatherRetention = await retainWeather();
  summary.checkpointRetention = await retainCheckpoints();
  await writeRepairLog(summary);

  console.log(JSON.stringify({ source: SOURCE, summary }, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  repairMongoStateC22().catch(async (error) => {
    console.error("Error repairing Mongo state C22:", error);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  SOURCE,
  repairMongoStateC22,
};
