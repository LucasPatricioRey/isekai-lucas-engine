require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const app = require("../app");
const connectDB = require("../config/db");

let server = null;
let baseUrl = "";

async function startApi() {
  if (server) return;

  assert.ok(process.env.API_KEY, "API_KEY is required for API tests.");
  await connectDB();

  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stopApi() {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
    baseUrl = "";
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

async function request(path, options = {}) {
  assert.ok(baseUrl, "API test server is not started.");

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "x-api-key": process.env.API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

async function get(path) {
  return request(path);
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

async function getCanonicalState(gameId = "isekai_lucas_main") {
  const query = gameId ? `?gameId=${encodeURIComponent(gameId)}` : "";
  const response = await get(`/api/context/full${query}`);
  assert.equal(response.status, 200);
  const gameState = response.data.context.gameState;

  return {
    gameId: gameState.gameId,
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    mpCurrent: gameState.lucasStatus?.mp?.current,
    satietyCurrent: gameState.lucasStatus?.satiety?.current,
    satietyLabel: gameState.lucasStatus?.satiety?.label,
    energyCurrent: gameState.lucasStatus?.energy?.current,
    energyLabel: gameState.lucasStatus?.energy?.label,
    activeMissionIds: gameState.activeMissionIds || [],
    pendingBiologicalAccumulations: response.data.context.pendingBiologicalAccumulations || [],
    inventoryCount: (gameState.inventory || []).length,
    skillSnapshot: Object.fromEntries((gameState.skills || []).map((skill) => [skill.skillId, skill.exp])),
  };
}

function assertCanonState(state) {
  assert.ok(Number.isInteger(state.currentDay) && state.currentDay >= 10);
  assert.match(state.time, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.ok(typeof state.locationId === "string" && state.locationId.length > 0);
  assert.ok(Number.isInteger(state.moneyCopper) && state.moneyCopper >= 0);
  assert.ok(Number.isInteger(state.mpCurrent) && state.mpCurrent >= 0);
  assert.ok(Number.isInteger(state.satietyCurrent) && state.satietyCurrent >= 0);
  assert.ok(Number.isInteger(state.energyCurrent) && state.energyCurrent >= 0);
  assert.ok(Array.isArray(state.activeMissionIds));
}

function assertSameState(before, after) {
  assert.deepEqual(after, before);
}

module.exports = {
  assert,
  assertCanonState,
  assertSameState,
  get,
  getCanonicalState,
  post,
  startApi,
  stopApi,
};
