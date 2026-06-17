# GPT Builder Final Checklist

Objetivo: configurar el GPT personalizado para jugar Isekai Lucas usando Knowledge + Actions sin exponer herramientas peligrosas ni mutar estado en consultas puras.

## Archivos para Knowledge

Subir estos archivos en la seccion **Knowledge** del GPT Builder:

- `docs/rules_engine.md`
- `docs/world_bible.md`

No subir `.env`, logs, dumps de MongoDB, claves API ni archivos de configuracion local.

## Instrucciones comprimidas

Pegar en **Configure > Instructions** el contenido completo de:

- `gpt-instructions-game-only-8000.md`

`gpt-instructions-actualizadas-8000.md` contiene el mismo contrato y queda como alias actual para copiar rapido.

Base contractual:

```text
En partida normal, llamar siempre y solo `playTurn` antes de responder.
No llamar endpoints mecanicos despues de `playTurn`.
Mongo/backend es canon; GPT narra con `narrativePacket` y copia `displayBundle.renderLines`.
No inventar dinero, EXP, stock, NPCs presentes, consecuencias, misiones, magia, viaje, trabajo ni HUD.
Si `playTurn.mode=needs_clarification`, pedir una aclaracion diegetica breve.
Si `playTurn.mode=blocked`, explicar el bloqueo desde la ficcion sin mutar nada.
No mencionar backend, MongoDB, Actions, endpoints, paquetes ni validacion durante partida.
```

Mantener instrucciones tecnicas fuera de la narracion. El GPT puede responder como asistente tecnico si el usuario pide codigo, Mongo, schema, Render, GitHub, tests o debug; en partida normal no opera herramientas manuales.

## OpenAPI / Actions

Para el GPT Builder normal de partida, pegar el contenido completo de:

- `docs/openapi-gpt-action-game.json`

Ese schema expone solo `playTurn`. El GPT manda el texto libre del jugador y narra con `narrativePacket`/`displayBundle`; no elige endpoints mecanicos.

Para modo tecnico/debug o transicion, usar solo en un GPT separado o sesion tecnica:

- `docs/openapi-gpt-action-compact.json`

El schema compacto expone herramientas internas de lectura, preview y mutacion. Es util para diagnostico, pero confunde al narrador si se importa en el GPT normal. La partida normal debe empezar cada turno con `POST /api/turn/play`; `GET /api/context/compact`, previews, `applyTurn`, `resolveTurn`, `completeJobShift` y `executeActionPlan` quedan para debug/diagnostico o pedidos tecnicos explicitos.

Cuando cambien `docs/rules_engine.md` o `docs/world_bible.md`, ejecutar `npm run seed:documents` contra MongoDB para que `GET /api/search/docs` vea la misma version que Knowledge.

El schema full de referencia tecnica queda en:

- `docs/openapi-gpt-action.json`

El schema opcional para una segunda Action tecnica/read-only queda en:

- `docs/openapi-gpt-action-admin-extra.json`

en **Configure > Actions > Import from schema** solo si se quiere separar modo tecnico seguro. Este segundo schema no reemplaza al compacto: agrega lecturas extra para debug/admin con `operationId` prefijados por `admin` para no duplicar herramientas.

El schema historico `docs/openapi-gpt-action-admin.json` queda como referencia read-only, pero para el GPT Builder conviene importar `openapi-gpt-action-admin-extra.json`.

Servidores esperados:

- Juego: `https://isekai-lucas-engine.onrender.com`
- Admin read-only: `https://isekai-lucas-engine-admin.onrender.com`
- Combate avanzado: `https://isekai-lucas-engine-1.onrender.com`

## Auth

Configurar autenticacion de Actions:

- Tipo: API Key
- Ubicacion: Header
- Header name: `x-api-key`
- Valor: usar la API key real del backend

No pegar la API key en Knowledge, Instructions, conversation starters ni archivos versionados.

## Endpoints que no deben exponerse

No incluir en el schema normal de GPT Builder:

- `GET /api/context/compact`
- `GET /api/search/docs`
- `GET /api/search/database`
- `GET /api/npcs/{npcId}/full`
- previews de viaje, magia, skills, social, trabajo, mundo o combate
- `POST /api/turn/intake`
- `POST /api/turn/resolve`
- `POST /api/turn/action-plan/execute`
- `POST /api/turns/apply`
- `POST /api/jobs/complete-shift`
- `POST /api/checkpoints`
- `POST /api/checkpoints/{checkpointId}/rollback`
- endpoints admin peligrosos
- mutadores destructivos no necesarios
- `POST /api/combat/encounters/start`
- `POST /api/combat/encounters/{encounterId}/round`
- `POST /api/missions/{missionId}/accept`
- `POST /api/missions/{missionId}/report`
- `POST /api/missions/expire-available`
- `POST /api/economy/restock-daily`

El segundo bloque `admin-extra` tambien debe mantenerse solo GET/read-only. No agregarle `applyTurn`, checkpoint create, rollback, restock, mutadores directos de misiones ni combate real.

Si se prueban mutaciones reales, hacerlo solo con checkpoint previo y rollback manual externo fuera del GPT normal.

## Validacion antes de probar

Ejecutar en backend:

```bash
npm run check
npm run audit:openapi-game
npm run audit:openapi
npm run audit:openapi-compact
npm run audit:state-hygiene
npm run seed:documents
npm run audit:combat-advanced
npm run audit:combat-playtest
npm run audit:combat-balance
npm run audit:combat-behavior
npm run audit:combat-recovery
npm run audit:narrative-drama
npm run audit:npc-emotions
npm run audit:gpt-readiness-compact
```

`npm test`, `npm run smoke` y auditorias contra Render pueden tocar o depender de datos vivos. Usarlos solo cuando el entorno de prueba este claro o despues de desplegar cambios compatibles.

Condicion minima para abrir Preview del GPT normal:

- `GET /docs/openapi-gpt-action-game.json` expone solo `operationId: playTurn`.
- `POST /api/turn/play` responde `ok: true` con `mode`, `narrativePacket` y `displayBundle`.
- Un turno read-only como "continuar historia" no muta estado y devuelve HUD compacto.
- Un turno compuesto soportado no requiere llamadas extra del GPT a `applyTurn`, `resolveTurn` ni `executeActionPlan`.
- La respuesta normal de `playTurn` queda por debajo de 25000 caracteres salvo debug.
- El dia/hora/ubicacion existen y tienen formato valido.
- Dinero y MP son numeros no negativos.
- `activeMissionIds` es array si el packet lo expone.
- OpenAPI game-only validado.
- `audit:state-hygiene` sin issues criticos.
- `.env` no aparece en `git status --short`.

Condicion minima adicional para modo tecnico/compact:

- `GET /api/context/compact` responde `ok: true`.
- `context.ruleLookupContract.schemaVersion=rule_lookup_contract_v1` y expone `searchBatches`.
- `GET /api/search/docs?ruleId=format.skill_progress` devuelve una rule card critica.
- `GET /api/search/docs?ruleId=format.mechanical_changes` devuelve una rule card critica.
- `GET /api/search/docs?ruleId=format.response_hud_exact` devuelve una rule card critica.
- `GET /api/search/docs?ruleId=skills.exp_evaluation_antifarm` devuelve una rule card critica.
- `GET /api/search/docs?ruleId=social.relationship_logic` devuelve una rule card critica.
- La respuesta compacta queda por debajo de 100000 caracteres.
- `GET /api/characters/char_lucas/state` devuelve HP, MP, dinero, inventario y skills directos.
- `audit:combat-playtest` pasa si se va a usar combate real en partida.
- `audit:combat-balance` pasa si se cambiaron formulas, enemigos, armas, armaduras o reglas de retirada.
- `audit:combat-behavior` pasa si se cambiaron tipos de encuentro, conducta enemiga, moral, distancia o perfiles de enemigos.
- `audit:combat-recovery` pasa si se tocaron heridas, tratamiento, recuperacion o endpoints medicos de combate.
- `audit:npc-emotions` pasa si se tocaron NPCs, relaciones NPC-NPC, contexto compacto de escena, dialogo o instrucciones narrativas.
- `audit:narrative-drama` pasa si se tocaron contexto compacto, NPCs, instrucciones de narracion o dialogo.
- `context/compact` expone `dramaticContext.schemaVersion=dramatic_context_v1`, `dramaticContext.emotionalScene.schemaVersion=emotional_scene_director_v1`, `scene.relationshipDynamics.schemaVersion=scene_relationship_dynamics_v1` y algun NPC cercano con `dialogueProfile.schemaVersion=dialogue_profile_v1`, `dialogueProfile.dramaticRole.schemaVersion=npc_dramatic_role_v1` + `emotionalProfile.schemaVersion=emotional_profile_v1`.
- Combates activos responde como array.

## URLs para importar desde GPT Builder

Action principal de juego:

- `https://isekai-lucas-engine.onrender.com/docs/openapi-gpt-action-game.json`

Action tecnica compacta:

- `https://isekai-lucas-engine.onrender.com/docs/openapi-gpt-action-compact.json`

Action tecnica extra read-only:

- `https://isekai-lucas-engine-admin.onrender.com/docs/openapi-gpt-action-admin-extra.json`

Action combate avanzado:

- `https://isekai-lucas-engine-1.onrender.com/docs/openapi-gpt-action-combat.json`
