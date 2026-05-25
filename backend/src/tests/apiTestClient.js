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

async function getCanonicalState() {
  const response = await get("/api/context/full");
  assert.equal(response.status, 200);
  const gameState = response.data.context.gameState;

  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    mpCurrent: gameState.lucasStatus?.mp?.current,
    activeMissionIds: gameState.activeMissionIds || [],
    inventoryCount: (gameState.inventory || []).length,
    skillSnapshot: Object.fromEntries((gameState.skills || []).map((skill) => [skill.skillId, skill.exp])),
  };
}

function assertCanonState(state) {
  assert.equal(state.currentDay, 10);
  assert.equal(state.time, "12:00");
  assert.equal(state.locationId, "loc_hoshimori_grulla_azul_comedor");
  assert.equal(state.moneyCopper, 1470);
  assert.equal(state.mpCurrent, 200);
  assert.equal(state.activeMissionIds.length, 0);
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
