const { applyTurn } = require("../controllers/turnController");
const { completeShift } = require("./jobService");
const { buildResolveTurnPayload } = require("./turnResolverService");
const { renderBundleLines } = require("../utils/turnDisplayBundle");

const SUPPORTED_OPERATIONS = new Set(["applyTurn", "completeJobShift", "resolveTurn"]);

function uniqueLines(lines = []) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const text = String(line || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function makePlanError(message, details = {}, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function normalizeOperations(body = {}) {
  const operations = body.operations || body.actionPlanPacket?.operations || body.plan?.operations || [];
  if (!Array.isArray(operations) || operations.length === 0) {
    throw makePlanError("executeActionPlan requiere operations[] no vacio.");
  }
  if (operations.length > 8) {
    throw makePlanError("executeActionPlan acepta como maximo 8 operaciones por plan.", {
      received: operations.length,
    });
  }
  return operations
    .map((operation, index) => ({
      ...operation,
      order: Number(operation.order || index + 1),
    }))
    .sort((left, right) => left.order - right.order);
}

function displayBundleFromPayload(payload = {}) {
  return (
    payload.displayBundle ||
    payload.result?.displayBundle ||
    payload.result?.changes?.displayBundle ||
    payload.changes?.displayBundle ||
    null
  );
}

function changesFromPayload(payload = {}) {
  return payload.changes || payload.result?.changes || {};
}

function gameStateFromPayload(payload = {}) {
  return payload.gameState || payload.result?.gameState || payload.result?.after || null;
}

function compactGameState(value = {}) {
  if (!value || typeof value !== "object") return null;
  const lucasStatus = value.lucasStatus || value.status || {};
  return {
    currentDay: value.currentDay || value.day || null,
    block: value.block || "",
    time: value.time || "",
    locationId: value.locationId || value.location?.locationId || "",
    moneyCopper: Number.isFinite(Number(value.moneyCopper)) ? Number(value.moneyCopper) : null,
    lucasStatus: {
      life: lucasStatus.life
        ? { current: lucasStatus.life.current, max: lucasStatus.life.max, label: lucasStatus.life.label || "" }
        : null,
      satiety: lucasStatus.satiety
        ? { current: lucasStatus.satiety.current, max: lucasStatus.satiety.max, label: lucasStatus.satiety.label || "" }
        : null,
      energy: lucasStatus.energy
        ? { current: lucasStatus.energy.current, max: lucasStatus.energy.max, label: lucasStatus.energy.label || "" }
        : null,
      mp: lucasStatus.mp
        ? { current: lucasStatus.mp.current, max: lucasStatus.mp.max, label: lucasStatus.mp.label || "" }
        : null,
    },
    activeEventIds: Array.isArray(value.activeEventIds) ? value.activeEventIds.slice(0, 5) : [],
    activeMissionIds: Array.isArray(value.activeMissionIds) ? value.activeMissionIds.slice(0, 5) : [],
  };
}

function checkpointIdFromPayload(payload = {}) {
  return (
    payload.changes?.autoCheckpoint?.checkpoint?.checkpointId ||
    payload.result?.changes?.autoCheckpoint?.checkpoint?.checkpointId ||
    ""
  );
}

function lineStartingWith(lines = [], prefix = "") {
  return lines.find((line) => String(line || "").startsWith(prefix)) || "";
}

function replaceSituationLine(stateLines = [], actionSummary = "") {
  if (!actionSummary) return stateLines;
  const summary = String(actionSummary).trim().replace(/\.+$/g, "");
  return stateLines.map((line) =>
    String(line || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .startsWith("situacion:")
      ? `Situación: ${summary}.`
      : line
  );
}

function mergeChangeGroups(displayBundles = []) {
  const groups = new Map();
  const order = [];
  for (const bundle of displayBundles) {
    for (const group of bundle?.changeGroups || []) {
      const id = group.id || group.title || `group_${order.length + 1}`;
      if (!groups.has(id)) {
        groups.set(id, {
          id,
          title: group.title || "",
          lines: [],
        });
        order.push(id);
      }
      groups.get(id).lines.push(...(group.lines || []));
    }
  }
  return order
    .map((id) => ({
      ...groups.get(id),
      lines: uniqueLines(groups.get(id).lines),
    }))
    .filter((group) => group.lines.length > 0);
}

function buildAggregateDisplayBundle({ operationResults = [], actionSummary = "" } = {}) {
  const displayBundles = operationResults.map((result) => result.displayBundle).filter(Boolean);
  const firstBundle = displayBundles[0] || {};
  const lastBundle = displayBundles[displayBundles.length - 1] || {};
  const firstTimeChange = operationResults.map((result) => result.timeChange || {}).find((time) => time.before) || {};
  const lastTimeChange = [...operationResults].reverse().map((result) => result.timeChange || {}).find((time) => time.after) || {};
  const finalGameState = [...operationResults].reverse().find((result) => result.gameState)?.gameState || {};
  const finalDay =
    finalGameState.currentDay ||
    finalGameState.day ||
    lastTimeChange.dayAfter ||
    firstTimeChange.dayAfter ||
    "?";
  const firstTime = firstTimeChange.before || finalGameState.time || "?";
  const lastTime = lastTimeChange.after || finalGameState.time || "?";
  const headerLines = [
    firstTime && lastTime && firstTime !== lastTime
      ? `## Día ${finalDay}—${firstTime}→${lastTime}`
      : lastBundle.headerLines?.[0] || firstBundle.headerLines?.[0] || `## Día ${finalDay}—${lastTime}`,
    lastBundle.headerLines?.[1] || firstBundle.headerLines?.[1] || "",
  ].filter(Boolean);
  const changeGroups = mergeChangeGroups(displayBundles);
  const stateLines = replaceSituationLine(lastBundle.stateLines || [], actionSummary);
  const alertLines = uniqueLines(displayBundles.flatMap((bundle) => bundle.alertLines || []));
  const renderLines = renderBundleLines({
    headerLines,
    changeGroups,
    stateLines,
    alertLines,
  });

  return {
    schemaVersion: "turn_action_plan_display_bundle_v1",
    source: "turn/action-plan/execute",
    copyInstruction:
      "Copiar renderLines como HUD final agregado del plan. No usar solo el displayBundle de una operacion individual.",
    headerLines,
    changeGroups,
    changeLines: uniqueLines(changeGroups.flatMap((group) => group.lines)),
    stateLines,
    alertLines,
    renderLines,
  };
}

function summarizePayload({ operation = {}, payload = {}, statusCode = 200 } = {}) {
  const displayBundle = displayBundleFromPayload(payload);
  const changes = changesFromPayload(payload);
  const gameState = compactGameState(gameStateFromPayload(payload));
  return {
    order: operation.order,
    selectedOperation: operation.selectedOperation,
    operationId: operation.operationId || operation.selectedOperation,
    ok: payload.ok !== false && statusCode < 400,
    statusCode,
    logIds: payload.logIds || (payload.result?.logId ? [payload.result.logId] : []),
    primaryLogId: payload.primaryLogId || payload.result?.logId || "",
    turnTraceId: payload.turnTraceId || "",
    checkpointId: checkpointIdFromPayload(payload),
    changeKeys: Object.keys(changes),
    timeChange: changes.time || null,
    displayBundle,
    stateLine: displayBundle ? lineStartingWith(displayBundle.stateLines || [], "Hora:") : "",
    gameState,
  };
}

function publicOperationResult(result = {}) {
  const bundle = result.displayBundle || {};
  return {
    order: result.order,
    selectedOperation: result.selectedOperation,
    operationId: result.operationId,
    ok: result.ok,
    statusCode: result.statusCode,
    logIds: result.logIds || [],
    primaryLogId: result.primaryLogId || "",
    turnTraceId: result.turnTraceId || "",
    checkpointId: result.checkpointId || "",
    changeKeys: result.changeKeys || [],
    timeChange: result.timeChange || null,
    displaySummary: {
      headerLines: bundle.headerLines || [],
      changeLineCount: Array.isArray(bundle.changeLines)
        ? bundle.changeLines.length
        : Array.isArray(bundle.changeGroups)
          ? bundle.changeGroups.reduce((count, group) => count + (group.lines || []).length, 0)
          : 0,
      stateLine: result.stateLine || "",
    },
  };
}

async function invokeApplyTurn(requestBody = {}) {
  let statusCode = 200;
  let payload = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      payload = value;
      return value;
    },
  };

  await applyTurn({ body: requestBody }, response);
  if (statusCode >= 400 || payload?.ok === false) {
    throw makePlanError(payload?.error || "applyTurn fallo dentro de executeActionPlan.", {
      statusCode,
      payload,
    }, statusCode);
  }
  return { statusCode, payload };
}

async function invokeCompleteJobShift(operation = {}) {
  const body = operation.request?.body || operation.body || {};
  const shiftId = operation.request?.pathParams?.shiftId || operation.pathParams?.shiftId || body.shiftId || "";
  if (!shiftId) {
    throw makePlanError("completeJobShift en actionPlan no trae shiftId.");
  }
  const result = await completeShift({
    shiftId,
    gameId: body.gameId || "isekai_lucas_main",
    characterId: body.characterId || "char_lucas",
    contractId: body.contractId || "",
    alreadyConsumedMealIds: body.alreadyConsumedMealIds || [],
    consumeIncludedMealIds: body.consumeIncludedMealIds || [],
    skipMealIds: body.skipMealIds || [],
    completionSummary: body.completionSummary || "",
    allowLateCompletion: Boolean(body.allowLateCompletion),
    mealTiming: body.mealTiming || "before_work_cost",
  });
  return {
    statusCode: 200,
    payload: {
      ok: true,
      result,
      displayBundle: result.displayBundle || result.changes?.displayBundle || null,
    },
  };
}

async function invokeResolveTurn(operation = {}) {
  const requestBody = operation.request || operation.body || {};
  const { applyTurnPayload, resolverPlan } = await buildResolveTurnPayload(requestBody, {
    forceDryRun: false,
  });
  const { statusCode, payload } = await invokeApplyTurn(applyTurnPayload);
  return {
    statusCode,
    payload: {
      ...payload,
      resolverPlan,
      resolvedApplyTurnPayload: requestBody.includeResolvedPayload ? applyTurnPayload : undefined,
    },
  };
}

async function executeOperation(operation = {}) {
  const selectedOperation = operation.selectedOperation || operation.operationId || "";
  if (!SUPPORTED_OPERATIONS.has(selectedOperation)) {
    throw makePlanError("Operacion no soportada por executeActionPlan.", {
      selectedOperation,
      allowed: Array.from(SUPPORTED_OPERATIONS),
    });
  }
  if (selectedOperation === "completeJobShift") {
    return invokeCompleteJobShift(operation);
  }
  if (selectedOperation === "resolveTurn") {
    return invokeResolveTurn(operation);
  }
  return invokeApplyTurn(operation.request || operation.body || {});
}

async function executeActionPlan(body = {}) {
  const operations = normalizeOperations(body);
  const operationResults = [];

  for (const operation of operations) {
    try {
      const { statusCode, payload } = await executeOperation(operation);
      operationResults.push(summarizePayload({ operation, payload, statusCode }));
    } catch (error) {
      throw makePlanError(error.message || "executeActionPlan fallo durante una operacion.", {
        errorCode: error.details?.errorCode || "ACTION_PLAN_OPERATION_FAILED",
        failedOperation: {
          order: operation.order,
          selectedOperation: operation.selectedOperation || operation.operationId || "",
          operationId: operation.operationId || operation.selectedOperation || "",
        },
        operationsAttempted: operationResults.length,
        operationResults,
        details: error.details || undefined,
      }, error.statusCode || 500);
    }
  }

  const actionSummary =
    body.actionSummary ||
    body.actionPlanPacket?.summary?.actionSummary ||
    body.plan?.summary?.actionSummary ||
    operations[0]?.request?.body?.completionSummary ||
    operations[0]?.request?.actionSummary ||
    "";
  const aggregateDisplayBundle = buildAggregateDisplayBundle({
    operationResults,
    actionSummary,
  });
  const unresolvedSlots = body.unresolvedSlots || body.actionPlanPacket?.unresolvedSlots || body.plan?.unresolvedSlots || [];
  const warnings = [
    ...unresolvedSlots.map((slot) => slot.displayLine || slot.reason || `Slot no resuelto: ${slot.slotId || slot.type || "unknown"}.`),
  ];

  return {
    ok: true,
    schemaVersion: "turn_action_plan_execute_v1",
    message: "Action plan ejecutado correctamente.",
    clientPlanId: body.clientPlanId || body.actionPlanPacket?.clientPlanId || "",
    operationCount: operationResults.length,
    operationsExecuted: operationResults.map((result) => ({
      order: result.order,
      selectedOperation: result.selectedOperation,
      operationId: result.operationId,
      ok: result.ok,
      logIds: result.logIds,
      primaryLogId: result.primaryLogId,
      turnTraceId: result.turnTraceId,
      checkpointId: result.checkpointId,
    })),
    operationResults: operationResults.map(publicOperationResult),
    unresolvedSlots,
    warnings,
    aggregateDisplayBundle,
    displayBundle: aggregateDisplayBundle,
    finalState: operationResults[operationResults.length - 1]?.gameState || null,
  };
}

module.exports = {
  executeActionPlan,
};
