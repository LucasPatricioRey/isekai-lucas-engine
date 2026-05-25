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
  if (missions.missions.length < 5) throw new Error("missions board devolvio menos de 5 misiones");
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
