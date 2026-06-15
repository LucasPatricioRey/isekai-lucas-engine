const assert = require("node:assert/strict");
const test = require("node:test");

const { buildContextHudContract, buildTurnDisplayBundle } = require("../utils/turnDisplayBundle");

test("builds a unified HUD bundle from mechanical, skill, social and magic changes", () => {
  const bundle = buildTurnDisplayBundle({
    changes: {
      time: {
        dayBefore: 19,
        before: "07:15",
        dayAfter: 19,
        after: "07:45",
        elapsedMinutes: 30,
      },
      mechanicalChangeDisplay: {
        displayLines: [
          "Saciedad: 69/100\u219266/100 (-3) - hambre leve.",
          "Acumulador biol\u00f3gico pendiente: 30 min descanso_sentado en bloque 07:00-08:00.",
        ],
      },
      skillProgressDisplay: {
        displayLines: ["Magia P.N4 3/100\u2192P.N4 23/100 (+20)"],
        levelUpLine: "Subida de nivel/fase: no.",
        levelUpDetails: [],
      },
      npcRelationships: [
        {
          name: "Fern",
          fieldChanges: [
            {
              field: "trust",
              label: "Confianza",
              before: 32,
              after: 33,
              appliedDelta: 1,
            },
          ],
        },
      ],
      magicPractice: [
        {
          techniqueName: "Teor\u00eda de estructura m\u00e1gica",
          minutes: 30,
          mp: {
            before: 190,
            after: 190,
            delta: 0,
          },
          canProduceVisibleEffect: false,
          unlocks: {
            willLearnSpell: false,
          },
        },
      ],
    },
    gameState: {
      currentDay: 19,
      diegeticDate: {
        day: 19,
        month: "Roc\u00edo Nuevo",
        year: 1,
      },
      block: "Ma\u00f1ana",
      time: "07:45",
      locationId: "loc_hoshimori_guild_patio",
      moneyCopper: 1498,
      lucasStatus: {
        life: { current: 100, max: 100 },
        satiety: { current: 66, max: 100, label: "hambre leve" },
        energy: { current: 99, max: 100, label: "rendimiento normal" },
        mp: { current: 190, max: 200 },
      },
    },
    location: {
      locationId: "loc_hoshimori_guild_patio",
      name: "Patio del gremio",
    },
    nearbyNpcs: [
      {
        npcId: "npc_eddan_rusk",
        name: "Eddan Rusk",
      },
    ],
    actionSummary: "Lucas practica control m\u00e1gico seguro con Eddan.",
  });

  assert.equal(bundle.schemaVersion, "turn_display_bundle_v1");
  assert.ok(bundle.renderLines.includes("## D\u00eda 19\u201407:15\u219207:45"));
  assert.ok(bundle.renderLines.includes("**Ubicaci\u00f3n:** Patio del gremio"));
  assert.ok(bundle.renderLines.includes("### Cambios relevantes"));
  assert.ok(bundle.renderLines.includes("Tiempo: 07:15\u219207:45."));
  assert.ok(bundle.renderLines.includes("Magia P.N4 3/100\u2192P.N4 23/100 (+20)"));
  assert.ok(bundle.renderLines.includes("Subida de nivel/fase: no."));
  assert.ok(bundle.renderLines.includes("Confianza Fern: 32\u219233 (+1)."));
  assert.ok(bundle.renderLines.includes("MP: 190/200\u2192190/200 (+0)."));
  assert.ok(bundle.renderLines.includes("Efecto m\u00e1gico visible: ninguno."));
  assert.ok(bundle.renderLines.includes("## Estado actual"));
  assert.ok(bundle.renderLines.includes("Dinero: 0 oro, 14 plata, 98 cobre"));
  assert.ok(bundle.renderLines.includes("NPCs visibles/cerca: Eddan Rusk."));
});

test("builds canonical HUD contract for read-only player scenes", () => {
  const contract = buildContextHudContract({
    profile: "player_scene",
    gameState: {
      currentDay: 19,
      diegeticDate: {
        day: 19,
        month: "Roc\u00edo Nuevo",
        year: 1,
      },
      block: "Ma\u00f1ana",
      time: "07:45",
      locationId: "loc_hoshimori_guild_patio",
      moneyCopper: 1498,
      lucasStatus: {
        life: { current: 100, max: 100 },
        satiety: { current: 66, max: 100, label: "hambre leve" },
        energy: { current: 99, max: 100, label: "rendimiento normal" },
        mp: { current: 190, max: 200 },
      },
    },
    location: {
      locationId: "loc_hoshimori_guild_patio",
      name: "Patio del gremio",
    },
    nearbyNpcs: [{ npcId: "npc_eddan", name: "Eddan Rusk" }],
    activeEvents: [],
    latestEventLog: {
      summary: "Lucas practico control interno sin descarga ni conjuracion.",
    },
  });

  assert.equal(contract.schemaVersion, "hud_contract_v1");
  assert.equal(contract.contractStrength, "mandatory_for_every_player_response");
  assert.equal(contract.sectionNames.state, "## Estado actual");
  assert.deepEqual(contract.exactStateFieldOrder.slice(0, 4), [
    "D\u00eda",
    "Bloque",
    "Hora",
    "Ubicaci\u00f3n",
  ]);
  assert.ok(contract.forbiddenStateFieldRenames.includes("Evento visible para Lucas"));
  assert.ok(contract.headerLines.includes("## D\u00eda 19\u201407:45"));
  assert.ok(contract.stateLines.includes("Evento activo: ninguno"));
  assert.ok(contract.stateLines.includes("NPCs visibles/cerca: Eddan Rusk."));
  assert.match(contract.noMutationChangeLine, /Sin cambios mecanicos nuevos/);
});

test("builds job shift HUD lines from completeJobShift-style changes", () => {
  const bundle = buildTurnDisplayBundle({
    changes: {
      time: {
        before: "14:00",
        after: "20:30",
        elapsedMinutes: 390,
      },
      pay: {
        before: 1498,
        delta: 800,
        after: 2298,
      },
      physicalBreakdown: {
        displayLines: [
          "Saciedad: 66->96 por comida de contrato ->81 tras trabajo",
          "Energ\u00eda: 99->100 por comida de contrato ->65 tras trabajo",
        ],
      },
      biologicalClock: {
        coveredPendingAccumulations: [
          { accumulationId: "bioacc_1" },
          { accumulationId: "bioacc_2" },
        ],
      },
      ledger: {
        shiftId: "shift_grulla_afternoon_1400_2030",
      },
    },
    gameState: {
      currentDay: 19,
      diegeticDate: {
        day: 19,
        month: "Roc\u00edo Nuevo",
        year: 1,
      },
      block: "Noche",
      time: "20:30",
      locationId: "loc_hoshimori_grulla_azul",
      moneyCopper: 2298,
      lucasStatus: {
        life: { current: 100, max: 100 },
        satiety: { current: 81, max: 100, label: "saciado" },
        energy: { current: 65, max: 100, label: "rendimiento normal" },
        mp: { current: 190, max: 200 },
      },
    },
    location: {
      locationId: "loc_hoshimori_grulla_azul",
      name: "La Grulla Azul",
    },
    nearbyNpcs: [
      { npcId: "npc_roberto_valen", name: "Roberto Valen" },
      { npcId: "npc_fern", name: "Fern" },
    ],
    actionSummary: "Lucas completa el turno tarde en La Grulla Azul.",
  });

  assert.ok(bundle.renderLines.includes("Trabajo:"));
  assert.ok(bundle.renderLines.includes("Turno laboral completado: shift_grulla_afternoon_1400_2030."));
  assert.ok(bundle.renderLines.includes("Dinero: 0 oro, 14 plata, 98 cobre\u21920 oro, 22 plata, 98 cobre (+800 cobre)."));
  assert.ok(bundle.renderLines.includes("Acumuladores biol\u00f3gicos cubiertos por turno laboral: 2."));
  assert.ok(bundle.renderLines.includes("Dinero: 0 oro, 22 plata, 98 cobre"));
  assert.ok(bundle.renderLines.includes("NPCs visibles/cerca: Roberto Valen, Fern."));
});
