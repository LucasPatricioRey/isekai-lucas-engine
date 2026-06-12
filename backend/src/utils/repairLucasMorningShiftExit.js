require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");
const JobContract = require("../models/JobContract");

const GAME_ID = "isekai_lucas_main";
const CONTRACT_ID = "job_contract_lucas_grulla_azul_d10";
const MORNING_SHIFT_ID = "shift_grulla_morning_0700_1200";
const REPAIR_LOG_ID = "log_repair_lucas_morning_shift_exit_d15";

function hasWriteFlag() {
  return process.argv.includes("--write");
}

async function repairLucasMorningShiftExit({ write = false } = {}) {
  await connectDB();

  const contract = await JobContract.findOne({ contractId: CONTRACT_ID });
  if (!contract) {
    throw new Error(`No existe contrato laboral canonico: ${CONTRACT_ID}`);
  }

  const shift = (contract.shifts || []).find((entry) => entry.shiftId === MORNING_SHIFT_ID);
  if (!shift) {
    throw new Error(`No existe turno manana canonico: ${MORNING_SHIFT_ID}`);
  }

  const before = contract.flags?.shiftSchedule?.[MORNING_SHIFT_ID] || null;
  const override = {
    status: "active",
    activeUntilDay: 15,
    inactiveFromDay: 16,
    inactiveReason: "Lucas aviso a Roberto que el Dia 15 seria su ultimo turno de manana.",
    reason: "Lucas aviso a Roberto que el Dia 15 seria su ultimo turno de manana.",
    decidedDay: 15,
    decidedTime: "06:45",
    employerNpcId: "npc_roberto_valen",
    source: "repair_lucas_morning_shift_exit",
    scheduleNotes: [
      "Desde el Dia 16 Lucas no esta obligado ni habilitado automaticamente para completar el turno de manana.",
      "El turno tarde sigue activo salvo cambio formal posterior.",
    ],
    updatedAt: new Date(),
  };

  if (!write) {
    return {
      dryRun: true,
      contractId: contract.contractId,
      shiftId: MORNING_SHIFT_ID,
      before,
      after: override,
    };
  }

  if (!contract.flags || typeof contract.flags !== "object") contract.flags = {};
  if (!contract.flags.shiftSchedule || typeof contract.flags.shiftSchedule !== "object") {
    contract.flags.shiftSchedule = {};
  }
  contract.flags.shiftSchedule[MORNING_SHIFT_ID] = override;
  contract.markModified("flags");
  await contract.save();

  await EventLog.updateOne(
    { logId: REPAIR_LOG_ID, gameId: GAME_ID },
    {
      $set: {
        logId: REPAIR_LOG_ID,
        gameId: GAME_ID,
        day: 15,
        timeStart: "06:45",
        timeEnd: "06:45",
        locationId: "loc_hoshimori_grulla_azul",
        type: "job_contract_update",
        summary: "Reparacion tecnica: el fin del turno manana de Lucas desde Dia 16 quedo formalizado en el contrato laboral.",
        involvedCharacterIds: ["char_lucas"],
        involvedNpcIds: ["npc_roberto_valen"],
        mechanicalChanges: {
          contractId: CONTRACT_ID,
          shiftId: MORNING_SHIFT_ID,
          before,
          after: override,
        },
        visibility: "hidden",
        source: "admin_fix",
        tags: ["repair", "job_contract", "lucas_morning_shift_exit"],
      },
    },
    { upsert: true }
  );

  return {
    dryRun: false,
    contractId: contract.contractId,
    shiftId: MORNING_SHIFT_ID,
    before,
    after: override,
  };
}

if (require.main === module) {
  repairLucasMorningShiftExit({ write: hasWriteFlag() })
    .then(async (result) => {
      console.log(JSON.stringify({ ok: true, result }, null, 2));
      await mongoose.disconnect();
    })
    .catch(async (error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
      await mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = {
  repairLucasMorningShiftExit,
};
