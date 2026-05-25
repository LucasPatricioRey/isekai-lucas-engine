require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const EnemyTemplate = require("../models/EnemyTemplate");

const enemies = [
  {
    enemyId: "enemy_lobo_borde",
    name: "Lobo de borde",
    type: "animal",
    dangerLevel: "low",
    rankHint: "Porcelana",
    baseStats: {
      life: 35,
      attack: 8,
      defense: 3,
      agility: 12,
      perception: 10,
      morale: 35
    },
    behavior: [
      "evita grupos grandes",
      "ataca presas aisladas o heridas",
      "puede retirarse si recibe daño serio"
    ],
    zones: [
      "Bosque de los Susurros",
      "Camino del Molino",
      "granjas cercanas"
    ],
    signals: [
      "huellas frescas",
      "aullido lejano",
      "ramas movidas",
      "animales inquietos"
    ],
    retreatLogic: "Se retira si pierde mucha vida, si queda superado o si no tiene ventaja.",
    rewardPolicy: "No hay recompensa automatica. Solo si existe contrato, prueba o piel/logica de recoleccion.",
    tags: ["wolf", "forest", "low_risk"]
  },
  {
    enemyId: "enemy_jabali_gris",
    name: "Jabali gris",
    type: "animal",
    dangerLevel: "medium",
    rankHint: "Cobre",
    baseStats: {
      life: 60,
      attack: 14,
      defense: 8,
      agility: 8,
      perception: 7,
      morale: 55
    },
    behavior: [
      "territorial",
      "carga si se siente amenazado",
      "no pelea por maldad, pelea por defensa o furia"
    ],
    zones: [
      "Bosque de los Susurros",
      "granjas cercanas"
    ],
    signals: [
      "tierra removida",
      "gruñidos bajos",
      "marcas de colmillos",
      "plantas aplastadas"
    ],
    retreatLogic: "Puede huir si la carga falla o si queda muy herido, pero es peligroso acorralarlo.",
    rewardPolicy: "Puede dar carne/piel si Lucas lo revisa, tiene herramientas y tiempo. No hay dinero automatico.",
    tags: ["boar", "forest", "charge"]
  },
  {
    enemyId: "enemy_rata_gigante",
    name: "Rata gigante",
    type: "beast",
    dangerLevel: "low",
    rankHint: "Porcelana",
    baseStats: {
      life: 20,
      attack: 5,
      defense: 2,
      agility: 10,
      perception: 8,
      morale: 20
    },
    behavior: [
      "ataca en grupo",
      "huye si queda sola",
      "busca comida y refugio"
    ],
    zones: [
      "sotanos",
      "graneros abandonados",
      "cuevas menores",
      "cantera vieja"
    ],
    signals: [
      "rasguños",
      "excremento",
      "ruido entre cajas",
      "sacos mordidos"
    ],
    retreatLogic: "Huye si el grupo cae o si hay fuego/ruido fuerte.",
    rewardPolicy: "No hay loot valioso automatico. Puede servir como prueba si una mision lo pide.",
    tags: ["rat", "low_risk", "group"]
  },
  {
    enemyId: "enemy_bandido_menor",
    name: "Bandido menor",
    type: "human_hostile",
    dangerLevel: "medium",
    rankHint: "Cobre",
    baseStats: {
      life: 45,
      attack: 10,
      defense: 5,
      agility: 9,
      perception: 8,
      morale: 45
    },
    behavior: [
      "prefiere intimidar antes que pelear",
      "busca ventaja numerica",
      "puede rendirse o huir si pierde control"
    ],
    zones: [
      "rutas poco vigiladas",
      "Camino del Molino",
      "Tierras Libres",
      "zonas de barro y retrasos"
    ],
    signals: [
      "huellas de botas",
      "ramas cortadas",
      "voces bajas",
      "carro detenido sin razon clara"
    ],
    retreatLogic: "Puede huir si pierde ventaja, si hay testigos armados o si resulta herido.",
    rewardPolicy: "No hay dinero automatico. Equipo o monedas solo existen si se revisa y tiene sentido. Puede requerir entregar al gremio/guardia.",
    tags: ["human", "bandit", "route_risk"]
  },
  {
    enemyId: "enemy_avispa_roja",
    name: "Avispa roja",
    type: "beast",
    dangerLevel: "medium",
    rankHint: "Cobre",
    baseStats: {
      life: 12,
      attack: 7,
      defense: 1,
      agility: 16,
      perception: 9,
      morale: 30
    },
    behavior: [
      "territorial",
      "defiende nido",
      "peligrosa en enjambre"
    ],
    zones: [
      "Colinas Grises",
      "madera podrida",
      "cuevas secas"
    ],
    signals: [
      "zumbido agudo",
      "nido rojizo",
      "animales evitando una zona",
      "picaduras en troncos o presas"
    ],
    retreatLogic: "No persigue lejos del nido salvo que el enjambre este alterado.",
    rewardPolicy: "No hay recompensa automatica. Aguijones o veneno solo si se recolectan con cuidado.",
    tags: ["wasp", "swarm", "poison"]
  }
];

async function seedEnemyTemplates() {
  await connectDB();

  for (const enemy of enemies) {
    await EnemyTemplate.updateOne(
      { enemyId: enemy.enemyId },
      { $set: enemy },
      { upsert: true, runValidators: true }
    );
  }

  const count = await EnemyTemplate.countDocuments();

  console.log(`Enemy templates cargados. Total: ${count}`);

  await mongoose.disconnect();
}

seedEnemyTemplates().catch(async (error) => {
  console.error("Error cargando enemy templates:", error);
  await mongoose.disconnect();
  process.exit(1);
});
