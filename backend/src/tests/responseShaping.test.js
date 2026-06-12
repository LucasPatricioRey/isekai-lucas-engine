const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildWorldFrictionSummary,
  missionActionState,
  summarizeMission,
} = require("../utils/responseShaping");

test("summarizes mission action state for submitted, verified and rejected reports", () => {
  const baseMission = {
    missionId: "mission_test",
    title: "Informe de prueba",
    status: "accepted",
    rank: "Cobre",
    riskLevel: "low",
    reward: { moneyCopper: 100, items: [], other: "" },
    proofRequired: "Reporte formal.",
    postedDay: 1,
    postedTime: "06:00",
    expiresDay: 2,
    expiresTime: "18:00",
  };

  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "submitted" }, 2, "12:00").key,
    "awaiting_verification"
  );
  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "verified" }, 2, "12:00").key,
    "ready_to_complete"
  );
  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "rejected" }, 2, "12:00").key,
    "proof_rejected"
  );
});

test("marks expiring available missions and accepted expired missions", () => {
  const available = summarizeMission(
    {
      missionId: "mission_expiring",
      title: "Revisar borde del bosque",
      status: "available",
      rank: "Cobre",
      riskLevel: "low",
      reward: { moneyCopper: 100, items: [], other: "" },
      proofStatus: "pending",
      postedDay: 2,
      postedTime: "06:00",
      expiresDay: 2,
      expiresTime: "14:30",
    },
    2,
    "12:00"
  );

  assert.equal(available.actionState.key, "available_expiring_soon");
  assert.equal(available.actionState.expiration.minutesUntil, 150);

  const acceptedExpired = summarizeMission(
    {
      missionId: "mission_late",
      title: "Reporte tardio",
      status: "accepted",
      rank: "Cobre",
      riskLevel: "low",
      reward: { moneyCopper: 100, items: [], other: "" },
      proofStatus: "pending",
      postedDay: 2,
      postedTime: "06:00",
      expiresDay: 2,
      expiresTime: "11:00",
    },
    2,
    "12:00"
  );

  assert.equal(acceptedExpired.actionState.key, "accepted_expired");
  assert.equal(acceptedExpired.actionState.requiresFormalClosure, true);
});

test("summarizes world friction for stock pressure, supply delays and bad weather", () => {
  const summary = buildWorldFrictionSummary({
    location: {
      locationId: "loc_hoshimori_market",
      dangerLevel: "safe",
    },
    weather: {
      currentCondition: "heavy_rain",
      intensity: 2,
      staleByCurrentTime: false,
      effects: [],
    },
    shops: [
      {
        shopId: "shop_general",
        name: "Almacen de prueba",
        status: "operational",
      },
    ],
    shopStocks: [
      {
        shopId: "shop_general",
        itemId: "item_rope",
        quantity: 1,
        reservedQuantity: 0,
        currentPriceCopper: 25,
        scarcityFlags: ["supply_delay_active"],
      },
      {
        shopId: "shop_general",
        itemId: "item_torch",
        quantity: 0,
        reservedQuantity: 0,
        currentPriceCopper: 8,
        scarcityFlags: [],
      },
    ],
    items: [
      {
        itemId: "item_rope",
        name: "Cuerda",
      },
      {
        itemId: "item_torch",
        name: "Antorcha",
      },
    ],
    events: [
      {
        eventId: "event_supply",
        title: "Carros demorados",
        type: "supply_delay",
        status: "active",
        tags: ["supplies"],
      },
    ],
  });

  assert.equal(summary.economy.hasPressure, true);
  assert.equal(summary.travel.hasPressure, true);
  assert.equal(summary.weather.exteriorTravelTimeMultiplier, 1.5);
  assert.equal(summary.economy.lowStock[0].itemName, "Cuerda");
  assert.equal(summary.economy.outOfStock[0].itemName, "Antorcha");
  assert.equal(summary.economy.supplyDelayed.length, 2);
  assert.match(summary.globalGuidance, /friccion de mundo activa/);
});

test("summarizes calm world friction without pressure", () => {
  const summary = buildWorldFrictionSummary({
    location: {
      locationId: "loc_inn",
      dangerLevel: "safe",
    },
    weather: {
      currentCondition: "clear",
      intensity: 1,
      staleByCurrentTime: false,
      effects: [],
    },
    shops: [
      {
        shopId: "shop_food",
        name: "Cocina",
        status: "operational",
      },
    ],
    shopStocks: [
      {
        shopId: "shop_food",
        itemId: "item_bread",
        quantity: 8,
        reservedQuantity: 0,
        currentPriceCopper: 4,
        scarcityFlags: [],
      },
    ],
    items: [
      {
        itemId: "item_bread",
        name: "Pan",
      },
    ],
    events: [],
  });

  assert.equal(summary.economy.hasPressure, false);
  assert.equal(summary.travel.hasPressure, false);
  assert.equal(summary.weather.exteriorTravelTimeMultiplier, 1);
  assert.deepEqual(summary.guidance, []);
});
