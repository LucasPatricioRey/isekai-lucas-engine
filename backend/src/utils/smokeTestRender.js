require("dotenv").config();

const BASE_URL = process.env.SMOKE_BASE_URL || "https://isekai-lucas-engine.onrender.com";
const API_KEY = process.env.API_KEY || "dev-secret";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

async function runSmokeTests() {
  console.log(`Probando API en: ${BASE_URL}`);

  const health = await fetch(`${BASE_URL}/api/health`).then((res) => res.json());
  if (!health.ok) throw new Error("Health check fallo");
  console.log("OK /api/health");

  const context = await request("/api/context/full");
  if (!context.ok) throw new Error("context/full fallo");
  if (!context.context?.gameState) throw new Error("context/full no devolvio gameState");
  console.log("OK /api/context/full");
  console.log("Estado:", {
    day: context.context.gameState.currentDay,
    time: context.context.gameState.time,
    moneyCopper: context.context.gameState.moneyCopper,
  });

  const searchDb = await request("/api/search/db?q=fern");
  if (!searchDb.ok) throw new Error("search/db fallo");
  console.log("OK /api/search/db?q=fern");

  const searchDocs = await request("/api/search/docs?q=romance");
  if (!searchDocs.ok) throw new Error("search/docs fallo");
  console.log("OK /api/search/docs?q=romance");

  const npc = await request("/api/npcs/npc_fern/full");
  if (!npc.ok) throw new Error("npcs/npc_fern/full fallo");
  console.log("OK /api/npcs/npc_fern/full");

  const location = await request("/api/locations/loc_hoshimori_grulla_azul_comedor/full");
  if (!location.ok) throw new Error("locations/full fallo");
  console.log("OK /api/locations/.../full");

  const economy = await request("/api/economy/shops/shop_pavo_food_stall/stock");
  if (!economy.ok) throw new Error("economy stock fallo");
  if (!Array.isArray(economy.stocks)) throw new Error("economy stock no devolvio stocks");
  console.log("OK /api/economy/shops/.../stock");

  const shops = await request("/api/economy/shops");
  if (!shops.ok) throw new Error("economy shops fallo");
  if (!Array.isArray(shops.shops)) throw new Error("economy shops no devolvio shops");
  console.log("OK /api/economy/shops");

  const borinStock = await request("/api/economy/shops/shop_borin_smithy/stock");
  if (!borinStock.ok) throw new Error("borin stock fallo");
  if (!Array.isArray(borinStock.stocks)) throw new Error("borin stock no devolvio stocks");
  console.log("OK /api/economy/shops/shop_borin_smithy/stock");

  const lioraStock = await request("/api/economy/shops/shop_liora_herbs/stock");
  if (!lioraStock.ok) throw new Error("liora stock fallo");
  if (!Array.isArray(lioraStock.stocks)) throw new Error("liora stock no devolvio stocks");
  console.log("OK /api/economy/shops/shop_liora_herbs/stock");

  const missions = await request("/api/missions/board");
  if (!missions.ok) throw new Error("missions board fallo");
  if (!Array.isArray(missions.missions)) throw new Error("missions board no devolvio missions");
  if (missions.missions.length < 1) throw new Error("missions board no devolvio misiones jugables");
  console.log("OK /api/missions/board");

  const missionDetail = await request("/api/missions/mission_d10_grulla_delivery_guild");
  if (!missionDetail.ok) throw new Error("mission detail fallo");
  if (!missionDetail.mission?.missionId) throw new Error("mission detail no devolvio mission");
  console.log("OK /api/missions/mission_d10_grulla_delivery_guild");

  const activeJob = await request("/api/jobs/contracts/active");
  if (!activeJob.ok) throw new Error("active job contract fallo");
  if (!activeJob.contract?.contractId) throw new Error("active job contract no devolvio contract");
  console.log("OK /api/jobs/contracts/active");

  const shiftPreview = await post("/api/jobs/shifts/shift_grulla_afternoon_1400_2030/preview", {});
  if (!shiftPreview.ok) throw new Error("job shift preview fallo");
  if (shiftPreview.preview?.mutation?.willMutateGameState !== false) {
    throw new Error("job shift preview no es dryRun");
  }
  console.log("OK /api/jobs/shifts/.../preview");

  const activityPreview = await post("/api/needs/activity-cost/preview", {
    category: "trabajo_normal",
    minutes: 60,
  });
  if (!activityPreview.ok) throw new Error("activity cost preview fallo");
  if (activityPreview.preview?.totalDelta?.energy !== -6) {
    throw new Error("activity cost preview no coincide con trabajo_normal");
  }
  console.log("OK /api/needs/activity-cost/preview");

  const skillPreview = await post("/api/progression/skills/preview", {
    skillId: "skill_mana",
    category: "practica_basica_1h_solo",
    expDelta: 4,
    currentEnergy: 80,
    modifiers: { aquaBlessing: true },
  });
  if (!skillPreview.ok) throw new Error("skill progression preview fallo");
  if (skillPreview.preview?.validation?.effectiveExpDelta !== 20) {
    throw new Error("skill progression preview no aplico Aqua a Mana");
  }
  console.log("OK /api/progression/skills/preview");

  const magicDisciplines = await request("/api/magic/disciplines");
  if (!magicDisciplines.ok) throw new Error("magic disciplines fallo");
  if (!Array.isArray(magicDisciplines.disciplines)) throw new Error("magic disciplines no devolvio disciplines");
  if (magicDisciplines.disciplines.length < 12) throw new Error("magic disciplines devolvio menos de 12 disciplinas");
  console.log("OK /api/magic/disciplines");

  const magicTechniques = await request("/api/magic/techniques");
  if (!magicTechniques.ok) throw new Error("magic techniques fallo");
  if (!Array.isArray(magicTechniques.techniques)) throw new Error("magic techniques no devolvio techniques");
  if (magicTechniques.techniques.length < 6) throw new Error("magic techniques devolvio menos de 6 tecnicas");
  console.log("OK /api/magic/techniques");

  const weatherCurrent = await request("/api/weather/current?regionId=region_hoshimori");
  if (!weatherCurrent.ok) throw new Error("weather current fallo");
  if (!weatherCurrent.weather?.weatherId) throw new Error("weather current no devolvio weather");
  console.log("OK /api/weather/current");

  const weatherPreview = await post("/api/weather/effects/preview", {
    routeType: "road",
    terrain: ["mud_road"],
  });
  if (!weatherPreview.ok) throw new Error("weather effects preview fallo");
  if (weatherPreview.preview?.willMutateGameState !== false) {
    throw new Error("weather effects preview no es dryRun");
  }
  console.log("OK /api/weather/effects/preview");

  const travelRoutes = await request("/api/travel/routes");
  if (!travelRoutes.ok) throw new Error("travel routes fallo");
  if (!Array.isArray(travelRoutes.routes)) throw new Error("travel routes no devolvio routes");
  if (travelRoutes.routes.length < 20) throw new Error("travel routes devolvio menos de 20 rutas");
  console.log("OK /api/travel/routes");

  const travelPreview = await post("/api/travel/preview", {
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_guild",
    conditions: {
      ignoreCurrentWeather: true,
      startTime: "12:40",
    },
  });
  if (!travelPreview.ok) throw new Error("travel preview fallo");
  if (travelPreview.preview?.timing?.finalMinutes !== 20) {
    throw new Error("travel preview Grulla Azul -> Gremio no devolvio 20 minutos");
  }
  if (travelPreview.preview?.biologicalCostPreview?.satietyDelta !== -1) {
    throw new Error("travel preview no devolvio coste biologico esperado");
  }
  console.log("OK /api/travel/preview");

  const combatActions = await request("/api/combat/actions");
  if (!combatActions.ok) throw new Error("combat actions fallo");
  if (!Array.isArray(combatActions.actions)) throw new Error("combat actions no devolvio actions");
  if (combatActions.actions.length < 9) throw new Error("combat actions devolvio menos de 9 acciones");
  console.log("OK /api/combat/actions");

  const worldTickPreview = await post("/api/world/tick/preview", {
    fromTime: "12:00",
    toTime: "14:00",
    dryRun: true,
  });
  if (!worldTickPreview.ok) throw new Error("world tick preview fallo");
  if (worldTickPreview.preview?.willMutateGameState !== false) {
    throw new Error("world tick preview no es dryRun");
  }
  console.log("OK /api/world/tick/preview");

  const combatEnemies = await request("/api/combat/enemies");
  if (!combatEnemies.ok) throw new Error("combat enemies fallo");
  if (!Array.isArray(combatEnemies.enemies)) throw new Error("combat enemies no devolvio enemies");
  console.log("OK /api/combat/enemies");

  const activeCombats = await request("/api/combat/encounters/active");
  if (!activeCombats.ok) throw new Error("combat active encounters fallo");
  if (!Array.isArray(activeCombats.encounters)) throw new Error("combat active encounters no devolvio encounters");
  console.log("OK /api/combat/encounters/active");

  const checkpoints = await request("/api/checkpoints");
  if (!checkpoints.ok) throw new Error("checkpoints fallo");
  console.log("OK /api/checkpoints");

  console.log("\nSmoke tests OK.");
}

runSmokeTests().catch((error) => {
  console.error("\nSmoke tests fallaron:");
  console.error(error.message);
  process.exit(1);
});
