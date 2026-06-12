const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "../../docs");
const FULL_PATH = path.join(DOCS_DIR, "openapi-gpt-action.json");
const COMPACT_PATH = path.join(DOCS_DIR, "openapi-gpt-action-compact.json");
const ADMIN_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin.json");
const ADMIN_EXTRA_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin-extra.json");
const MATRIX_PATH = path.join(DOCS_DIR, "gpt-actions-operation-matrix.md");

const EXPECTED_COMPACT = [
  ["GET", "/api/context/compact"],
  ["GET", "/api/characters/{characterId}/state"],
  ["GET", "/api/search/db"],
  ["GET", "/api/search/docs"],
  ["GET", "/api/npcs/{npcId}/full"],
  ["GET", "/api/locations/{locationId}/full"],
  ["POST", "/api/turn/apply"],
  ["GET", "/api/economy/shops/{shopId}/stock"],
  ["GET", "/api/economy/items/{itemId}"],
  ["GET", "/api/missions/board"],
  ["GET", "/api/missions/{missionId}"],
  ["POST", "/api/npcs/social/impact/preview"],
  ["GET", "/api/combat/actions"],
  ["GET", "/api/combat/encounters/active"],
  ["GET", "/api/combat/encounters/{encounterId}"],
  ["POST", "/api/combat/encounters/{encounterId}/actions/preview"],
  ["GET", "/api/travel/routes"],
  ["POST", "/api/travel/preview"],
  ["POST", "/api/world/tick/preview"],
  ["GET", "/api/jobs/contracts/active"],
  ["GET", "/api/jobs/shifts/available"],
  ["POST", "/api/jobs/shifts/{shiftId}/preview"],
  ["POST", "/api/jobs/shifts/{shiftId}/complete"],
  ["POST", "/api/needs/activity-cost/preview"],
  ["POST", "/api/progression/skills/preview"],
  ["GET", "/api/magic/techniques"],
  ["GET", "/api/magic/techniques/{techniqueId}"],
  ["POST", "/api/magic/practice/preview"],
  ["GET", "/api/weather/current"],
  ["POST", "/api/weather/effects/preview"],
];

const COMPACT_EXCLUDED = [
  "GET /api/context/full",
  "GET /api/checkpoints",
  "POST /api/checkpoints",
  "POST /api/checkpoints/{checkpointId}/rollback",
  "POST /api/combat/encounters/start",
  "POST /api/combat/encounters/{encounterId}/round",
  "POST /api/missions/expire-available",
  "POST /api/missions/{missionId}/accept",
  "POST /api/missions/{missionId}/report",
  "POST /api/economy/restock-daily",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function key(method, routePath) {
  return `${method.toUpperCase()} ${routePath}`;
}

function collectOperations(openapi) {
  const operations = new Map();
  const methods = ["get", "post", "put", "patch", "delete"];

  for (const [routePath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of methods) {
      if (pathItem[method]) {
        operations.set(key(method, routePath), pathItem[method]);
      }
    }
  }

  return operations;
}

function collectOperationIds(openapi) {
  const operationIds = [];

  for (const pathItem of Object.values(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]?.operationId) operationIds.push(pathItem[method].operationId);
    }
  }

  return operationIds;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function hasSchemaProperty(openapi, propertyName) {
  return Boolean(openapi.components?.schemas?.ApplyTurnRequest?.properties?.[propertyName]);
}

function main() {
  const issues = [];

  console.log("OpenAPI compact audit");
  console.log(`Full: ${FULL_PATH}`);
  console.log(`Compact: ${COMPACT_PATH}`);
  console.log(`Admin: ${ADMIN_PATH}`);
  console.log(`Admin extra: ${ADMIN_EXTRA_PATH}`);

  const full = readJson(FULL_PATH);
  const compact = readJson(COMPACT_PATH);
  const admin = readJson(ADMIN_PATH);
  const adminExtra = readJson(ADMIN_EXTRA_PATH);
  const fullOps = collectOperations(full);
  const compactOps = collectOperations(compact);
  const adminOps = collectOperations(admin);
  const adminExtraOps = collectOperations(adminExtra);

  section("Compact Shape");
  assertCondition(issues, "compact file exists", fs.existsSync(COMPACT_PATH));
  assertCondition(issues, "compact operation count is within limit", compactOps.size <= 30, String(compactOps.size));
  assertCondition(issues, "compact declares operation limit", compact["x-operation-limit"] === 30);
  assertCondition(issues, "compact uses ApiKeyAuth", Boolean(compact.components?.securitySchemes?.ApiKeyAuth));
  assertCondition(issues, "compact server points to Render", (compact.servers || []).some((server) => /onrender\.com/.test(server.url || "")));

  section("Expected Compact Operations");
  const missingCompact = [];
  for (const [method, routePath] of EXPECTED_COMPACT) {
    const operationKey = key(method, routePath);
    const exists = compactOps.has(operationKey);
    const existsInFull = fullOps.has(operationKey);
    console.log(`${exists && existsInFull ? "PASS" : "FAIL"} ${operationKey}`);
    if (!exists || !existsInFull) missingCompact.push(operationKey);
  }
  assertCondition(issues, "missing compact operation count", missingCompact.length === 0, String(missingCompact.length));

  section("Excluded From Compact");
  const excludedIncluded = [];
  for (const operationKey of COMPACT_EXCLUDED) {
    const included = compactOps.has(operationKey);
    console.log(`${included ? "FAIL" : "PASS"} ${operationKey}`);
    if (included) excludedIncluded.push(operationKey);
  }
  assertCondition(issues, "excluded compact operation count", excludedIncluded.length === 0, String(excludedIncluded.length));

  section("Consequential Flags");
  assertCondition(
    issues,
    "compact applyTurn is non-consequential for fluid gameplay",
    compactOps.get("POST /api/turn/apply")?.["x-openai-isConsequential"] === false
  );
  assertCondition(
    issues,
    "compact completeJobShift is non-consequential for fluid gameplay",
    compactOps.get("POST /api/jobs/shifts/{shiftId}/complete")?.["x-openai-isConsequential"] === false
  );
  assertCondition(
    issues,
    "compact previews are non-consequential",
      compactOps.get("POST /api/travel/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/world/tick/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/magic/practice/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/npcs/social/impact/preview")?.["x-openai-isConsequential"] === false
  );

  section("ApplyTurn Schema");
  for (const propertyName of [
    "moneyPatch",
    "inventoryPatch",
    "skillPatch",
    "shopStockPatches",
    "npcMemoryPatches",
    "npcRelationshipPatches",
    "gameStatePatch",
    "activityCost",
    "biologicalCostExemptReason",
    "missionPatch",
    "worldEventPatches",
    "jobContractPatch",
    "eventLogs",
  ]) {
    assertCondition(
      issues,
      `full ApplyTurnRequest has ${propertyName}`,
      hasSchemaProperty(full, propertyName)
    );
    assertCondition(
      issues,
      `compact ApplyTurnRequest has ${propertyName}`,
      hasSchemaProperty(compact, propertyName)
    );
  }
  assertCondition(
    issues,
    "full timeAdvance supports fromDay",
    Boolean(full.components?.schemas?.ApplyTurnRequest?.properties?.timeAdvance?.properties?.fromDay)
  );
  assertCondition(
    issues,
    "full timeAdvance supports toDay",
    Boolean(full.components?.schemas?.ApplyTurnRequest?.properties?.timeAdvance?.properties?.toDay)
  );
  assertCondition(
    issues,
    "compact timeAdvance supports fromDay",
    Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.timeAdvance?.properties?.fromDay)
  );
  assertCondition(
    issues,
    "compact timeAdvance supports toDay",
    Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.timeAdvance?.properties?.toDay)
  );
  assertCondition(
    issues,
    "compact activityCost supports minutes mismatch override",
    Boolean(compact.components?.schemas?.ActivityCostInput?.properties?.allowMinutesMismatch)
  );
  assertCondition(
    issues,
    "compact has JobContractPatchItem",
    Boolean(compact.components?.schemas?.JobContractPatchItem)
  );
  assertCondition(
    issues,
    "full CompleteJobShiftRequest supports explicit contract meal consumption",
    Boolean(full.components?.schemas?.CompleteJobShiftRequest?.properties?.consumeIncludedMealIds)
  );
  assertCondition(
    issues,
    "compact CompleteJobShiftRequest supports explicit contract meal consumption",
    Boolean(compact.components?.schemas?.CompleteJobShiftRequest?.properties?.consumeIncludedMealIds)
  );
  assertCondition(
    issues,
    "full ApplyTurnRequest rejects unknown top-level properties",
    full.components?.schemas?.ApplyTurnRequest?.additionalProperties === false
  );
  assertCondition(
    issues,
    "compact ApplyTurnRequest rejects unknown top-level properties",
    compact.components?.schemas?.ApplyTurnRequest?.additionalProperties === false
  );
  for (const propertyName of ["category", "reason", "modifiers"]) {
    assertCondition(
      issues,
      `full SkillPatchItem has ${propertyName}`,
      Boolean(full.components?.schemas?.SkillPatchItem?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact SkillPatchItem has ${propertyName}`,
      Boolean(compact.components?.schemas?.SkillPatchItem?.properties?.[propertyName])
    );
  }
  for (const propertyName of ["skillId", "expDelta", "category", "reason"]) {
    assertCondition(
      issues,
      `compact SkillPatchItem requires ${propertyName}`,
      compact.components?.schemas?.SkillPatchItem?.required?.includes(propertyName)
    );
  }
  for (const propertyName of ["skillId", "expDelta", "category", "reason"]) {
    assertCondition(
      issues,
      `compact PreviewSkillProgressionRequest requires ${propertyName}`,
      compact.components?.schemas?.PreviewSkillProgressionRequest?.required?.includes(propertyName)
    );
  }
  assertCondition(
    issues,
    "compact skill preview has request body",
    Boolean(
      compactOps.get("POST /api/progression/skills/preview")?.requestBody?.content?.["application/json"]?.schema
    )
  );
  for (const propertyName of ["techniqueId", "minutes"]) {
    assertCondition(
      issues,
      `compact PreviewMagicPracticeRequest requires ${propertyName}`,
      compact.components?.schemas?.PreviewMagicPracticeRequest?.required?.includes(propertyName)
    );
  }
  assertCondition(
    issues,
    "compact magic practice preview has request body",
    Boolean(
      compactOps.get("POST /api/magic/practice/preview")?.requestBody?.content?.["application/json"]?.schema
    )
  );
  for (const op of ["accept", "report", "verify", "complete", "fail", "expire"]) {
    assertCondition(
      issues,
      `compact MissionPatchItem supports ${op}`,
      compact.components?.schemas?.MissionPatchItem?.properties?.op?.enum?.includes(op)
    );
  }
  assertCondition(
    issues,
    "compact activityCost documents auto accumulation",
    Boolean(compact.components?.schemas?.ActivityCostInput?.properties?.processingMode)
  );
  assertCondition(
    issues,
    "compact activityCost documents sourceEventLogId",
    Boolean(compact.components?.schemas?.ActivityCostInput?.properties?.sourceEventLogId)
  );
  assertCondition(
    issues,
    "compact WorldEventPatchItem supports expired status",
    compact.components?.schemas?.WorldEventPatchItem?.properties?.status?.enum?.includes("expired")
  );
  for (const propertyName of ["applySocialConsequences", "socialOutcome"]) {
    assertCondition(
      issues,
      `full WorldEventPatchItem has ${propertyName}`,
      Boolean(full.components?.schemas?.WorldEventPatchItem?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact WorldEventPatchItem has ${propertyName}`,
      Boolean(compact.components?.schemas?.WorldEventPatchItem?.properties?.[propertyName])
    );
  }
  for (const propertyName of [
    "familiarityDelta",
    "socialDebtDelta",
    "actionType",
    "overrideDailyCap",
    "overrideReason",
  ]) {
    assertCondition(
      issues,
      `full NpcRelationshipPatchItem has ${propertyName}`,
      Boolean(full.components?.schemas?.NpcRelationshipPatchItem?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact NpcRelationshipPatchItem has ${propertyName}`,
      Boolean(compact.components?.schemas?.NpcRelationshipPatchItem?.properties?.[propertyName])
    );
  }
  for (const propertyName of [
    "socialTone",
    "intentTags",
    "contextTags",
    "respectNpcProfile",
  ]) {
    assertCondition(
      issues,
      `full SocialImpactPreviewRequest has ${propertyName}`,
      Boolean(full.components?.schemas?.SocialImpactPreviewRequest?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact SocialImpactPreviewRequest has ${propertyName}`,
      Boolean(compact.components?.schemas?.SocialImpactPreviewRequest?.properties?.[propertyName])
    );
  }
  assertCondition(
    issues,
    "compact SocialImpactFactors has actionType",
    Boolean(compact.components?.schemas?.SocialImpactFactors?.properties?.actionType)
  );

  section("Admin Read-Only Schema");
  const adminMutators = Array.from(adminOps.keys()).filter((operationKey) => operationKey.startsWith("POST "));
  assertCondition(issues, "admin schema exists", fs.existsSync(ADMIN_PATH));
  assertCondition(issues, "admin schema has no POST operations", adminMutators.length === 0, adminMutators.join(", "));
  assertCondition(issues, "admin schema excludes rollback", !adminOps.has("POST /api/checkpoints/{checkpointId}/rollback"));

  section("Admin Extra Read-Only Schema");
  const adminExtraMutators = Array.from(adminExtraOps.keys()).filter((operationKey) => !operationKey.startsWith("GET "));
  const compactOperationIds = new Set(collectOperationIds(compact));
  const adminExtraOperationIds = collectOperationIds(adminExtra);
  const duplicatedOperationIds = adminExtraOperationIds.filter((operationId) => compactOperationIds.has(operationId));
  assertCondition(issues, "admin extra schema exists", fs.existsSync(ADMIN_EXTRA_PATH));
  assertCondition(issues, "admin extra has 10 operations", adminExtraOps.size === 10, String(adminExtraOps.size));
  assertCondition(issues, "admin extra schema has only GET operations", adminExtraMutators.length === 0, adminExtraMutators.join(", "));
  assertCondition(issues, "admin extra includes world event list", adminExtraOps.has("GET /api/world/events"));
  assertCondition(issues, "admin extra includes world event detail", adminExtraOps.has("GET /api/world/events/{eventId}"));
  assertCondition(issues, "admin extra operationIds do not duplicate compact", duplicatedOperationIds.length === 0, duplicatedOperationIds.join(", "));

  section("Operation Matrix");
  assertCondition(issues, "operation matrix exists", fs.existsSync(MATRIX_PATH));
  const matrix = fs.readFileSync(MATRIX_PATH, "utf8");
  assertCondition(issues, "operation matrix mentions missionPatch", matrix.includes("missionPatch"));
  assertCondition(issues, "operation matrix mentions compact limit", matrix.includes("30 operaciones"));

  section("Comparison Table");
  for (const operationKey of Array.from(new Set([...fullOps.keys(), ...compactOps.keys()])).sort()) {
    const operation = fullOps.get(operationKey) || compactOps.get(operationKey) || {};
    console.log(
      JSON.stringify({
        operation: operation.operationId || "",
        endpoint: operationKey,
        full: fullOps.has(operationKey),
        compact: compactOps.has(operationKey),
      })
    );
  }

  section("Audit Result");
  if (issues.length > 0) {
    console.error("OpenAPI compact audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("OpenAPI compact audit OK.");
}

main();
