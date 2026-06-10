const { after, before, describe, it } = require("node:test");

const {
  assert,
  assertCanonState,
  get,
  getCanonicalState,
  startApi,
  stopApi,
} = require("./apiTestClient");

describe("read-only API coverage", () => {
  before(startApi);
  after(stopApi);

  it("returns health and canonical context", async () => {
    const health = await get("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);

    const state = await getCanonicalState();
    assertCanonState(state);

    const compact = await get("/api/context/compact");
    assert.equal(compact.status, 200);
    assert.ok(Array.isArray(compact.data.context.pendingBiology));
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.relationshipState?.schemaVersion === "social_state_v1"
      )
    );
    assert.deepEqual(
      compact.data.context.pendingBiology,
      compact.data.context.pendingBiologicalAccumulations
    );
  });

  it("serves public OpenAPI schemas for GPT Builder import", async () => {
    const compact = await get("/docs/openapi-gpt-action-compact.json");
    assert.equal(compact.status, 200);
    assert.equal(compact.data.openapi, "3.1.0");
    assert.match(compact.data.servers[0].url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const adminExtra = await get("/docs/openapi-gpt-action-admin-extra.json");
    assert.equal(adminExtra.status, 200);
    assert.equal(adminExtra.data.openapi, "3.1.0");
    assert.match(adminExtra.data.servers[0].url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.ok(adminExtra.data.paths["/api/world/events"]);
  });

  it("searches DB and docs", async () => {
    const db = await get("/api/search/db?q=fern");
    assert.equal(db.status, 200);
    assert.equal(db.data.ok, true);

    const docs = await get("/api/search/docs?q=romance");
    assert.equal(docs.status, 200);
    assert.equal(docs.data.ok, true);
    assert.ok((docs.data.results || docs.data.documents || []).length >= 1);
  });

  it("loads NPC and location full views", async () => {
    const npc = await get("/api/npcs/npc_fern/full");
    assert.equal(npc.status, 200);
    assert.equal(npc.data.ok, true);
    assert.equal(npc.data.npc.npcId, "npc_fern");
    assert.equal(npc.data.relationshipState.schemaVersion, "social_state_v1");
    assert.equal(npc.data.npcSummary.relationshipState.schemaVersion, "social_state_v1");

    const location = await get("/api/locations/loc_hoshimori_grulla_azul_comedor/full");
    assert.equal(location.status, 200);
    assert.equal(location.data.ok, true);
    assert.equal(location.data.location.locationId, "loc_hoshimori_grulla_azul_comedor");
  });

  it("loads economy shops, stock and items", async () => {
    const shops = await get("/api/economy/shops");
    assert.equal(shops.status, 200);
    assert.ok((shops.data.shops || []).length >= 9);

    const stock = await get("/api/economy/shops/shop_pavo_food_stall/stock");
    assert.equal(stock.status, 200);
    assert.ok((stock.data.stocks || []).some((entry) => entry.itemId === "item_racion_normal"));

    const item = await get("/api/economy/items/item_daga_simple");
    assert.equal(item.status, 200);
    assert.equal(item.data.item.itemId, "item_daga_simple");
  });

  it("loads missions board and detail without accepting missions", async () => {
    const board = await get("/api/missions/board");
    assert.equal(board.status, 200);
    assert.ok(Array.isArray(board.data.missions));

    const detail = await get("/api/missions/mission_d10_grulla_delivery_guild");
    assert.equal(detail.status, 200);
    assert.equal(detail.data.mission.missionId, "mission_d10_grulla_delivery_guild");
  });

  it("loads combat, travel, magic, weather and checkpoints read endpoints", async () => {
    const enemies = await get("/api/combat/enemies");
    assert.equal(enemies.status, 200);
    assert.ok((enemies.data.enemies || []).length >= 5);

    const active = await get("/api/combat/encounters/active");
    assert.equal(active.status, 200);
    assert.equal((active.data.encounters || []).length, 0);

    const actions = await get("/api/combat/actions");
    assert.equal(actions.status, 200);
    assert.ok((actions.data.actions || []).length >= 9);

    const routes = await get("/api/travel/routes");
    assert.equal(routes.status, 200);
    assert.ok((routes.data.routes || []).length >= 23);

    const disciplines = await get("/api/magic/disciplines");
    assert.equal(disciplines.status, 200);
    assert.ok((disciplines.data.disciplines || []).length >= 12);

    const techniques = await get("/api/magic/techniques");
    assert.equal(techniques.status, 200);
    assert.ok((techniques.data.techniques || []).length >= 7);

    const weather = await get("/api/weather/current?regionId=region_hoshimori");
    assert.equal(weather.status, 200);
    assert.equal(weather.data.weather.regionId, "region_hoshimori");
    assert.ok(weather.data.weather.weatherId);
    assert.ok(["clear", "cloudy", "light_rain", "heavy_rain", "fog", "cold", "heat"].includes(weather.data.weather.currentCondition));

    const checkpoints = await get("/api/checkpoints");
    assert.equal(checkpoints.status, 200);
    assert.ok(
      (checkpoints.data.checkpoints || []).some(
        (checkpoint) => checkpoint.checkpointId === "checkpoint_d10_1200_1779723391623"
      )
    );

    const worldEvents = await get("/api/world/events?limit=5");
    assert.equal(worldEvents.status, 200);
    assert.equal(worldEvents.data.ok, true);
    assert.ok(Array.isArray(worldEvents.data.events));
  });
});
