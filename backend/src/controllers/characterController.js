const mongoose = require("mongoose");

const Character = require("../models/Character");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const responseShaping = require("../utils/responseShaping");

function summarizeCharacter(character) {
  if (!character) return null;
  return {
    characterId: character.characterId,
    name: character.name,
    apparentAge: character.apparentAge,
    realPastLifeAge: character.realPastLifeAge,
    visual: character.visual || {},
    background: character.background || {},
    modernKnowledgeProfile: character.modernKnowledgeProfile || [],
    basePersonality: character.basePersonality || [],
    staticFlags: character.staticFlags || {},
  };
}

async function getCharacterState(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no esta conectado. Configura MONGODB_URI para usar /api/characters/:characterId/state.",
      });
    }

    const { characterId } = req.params;
    const gameId = req.query.gameId || "isekai_lucas_main";

    const [character, gameState] = await Promise.all([
      Character.findOne({ characterId }).lean(),
      GameState.findOne({ gameId, characterId }).lean(),
    ]);

    if (!character) {
      return res.status(404).json({
        ok: false,
        error: `No existe personaje con id: ${characterId}`,
      });
    }

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe estado vivo para characterId: ${characterId} en gameId: ${gameId}`,
      });
    }

    const inventoryItemIds = responseShaping.unique(
      (gameState.inventory || []).map((entry) => entry.itemId)
    );
    const inventoryItems = inventoryItemIds.length
      ? await Item.find({ itemId: { $in: inventoryItemIds } }).sort({ name: 1 }).lean()
      : [];
    const biologicalAccumulations = gameState.biologicalClock?.pendingAccumulations || [];
    const pendingBiologicalAccumulations = biologicalAccumulations.filter(
      (entry) => entry && entry.status !== "processed" && !entry.processedAt
    );
    const biologicalAccumulationHistory = biologicalAccumulations
      .filter((entry) => entry && (entry.status === "processed" || entry.processedAt))
      .slice(-20);

    return res.json({
      ok: true,
      character: summarizeCharacter(character),
      gameState: responseShaping.summarizeGameState(gameState),
      state: responseShaping.summarizeLucasState(gameState, character, inventoryItems),
      pendingBiologicalAccumulations,
      biologicalAccumulationHistory,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo estado de personaje.",
      details: error.message,
    });
  }
}

module.exports = {
  getCharacterState,
};
