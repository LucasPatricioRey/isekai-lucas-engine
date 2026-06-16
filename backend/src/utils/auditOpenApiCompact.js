const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "../../docs");
const FULL_PATH = path.join(DOCS_DIR, "openapi-gpt-action.json");
const COMPACT_PATH = path.join(DOCS_DIR, "openapi-gpt-action-compact.json");
const ADMIN_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin.json");
const ADMIN_EXTRA_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin-extra.json");
const COMBAT_PATH = path.join(DOCS_DIR, "openapi-gpt-action-combat.json");
const MATRIX_PATH = path.join(DOCS_DIR, "gpt-actions-operation-matrix.md");
const GPT_BUILDER_OPERATION_TEXT_LIMIT = 300;

const EXPECTED_COMPACT = [
  ["POST", "/api/turn/intake"],
  ["GET", "/api/context/compact"],
  ["GET", "/api/search/db"],
  ["GET", "/api/search/docs"],
  ["GET", "/api/npcs/{npcId}/full"],
  ["GET", "/api/locations/{locationId}/full"],
  ["POST", "/api/turn/apply"],
  ["POST", "/api/turn/resolve/preview"],
  ["POST", "/api/turn/resolve"],
  ["GET", "/api/economy/shops/{shopId}/stock"],
  ["GET", "/api/economy/items/{itemId}"],
  ["GET", "/api/missions/board"],
  ["GET", "/api/missions/{missionId}"],
  ["POST", "/api/npcs/social/impact/preview"],
  ["GET", "/api/combat/actions"],
  ["GET", "/api/combat/encounters/active"],
  ["GET", "/api/combat/encounters/{encounterId}"],
  ["POST", "/api/combat/encounters/{encounterId}/actions/preview"],
  ["POST", "/api/travel/preview"],
  ["POST", "/api/world/tick/preview"],
  ["GET", "/api/jobs/contracts/active"],
  ["GET", "/api/jobs/shifts/available"],
  ["POST", "/api/jobs/shifts/{shiftId}/preview"],
  ["POST", "/api/jobs/shifts/{shiftId}/complete"],
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
  "GET /api/travel/routes",
  "POST /api/needs/activity-cost/preview",
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

function collectOperationTextLimitIssues(openapi, schemaName) {
  const issues = [];
  const methods = ["get", "post", "put", "patch", "delete"];

  for (const [routePath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      for (const field of ["summary", "description"]) {
        const value = operation[field];
        if (typeof value === "string" && value.length > GPT_BUILDER_OPERATION_TEXT_LIMIT) {
          issues.push(
            `${schemaName} ${method.toUpperCase()} ${routePath} ${field} ${value.length}/${GPT_BUILDER_OPERATION_TEXT_LIMIT}`
          );
        }
      }
    }
  }

  return issues;
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
  console.log(`Combat: ${COMBAT_PATH}`);

  const full = readJson(FULL_PATH);
  const compact = readJson(COMPACT_PATH);
  const admin = readJson(ADMIN_PATH);
  const adminExtra = readJson(ADMIN_EXTRA_PATH);
  const combat = readJson(COMBAT_PATH);
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

  section("GPT Builder Text Limits");
  const textLimitIssues = [
    ...collectOperationTextLimitIssues(full, "full"),
    ...collectOperationTextLimitIssues(compact, "compact"),
    ...collectOperationTextLimitIssues(admin, "admin"),
    ...collectOperationTextLimitIssues(adminExtra, "admin-extra"),
    ...collectOperationTextLimitIssues(combat, "combat"),
  ];
  for (const issue of textLimitIssues) console.log(`FAIL ${issue}`);
  assertCondition(
    issues,
    "operation summaries/descriptions stay under GPT Builder limit",
    textLimitIssues.length === 0,
    textLimitIssues.length ? textLimitIssues.join("; ") : `${GPT_BUILDER_OPERATION_TEXT_LIMIT} chars`
  );

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

  section("SearchDocs Rule Cards");
  const compactSearchDocsParams = compactOps.get("GET /api/search/docs")?.parameters || [];
  const compactSearchDocsParamNames = new Set(compactSearchDocsParams.map((param) => param.name));
  assertCondition(
    issues,
    "compact searchDocs q is optional for rule cards",
    compactSearchDocsParams.find((param) => param.name === "q")?.required === false
  );
  for (const paramName of ["ruleId", "source", "domain", "priority", "tag", "appliesTo", "limit"]) {
    assertCondition(
      issues,
      `compact searchDocs supports ${paramName}`,
      compactSearchDocsParamNames.has(paramName)
    );
  }

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
    "compact resolveTurn is non-consequential for fluid gameplay",
    compactOps.get("POST /api/turn/resolve")?.["x-openai-isConsequential"] === false
  );
  assertCondition(
    issues,
    "compact previews are non-consequential",
      compactOps.get("POST /api/travel/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/world/tick/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/magic/practice/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/npcs/social/impact/preview")?.["x-openai-isConsequential"] === false &&
      compactOps.get("POST /api/turn/resolve/preview")?.["x-openai-isConsequential"] === false
  );

  section("ApplyTurn Schema");
  for (const propertyName of [
    "moneyPatch",
    "inventoryPatch",
    "evidencePatches",
    "knowledgePatches",
    "skillPatch",
    "magicPractice",
    "magicPatches",
    "shopStockPatches",
    "npcMemoryPatches",
    "npcRelationshipPatches",
    "gameStatePatch",
    "activityCost",
    "activitySegments",
    "biologicalCostExemptReason",
    "actionFamily",
    "dryRun",
    "missionPatch",
    "worldEventPatches",
    "jobContractPatch",
    "commitmentPatches",
    "eventLogs",
    "factionReputationPatches",
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
  for (const propertyName of [
    "formalGuildRegistrationPending",
    "guildRegistrationStatus",
    "guildRegistrationResolution",
  ]) {
    assertCondition(
      issues,
      `full GameStatePatch has ${propertyName}`,
      Boolean(full.components?.schemas?.GameStatePatch?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact GameStatePatch has ${propertyName}`,
      Boolean(compact.components?.schemas?.GameStatePatch?.properties?.[propertyName])
    );
  }
  assertCondition(
    issues,
    "compact has JobContractPatchItem",
    Boolean(compact.components?.schemas?.JobContractPatchItem)
  );
  assertCondition(
    issues,
    "compact JobContractPatchItem supports record_work_segment",
    compact.components?.schemas?.JobContractPatchItem?.properties?.op?.enum?.includes("record_work_segment") &&
      Boolean(compact.components?.schemas?.JobContractPatchItem?.properties?.minutes)
  );
  assertCondition(
    issues,
    "full has CommitmentPatchItem",
    Boolean(full.components?.schemas?.CommitmentPatchItem)
  );
  assertCondition(
    issues,
    "compact has CommitmentPatchItem",
    Boolean(compact.components?.schemas?.CommitmentPatchItem)
  );
  for (const propertyName of [
    "failureSeverity",
    "failureConsequence",
    "successConsequence",
    "graceMinutes",
    "requiresExplicitResolution",
    "promiseType",
    "promiseStrength",
    "nextCheckDay",
    "nextCheckTime",
    "blockerSummary",
    "conditionSummary",
    "dormantUntilDay",
    "dormantUntilTime",
    "speakerNpcId",
    "responsibleNpcId",
    "responsibleFactionId",
  ]) {
    assertCondition(
      issues,
      `full CommitmentPatchItem has ${propertyName}`,
      Boolean(full.components?.schemas?.CommitmentPatchItem?.properties?.[propertyName])
    );
    assertCondition(
      issues,
      `compact CommitmentPatchItem has ${propertyName}`,
      Boolean(compact.components?.schemas?.CommitmentPatchItem?.properties?.[propertyName])
    );
  }
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
    "compact PreviewMagicPracticeRequest has modifiers",
    Boolean(compact.components?.schemas?.PreviewMagicPracticeRequest?.properties?.modifiers)
  );
  assertCondition(
    issues,
    "compact has MagicPracticeApplyItem",
    Boolean(compact.components?.schemas?.MagicPracticeApplyItem)
  );
  for (const propertyName of ["techniqueId", "minutes", "reason"]) {
    assertCondition(
      issues,
      `compact MagicPracticeApplyItem requires ${propertyName}`,
      compact.components?.schemas?.MagicPracticeApplyItem?.required?.includes(propertyName)
    );
  }
  assertCondition(
    issues,
    "compact MagicPracticeApplyItem supports target",
    Boolean(compact.components?.schemas?.MagicPracticeApplyItem?.properties?.target)
  );
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
  assertCondition(
    issues,
    "compact has EvidencePatchItem",
    Boolean(compact.components?.schemas?.EvidencePatchItem)
  );
  assertCondition(
    issues,
    "compact WorldEventPatchItem has progress",
    Boolean(compact.components?.schemas?.WorldEventPatchItem?.properties?.progress)
  );
  assertCondition(
    issues,
    "compact has FactionReputationPatchItem",
    Boolean(compact.components?.schemas?.FactionReputationPatchItem)
  );
  assertCondition(
    issues,
    "compact actionFamily supports investigation",
    compact.components?.schemas?.ApplyTurnRequest?.properties?.actionFamily?.enum?.includes("investigation")
  );
  assertCondition(
    issues,
    "compact actionFamily supports report",
    compact.components?.schemas?.ApplyTurnRequest?.properties?.actionFamily?.enum?.includes("report")
  );
  assertCondition(
    issues,
    "compact resolveTurn actionFamily aligns with job_shift",
    compact.components?.schemas?.ResolveTurnRequest?.properties?.actionFamily?.enum?.includes("job_shift") &&
      !compact.components?.schemas?.ResolveTurnRequest?.properties?.actionFamily?.enum?.includes("work")
  );
  assertCondition(
    issues,
    "compact resolveTurn supports work_segment",
    compact.components?.schemas?.ResolveTurnStep?.properties?.type?.enum?.includes("work_segment")
  );
  assertCondition(
    issues,
    "compact resolveTurn work_segment supports intensity",
    Boolean(compact.components?.schemas?.ResolveTurnStep?.properties?.intensity)
  );
  assertCondition(
    issues,
    "compact travel preview supports multi-segment pathfinding",
    Boolean(
      compactOps.get("POST /api/travel/preview")?.requestBody?.content?.["application/json"]?.schema?.properties
        ?.allowMultiSegment
    )
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
  assertCondition(issues, "admin extra has 11 operations", adminExtraOps.size === 11, String(adminExtraOps.size));
  assertCondition(issues, "admin extra schema has only GET operations", adminExtraMutators.length === 0, adminExtraMutators.join(", "));
  assertCondition(issues, "admin extra includes state audit", adminExtraOps.has("GET /api/context/audit-state"));
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
