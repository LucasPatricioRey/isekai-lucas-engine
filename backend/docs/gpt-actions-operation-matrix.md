# GPT Actions Operation Matrix

Comparacion entre `openapi-gpt-action.json` full y `openapi-gpt-action-compact.json` usado en GPT Builder.

| Operacion | Endpoint | Full | Compact | Tipo | Dominio |
|---|---|---:|---:|---|---|
| listCheckpoints | `GET /api/checkpoints` | si | no | lectura | admin/debug |
| getCheckpoint | `GET /api/checkpoints/{checkpointId}` | si | no | lectura | admin/debug |
| getCharacterState | `GET /api/characters/{characterId}/state` | si | si | lectura | gameplay |
| listCombatActions | `GET /api/combat/actions` | si | si | lectura | gameplay |
| listActiveCombatEncounters | `GET /api/combat/encounters/active` | si | si | lectura | gameplay |
| getCombatEncounter | `GET /api/combat/encounters/{encounterId}` | si | si | lectura | gameplay |
| listCombatEnemies | `GET /api/combat/enemies` | si | no | lectura | gameplay/debug |
| getCombatEnemy | `GET /api/combat/enemies/{enemyId}` | si | no | lectura | gameplay |
| getCompactContext | `GET /api/context/compact` | si | si | lectura | gameplay |
| getFullContext | `GET /api/context/full` | si | no | lectura | debug/admin |
| getItem | `GET /api/economy/items/{itemId}` | si | si | lectura | gameplay |
| listShops | `GET /api/economy/shops` | si | no | lectura | gameplay |
| getShopStock | `GET /api/economy/shops/{shopId}/stock` | si | si | lectura | gameplay |
| getHealth | `GET /api/health` | si | no | lectura | admin/debug |
| getActiveJobContract | `GET /api/jobs/contracts/active` | si | si | lectura | gameplay |
| getAvailableJobShifts | `GET /api/jobs/shifts/available` | si | si | lectura | gameplay |
| completeJobShift | `POST /api/jobs/shifts/{shiftId}/complete` | si | si | mutacion | gameplay |
| getLocationFull | `GET /api/locations/{locationId}/full` | si | si | lectura | gameplay |
| listMagicDisciplines | `GET /api/magic/disciplines` | si | no | lectura | gameplay |
| listMagicTechniques | `GET /api/magic/techniques` | si | si | lectura | gameplay |
| getMagicTechnique | `GET /api/magic/techniques/{techniqueId}` | si | si | lectura | gameplay |
| getMissionBoard | `GET /api/missions/board` | si | si | lectura | gameplay |
| getMissionDetail | `GET /api/missions/{missionId}` | si | si | lectura | gameplay |
| getNpcFull | `GET /api/npcs/{npcId}/full` | si | si | lectura | gameplay |
| previewSocialImpact | `POST /api/npcs/social/impact/preview` | si | si | preview | gameplay |
| searchDatabase | `GET /api/search/db` | si | si | lectura | gameplay |
| searchDocs | `GET /api/search/docs` | si | si | lectura | gameplay |
| listTravelRoutes | `GET /api/travel/routes` | si | si | lectura | gameplay |
| getTravelRoute | `GET /api/travel/routes/{routeId}` | si | no | lectura | gameplay |
| getCurrentWeather | `GET /api/weather/current` | si | si | lectura | gameplay |
| createCheckpoint | `POST /api/checkpoints` | si | no | mutacion | admin/debug |
| previewCombatAction | `POST /api/combat/encounters/{encounterId}/actions/preview` | si | si | preview | gameplay |
| previewJobShift | `POST /api/jobs/shifts/{shiftId}/preview` | si | si | preview | gameplay |
| previewMagicPractice | `POST /api/magic/practice/preview` | si | si | preview | gameplay |
| previewActivityCost | `POST /api/needs/activity-cost/preview` | si | si | preview | gameplay |
| previewSkillProgression | `POST /api/progression/skills/preview` | si | si | preview | gameplay |
| previewTravel | `POST /api/travel/preview` | si | si | preview | gameplay |
| applyTurn | `POST /api/turn/apply` | si | si | mutacion | gameplay |
| previewWeatherEffects | `POST /api/weather/effects/preview` | si | si | preview | gameplay |
| listWorldEvents | `GET /api/world/events` | si | no | lectura | admin/debug |
| getWorldEvent | `GET /api/world/events/{eventId}` | si | no | lectura | admin/debug |
| previewWorldTick | `POST /api/world/tick/preview` | si | si | preview | gameplay |

Notas:
- El compact mantiene hasta 30 operaciones para respetar el limite practico de GPT Builder.
- `getCompactContext` es la lectura principal por turno; `getFullContext` queda fuera del compact y solo debe usarse en debug/admin.
- `getCharacterState` evita reconstruir HP/MP/inventario/skills desde logs.
- `previewSocialImpact` pondera perfil social del NPC (`values/tolerates/rejects/socialProfile`) y sugiere deltas capados de confianza/familiaridad/respeto/afecto/etc.; el guardado real se hace con `applyTurn.npcRelationshipPatches` y crea ledger social diario. Tambien proyecta `relationshipState` para mostrar acceso, riesgos y bloqueos antes de mutar.
- Mutadores directos de misiones, combate, restock y rollback quedan fuera; misiones se gestionan por `applyTurn.missionPatch` (`accept/report/verify/complete/fail/expire`) y eventos por `applyTurn.worldEventPatches`. Resolver/vencer eventos diarios puede crear consecuencias sociales automaticas sobre NPCs afectados y ledger social.
- El backend puede separar keys por scope: lecturas/previews aceptan keys validas de lectura, `applyTurn` usa scope gameplay y mutadores directos peligrosos usan scope admin-write. `API_KEY` sigue funcionando como fallback legacy mientras existan despliegues antiguos.
- `applyTurn` y `completeJobShift` no estan marcados como consequential en el schema compacto para modo juego fluido sin confirmacion manual. El backend sigue validando y rechazando mutaciones invalidas.
- `applyTurn.activityCost` no suma operaciones: todo `timeAdvance` positivo requiere `activityCost` o exencion explicita; acumula automaticamente actividades entre horas y procesa pendientes al llegar a `:00`.
- `narrativeHints`/`narrativeContext` no suman operaciones: viajan dentro de respuestas existentes para ayudar a variar escenas repetidas sin tocar calculos mecanicos.
- El schema `admin-extra` es solo lectura, usa `operationId` prefijados por `admin` y no debe usarse para juego normal.
