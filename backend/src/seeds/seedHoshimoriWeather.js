require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const WeatherState = require("../models/WeatherState");

const SOURCE = "g13_hoshimori_weather_seed";
const MARKER_TAGS = ["g13", "hoshimori", "weather"];

const weatherState = {
  weatherId: "weather_hoshimori_d10_post_rain_mud",
  regionId: "region_hoshimori",
  currentCondition: "cloudy",
  intensity: 3,
  startedDay: 10,
  startedTime: "06:00",
  expectedUntilDay: 10,
  expectedUntilTime: "18:00",
  effects: [
    {
      type: "travel_time_multiplier",
      target: "exterior_muddy_routes",
      value: 1.25,
      appliesToRouteTypes: ["road", "wilderness", "regional"],
      appliesToTerrain: ["mud_road", "rural_path", "forest_path", "hills_path"],
      reason: "Barro residual tras lluvia reciente; coherente con retraso de suministros activo.",
    },
    {
      type: "visibility_warning",
      target: "forest_and_hills",
      value: "low_clouds_and_wet_ground",
      appliesToRouteTypes: ["wilderness", "regional"],
      appliesToTerrain: ["forest", "deep_forest", "hills", "caves"],
      reason: "Nubes bajas y suelo humedo exigen cautela fuera del poblado.",
    },
    {
      type: "market_supply_warning",
      target: "hoshimori_market",
      value: "minor_delay",
      appliesToRouteTypes: ["town", "road"],
      appliesToTerrain: ["market_path", "mud_road"],
      reason: "Los caminos embarrados explican demoras menores, no una crisis nueva.",
    },
  ],
  source: SOURCE,
  tags: [...MARKER_TAGS, SOURCE, "post_rain", "residual_mud", "rocio_nuevo", "no_major_event"],
};

async function seedHoshimoriWeather() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori weather.");
  }

  await WeatherState.updateOne(
    { weatherId: weatherState.weatherId },
    { $set: weatherState },
    { upsert: true }
  );

  const count = await WeatherState.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });

  console.log("Hoshimori weather seed completed.");
  console.log("Expected G13 weather states in seed: 1");
  console.log(`MongoDB G13 weather states found: ${count}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriWeather().catch(async (error) => {
    console.error("Error seeding Hoshimori weather:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  weatherState,
  seedHoshimoriWeather,
};
