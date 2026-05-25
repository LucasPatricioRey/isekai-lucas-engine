const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");

async function getLocationFull(req, res) {
  const { locationId } = req.params;

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
      .limit(30)
      .lean(),

    WorldEvent.find({
      status: { $in: ["scheduled", "active"] },
      affectedLocationIds: locationId,
    })
      .sort({ startDay: 1, startTime: 1 })
      .limit(30)
      .lean(),

    Mission.find({
      locationId,
      status: { $in: ["available", "accepted", "blocked"] },
    })
      .sort({ postedDay: -1, postedTime: -1 })
      .limit(30)
      .lean(),

    EventLog.find({ locationId })
      .sort({ day: -1, timeStart: -1 })
      .limit(30)
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
    recentEventLogs,
  });
}

module.exports = {
  getLocationFull,
};
