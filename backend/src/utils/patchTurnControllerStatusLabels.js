const fs = require("fs");

const filePath = "src/controllers/turnController.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes("function getStatusLabel(statKey, current)")) {
  text = text.replace(
`function applyStatDelta(stat, delta) {
  const before = stat.current;
  const after = clamp(before + delta, 0, stat.max);
  stat.current = after;

  return {
    before,
    delta,
    after,
  };
}`,
`function getStatusLabel(statKey, current) {
  if (statKey === "satiety") {
    if (current >= 71) return "satisfecho";
    if (current >= 51) return "hambre leve";
    if (current >= 21) return "hambre fuerte";
    if (current >= 1) return "debilidad/mareos";
    return "inanicion/riesgo de vida";
  }

  if (statKey === "energy") {
    if (current >= 70) return "rendimiento normal";
    if (current >= 40) return "cansancio leve/energia media";
    if (current >= 20) return "cansancio serio";
    if (current >= 1) return "agotamiento peligroso";
    return "colapso";
  }

  return "";
}

function applyStatDelta(stat, delta, statKey) {
  const before = stat.current;
  const after = clamp(before + delta, 0, stat.max);
  stat.current = after;

  const label = getStatusLabel(statKey, after);
  if (label) {
    stat.label = label;
  }

  return {
    before,
    delta,
    after,
    labelAfter: stat.label || "",
  };
}`
  );
}

text = text.replace(
  "lucasChanges[statKey] = applyStatDelta(gameState.lucasStatus[statKey], delta);",
  "lucasChanges[statKey] = applyStatDelta(gameState.lucasStatus[statKey], delta, statKey);"
);

fs.writeFileSync(filePath, text, "utf8");

console.log("turnController.js actualizado con labels automaticos.");
