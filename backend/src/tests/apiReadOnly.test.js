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
    const compactPayloadBytes = Buffer.byteLength(JSON.stringify(compact.data), "utf8");
    assert.ok(
      compactPayloadBytes < 100000,
      `compact context payload is ${compactPayloadBytes} bytes and should stay under 100000`
    );
    assert.ok(Array.isArray(compact.data.context.pendingBiology));
    const narrationContract = compact.data.context.scene.narrationContract;
    assert.equal(narrationContract?.schemaVersion, "scene_narration_contract_v1");
    assert.equal(narrationContract?.contractStrength, "mandatory_for_player_scene");
    assert.equal(narrationContract?.sourcePriority?.[0], "scene.narrationContract.npcContracts");
    assert.ok((narrationContract?.npcContracts || []).length > 0);
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.relationshipState?.schemaVersion === "social_state_v1"
      )
    );
    assert.equal(compact.data.context.dramaticContext?.schemaVersion, "dramatic_context_v1");
    assert.equal(compact.data.context.dramaticContext?.outputContract?.hudRequired, true);
    assert.equal(
      compact.data.context.dramaticContext?.emotionalScene?.schemaVersion,
      "emotional_scene_director_v1"
    );
    assert.ok(
      (compact.data.context.dramaticContext?.emotionalScene?.beatEngine || []).some((line) =>
        /Mascara/.test(line)
      )
    );
    assert.ok(
      (compact.data.context.dramaticContext?.dialogueDirectives || []).some((line) =>
        /dialogueProfile/.test(line)
      )
    );
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.dialogueProfile?.schemaVersion === "dialogue_profile_v1"
      )
    );
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.emotionalProfile?.schemaVersion === "emotional_profile_v1"
      )
    );
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.dialogueProfile?.emotionalSubtext?.rule
      )
    );
    assert.ok(
      (compact.data.context.scene.nearbyNpcs || []).some(
        (npc) => npc.dialogueProfile?.dramaticRole?.schemaVersion === "npc_dramatic_role_v1"
      )
    );
    assert.equal(
      compact.data.context.scene.relationshipDynamics?.schemaVersion,
      "scene_relationship_dynamics_v1"
    );
    assert.equal(
      compact.data.context.dramaticContext?.groupDynamics?.relationshipDynamicsAvailable,
      Boolean(compact.data.context.scene.relationshipDynamics?.count)
    );
    assert.deepEqual(
      compact.data.context.pendingBiology,
      compact.data.context.pendingBiologicalAccumulations
    );
    assert.ok(compact.data.context.jobContract);
    assert.ok(compact.data.context.jobContract.schedule);
    assert.ok(Array.isArray(compact.data.context.jobContract.schedule.activeShiftIds));
    assert.ok(
      compact.data.context.jobContract.shifts.every((shift) => shift.scheduleStatus)
    );
  });

  it("can include a compact technical readiness summary on demand", async () => {
    const compact = await get("/api/context/compact?includeTechnicalSummary=true");
    assert.equal(compact.status, 200);
    assert.equal(compact.data.ok, true);
    assert.equal(compact.data.context.technicalSummary.schemaVersion, "technical_summary_v1");
    assert.ok(compact.data.context.technicalSummary.clock.time);
    assert.ok(compact.data.context.technicalSummary.eventState);
    assert.ok(Array.isArray(compact.data.context.technicalSummary.recommendedChecks));

    const defaultCompact = await get("/api/context/compact");
    assert.equal(defaultCompact.status, 200);
    assert.equal(defaultCompact.data.profile, "player_scene");
    assert.equal(defaultCompact.data.context.technicalSummary, undefined);
  });

  it("serves read-only state audit for technical admin mode", async () => {
    const audit = await get("/api/context/audit-state");
    assert.equal(audit.status, 200);
    assert.equal(audit.data.schemaVersion, "state_audit_v1");
    assert.ok(Array.isArray(audit.data.issues));
    assert.ok(audit.data.checks.missions);
    assert.ok(audit.data.checks.events);
    assert.ok(audit.data.checks.magic);
    assert.ok(audit.data.checks.combatSchema);
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
    assert.ok(adminExtra.data.paths["/api/context/audit-state"]);
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
    assert.ok((disciplines.data.disciplines || []).length >= 13);
    const disciplineIds = new Set((disciplines.data.disciplines || []).map((entry) => entry.disciplineId));
    for (const disciplineId of [
      "discipline_fire",
      "discipline_lightning",
      "discipline_ice",
      "discipline_earth_wind",
      "discipline_defensive_magic",
      "discipline_magic_resistance",
      "discipline_healing_magic",
      "discipline_mental_magic",
      "discipline_summoning_magic",
    ]) {
      assert.equal(disciplineIds.has(disciplineId), true, `${disciplineId} should be exposed`);
    }

    const techniques = await get("/api/magic/techniques");
    assert.equal(techniques.status, 200);
    assert.ok((techniques.data.techniques || []).length >= 22);
    const techniqueIds = new Set((techniques.data.techniques || []).map((entry) => entry.techniqueId));
    for (const techniqueId of [
      "technique_locked_offensive_spark",
      "technique_locked_fire_ember_bolt",
      "technique_locked_lightning_static_discharge",
      "technique_locked_ice_shard",
      "technique_locked_earth_wind_push",
      "technique_locked_minor_ward",
      "technique_locked_minor_stabilization",
      "technique_locked_mental_presence_touch",
      "technique_locked_summoning_anchor_mark",
      "technique_locked_resistance_guard",
    ]) {
      assert.equal(techniqueIds.has(techniqueId), true, `${techniqueId} should be exposed`);
    }

    const weather = await get("/api/weather/current?regionId=region_hoshimori");
    assert.equal(weather.status, 200);
    assert.equal(weather.data.weather.regionId, "region_hoshimori");
    assert.ok(weather.data.weather.weatherId);
    assert.ok(["clear", "cloudy", "light_rain", "heavy_rain", "fog", "cold", "heat"].includes(weather.data.weather.currentCondition));

    const checkpoints = await get("/api/checkpoints");
    assert.equal(checkpoints.status, 200);
    assert.ok((checkpoints.data.checkpoints || []).length > 0);
    assert.ok((checkpoints.data.checkpoints || []).every((checkpoint) => checkpoint.checkpointId));

    const worldEvents = await get("/api/world/events?limit=5");
    assert.equal(worldEvents.status, 200);
    assert.equal(worldEvents.data.ok, true);
    assert.ok(Array.isArray(worldEvents.data.events));
  });
});
