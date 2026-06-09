const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const responseShaping = require("../utils/responseShaping");

async function getLocationFull(req, res) {
  const { locationId } = req.params;
  const gameId = req.query.gameId || "isekai_lucas_main";
  const rumorLimit = responseShaping.toIntQuery(req.query.rumorLimit, 20, 0, 30);
  const eventLimit = responseShaping.toIntQuery(req.query.eventLimit, 20, 0, 30);
  const missionLimit = responseShaping.toIntQuery(req.query.missionLimit, 20, 0, 30);
  const logLimit = responseShaping.toIntQuery(req.query.logLimit, 10, 0, 30);
  const includeMechanicalChanges = responseShaping.queryBoolean(req.query.includeMechanicalChanges, false);

  const location = await Location.findOne({ locationId }).lean();

  if (!location) {
    return res.status(404).json({
      ok: false,
      error: `No existe ubicación con id: ${locationId}`,
    });
  }

  const shops = await Shop.find({ locationId }).lean();
  const shopIds = shops.map((shop) => shop.shopId);

  const [
    npcsPresent,
    rumors,
    activeEvents,
    missions,
    recentEventLogs,
    shopStocks,
  ] = await Promise.all([
    Npc.find({ currentLocationId: locationId }).sort({ name: 1 }).lean(),

    Rumor.find({
      status: "active",
      locationIds: locationId,
    })
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(rumorLimit)
      .lean(),

    WorldEvent.find({
      status: { $in: ["scheduled", "active"] },
      affectedLocationIds: locationId,
    })
      .sort({ startDay: 1, startTime: 1 })
      .limit(eventLimit)
      .lean(),

    Mission.find({
      locationId,
      status: { $in: ["available", "accepted", "blocked"] },
    })
      .sort({ postedDay: -1, postedTime: -1 })
      .limit(missionLimit)
      .lean(),

    EventLog.find({ gameId, locationId })
      .sort({ day: -1, timeStart: -1 })
      .limit(logLimit)
      .lean(),

    ShopStock.find({ shopId: { $in: shopIds } }).lean(),
  ]);

  return res.json({
    ok: true,
    location,
    npcsPresent,
    rumors,
    activeEvents,
    missions,
    shops,
    shopStocks,
    recentEventLogs: recentEventLogs.map((log) =>
      responseShaping.summarizeEventLog(log, { includeMechanicalChanges })
    ),
  });
}

module.exports = {
  getLocationFull,
};
