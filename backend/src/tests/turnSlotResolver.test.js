const { describe, it } = require("node:test");

const { assert } = require("./apiTestClient");
const { commonResolverPlan, routeTurnIntent } = require("../services/turnCapabilityRouterService");
const {
  buildDestinationAliases,
  resolveSafeMagicPracticeSlot,
  resolveSimpleMealPurchaseSlot,
} = require("../services/turnSlotResolverService");

describe("turn slot resolver", () => {
  it("builds destination aliases from Mongo-like location documents for the router", () => {
    const destinationAliases = buildDestinationAliases([
      {
        locationId: "loc_test_crystal_tower",
        name: "Torre de Cristal",
        type: "landmark",
        tags: ["observatorio_arcano"],
      },
    ]);

    const plan = commonResolverPlan({
      text: "Lucas camina hasta la torre de cristal.",
      destinationAliases,
    });

    assert.equal(plan.supported, true);
    assert.equal(plan.steps[0].type, "travel");
    assert.equal(plan.steps[0].toLocationId, "loc_test_crystal_tower");

    const routed = routeTurnIntent({
      text: "Lucas va al observatorio arcano.",
      destinationAliases,
    });
    assert.equal(routed.route.resolverPlan.steps[0].toLocationId, "loc_test_crystal_tower");
  });

  it("resolves safe magic practice techniques from context catalog instead of requiring fixed ids", () => {
    const context = {
      magicTechniques: [
        {
          techniqueId: "technique_custom_mana_breath",
          name: "Respiracion de mana inicial",
          kind: "exercise",
          status: "available",
          difficulty: "safe",
          isRealSpell: false,
          isOffensive: false,
          defaultMinutes: 30,
          minMinutes: 5,
          maxMinutes: 120,
          tags: ["mana", "respiracion"],
        },
      ],
    };

    const resolved = resolveSafeMagicPracticeSlot({
      text: "Lucas practica respiracion de mana durante veinte minutos.",
      plan: { minutes: 20 },
      context,
    });

    assert.equal(resolved.resolved, true);
    assert.equal(resolved.plan.techniqueId, "technique_custom_mana_breath");
    assert.equal(resolved.source, "mongo_alias");
  });

  it("resolves simple meal purchases from local shop stock and items", () => {
    const context = {
      shops: [
        {
          shopId: "shop_test_inn",
          name: "Posada del Sauce",
          locationId: "loc_test_inn",
          type: "inn",
          services: { food: true },
          tags: ["posada"],
        },
      ],
      shopStocks: [
        {
          stockId: "stock_test_soup",
          shopId: "shop_test_inn",
          itemId: "item_test_soup",
          quantity: 3,
          currentPriceCopper: 8,
          quality: "normal",
        },
        {
          stockId: "stock_test_meal",
          shopId: "shop_test_inn",
          itemId: "item_test_normal_meal",
          quantity: 2,
          currentPriceCopper: 12,
          quality: "normal",
        },
      ],
      items: [
        {
          itemId: "item_test_soup",
          name: "Sopa clara",
          type: "food",
          satietyBonus: 12,
          tags: ["sopa"],
        },
        {
          itemId: "item_test_normal_meal",
          name: "Comida normal de posada",
          type: "food",
          satietyBonus: 25,
          tags: ["comida", "normal"],
        },
      ],
    };

    const soup = resolveSimpleMealPurchaseSlot({
      text: "Lucas compra una sopa caliente.",
      plan: {},
      gameState: { locationId: "loc_test_inn" },
      context,
    });
    assert.equal(soup.resolved, true);
    assert.equal(soup.plan.itemId, "item_test_soup");

    const meal = resolveSimpleMealPurchaseSlot({
      text: "Lucas pide una comida normal.",
      plan: {},
      gameState: { locationId: "loc_test_inn" },
      context,
    });
    assert.equal(meal.resolved, true);
    assert.equal(meal.plan.itemId, "item_test_normal_meal");
  });
});
