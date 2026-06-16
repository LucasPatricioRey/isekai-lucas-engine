const { executeActionPlan } = require("./turnActionPlanService");
const { buildNarratorPacket } = require("./turnIntakeService");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const SCHEMA_VERSION = "turn_play_v1";

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function displayBundleFromExecution(execution = {}) {
  if (!execution) return null;
  return execution.displayBundle || execution.aggregateDisplayBundle || null;
}

function compactRoute(route = {}) {
  return {
    intent: route.intent || "",
    domains: asArray(route.domains),
    needsMutation: Boolean(route.needsMutation),
    suggestedOperation: route.suggestedOperation || "",
    supported: Boolean(route.supported),
    confidence: route.confidence || "",
    capabilityId: route.capabilityId || "",
    capabilityDomain: route.capabilityDomain || "",
    capabilityRisk: route.capabilityRisk || "",
    capabilityImpactLevel: route.capabilityImpactLevel ?? null,
    fallbackReason: route.fallbackReason || "",
  };
}

function decisionFromIntake({ intake = {}, mode = "", execution = null } = {}) {
  const route = compactRoute(intake.route || {});
  const actionPlanPacket = intake.actionPlanPacket || null;
  const actionPacket = intake.actionPacket || null;
  const resolverPacket = intake.resolverPacket || null;
  const unresolvedSlots = [
    ...asArray(actionPlanPacket?.unresolvedSlots),
    ...asArray(execution?.unresolvedSlots),
  ];

  return {
    schemaVersion: "turn_play_decision_v1",
    mode,
    ...route,
    selectedOperation:
      actionPlanPacket?.selectedOperation ||
      actionPacket?.selectedOperation ||
      resolverPacket?.selectedOperation ||
      route.suggestedOperation ||
      "",
    operationClass:
      actionPlanPacket?.summary?.capabilityId ||
      actionPacket?.summary?.capabilityId ||
      resolverPacket?.resolverRequest?.actionFamily ||
      route.capabilityId ||
      "",
    unresolvedSlots,
    warnings: asArray(execution?.warnings),
  };
}

function compactExecution(execution = null) {
  if (!execution) return null;

  return {
    schemaVersion: execution.schemaVersion || "",
    message: execution.message || "",
    operationCount: execution.operationCount || 0,
    operationsExecuted: asArray(execution.operationsExecuted).map((operation) => ({
      order: operation.order,
      selectedOperation: operation.selectedOperation || "",
      operationId: operation.operationId || "",
      ok: operation.ok !== false,
      primaryLogId: operation.primaryLogId || "",
      turnTraceId: operation.turnTraceId || "",
      checkpointId: operation.checkpointId || "",
    })),
    operationResults: asArray(execution.operationResults).map((result) => ({
      order: result.order,
      selectedOperation: result.selectedOperation || "",
      operationId: result.operationId || "",
      ok: result.ok !== false,
      statusCode: result.statusCode || 200,
      changeKeys: asArray(result.changeKeys),
      timeChange: result.timeChange || null,
      displaySummary: result.displaySummary || null,
    })),
    unresolvedSlots: asArray(execution.unresolvedSlots),
    warnings: asArray(execution.warnings),
    finalState: execution.finalState || null,
  };
}

function buildNarrativePacket({ intake = {}, execution = null, mode = "" } = {}) {
  const narratorPacket = intake.narratorPacket || {};
  const executionDisplayBundle = displayBundleFromExecution(execution);
  const displayBundle = executionDisplayBundle || narratorPacket.displayBundle || null;

  return {
    schemaVersion: "turn_play_narrative_packet_v1",
    mode,
    packetProfile: narratorPacket.packetProfile || "",
    playerText: narratorPacket.playerText || "",
    state: narratorPacket.state || null,
    latestVisibleLog: narratorPacket.latestVisibleLog || null,
    npcPresence: narratorPacket.npcPresence || null,
    visibleEvents: narratorPacket.visibleEvents || [],
    hiddenEventCount: narratorPacket.hiddenEventCount || 0,
    immediateTensions: narratorPacket.immediateTensions || [],
    narrationBoundaries: narratorPacket.narrationBoundaries || [],
    socialPacket: mode === "read_only" ? narratorPacket.socialPacket || null : null,
    displayBundle,
    renderLines: displayBundle?.renderLines || [],
    warnings: asArray(execution?.warnings),
  };
}

function operationFromResolverPacket(packet = {}) {
  return {
    order: 1,
    selectedOperation: "resolveTurn",
    operationId: "resolveTurn",
    request: packet.resolverRequest,
    summary: {
      capabilityId: packet.resolverRequest?.intent?.capabilityId || packet.resolverRequest?.actionFamily || "",
    },
  };
}

function operationFromActionPacket(packet = {}) {
  return {
    order: 1,
    selectedOperation: packet.selectedOperation,
    operationId: packet.operationId || packet.selectedOperation,
    endpoint: packet.endpoint || null,
    request: packet.request || null,
    summary: packet.summary || {},
  };
}

async function executeReadyPacket({ intake }) {
  if (intake.actionPlanPacket?.supported && intake.actionPlanPacket.request) {
    return executeActionPlan(intake.actionPlanPacket.request);
  }

  if (intake.actionPacket?.supported && intake.actionPacket.selectedOperation) {
    return executeActionPlan({
      gameId: intake.actionPacket.request?.gameId || intake.actionPacket.request?.body?.gameId || DEFAULT_GAME_ID,
      responseProfile: "compact",
      actionSummary: intake.actionPacket.request?.actionSummary || intake.actionPacket.request?.body?.completionSummary || "",
      operations: [operationFromActionPacket(intake.actionPacket)],
    });
  }

  if (intake.resolverPacket?.supported && intake.resolverPacket.resolverRequest) {
    return executeActionPlan({
      gameId: intake.resolverPacket.resolverRequest.gameId || DEFAULT_GAME_ID,
      responseProfile: "compact",
      actionSummary: intake.resolverPacket.resolverRequest.actionSummary || "",
      operations: [operationFromResolverPacket(intake.resolverPacket)],
    });
  }

  return null;
}

function unsupportedModeForIntake(intake = {}) {
  if (intake.route?.needsMutation) return "needs_clarification";
  return "blocked";
}

function clarificationPromptForIntake(intake = {}) {
  const route = intake.route || {};
  if (route.needsMutation) {
    return "La accion mezcla intencion o consecuencias que el motor no resolvio con seguridad. Pedile al jugador que concrete el objetivo inmediato de Lucas.";
  }
  return "El motor no encontro un paquete narrable seguro para esta accion. Pedile al jugador que reformule el turno.";
}

async function playTurn(body = {}) {
  const gameId = body.gameId || DEFAULT_GAME_ID;
  const text = body.text || body.playerText || body.userText || "";
  const intake = await buildNarratorPacket({
    gameId,
    text,
    aiClassification: body.aiClassification || body.classification || null,
    lastTargetNpcId:
      body.lastTargetNpcId ||
      body.sceneFocusNpcId ||
      body.conversationContext?.lastTargetNpcId ||
      body.conversationContext?.sceneFocusNpcId ||
      "",
  });

  if (intake.route?.supported && intake.route?.suggestedOperation === "narrateOnly") {
    const mode = "read_only";
    const narrativePacket = buildNarrativePacket({ intake, mode });
    return {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      mode,
      readOnly: true,
      actionRequired: false,
      playerText: text,
      decision: decisionFromIntake({ intake, mode }),
      narrativePacket,
      displayBundle: narrativePacket.displayBundle,
    };
  }

  if (intake.route?.supported) {
    const execution = await executeReadyPacket({ intake });
    if (execution) {
      const mode = "applied";
      const narrativePacket = buildNarrativePacket({ intake, execution, mode });
      return {
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        mode,
        readOnly: false,
        actionRequired: false,
        playerText: text,
        decision: decisionFromIntake({ intake, mode, execution }),
        execution: compactExecution(execution),
        narrativePacket,
        displayBundle: narrativePacket.displayBundle,
      };
    }
  }

  const mode = unsupportedModeForIntake(intake);
  const narrativePacket = buildNarrativePacket({ intake, mode });
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    mode,
    readOnly: true,
    actionRequired: false,
    playerText: text,
    decision: {
      ...decisionFromIntake({ intake, mode }),
      clarificationPrompt: clarificationPromptForIntake(intake),
    },
    narrativePacket,
    displayBundle: narrativePacket.displayBundle,
  };
}

module.exports = {
  SCHEMA_VERSION,
  playTurn,
};
