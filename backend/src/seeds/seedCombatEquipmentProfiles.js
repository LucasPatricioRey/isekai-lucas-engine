require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const WeaponProfile = require("../models/WeaponProfile");

const SOURCE = "c8_combat_equipment_profiles_seed";

const weaponProfiles = [
  {
    weaponProfileId: "weapon_profile_item_daga_simple",
    itemId: "item_daga_simple",
    name: "Daga simple",
    weaponType: "dagger",
    rangeBand: "engaged",
    damageType: "pierce",
    baseDamage: 4,
    accuracyModifier: 1,
    defenseModifier: 1,
    speedModifier: 1,
    fatigueCostModifier: 0,
    requiredSkillId: "skill_daga",
    offhandAllowed: true,
    traits: ["light", "fast", "concealable"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Arma corta comun; puede mellarse o trabarse en usos torpes.",
    },
    notes: "Arma ligera de defensa cercana. Buena para ataques rapidos, no para bloquear golpes pesados.",
  },
  {
    weaponProfileId: "weapon_profile_item_cuchillo_trabajo",
    itemId: "item_cuchillo_trabajo",
    name: "Cuchillo de trabajo",
    weaponType: "dagger",
    rangeBand: "engaged",
    damageType: "cut",
    baseDamage: 3,
    accuracyModifier: 0,
    defenseModifier: 0,
    speedModifier: 1,
    fatigueCostModifier: 0,
    requiredSkillId: "skill_daga",
    offhandAllowed: true,
    traits: ["light", "concealable", "improvised"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Herramienta util, pero no templada para combate prolongado.",
    },
    notes: "Sirve en defensa desesperada; peor que una daga formal para combate sostenido.",
  },
  {
    weaponProfileId: "weapon_profile_item_escudo_madera_simple",
    itemId: "item_escudo_madera_simple",
    name: "Escudo de madera simple",
    weaponType: "shield",
    rangeBand: "engaged",
    damageType: "blunt",
    baseDamage: 1,
    accuracyModifier: -2,
    defenseModifier: 3,
    speedModifier: -1,
    fatigueCostModifier: 1,
    requiredSkillId: "skill_bloqueo",
    offhandAllowed: true,
    traits: ["defensive", "slow"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Madera simple; aguanta golpes menores, pero puede astillarse ante cargas pesadas.",
    },
    notes: "Herramienta defensiva basica. Sirve para bloqueo, no para ganar duelos por dano.",
  },
  {
    weaponProfileId: "weapon_profile_item_baston_simple",
    itemId: "item_baston_simple",
    name: "Baston simple",
    weaponType: "staff",
    rangeBand: "near",
    damageType: "blunt",
    baseDamage: 3,
    accuracyModifier: 0,
    defenseModifier: 2,
    speedModifier: 0,
    fatigueCostModifier: 1,
    requiredSkillId: "skill_tactica_basica",
    offhandAllowed: false,
    traits: ["reach", "defensive", "two_handed"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Madera simple; puede partirse contra armadura o impactos fuertes.",
    },
    notes: "Mantiene distancia y ayuda a bloquear, pero no es un arma letal refinada.",
  },
  {
    weaponProfileId: "weapon_profile_item_garrote_reforzado",
    itemId: "item_garrote_reforzado",
    name: "Garrote reforzado",
    weaponType: "club",
    rangeBand: "engaged",
    damageType: "blunt",
    baseDamage: 5,
    accuracyModifier: -1,
    defenseModifier: 0,
    speedModifier: -1,
    fatigueCostModifier: 1,
    requiredSkillId: "skill_tactica_basica",
    offhandAllowed: false,
    traits: ["heavy", "slow"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Resiste golpes simples, pero castiga la fatiga y puede atascarse.",
    },
    notes: "Golpea fuerte para equipo barato, pero es lento y poco defensivo.",
  },
  {
    weaponProfileId: "weapon_profile_item_espada_usada",
    itemId: "item_espada_usada",
    name: "Espada usada",
    weaponType: "short_sword",
    rangeBand: "engaged",
    damageType: "cut",
    baseDamage: 6,
    accuracyModifier: 0,
    defenseModifier: 2,
    speedModifier: -1,
    fatigueCostModifier: 2,
    requiredSkillId: "skill_tactica_basica",
    offhandAllowed: false,
    traits: ["defensive"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Usada y reparada; no conviene confiarla a choques repetidos.",
    },
    notes: "Mas dano y mejor defensa que daga, pero requiere control y cansa mas.",
  },
  {
    weaponProfileId: "weapon_profile_item_arco_simple",
    itemId: "item_arco_simple",
    name: "Arco simple",
    weaponType: "bow",
    rangeBand: "medium",
    damageType: "pierce",
    baseDamage: 4,
    accuracyModifier: -1,
    defenseModifier: 0,
    speedModifier: -1,
    fatigueCostModifier: 2,
    requiredSkillId: "skill_tactica_basica",
    offhandAllowed: false,
    traits: ["two_handed"],
    conditionRules: {
      durabilityMatters: true,
      canBreak: true,
      breakRiskNotes: "Necesita cuerda/flechas y distancia; mala opcion en forcejeo cercano.",
    },
    notes: "Perfil preliminar para distancia. El consumo de municion queda para una fase posterior.",
  },
];

async function seedCombatEquipmentProfiles() {
  await connectDB();

  for (const profile of weaponProfiles) {
    await WeaponProfile.updateOne(
      { weaponProfileId: profile.weaponProfileId },
      {
        $set: {
          ...profile,
          flags: {
            ...(profile.flags || {}),
            source: SOURCE,
          },
        },
      },
      { upsert: true }
    );
  }

  const total = await WeaponProfile.countDocuments({
    weaponProfileId: { $in: weaponProfiles.map((profile) => profile.weaponProfileId) },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: SOURCE,
        upserted: weaponProfiles.length,
        total,
        weaponProfileIds: weaponProfiles.map((profile) => profile.weaponProfileId),
      },
      null,
      2
    )
  );
}

seedCombatEquipmentProfiles()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
