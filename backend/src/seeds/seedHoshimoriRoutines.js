require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Npc = require("../models/Npc");

function r(timeStart, timeEnd, locationId, task) {
  return { dayType: "normal", timeStart, timeEnd, locationId, task };
}

const specificRoutines = {
  npc_roberto_valen: [
    r("05:30", "07:00", "loc_hoshimori_grulla_azul_cocina", "organizando cocina y desayuno"),
    r("07:00", "11:00", "loc_hoshimori_grulla_azul_comedor", "supervisando sala, proveedores y trabajo"),
    r("11:00", "14:00", "loc_hoshimori_grulla_azul_comedor", "supervisando mediodia, sala y suministros"),
    r("14:00", "20:30", "loc_hoshimori_grulla_azul_comedor", "supervisando turno tarde"),
    r("20:30", "22:30", "loc_hoshimori_grulla_azul_comedor", "cerrando servicio de noche"),
    r("22:30", "05:30", "loc_hoshimori_grulla_azul", "durmiendo o cerrando asuntos internos")
  ],

  npc_fern: [
    r("06:30", "12:00", "loc_hoshimori_grulla_azul", "tareas de posada"),
    r("12:00", "14:00", "loc_hoshimori_grulla_azul", "tareas internas de mediodia"),
    r("14:00", "20:30", "loc_hoshimori_grulla_azul", "apoyo en comedor y cocina"),
    r("20:30", "22:30", "loc_hoshimori_grulla_azul", "cierre menor de posada"),
    r("22:30", "06:30", "loc_hoshimori_grulla_azul", "durmiendo o descansando")
  ],

  npc_yara_mils: [
    r("06:00", "12:00", "loc_hoshimori_grulla_azul_cocina", "trabajo de cocina y preparacion"),
    r("12:00", "14:00", "loc_hoshimori_grulla_azul_cocina", "trabajo de cocina durante mediodia"),
    r("14:00", "20:30", "loc_hoshimori_grulla_azul_cocina", "apoyo de cocina y servicio"),
    r("20:30", "21:30", "loc_hoshimori_grulla_azul_cocina", "cierre de cocina"),
    r("21:30", "06:00", "loc_hoshimori_grulla_azul", "descansando o durmiendo")
  ],

  npc_garrick_thorne: [
    r("07:00", "12:00", "loc_hoshimori_guild", "coordinando registros y voluntarios"),
    r("12:00", "14:00", "loc_hoshimori_guild", "revisando reportes de mediodia"),
    r("14:00", "18:00", "loc_hoshimori_guild", "coordinando encargos y rutas"),
    r("18:00", "22:00", "loc_hoshimori_guild", "cerrando reportes del gremio"),
    r("22:00", "07:00", "loc_hoshimori_guild", "fuera de atencion publica")
  ],

  npc_pavo: [
    r("06:00", "12:00", "loc_hoshimori_market", "atendiendo puesto de raciones"),
    r("12:00", "14:00", "loc_hoshimori_market", "vendiendo comida de mediodia"),
    r("14:00", "18:00", "loc_hoshimori_market", "atendiendo clientes del mercado"),
    r("18:00", "20:00", "loc_hoshimori_market", "cerrando puesto"),
    r("20:00", "06:00", "loc_hoshimori_market", "fuera de atencion publica")
  ],

  npc_borin: [
    r("07:00", "12:00", "loc_hoshimori_borin_smithy", "trabajando en la herreria"),
    r("12:00", "14:00", "loc_hoshimori_borin_smithy", "descanso y reparaciones menores"),
    r("14:00", "18:00", "loc_hoshimori_borin_smithy", "atendiendo herreria"),
    r("18:00", "21:00", "loc_hoshimori_borin_smithy", "cerrando herramientas"),
    r("21:00", "07:00", "loc_hoshimori_borin_smithy", "fuera de atencion publica")
  ],

  npc_narek: [
    r("06:00", "12:00", "loc_hoshimori_temple_serene_flame", "cuidando el templo"),
    r("12:00", "14:00", "loc_hoshimori_temple_serene_flame", "atendiendo visitas tranquilas"),
    r("14:00", "20:00", "loc_hoshimori_temple_serene_flame", "velas, consejo y primeros auxilios"),
    r("20:00", "22:00", "loc_hoshimori_temple_serene_flame", "cierre del templo"),
    r("22:00", "06:00", "loc_hoshimori_temple_serene_flame", "descansando")
  ],

  npc_joren_pell: [
    r("06:00", "10:00", "loc_hoshimori_market", "revisando suministros"),
    r("10:00", "14:00", "loc_hoshimori_grulla_azul", "descansando o revisando suministros"),
    r("14:00", "18:00", "loc_hoshimori_market", "negocios menores en el mercado"),
    r("18:00", "22:00", "loc_hoshimori_grulla_azul", "cenando o escuchando rumores"),
    r("22:00", "06:00", "loc_hoshimori_grulla_azul", "durmiendo como viajero")
  ]
};

function genericRoutineForNpc(npc) {
  const dayLocation = npc.currentLocationId || npc.homeLocationId || "loc_hoshimori_plaza";
  const homeLocation = npc.homeLocationId || dayLocation;
  const dayTask = npc.currentTask || "ocupado en su rutina diaria";

  return [
    r("06:00", "12:00", dayLocation, dayTask),
    r("12:00", "14:00", dayLocation, `${dayTask} durante mediodia`),
    r("14:00", "18:00", dayLocation, dayTask),
    r("18:00", "22:00", homeLocation, "cerrando asuntos del dia"),
    r("22:00", "06:00", homeLocation, "descansando o durmiendo")
  ];
}

async function seedHoshimoriRoutines() {
  await connectDB();

  const npcs = await Npc.find({ regionId: "region_hoshimori" }).lean();

  for (const npc of npcs) {
    const routineBase = specificRoutines[npc.npcId] || genericRoutineForNpc(npc);

    await Npc.updateOne(
      { npcId: npc.npcId },
      { $set: { routineBase } },
      { runValidators: true }
    );
  }

  console.log(`Rutinas base cargadas para NPCs de Hoshimori: ${npcs.length}`);

  await mongoose.disconnect();
}

seedHoshimoriRoutines().catch(async (error) => {
  console.error("Error cargando rutinas:", error);
  await mongoose.disconnect();
  process.exit(1);
});
