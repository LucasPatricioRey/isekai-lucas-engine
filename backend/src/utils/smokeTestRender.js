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

  const missions = await request("/api/missions/board");
  if (!missions.ok) throw new Error("missions board fallo");
  if (!Array.isArray(missions.missions)) throw new Error("missions board no devolvio missions");
  console.log("OK /api/missions/board");

  const combatEnemies = await request("/api/combat/enemies");
  if (!combatEnemies.ok) throw new Error("combat enemies fallo");
  if (!Array.isArray(combatEnemies.enemies)) throw new Error("combat enemies no devolvio enemies");
  console.log("OK /api/combat/enemies");

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
