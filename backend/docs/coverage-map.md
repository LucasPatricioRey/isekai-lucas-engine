# G1 Coverage Map - Isekai Lucas Engine

Fecha de auditoria: 2026-05-25  
Backend vivo auditado: `https://isekai-lucas-engine.onrender.com`  
Modo: solo lectura. No se ejecutaron seeds, rollbacks, aceptaciones de mision, creacion de checkpoints ni mutaciones de partida.

## Resumen ejecutivo

G1 compara tres niveles:

1. Texto canonico en `docs/rules_engine.md` y `docs/world_bible.md`.
2. Representacion en repo: modelos, seeds, servicios, rutas, smoke tests y docs indexables.
3. Representacion viva en Render/MongoDB usando endpoints protegidos por `x-api-key`.

Hallazgo principal: el repo ya tiene una base tecnica amplia, pero MongoDB vivo esta bastante por detras de lo que los docs y algunos seeds describen. El estado canon de partida si coincide con Dia 10 12:00, pero el roster vivo, ubicaciones vivas, rumores, memorias, economia amplia, misiones y magia todavia no cubren el 100% del texto.

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

Resultado de ejecucion local en este entorno:

- `npm run check`: OK.
- `npm run seed:hoshimori-core`: no ejecutado contra MongoDB porque no existe `.env` ni `MONGODB_URI` en el entorno local. El script fallo antes de escribir datos.
- `npm run audit:hoshimori-core`: fallo correctamente contra Render porque la DB viva aun no contiene el nucleo completo.
- `npm run smoke`: OK.

Evidencia viva antes de ejecutar el seed con credenciales Atlas:

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
| NPCs, conocimiento, escena viva | `rules_engine.md` 18; `world_bible.md` 11 | `Npc`, `NpcMemory`, `RoutineOverride`, `getNpcFull` | Contexto cercano: 3 NPCs; Narek no existe vivo | partial | `search/db?q=Narek` devuelve 0 NPCs; `context/full` devuelve Fern/Roberto/Yara | Correr/completar roster solo en G2/G3, no durante G1 |
| Relaciones, confianza, romance | `rules_engine.md` 19; `world_bible.md` 12 | `relationshipWithLucas` en `Npc`; no hay `NpcRelationship` entre NPCs | Relaciones con Lucas en NPCs iniciales | partial | No existe modelo NpcRelationship; sin red social viva entre NPCs | G4: modelo o ampliacion clara |
| Rumores y propagacion | `rules_engine.md` 20.1; `world_bible.md` 17 | `Rumor`, `applyRumorPatches`, search/context consultan rumores | Sin rumores encontrados por busquedas vivas | partial | `/api/search/db?q=a` devuelve `rumors=0`; `search/db?q=rumor` devuelve 0 | G5: seed inicial de rumores + propagacion simple |
| Reputacion y facciones | `rules_engine.md` 20.2-20.3; `world_bible.md` 10, 15 | `Faction`, links de NPC, reputacion con Lucas | 3 facciones aparecen con query amplia | partial | `/api/search/db?q=a` devuelve `factions=3` | G15: ley, testigos, acceso, sospecha |
| Inventario, propiedad y objetos | `rules_engine.md` 21 | Inventario en `GameState`, `Item`, validacion de item existente al agregar | Inventario Lucas vivo; 5 items base en seed | partial | `turn/apply` rechaza item inexistente al agregar | Completar catalogo G6/G17 |
| Viaje, exploracion y zonas seguras | `rules_engine.md` 22; `world_bible.md` 7, 13 | Solo docs y strings de zonas en enemigos | No hay rutas vivas | indexed_docs_only | Sin modelos Route/TravelService; ubicaciones de bosque/camino faltan | G18 tras G2 |
| Pipeline de acciones complejas | `rules_engine.md` 23-24 | `turn/apply` procesa patches; no orquestador de pipeline | Patches funcionan si GPT los manda bien | partial | Endpoint existe, pero validacion semantica es incompleta | Mantener GPT como planificador, mover reglas criticas al backend |
| Hoshimori: ubicaciones principales | `world_bible.md` 6.3, 19 | `Location` model; seeds iniciales/world essentials; `seedHoshimoriCore.js` prepara 25 ubicaciones canonicas | Vivo confirmado antes de seed: 7/25 ubicaciones esperadas | partial | `audit:hoshimori-core`: 18 ubicaciones faltantes; el seed no corrio por falta de `MONGODB_URI` local | Ejecutar `npm run seed:hoshimori-core` en entorno con Atlas vivo y repetir auditoria |
| Hoshimori: roster base 25 NPCs | `world_bible.md` 11 | `seedInitialState` tiene 4; `seedHoshimoriRoster` prepara 21 mas; `seedHoshimoriCore.js` consolida 25 NPCs con rutinas base | Vivo confirmado antes de seed: 4/25 NPCs esperados | partial | `audit:hoshimori-core`: 21 NPCs faltantes; Narek/Pavo/Borin/Liora no aparecen como NPC | Ejecutar seed en entorno con `MONGODB_URI`; luego marcar `seeded_mongodb` si `audit:hoshimori-core` pasa |
| Hoshimori: red social base | `world_bible.md` 12 | Relaciones solo con Lucas; no Npc-Npc | No red social NPC-NPC viva | missing | No hay `NpcRelationship`; memorias vivas 0 por query amplia | G4 |
| Region cercana a Hoshimori | `world_bible.md` 13 | Docs indexados; algunos enemy zones textuales | No locations vivas confirmadas | indexed_docs_only | Faltan `loc_hoshimori_mill`, bosque/colinas | G18/G2 |
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
| La DB viva tiene 25 NPCs de Hoshimori. | FALSA | `search/db?q=Narek` devuelve 0 NPCs; Narek es parte del roster de 25. Query amplia `/api/search/db?q=a` devuelve 4 NPCs. |
| `context/full` devuelve solo NPCs cercanos, no todo el roster. | VERDADERA | `context/full` devuelve 3 NPCs cercanos: Fern, Roberto Valen, Yara Mils. |
| Faltan ubicaciones importantes de Hoshimori como Location. | VERDADERA | GET manual a ubicaciones como `loc_hoshimori_plaza`, `loc_hoshimori_guild_patio`, `loc_hoshimori_mill`, bosque/colinas/panaderia/guardia/consejo/curtidor devolvio 404. |
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

1. Ejecutar `npm run seed:hoshimori-core` en un entorno con `MONGODB_URI` apuntando a Atlas vivo o en shell segura de Render.
2. Repetir `npm run audit:hoshimori-core`, `npm run smoke` y `npm run audit:coverage`.
3. Si la auditoria pasa, cambiar G2/G3 de `partial` a `seeded_mongodb`.
4. Agregar red social/memorias base y rumores iniciales.
5. Expandir economia/misiones solo despues de que locations/NPCs existan vivos.
6. Convertir `auditLiveCoverage.js` en chequeo recurrente y, mas adelante, respaldarlo con `/api/admin/coverage-summary`.
