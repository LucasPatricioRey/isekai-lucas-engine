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
      hp: 35,
      attack: 8,
      defense: 3,
      agility: 12,
      perception: 10,
      endurance: 4,
      morale: 35,
      speed: 12,
      awareness: 10,
      instinct: 11
    },
    attacks: [
      {
        attackId: "atk_lobo_mordida",
        name: "Mordida rapida",
        rangeBand: "engaged",
        damageType: "bite",
        baseDamage: 4,
        accuracyModifier: 1,
        fatigueCost: 1,
        traits: ["bite", "fast"]
      }
    ],
    defenses: [
      {
        defenseId: "def_lobo_instinto",
        name: "Instinto evasivo",
        defenseType: "instinct",
        modifier: 2,
        traits: ["animal", "fast"]
      }
    ],
    movement: {
      speed: 12,
      preferredDistance: "engaged",
      terrainAdvantages: ["forest"],
      terrainDisadvantages: ["crowd"]
    },
    moraleProfile: {
      baseState: "cautious",
      breaksAt: 6,
      fleesAt: 10,
      surrenderPossible: false,
      modifiers: ["huye si queda herido o pierde ventaja"]
    },
    behaviorProfile: {
      archetype: "predatory",
      preferredActions: ["attack", "flee"],
      avoidsActions: ["surrender"],
      targetPriority: ["isolated", "wounded"],
      notes: "Prueba debilidad y evita morir por una presa dificil."
    },
    lootProfile: {
      mode: "proof_only",
      requiresSearchAction: true,
      notes: "Piel/carne requieren herramientas y catalogo futuro; la fase actual solo crea evidencia."
    },
    evidenceProfile: {
      possibleEvidenceTypes: ["sample", "trace"],
      proofItems: [
        {
          key: "wolf_fur_or_blood_trace",
          name: "Rastro fisico de lobo",
          type: "sample",
          proofStatus: "partial",
          summary: "Pelo, sangre o marca fisica compatible con lobo de borde."
        }
      ],
      defaultProofStatus: "partial",
      notes: "Sirve como prueba parcial hasta verificacion del gremio."
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
      hp: 60,
      attack: 14,
      defense: 8,
      agility: 8,
      perception: 7,
      endurance: 11,
      morale: 55,
      speed: 9,
      awareness: 7,
      instinct: 8
    },
    attacks: [
      {
        attackId: "atk_jabali_carga",
        name: "Carga de colmillos",
        rangeBand: "near",
        damageType: "pierce",
        baseDamage: 8,
        accuracyModifier: -1,
        fatigueCost: 2,
        traits: ["charge", "heavy"]
      }
    ],
    defenses: [
      {
        defenseId: "def_jabali_cuero",
        name: "Cuero grueso",
        defenseType: "resistance",
        modifier: 2,
        traits: ["tough"]
      }
    ],
    movement: {
      speed: 9,
      preferredDistance: "near",
      terrainAdvantages: ["forest"],
      terrainDisadvantages: ["mud", "narrow_path"]
    },
    moraleProfile: {
      baseState: "angered",
      breaksAt: 8,
      fleesAt: 12,
      surrenderPossible: false,
      modifiers: ["mas peligroso si esta acorralado"]
    },
    behaviorProfile: {
      archetype: "territorial",
      preferredActions: ["attack", "move"],
      avoidsActions: ["surrender"],
      targetPriority: ["closest"],
      notes: "Carga para abrir espacio; no persigue por maldad."
    },
    lootProfile: {
      mode: "proof_only",
      requiresSearchAction: true,
      notes: "Materiales solo con herramientas/catalogo; no inventar carne ni dinero."
    },
    evidenceProfile: {
      possibleEvidenceTypes: ["sample", "trace"],
      proofItems: [
        {
          key: "boar_tusk_mark",
          name: "Marca de colmillo de jabali",
          type: "trace",
          proofStatus: "partial",
          summary: "Marca o resto fisico compatible con jabali gris."
        }
      ],
      defaultProofStatus: "partial"
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
      hp: 20,
      attack: 5,
      defense: 2,
      agility: 10,
      perception: 8,
      endurance: 2,
      morale: 20,
      speed: 10,
      awareness: 8,
      instinct: 8
    },
    attacks: [
      {
        attackId: "atk_rata_mordisco",
        name: "Mordisco bajo",
        rangeBand: "engaged",
        damageType: "bite",
        baseDamage: 3,
        accuracyModifier: 0,
        fatigueCost: 1,
        traits: ["bite", "low"]
      }
    ],
    defenses: [
      {
        defenseId: "def_rata_escurridiza",
        name: "Movimiento escurridizo",
        defenseType: "dodge",
        modifier: 1,
        traits: ["small"]
      }
    ],
    movement: {
      speed: 10,
      preferredDistance: "engaged",
      terrainAdvantages: ["indoors"],
      terrainDisadvantages: ["open_ground"]
    },
    moraleProfile: {
      baseState: "afraid",
      breaksAt: 4,
      fleesAt: 7,
      surrenderPossible: false,
      modifiers: ["huye si queda sola o herida"]
    },
    behaviorProfile: {
      archetype: "opportunist",
      preferredActions: ["attack", "flee"],
      avoidsActions: ["surrender"],
      targetPriority: ["food", "isolated"],
      notes: "Amenaza menor; peligrosa por infeccion o grupo, no por duelo limpio."
    },
    lootProfile: {
      mode: "proof_only",
      requiresSearchAction: true,
      notes: "No hay loot valioso automatico."
    },
    evidenceProfile: {
      possibleEvidenceTypes: ["sample", "trace"],
      proofItems: [
        {
          key: "giant_rat_tail_trace",
          name: "Prueba de rata gigante",
          type: "sample",
          proofStatus: "partial",
          summary: "Rastro fisico que permite reportar presencia de rata gigante."
        }
      ],
      defaultProofStatus: "partial"
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
      hp: 45,
      attack: 10,
      defense: 5,
      agility: 9,
      perception: 8,
      endurance: 6,
      morale: 45,
      speed: 9,
      awareness: 8,
      instinct: 6
    },
    attacks: [
      {
        attackId: "atk_bandido_cuchillo",
        name: "Corte de cuchillo",
        rangeBand: "engaged",
        damageType: "cut",
        baseDamage: 5,
        accuracyModifier: 0,
        fatigueCost: 1,
        traits: ["weapon", "human"]
      }
    ],
    defenses: [
      {
        defenseId: "def_bandido_guardia",
        name: "Guardia callejera",
        defenseType: "block",
        modifier: 1,
        traits: ["human", "weapon"]
      }
    ],
    movement: {
      speed: 9,
      preferredDistance: "near",
      terrainAdvantages: ["road", "crowd"],
      terrainDisadvantages: ["forest"]
    },
    moraleProfile: {
      baseState: "confident",
      breaksAt: 8,
      fleesAt: 12,
      surrenderPossible: true,
      modifiers: ["testigos y heridas bajan moral"]
    },
    behaviorProfile: {
      archetype: "opportunist",
      preferredActions: ["intimidate", "attack", "flee"],
      avoidsActions: [],
      targetPriority: ["weak", "valuable_items"],
      notes: "Prefiere intimidar y huir si pierde la ventaja."
    },
    lootProfile: {
      mode: "held_items",
      requiresSearchAction: true,
      notes: "Objetos o monedas solo si existen formalmente o quedan bajo custodia; no inventar botin."
    },
    evidenceProfile: {
      possibleEvidenceTypes: ["object", "testimony", "trace"],
      proofItems: [
        {
          key: "bandit_token_or_weapon_trace",
          name: "Indicio de bandido",
          type: "object",
          proofStatus: "partial",
          summary: "Senal fisica o testimonio vinculable a un asalto."
        }
      ],
      defaultProofStatus: "partial"
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
      hp: 12,
      attack: 7,
      defense: 1,
      agility: 16,
      perception: 9,
      endurance: 1,
      morale: 30,
      speed: 16,
      awareness: 9,
      instinct: 12
    },
    attacks: [
      {
        attackId: "atk_avispa_aguijon",
        name: "Aguijon",
        rangeBand: "engaged",
        damageType: "pierce",
        baseDamage: 3,
        accuracyModifier: 2,
        fatigueCost: 1,
        traits: ["poison", "fast", "flying"]
      }
    ],
    defenses: [
      {
        defenseId: "def_avispa_vuelo",
        name: "Vuelo erratico",
        defenseType: "dodge",
        modifier: 3,
        traits: ["flying", "small"]
      }
    ],
    movement: {
      speed: 16,
      preferredDistance: "near",
      canFly: true,
      terrainAdvantages: ["forest", "slope"],
      terrainDisadvantages: ["rain"]
    },
    moraleProfile: {
      baseState: "angered",
      breaksAt: 5,
      fleesAt: 8,
      surrenderPossible: false,
      modifiers: ["no persigue lejos del nido"]
    },
    behaviorProfile: {
      archetype: "protective",
      preferredActions: ["attack", "move"],
      avoidsActions: ["surrender"],
      targetPriority: ["threat_to_nest"],
      notes: "Ataca por territorio; fuera del nido no persigue demasiado."
    },
    lootProfile: {
      mode: "proof_only",
      requiresSearchAction: true,
      notes: "Aguijon/veneno requiere recoleccion cuidadosa y catalogo."
    },
    evidenceProfile: {
      possibleEvidenceTypes: ["sample", "trace"],
      proofItems: [
        {
          key: "red_wasp_stinger_trace",
          name: "Rastro de avispa roja",
          type: "sample",
          proofStatus: "partial",
          summary: "Aguijon, ala o marca compatible con avispa roja."
        }
      ],
      defaultProofStatus: "partial"
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
