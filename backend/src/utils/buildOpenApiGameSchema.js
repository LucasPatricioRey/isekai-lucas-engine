const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "../../docs");
const COMPACT_PATH = path.join(DOCS_DIR, "openapi-gpt-action-compact.json");
const GAME_PATH = path.join(DOCS_DIR, "openapi-gpt-action-game.json");

function main() {
  const compact = JSON.parse(fs.readFileSync(COMPACT_PATH, "utf8"));
  const playPath = compact.paths?.["/api/turn/play"];
  const playRequest = compact.components?.schemas?.PlayTurnRequest;
  const playResponse = compact.components?.schemas?.PlayTurnResponse;

  if (!playPath || !playRequest || !playResponse) {
    throw new Error("compact schema must include /api/turn/play and PlayTurn schemas");
  }

  const game = {
    openapi: compact.openapi,
    info: {
      title: "Isekai Lucas Engine GPT Game Action",
      version: compact.info?.version || "2.33.0",
      description:
        "Schema de juego normal con una sola Action: playTurn. El backend resuelve el turno y el GPT solo narra el paquete devuelto.",
    },
    servers: compact.servers || [{ url: "https://isekai-lucas-engine.onrender.com" }],
    components: {
      securitySchemes: compact.components?.securitySchemes || {},
      schemas: {
        PlayTurnRequest: playRequest,
        PlayTurnResponse: playResponse,
      },
    },
    security: compact.security || [{ ApiKeyAuth: [] }],
    paths: {
      "/api/turn/play": playPath,
    },
    "x-operation-limit": 1,
    "x-gameplay-schema": true,
    "x-primary-operation": "playTurn",
    "x-debug-schema": "openapi-gpt-action-compact.json",
  };

  fs.writeFileSync(GAME_PATH, `${JSON.stringify(game, null, 2)}\n`);
  console.log(`Wrote ${GAME_PATH}`);
}

main();
