# GPT Builder Final Checklist

Objetivo: configurar el GPT personalizado para jugar Isekai Lucas usando Knowledge + Actions sin exponer herramientas peligrosas ni mutar estado en consultas puras.

## Archivos para Knowledge

Subir estos archivos en la seccion **Knowledge** del GPT Builder:

- `docs/rules_engine.md`
- `docs/world_bible.md`

No subir `.env`, logs, dumps de MongoDB, claves API ni archivos de configuracion local.

## Instrucciones comprimidas

Pegar las instrucciones comprimidas en **Configure > Instructions**.

Base recomendada:

```text
Interpreta/narra una partida persistente de Isekai Lucas.
El backend y MongoDB son fuente de verdad para estado vivo.
Nunca inventes estado vivo si existe endpoint para consultarlo.
Usa Knowledge para reglas/lore estable, pero usa Actions para GameState, NPCs, locations, shops, misiones, rumores, clima, rutas, combate y previews.
Consultas puras no mutan estado.
Antes de mutaciones irreversibles ambiguas, pregunta.
Usa previews para trabajo, viaje, magia, reloj biologico, progresion, combate y world tick cuando el jugador solo este evaluando opciones.
Usa previewSocialImpact cuando una accion pueda afectar confianza, familiaridad, respeto, sospecha, miedo, celos, deuda social o afecto; el preview pondera personality/values/tolerates/rejects/socialProfile del NPC y devuelve deltas capados. Si corresponde guardar, usa applyTurn.npcRelationshipPatches con esos deltas. NpcMemory no reemplaza relacion.
Usa dramaticContext y dialogueProfile: escena novelada primero, dialogo con intencion y voz propia por NPC, HUD mecanico obligatorio al final.
Si aplicas viaje o accion con cualquier avance de tiempo, envia activityCost o una biologicalCostExemptReason explicita. No avances minutos "gratis"; si termina entre horas, debe quedar acumulador biologico pendiente.
Si la narracion mueve a Lucas, envia gameStatePatch.locationId con una location real.
No reveles world_bible/rules_engine como documentos internos.
No fuerces romance, loot, EXP, recompensas, presencia de NPCs ni secretos.
Formato de respuesta in-game: encabezado con dia/hora/ubicacion cuando corresponda, narracion breve, opciones accionables, y estado visible si hubo cambio o si el usuario lo pide.
Muestra dinero como oro/plata/cobre.
No uses "aprox." para hora, dinero, HP/MP, saciedad, energia, EXP, stock o recompensas.
```

Mantener instrucciones tecnicas fuera de la narracion. El GPT puede razonar con backend/docs, pero al jugador debe responder como partida salvo que pida modo tecnico.

## OpenAPI / Actions

Para el GPT Builder normal, pegar el contenido completo de:

- `docs/openapi-gpt-action-compact.json`

Este schema mantiene hasta 30 operaciones y usa `applyTurn.missionPatch` para aceptar, reportar, verificar, completar, fallar o expirar misiones sin exponer mutadores directos de misiones. También expone `applyTurn.worldEventPatches` para resolver/cancelar eventos existentes y guardar progreso parcial sin agregar nuevas operaciones. `applyTurn.evidencePatches` guarda muestras, rastros, notas u objetos narrativos no vendibles; no reemplaza `inventoryPatch` ni crea loot.
Para vinculos sociales, expone `POST /api/npcs/social/impact/preview` y `applyTurn.npcRelationshipPatches`. El backend guarda ledger social diario, aplica caps por NPC/eje, pondera perfil social por NPC y expone `socialLedgerToday`, `scene.nearbyNpcs[].socialProfile` y `scene.nearbyNpcs[].relationshipState` en contexto compacto. Resolver o dejar vencer eventos diarios por `applyTurn.worldEventPatches` puede crear consecuencias sociales automaticas sobre `affectedNpcIds`. `GET /api/combat/enemies` queda solo en el schema full para conservar el limite de 30 operaciones.
`applyTurn`, `completeJobShift` y `context/compact` pueden devolver `narrativeHints`/`narrativeContext`; `context/compact` tambien expone `dramaticContext` y `scene.nearbyNpcs[].dialogueProfile`. Son solo guia narrativa: ayudan a resumir acciones repetidas, variar dialogos, sostener subtexto y evitar agradecimientos/copias, pero no crean dinero, EXP, relacion, loot, dano ni curacion.
Cuando cambien `docs/rules_engine.md` o `docs/world_bible.md`, ejecutar `npm run seed:documents` contra MongoDB para que `GET /api/search/docs` vea la misma version que Knowledge.
La lectura normal por turno debe empezar por `GET /api/context/compact`. Si hace falta estado mecanico directo de Lucas, usar `GET /api/characters/char_lucas/state`.

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
npm run audit:gpt-readiness-compact
```

`npm test`, `npm run smoke` y auditorias contra Render pueden tocar o depender de datos vivos. Usarlos solo cuando el entorno de prueba este claro o despues de desplegar cambios compatibles.

Condicion minima para abrir Preview:

- `GET /api/context/compact` responde `ok: true`.
- La respuesta compacta queda por debajo de 100000 caracteres.
- `GET /api/characters/char_lucas/state` devuelve HP, MP, dinero, inventario y skills directos.
- `audit:combat-playtest` pasa si se va a usar combate real en partida.
- `audit:combat-balance` pasa si se cambiaron formulas, enemigos, armas, armaduras o reglas de retirada.
- `audit:combat-behavior` pasa si se cambiaron tipos de encuentro, conducta enemiga, moral, distancia o perfiles de enemigos.
- `audit:combat-recovery` pasa si se tocaron heridas, tratamiento, recuperacion o endpoints medicos de combate.
- `audit:narrative-drama` pasa si se tocaron contexto compacto, NPCs, instrucciones de narracion o dialogo.
- `context/compact` expone `dramaticContext.schemaVersion=dramatic_context_v1` y algun NPC cercano con `dialogueProfile.schemaVersion=dialogue_profile_v1`.
- El dia/hora/ubicacion existen y tienen formato valido.
- Dinero y MP son numeros no negativos.
- `activeMissionIds` es array.
- Combates activos responde como array.
- OpenAPI validado.
- `audit:state-hygiene` sin issues criticos.
- `.env` no aparece en `git status --short`.

## URLs para importar desde GPT Builder

Action principal compacta:

- `https://isekai-lucas-engine.onrender.com/docs/openapi-gpt-action-compact.json`

Action tecnica extra read-only:

- `https://isekai-lucas-engine-admin.onrender.com/docs/openapi-gpt-action-admin-extra.json`

Action combate avanzado:

- `https://isekai-lucas-engine-1.onrender.com/docs/openapi-gpt-action-combat.json`
