const fs = require("fs");

const filePath = "src/controllers/checkpointController.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const CombatEncounter = require("../models/CombatEncounter");')) {
  text = text.replace(
    'const RoutineOverride = require("../models/RoutineOverride");',
    'const RoutineOverride = require("../models/RoutineOverride");\nconst CombatEncounter = require("../models/CombatEncounter");'
  );
}

if (!text.includes("combatEncounters,")) {
  text = text.replace(
    `    routineOverrides,
  ] = await Promise.all([`,
    `    routineOverrides,
    combatEncounters,
  ] = await Promise.all([`
  );

  text = text.replace(
    `    RoutineOverride.find({}).lean(),
  ]);`,
    `    RoutineOverride.find({}).lean(),
    CombatEncounter.find({}).lean(),
  ]);`
  );

  text = text.replace(
    `      routineOverrides,
    },`,
    `      routineOverrides,
      combatEncounters,
    },`
  );
}

if (!text.includes("restoreCollection(CombatEncounter")) {
  text = text.replace(
    "    await restoreCollection(RoutineOverride, snapshot.routineOverrides);",
    "    await restoreCollection(RoutineOverride, snapshot.routineOverrides);\n    await restoreCollection(CombatEncounter, snapshot.combatEncounters);"
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("checkpointController.js actualizado para incluir CombatEncounter.");
