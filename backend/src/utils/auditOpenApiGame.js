const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "../../docs");
const GAME_PATH = path.join(DOCS_DIR, "openapi-gpt-action-game.json");

const EXPECTED_OPERATION = "POST /api/turn/play";
const FORBIDDEN_OPERATION_IDS = new Set([
  "intakeTurn",
  "executeActionPlan",
  "applyTurn",
  "resolveTurn",
  "completeJobShift",
  "getCompactContext",
  "getNpcFull",
  "getLocationFull",
  "searchDocs",
  "searchDatabase",
  "previewTravel",
  "previewMagicPractice",
  "previewSkillProgression",
  "previewWorldTick",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function key(method, routePath) {
  return `${method.toUpperCase()} ${routePath}`;
}

function collectOperations(openapi) {
  const operations = new Map();
  for (const [routePath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]) operations.set(key(method, routePath), pathItem[method]);
    }
  }
  return operations;
}

function collectOperationIds(openapi) {
  const ids = [];
  for (const pathItem of Object.values(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const id = pathItem[method]?.operationId;
      if (id) ids.push(id);
    }
  }
  return ids;
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function main() {
  const issues = [];
  console.log("OpenAPI game-only audit");
  console.log(`Game schema: ${GAME_PATH}`);

  assertCondition(issues, "game file exists", fs.existsSync(GAME_PATH));
  if (!fs.existsSync(GAME_PATH)) process.exit(1);

  const game = readJson(GAME_PATH);
  const operations = collectOperations(game);
  const operationIds = collectOperationIds(game);
  const forbiddenPresent = operationIds.filter((operationId) => FORBIDDEN_OPERATION_IDS.has(operationId));

  assertCondition(issues, "game schema is OpenAPI 3.1.0", game.openapi === "3.1.0", game.openapi || "");
  assertCondition(issues, "game operation count is exactly 1", operations.size === 1, String(operations.size));
  assertCondition(issues, "game declares operation limit 1", game["x-operation-limit"] === 1);
  assertCondition(issues, "game includes playTurn", operations.has(EXPECTED_OPERATION));
  assertCondition(issues, "game uses ApiKeyAuth", Boolean(game.components?.securitySchemes?.ApiKeyAuth));
  assertCondition(
    issues,
    "playTurn is non-consequential",
    operations.get(EXPECTED_OPERATION)?.["x-openai-isConsequential"] === false
  );
  assertCondition(
    issues,
    "game excludes manual/debug operationIds",
    forbiddenPresent.length === 0,
    forbiddenPresent.join(", ")
  );
  assertCondition(
    issues,
    "game has PlayTurnRequest/Response only",
    Boolean(game.components?.schemas?.PlayTurnRequest) &&
      Boolean(game.components?.schemas?.PlayTurnResponse) &&
      Object.keys(game.components?.schemas || {}).length === 2,
    Object.keys(game.components?.schemas || {}).join(", ")
  );

  if (issues.length > 0) {
    console.error(`OpenAPI game-only audit failed with ${issues.length} issue(s).`);
    process.exit(1);
  }

  console.log("OpenAPI game-only audit OK.");
}

main();
