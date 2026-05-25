# G1 Coverage Map - Isekai Lucas Engine

Fecha de auditoria: 2026-05-25  
Backend vivo auditado: `https://isekai-lucas-engine.onrender.com`  
Modo: solo lectura. No se ejecutaron seeds, rollbacks, aceptaciones de mision, creacion de checkpoints ni mutaciones de partida.

## Resumen ejecutivo

G1 compara tres niveles:

1. Texto canonico en `docs/rules_engine.md` y `docs/world_bible.md`.
2. Representacion en repo: modelos, seeds, servicios, rutas, smoke tests y docs indexables.
3. Representacion viva en Render/MongoDB usando endpoints protegidos por `x-api-key`.

Hallazgo principal: el repo ya tiene una base tecnica amplia y, tras G2/G3, MongoDB vivo contiene el nucleo de Hoshimori: 25 NPCs esperados y 25 ubicaciones principales. El estado canon de partida sigue Dia 10 12:00. Lo que todavia no cubre el 100% del texto son relaciones NPC-NPC, memorias base, rumores, economia amplia, misiones ampliadas, magia, viajes y world tick.

## Estado vivo confirmado

Fuente: `npm run audit:coverage`, script `src/utils/auditLiveCoverage.js`.

| Campo | Valor vivo | Resultado |
|---|---:|---|
| Dia | 10 | coincide |
| Hora | 12:00 | coincide |
| Bloque | Mediodia | coincide |
| Ubicacion | `loc_hoshimori_grulla_azul_comedor` | coincide |
| Dinero | 1470 cobre | coincide |
| Saciedad | 30/100, hambre fuerte | coincide |
| Energia | 59/100, cansancio leve/energia media | coincide |
| MP | 200/200 | coincide |
| Combates activos | 0 | coincide |
| Checkpoint oficial | `checkpoint_d10_1200_1779684235944` | presente |

## Actualizacion G2/G3

Se agregaron herramientas para sembrar y auditar el nucleo de Hoshimori:

- `src/seeds/seedHoshimoriCore.js`
- `src/utils/auditHoshimoriCore.js`
- scripts `seed:hoshimori-core` y `audit:hoshimori-core`

Resultado de ejecucion inicial en el entorno de Codex:

- `npm run check`: OK.
- `npm run seed:hoshimori-core`: no ejecutado contra MongoDB porque no existe `.env` ni `MONGODB_URI` en el entorno local. El script fallo antes de escribir datos.
- `npm run audit:hoshimori-core`: fallo correctamente contra Render porque la DB viva aun no contiene el nucleo completo.
- `npm run smoke`: OK.

Resultado posterior reportado tras ejecutar el seed en entorno local con `MONGODB_URI` vivo:

- `npm run check`: OK.
- `npm run smoke`: OK.
- `npm run seed:hoshimori-core`: OK.
- `npm run audit:hoshimori-core`: OK.
- GameState sigue Dia 10 12:00.
- `moneyCopper` sigue 1470.
- Combates activos: 0.
- NPCs Hoshimori esperados: 25.
- NPCs encontrados por API: 25.
- NPCs faltantes: 0.
- Ubicaciones Hoshimori esperadas: 25.
- Ubicaciones encontradas por API: 25.
- Ubicaciones faltantes: 0.
- Narek/Pavo/Borin/Liora aparecen correctamente en `search/db`.

Evidencia viva antes de ejecutar el seed con credenciales Atlas, preservada como antecedente:

- NPCs esperados Hoshimori: 25.
- NPCs encontrados por API: 4.
- NPCs faltantes por API: 21.
- Ubicaciones esperadas Hoshimori: 25.
- Ubicaciones encontradas por API: 7.
- Ubicaciones faltantes por API: 18.
- Estado canon sigue Dia 10 12:00, dinero 1470, combates activos 0.

## Tabla de cobertura

Estados usados:

- `implemented_backend`: hay modelo/ruta/servicio funcional, no necesariamente todo el contenido.
- `seeded_mongodb`: hay datos confirmados vivos en MongoDB.
- `indexed_docs_only`: existe en docs indexados, pero no como entidad/sistema vivo.
- `partial`: existe parte del sistema, pero falta contenido o validacion critica.
- `missing`: no hay implementacion suficiente para que el backend lo sostenga.
- `future_optional`: conviene postergar hasta que el juego lo necesite.

| Area / seccion | Fuente en docs | Representacion en repo | Representacion en MongoDB vivo | Estado | Evidencia | Proxima accion recomendada |
|---|---|---|---|---|---|---|
| Autoridad, regla madre y no inventar | `rules_engine.md` 0-3, 25 | Docs indexados, `context/full`, `search/db`, `search/docs`, `turn/apply` | API responde health/context/search | partial | Smoke OK; docs search OK; backend no fuerza todas las reglas narrativas | Mantener como instrucciones GPT + agregar validadores solo donde haya estado vivo |
| Formato obligatorio de respuesta | `rules_engine.md` 4 | No hay renderer/formato backend; solo docs | Indexado en docs | indexed_docs_only | No hay modelo/ruta de formato | Resolver en instrucciones GPT; no meter en MongoDB salvo logs/estado |
| Tiempo exacto y bloques | `rules_engine.md` 5 | `GameState.time`, `block`, `turnController.getBlockFromTime` | Dia 10 12:00, Mediodia | partial | `audit:coverage` confirma tiempo; `turn/apply` no permite retroceder dentro del dia | Agregar avance de dia y reglas de cambio de dia en G14/G9 |
| Reloj biologico suavizado | `rules_engine.md` 6 | `GameState.biologicalClock`, deltas directos en `turn/apply` | `pendingAccumulation: []` | partial | Schema existe; no hay procesador estricto por hora | G9 antes de balance avanzado |
| Vida, heridas y condiciones | `rules_engine.md` 7 | `GameState.lucasStatus`, heridas/condiciones, combate agrega heridas | Sin heridas activas | partial | Modelos y patches existen; validacion de causa depende del GPT | Endurecer validadores de heridas/condiciones |
| Comidas, raciones y contrato | `rules_engine.md` 8 | `Item`, inventario inicial, comida/raciones en seed; no hay contrato laboral formal | Lucas tiene raciones; Pavo vende raciones | partial | Stock vivo Pavo: 8 raciones normales, 12 pequenas | Crear sistema de trabajos/contrato en G8 |
| Dinero y comercio basico | `rules_engine.md` 9 | `Item`, `Shop`, `ShopStock`, `economyService`, `shopStockPatches` | 2 shops vivos, stock Pavo y Grulla | partial | `/api/economy/shops/shop_pavo_food_stall/stock` OK | Completar shops e items de Hoshimori en G6 |
| Bancos, deudas, alquileres, impuestos | `rules_engine.md` 9.7, `world_bible.md` 4.6 | No hay modelos especificos `Loan/Debt/Rental/Tax/BankAccount` | No confirmado vivo | future_optional | Solo docs y algunas facciones; sin endpoints | Postergar hasta G16 |
| Progresion de habilidades y EXP | `rules_engine.md` 10-13 | Skills embebidas en `GameState`; `applySkillExp` con level-up | Skills de Lucas vivas | partial | Hay skills y EXP, pero no valida rangos, maestro, Aqua, energia baja, anti-farmeo | G10: centralizar tabla y validadores |
| Magia, MP y practica | `rules_engine.md` 14; `world_bible.md` 1.4, 9.3 | MP, skills `skill_mana`/`skill_magia`, flag `knownSpells` | MP 200/200, `knownSpells: []` | partial | No hay catalogo de hechizos ni templates | G11 despues de EXP/biologia |
| Entrenamiento fisico, trabajo y viaje | `rules_engine.md` 15 | Deltas por `turn/apply`; no hay `Job`, `Route`, `TravelService` | Trabajo actual en flags, sin contrato formal | partial | `flags.currentJob: La Grulla Azul`; no hay endpoints de jobs | G8 y G18 |
| Combate narrativo con numeros | `rules_engine.md` 16; `world_bible.md` 16 | `EnemyTemplate`, `CombatEncounter`, `combatService`, rutas `/api/combat/*` | 5 enemigos vivos; 0 combates activos | seeded_mongodb | `audit:coverage`: 5 enemy templates, active combats 0 | G12: acciones, armas, multiples enemigos, loot/proof |
| Gremio, MG y misiones | `rules_engine.md` 17; `world_bible.md` 18 | `Mission`, `missionService`, rutas board/accept/report/expire | 1 mision Porcelana disponible | partial | `mission_d10_cleanup_post_rain` viva, proof pending | G7: templates/cartelera amplia y completar flujo de recompensa |
| NPCs, conocimiento, escena viva | `rules_engine.md` 18; `world_bible.md` 11 | `Npc`, `NpcMemory`, `RoutineOverride`, `getNpcFull`; `seedHoshimoriCore.js` consolida roster base | 25 NPCs de Hoshimori vivos; `context/full` sigue devolviendo solo NPCs cercanos | partial | `audit:hoshimori-core` OK reportado: 25/25 NPCs; Narek/Pavo/Borin/Liora aparecen en `search/db`; memorias/red social siguen pendientes | G4 para relaciones NPC-NPC y memorias base |
| Relaciones, confianza, romance | `rules_engine.md` 19; `world_bible.md` 12 | `relationshipWithLucas` en `Npc`; no hay `NpcRelationship` entre NPCs | Relaciones con Lucas en NPCs iniciales | partial | No existe modelo NpcRelationship; sin red social viva entre NPCs | G4: modelo o ampliacion clara |
| Rumores y propagacion | `rules_engine.md` 20.1; `world_bible.md` 17 | `Rumor`, `applyRumorPatches`, search/context consultan rumores | Sin rumores encontrados por busquedas vivas | partial | `/api/search/db?q=a` devuelve `rumors=0`; `search/db?q=rumor` devuelve 0 | G5: seed inicial de rumores + propagacion simple |
| Reputacion y facciones | `rules_engine.md` 20.2-20.3; `world_bible.md` 10, 15 | `Faction`, links de NPC, reputacion con Lucas | 3 facciones aparecen con query amplia | partial | `/api/search/db?q=a` devuelve `factions=3` | G15: ley, testigos, acceso, sospecha |
| Inventario, propiedad y objetos | `rules_engine.md` 21 | Inventario en `GameState`, `Item`, validacion de item existente al agregar | Inventario Lucas vivo; 5 items base en seed | partial | `turn/apply` rechaza item inexistente al agregar | Completar catalogo G6/G17 |
| Viaje, exploracion y zonas seguras | `rules_engine.md` 22; `world_bible.md` 7, 13 | Docs, strings de zonas en enemigos, ubicaciones core de camino/bosque/colinas sembradas | Locations principales existen; no hay grafo de rutas ni TravelService | partial | `audit:hoshimori-core` OK reportado para locations; sin modelos Route/TravelService | G18 tras economia/misiones base |
| Pipeline de acciones complejas | `rules_engine.md` 23-24 | `turn/apply` procesa patches; no orquestador de pipeline | Patches funcionan si GPT los manda bien | partial | Endpoint existe, pero validacion semantica es incompleta | Mantener GPT como planificador, mover reglas criticas al backend |
| Hoshimori: ubicaciones principales | `world_bible.md` 6.3, 19 | `Location` model; seeds iniciales/world essentials; `seedHoshimoriCore.js` prepara 25 ubicaciones canonicas | 25/25 ubicaciones esperadas vivas | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing locations 0; GameState intacto | Mantener auditoria como regresion; G6/G7 pueden apoyarse en estas locations |
| Hoshimori: roster base 25 NPCs | `world_bible.md` 11 | `seedInitialState` tiene 4; `seedHoshimoriRoster` prepara 21 mas; `seedHoshimoriCore.js` consolida 25 NPCs con rutinas base | 25/25 NPCs esperados vivos | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing NPCs 0; Narek/Pavo/Borin/Liora aparecen en `search/db` | G4: relaciones NPC-NPC, memorias base y conocimiento no omnisciente |
| Hoshimori: red social base | `world_bible.md` 12 | Relaciones solo con Lucas; no Npc-Npc | No red social NPC-NPC viva | missing | No hay `NpcRelationship`; memorias vivas 0 por query amplia | G4 |
| Region cercana a Hoshimori | `world_bible.md` 13 | Docs indexados; algunas locations core cercanas y enemy zones textuales | Camino del Molino, molino, bosque y colinas base existen como locations core | partial | `audit:hoshimori-core` OK reportado para 25 locations; faltan rutas regionales, aldeas/granjas y rosters externos | G18 y G19 despues de Hoshimori economico/social |
| Regiones y ciudades mayores | `world_bible.md` 14 | Docs indexados | No entidades vivas confirmadas | future_optional | `search/docs` encuentra Valdoria; DB solo faccion Corona | G19 post-Hoshimori |
| Amenazas, fauna y monstruos | `world_bible.md` 16 | `EnemyTemplate`, `seedEnemyTemplates` | 5 enemigos vivos | seeded_mongodb | `search/db?q=lobo` devuelve 1 enemyTemplate; `/api/combat/enemies` devuelve 5 | Ampliar con zonas/loot en G12/G17 |
| Clima y eventos diarios | `world_bible.md` 8; `rules_engine.md` 5.4 | `WorldEvent`; no `WeatherState` | Evento activo supply delay por barro | partial | `activeEventIds: event_d10_supply_delay_mud`; sin weather endpoint | G13 |
| Mundo offscreen / world tick | `rules_engine.md` 2.4; G14 implicito | `/api/world/sync-routines` solo rutinas | No tick integral | partial | No endpoint `/api/world/tick`; rutinas no corridas en vivo para roster ampliado | G14 despues de G2-G7 |
| Busqueda DB | `rules_engine.md` 3.2 | `/api/search/db` busca modelos principales | Funciona | implemented_backend | Queries Narek/lobo/a responden | Mantener; agregar resumen admin read-only si hace falta |
| Busqueda docs | `rules_engine.md` 3.2; ambos docs | `WorldDocumentIndex`, `seedDocuments`, `/api/search/docs` | Funciona con `romance` | seeded_mongodb | `search/docs?q=romance` devuelve 4 docs | Mantener seed docs alineado con archivos |
| Contexto completo | `rules_engine.md` 3.2 | `/api/context/full` junta estado, location, NPCs cercanos, shops, rumors, missions, factions, combat | Funciona y es de alcance cercano | implemented_backend | `context/full` devuelve 3 nearby NPCs en Grulla | Documentar que no es roster completo |
| Checkpoints y rollback | `rules_engine.md` 3.4 | `Checkpoint`, rutas create/list/get/rollback | Checkpoints vivos; oficial presente | implemented_backend | `/api/checkpoints` lista `checkpoint_d10_1200_1779684235944` | Separar admin/in-game en OpenAPI; no exponer rollback al GPT normal |
| Smoke test | README, `smokeTestRender.js` | `npm run smoke` cubre health/context/search/npc/location/economy/missions/combat/checkpoints | Smoke remoto OK | implemented_backend | Ejecutado OK en G1 | Expandir a tests no mutantes |
| Tests automatizados | `rules_engine.md` 26 | `npm test` sigue placeholder | No aplica | missing | `package.json`: `test` imprime "no test specified" | G21 |
| OpenAPI / GPT Actions | `rules_engine.md` 26 | No se encontro archivo OpenAPI/swagger | No aplica | missing | `rg openapi|swagger` solo encuentra menciones pendientes | G22 |
| Admin/debug seguro | `rules_engine.md` 26 | Checkpoints y scripts utilitarios; no resumen read-only de colecciones | No endpoint de conteo seguro | partial | Se audita con busquedas indirectas | Proponer `/api/admin/coverage-summary`, no implementar en G1 |

## Afirmaciones auditadas

| Afirmacion | Resultado | Evidencia |
|---|---|---|
| La DB viva tiene 25 NPCs de Hoshimori. | VERDADERA tras G2/G3 | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados: 25/25 NPCs, missing NPCs 0; Narek/Pavo/Borin/Liora aparecen en `search/db`. |
| `context/full` devuelve solo NPCs cercanos, no todo el roster. | VERDADERA | `context/full` devuelve 3 NPCs cercanos: Fern, Roberto Valen, Yara Mils. |
| Faltan ubicaciones importantes de Hoshimori como Location. | FALSA tras G2/G3 para el core definido | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados: 25/25 locations, missing locations 0. Quedan fuera del core rutas regionales/otras aldeas. |
| Hay modelos que existen pero colecciones vacias. | VERDADERA con limite de evidencia | Existen `Rumor` y `NpcMemory`; query amplia `/api/search/db?q=a` devuelve `rumors=0` y `npcMemories=0`. Sin endpoint de conteo, esto no prueba matematicamente todas las colecciones, pero si ausencia viva observable por API publica. |
| El GPT puede consultar docs completos desde `/api/search/docs`. | VERDADERA | `search/docs?q=romance` devuelve 4 documentos indexados; otras consultas como Valdoria/Bosque tambien devuelven chunks. |
| El combate base esta disponible en Render. | VERDADERA | `/api/combat/enemies` devuelve 5 templates: lobo, rata gigante, avispa roja, bandido menor, jabali gris. |
| No hay combates activos fantasma. | VERDADERA | `/api/combat/encounters/active` devuelve 0. |
| El estado vivo actual coincide con Dia 10 12:00. | VERDADERA | `context/full` confirma `currentDay=10`, `time=12:00`, location y recursos esperados. |

## Revision de repo local

Modelos existentes:

`Character`, `Checkpoint`, `CombatEncounter`, `EnemyTemplate`, `EventLog`, `Faction`, `GameState`, `Item`, `Location`, `Mission`, `Npc`, `NpcMemory`, `RoutineOverride`, `Rumor`, `Shop`, `ShopStock`, `WorldDocumentIndex`, `WorldEvent`.

Seeds existentes:

`seedInitialState.js`, `seedWorldEssentials.js`, `seedHoshimoriRoster.js`, `seedHoshimoriRoutines.js`, `seedEnemyTemplates.js`, `seedDocuments.js`, mas scripts de limpieza/reparacion. En G1 no se ejecuto ningun seed.

Rutas existentes:

`/api/context/full`, `/api/turn/apply`, `/api/search/db`, `/api/search/docs`, `/api/npcs/:npcId/full`, `/api/locations/:locationId/full`, `/api/checkpoints`, `/api/world/sync-routines`, `/api/economy/shops/:shopId/stock`, `/api/economy/restock-daily`, `/api/missions/*`, `/api/combat/*`.

Smoke test:

`src/utils/smokeTestRender.js` existe y cubre health, context, search, npc, location, economy, missions, combat y checkpoints. Fue ejecutado durante G1.

Docs indexados:

`seedDocuments.js` indexa `docs/rules_engine.md` y `docs/world_bible.md` en `WorldDocumentIndex`. La API viva confirma busqueda por `/api/search/docs`.

OpenAPI:

No se encontro archivo OpenAPI/Swagger en el repo. Solo hay menciones en `rules_engine.md` como pendiente.

## Endpoint admin propuesto, no implementado

No hay endpoint seguro para contar colecciones vivas. Para futuras auditorias conviene crear un endpoint estrictamente read-only y protegido por API key:

`GET /api/admin/coverage-summary`

Salida sugerida:

- conteos por coleccion: `Npc`, `Location`, `Rumor`, `NpcMemory`, `Mission`, `Shop`, `ShopStock`, `Faction`, `EnemyTemplate`, `CombatEncounter`, `WorldEvent`, `WorldDocumentIndex`;
- lista compacta de IDs canonicos faltantes para Hoshimori;
- version/hash de docs indexados si se decide guardarlo;
- timestamp del resumen.

Justificacion: hoy G1 puede inferir huecos por busqueda y endpoints profundos, pero no puede probar conteos completos sin consultar MongoDB directamente. No se implemento en esta fase para respetar el alcance: auditoria + scripts seguros.

## Proximas acciones recomendadas

1. Usar `npm run audit:hoshimori-core` como regresion read-only antes de G4/G5/G6.
2. Agregar red social/memorias base y rumores iniciales.
3. Expandir economia/misiones sobre las locations y NPCs ya vivos.
4. Convertir `auditLiveCoverage.js` en chequeo recurrente y, mas adelante, respaldarlo con `/api/admin/coverage-summary`.
