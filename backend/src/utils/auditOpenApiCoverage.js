const fs = require("fs");
const path = require("path");

const OPENAPI_PATH = path.resolve(__dirname, "../../docs/openapi-gpt-action.json");

const EXPECTED_INCLUDED = [
  ["GET", "/api/health"],
  ["GET", "/api/context/compact"],
  ["GET", "/api/context/full"],
  ["GET", "/api/characters/{characterId}/state"],
  ["GET", "/api/search/db"],
  ["GET", "/api/search/docs"],
  ["GET", "/api/npcs/{npcId}/full"],
  ["GET", "/api/locations/{locationId}/full"],
  ["POST", "/api/turn/apply"],
  ["GET", "/api/economy/shops"],
  ["GET", "/api/economy/shops/{shopId}/stock"],
  ["GET", "/api/economy/items/{itemId}"],
  ["GET", "/api/missions/board"],
  ["GET", "/api/missions/{missionId}"],
  ["POST", "/api/npcs/social/impact/preview"],
  ["GET", "/api/combat/actions"],
  ["GET", "/api/combat/enemies"],
  ["GET", "/api/combat/enemies/{enemyId}"],
  ["GET", "/api/combat/encounters/active"],
  ["GET", "/api/combat/encounters/{encounterId}"],
  ["POST", "/api/combat/encounters/{encounterId}/actions/preview"],
  ["GET", "/api/travel/routes"],
  ["GET", "/api/travel/routes/{routeId}"],
  ["POST", "/api/travel/preview"],
  ["POST", "/api/world/tick/preview"],
  ["GET", "/api/jobs/contracts/active"],
  ["GET", "/api/jobs/shifts/available"],
  ["POST", "/api/jobs/shifts/{shiftId}/preview"],
  ["POST", "/api/needs/activity-cost/preview"],
  ["POST", "/api/progression/skills/preview"],
  ["GET", "/api/magic/disciplines"],
  ["GET", "/api/magic/techniques"],
  ["GET", "/api/magic/techniques/{techniqueId}"],
  ["POST", "/api/magic/practice/preview"],
  ["GET", "/api/weather/current"],
  ["POST", "/api/weather/effects/preview"],
  ["GET", "/api/checkpoints"],
  ["POST", "/api/checkpoints"],
  ["GET", "/api/checkpoints/{checkpointId}"],
];

const EXPECTED_EXCLUDED = [
  ["POST", "/api/checkpoints/{checkpointId}/rollback"],
  ["POST", "/api/combat/encounters/start"],
  ["POST", "/api/combat/encounters/{encounterId}/round"],
  ["POST", "/api/missions/expire-available"],
  ["POST", "/api/missions/{missionId}/accept"],
  ["POST", "/api/missions/{missionId}/report"],
  ["POST", "/api/economy/restock-daily"],
];

function key(method, routePath) {
  return `${method.toUpperCase()} ${routePath}`;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function readOpenApi() {
  const raw = fs.readFileSync(OPENAPI_PATH, "utf8");
  return JSON.parse(raw);
}

function collectOperations(openapi) {
  const operations = new Set();
  const methods = ["get", "post", "put", "patch", "delete"];

  for (const [routePath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of methods) {
      if (pathItem[method]) {
        operations.add(key(method, routePath));
      }
    }
  }

  return operations;
}

function main() {
  const issues = [];

  console.log("OpenAPI coverage audit");
  console.log(`OpenAPI file: ${OPENAPI_PATH}`);

  const openapi = readOpenApi();
  const operations = collectOperations(openapi);
  const deliberatelyExcluded = new Set(openapi["x-deliberately-excluded"] || []);

  section("Document Shape");
  assertCondition(issues, "openapi version present", Boolean(openapi.openapi), openapi.openapi || "");
  assertCondition(issues, "title present", Boolean(openapi.info?.title), openapi.info?.title || "");
  assertCondition(issues, "ApiKeyAuth security scheme present", Boolean(openapi.components?.securitySchemes?.ApiKeyAuth));
  assertCondition(issues, "server points to Render", (openapi.servers || []).some((server) => /onrender\.com/.test(server.url || "")));

  section("Expected Included Operations");
  const missing = [];
  for (const [method, routePath] of EXPECTED_INCLUDED) {
    const operationKey = key(method, routePath);
    const exists = operations.has(operationKey);
    console.log(`${exists ? "PASS" : "FAIL"} ${operationKey}`);
    if (!exists) missing.push(operationKey);
  }
  assertCondition(issues, "missing included operation count", missing.length === 0, String(missing.length));

  section("Deliberately Excluded Operations");
  const wronglyIncluded = [];
  const missingFromExcludedList = [];
  for (const [method, routePath] of EXPECTED_EXCLUDED) {
    const operationKey = key(method, routePath);
    const isIncluded = operations.has(operationKey);
    const isDocumentedAsExcluded = deliberatelyExcluded.has(operationKey);
    console.log(`${!isIncluded && isDocumentedAsExcluded ? "PASS" : "FAIL"} ${operationKey}`);
    if (isIncluded) wronglyIncluded.push(operationKey);
    if (!isDocumentedAsExcluded) missingFromExcludedList.push(operationKey);
  }
  assertCondition(issues, "wrongly included excluded operation count", wronglyIncluded.length === 0, String(wronglyIncluded.length));
  assertCondition(issues, "excluded-list missing count", missingFromExcludedList.length === 0, String(missingFromExcludedList.length));

  section("Security Checks");
  const healthSecurity = openapi.paths?.["/api/health"]?.get?.security || [];
  assertCondition(issues, "health is explicitly public", Array.isArray(healthSecurity) && healthSecurity.length === 0);
  const protectedMissing = [];
  for (const [method, routePath] of EXPECTED_INCLUDED) {
    if (routePath === "/api/health") continue;
    const operation = openapi.paths?.[routePath]?.[method.toLowerCase()];
    const security = operation?.security || openapi.security || [];
    if (!JSON.stringify(security).includes("ApiKeyAuth")) {
      protectedMissing.push(key(method, routePath));
    }
  }
  assertCondition(issues, "protected operations require ApiKeyAuth", protectedMissing.length === 0, String(protectedMissing.length));

  section("Audit Result");
  if (issues.length > 0) {
    console.error("OpenAPI coverage audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("OpenAPI coverage audit OK.");
}

main();
