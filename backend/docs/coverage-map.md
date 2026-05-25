# G1 Coverage Map - Isekai Lucas Engine

Fecha de auditoria: 2026-05-25  
Backend vivo auditado: `https://isekai-lucas-engine.onrender.com`  
Modo G1 original: solo lectura. Actualizaciones posteriores G2/G3/G4/G5/G6 ejecutaron seeds idempotentes de cobertura sin rollbacks, aceptaciones de mision, creacion de checkpoints ni mutaciones de partida.

## Resumen ejecutivo

G1 compara tres niveles:

1. Texto canonico en `docs/rules_engine.md` y `docs/world_bible.md`.
2. Representacion en repo: modelos, seeds, servicios, rutas, smoke tests y docs indexables.
3. Representacion viva en Render/MongoDB usando endpoints protegidos por `x-api-key`.

Hallazgo principal: el repo ya tiene una base tecnica amplia y, tras G2/G3/G4/G5/G6, MongoDB vivo contiene el nucleo de Hoshimori: 25 NPCs esperados, 25 ubicaciones principales, 12 relaciones NPC-NPC base, 4 memorias canonicas base, 8 rumores base activos, 36 items economicos, 9 shops y 39 filas de stock. El estado canon de partida sigue Dia 10 12:00. Lo que todavia no cubre el 100% del texto son venta/compra transaccional completa, propagacion avanzada de rumores, relaciones avanzadas/romance, secretos, misiones ampliadas, magia, viajes y world tick.

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

## Actualizacion G4

Se agregaron herramientas para sembrar y auditar la red social base de Hoshimori:

- `src/models/NpcRelationship.js`
- `src/seeds/seedHoshimoriSocialGraph.js`
- `src/utils/auditHoshimoriSocialGraph.js`
- scripts `seed:hoshimori-social` y `audit:hoshimori-social`

El modelo `NpcRelationship` guarda pares NPC-NPC normalizados, tipo de relacion, confianza, familiaridad, tension, resumen publico, notas privadas, si Lucas lo sabe, fuente y tags. Tambien se agrego lectura de relaciones sociales en:

- `GET /api/context/full`
- `GET /api/npcs/:npcId/full`
- `GET /api/search/db`
- snapshots futuros de checkpoints

Marcador canonico de G4:

- `source: "g4_hoshimori_social_seed"`
- `tags: ["g4", "hoshimori", "social_graph"]`

Fix de consistencia: el seed ahora backfillea `source`/`tags` en relaciones ya existentes por par NPC-NPC, y la auditoria cuenta las 12 relaciones por pares esperados. El conteo de marcador queda como evidencia adicional, no como razon para fallar si los pares existen.

Contenido preparado por el seed G4:

- 12 relaciones NPC-NPC seguras, sin romance ni secretos.
- 4 memorias base justificadas por canon existente:
  - Roberto sabe que Lucas trabaja en La Grulla Azul.
  - Fern sabe que Lucas le conto que desperto mana/magia; queda como memoria privada, no publica.
  - Yara conoce a Lucas como trabajador de la posada.
  - Garrick conoce a Lucas por voluntariado/trato de gremio.

Resultado vivo tras ejecutar G4 con `MONGODB_URI`:

- `npm run check`: OK.
- `npm run smoke`: OK.
- `npm run seed:hoshimori-social`: OK.
- `npm run audit:hoshimori-social`: OK.
- `npm run audit:coverage`: OK.
- `npm run audit:hoshimori-core`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- Combates activos: 0.
- Relaciones G4 esperadas: 12/12 pares existentes.
- Relaciones G4 con marcador: 12.
- Memorias G4 esperadas: 4/4 existentes.
- Rumores creados por G4: 0.
- Relaciones de romance: 0.
- `relationshipWithLucas` de Roberto/Fern/Yara/Garrick no fue reducido.

## Actualizacion G5

Se agregaron herramientas para sembrar y auditar rumores base de Hoshimori:

- `src/seeds/seedHoshimoriRumors.js`
- `src/utils/auditHoshimoriRumors.js`
- scripts `seed:hoshimori-rumors` y `audit:hoshimori-rumors`

Tambien se agrego el campo minimo `source` en `Rumor` para poder marcar seeds vivos de forma estable y se amplio `search/db` para buscar por ese campo.

Marcador canonico de G5:

- `source: "g5_hoshimori_rumors_seed"`
- `tags: ["g5", "hoshimori", "rumor"]`

Contenido vivo sembrado:

- 8 rumores base activos.
- Temas cubiertos: retrasos por barro, comerciantes tarde, huellas de lobo cerca del Camino del Molino, sensaciones raras del Bosque de los Susurros, suministros menores de posada/mercado, trabajos simples del gremio y caminos pesados por barro.
- Ningun rumor queda como `confirmed`; se usan `probable`, `rumor` y `doubtful`.
- Cada rumor queda limitado a 3-4 NPCs conocedores, mas locations/facciones cuando corresponde.

Resultado vivo tras ejecutar G5 con `MONGODB_URI`:

- `npm run check`: OK.
- `npm run smoke`: OK.
- `npm run seed:hoshimori-rumors`: OK.
- `npm run audit:hoshimori-rumors`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- Combates activos: 0.
- Rumores G5 esperados: 8/8.
- Rumores G5 con marcador: 8/8.
- `context/full` expone 4 rumores activos relevantes desde La Grulla Azul.
- `search/db?q=barro` y `search/db?q=Bosque` encuentran rumores G5.
- IDs de NPC/location/faction usados por rumores: 0 faltantes.
- Rumores con romance, secretos privados o estado/certidumbre invalida: 0.

## Actualizacion G6

Se agregaron herramientas para sembrar y auditar la economia base de Hoshimori:

- `src/seeds/seedHoshimoriEconomy.js`
- `src/utils/auditHoshimoriEconomy.js`
- scripts `seed:hoshimori-economy` y `audit:hoshimori-economy`

Tambien se agregaron endpoints read-only:

- `GET /api/economy/shops`
- `GET /api/economy/items/:itemId`

El smoke test ahora cubre:

- `GET /api/economy/shops`
- `GET /api/economy/shops/shop_borin_smithy/stock`
- `GET /api/economy/shops/shop_liora_herbs/stock`

Contenido vivo sembrado:

- 36 items basicos: alimentos, medicina comun, herramientas/materiales, ropa/equipo, armas simples y servicios simples.
- 9 shops/servicios: Pavo, La Grulla Azul, Borin, Liora, Sella, Hilda, Merek, gremio y templo.
- 39 filas de stock inicial.
- No hay objetos magicos comunes.
- El seed preserva cantidades existentes con `$setOnInsert` para no resetear compras/stock vivo ya existente.

Resultado vivo tras ejecutar G6 con `MONGODB_URI`:

- `npm run check`: OK.
- `npm run seed:hoshimori-economy`: OK.
- `npm run smoke`: OK contra backend local con DB viva, para validar endpoints nuevos antes del redeploy de Render.
- `npm run audit:hoshimori-economy`: OK contra backend local con DB viva.
- `npm run audit:coverage`: OK.
- `npm run audit:hoshimori-core`: OK.
- `npm run audit:hoshimori-social`: OK.
- `npm run audit:hoshimori-rumors`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- Combates activos: 0.
- Pavo conserva racion pequena y racion normal.
- Borin, Liora, Sella, Hilda y Merek tienen stock consultable.

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
| Comidas, raciones y contrato | `rules_engine.md` 8 | `Item`, inventario inicial, comida/raciones en seed; no hay contrato laboral formal | Alimentos base vivos; Pavo, Grulla y Hilda tienen stock de comida | partial | G6: Pavo conserva racion pequena/normal; Grulla tiene comida/sopa/servicio de habitacion; Hilda pan simple/de viaje | Crear sistema de trabajos/contrato en G8 |
| Dinero y comercio basico | `rules_engine.md` 9 | `Item`, `Shop`, `ShopStock`, `economyService`, `shopStockPatches`, `GET /api/economy/shops`, `GET /api/economy/items/:itemId` | 9 shops vivos, 36 items, 39 stocks | seeded_mongodb | `seed:hoshimori-economy` OK; `audit:hoshimori-economy` OK; Borin/Liora/Sella/Hilda/Merek consultables | G6 futuro/G16: venta transaccional, fiado profundo, precios variables sofisticados, bancos/deudas/impuestos |
| Bancos, deudas, alquileres, impuestos | `rules_engine.md` 9.7, `world_bible.md` 4.6 | No hay modelos especificos `Loan/Debt/Rental/Tax/BankAccount` | No confirmado vivo | future_optional | Solo docs y algunas facciones; sin endpoints | Postergar hasta G16 |
| Progresion de habilidades y EXP | `rules_engine.md` 10-13 | Skills embebidas en `GameState`; `applySkillExp` con level-up | Skills de Lucas vivas | partial | Hay skills y EXP, pero no valida rangos, maestro, Aqua, energia baja, anti-farmeo | G10: centralizar tabla y validadores |
| Magia, MP y practica | `rules_engine.md` 14; `world_bible.md` 1.4, 9.3 | MP, skills `skill_mana`/`skill_magia`, flag `knownSpells` | MP 200/200, `knownSpells: []` | partial | No hay catalogo de hechizos ni templates | G11 despues de EXP/biologia |
| Entrenamiento fisico, trabajo y viaje | `rules_engine.md` 15 | Deltas por `turn/apply`; no hay `Job`, `Route`, `TravelService` | Trabajo actual en flags, sin contrato formal | partial | `flags.currentJob: La Grulla Azul`; no hay endpoints de jobs | G8 y G18 |
| Combate narrativo con numeros | `rules_engine.md` 16; `world_bible.md` 16 | `EnemyTemplate`, `CombatEncounter`, `combatService`, rutas `/api/combat/*` | 5 enemigos vivos; 0 combates activos | seeded_mongodb | `audit:coverage`: 5 enemy templates, active combats 0 | G12: acciones, armas, multiples enemigos, loot/proof |
| Gremio, MG y misiones | `rules_engine.md` 17; `world_bible.md` 18 | `Mission`, `missionService`, rutas board/accept/report/expire | 1 mision Porcelana disponible | partial | `mission_d10_cleanup_post_rain` viva, proof pending | G7: templates/cartelera amplia y completar flujo de recompensa |
| NPCs, conocimiento, escena viva | `rules_engine.md` 18; `world_bible.md` 11 | `Npc`, `NpcMemory`, `RoutineOverride`, `NpcRelationship`, `getNpcFull`; seeds core/social/rumors preparados | 25 NPCs de Hoshimori vivos; 4 memorias G4 vivas; rumores G5 distribuidos por NPC/location | partial | `audit:hoshimori-core`, `audit:hoshimori-social` y `audit:hoshimori-rumors` OK | Ampliar memoria privada solo con canon verificable; no hacer NPCs omniscientes |
| Relaciones, confianza, romance | `rules_engine.md` 19; `world_bible.md` 12 | `relationshipWithLucas` en `Npc`; `NpcRelationship` para NPC-NPC; lecturas en context/npc/search | 12 relaciones NPC-NPC base de Hoshimori vivas y marcadas | partial | `audit:hoshimori-social`: 12/12 pares, 12 con `source`/`tags`, romance relationships 0, relationshipWithLucas no reducido | Mantener romance fuera hasta que haya canon explicito; ampliar tensiones/secretos solo por eventos |
| Rumores y propagacion | `rules_engine.md` 20.1; `world_bible.md` 17 | `Rumor` con `source`, `applyRumorPatches`, `seedHoshimoriRumors.js`, `auditHoshimoriRumors.js`; search/context consultan rumores | 8 rumores G5 activos vivos; contexto y busqueda los ven | seeded_mongodb | `seed:hoshimori-rumors` OK; `audit:hoshimori-rumors` OK; `context/full` muestra 4 rumores relevantes; `search/db?q=barro` y `search/db?q=Bosque` encuentran rumores | G5 avanzado/G14: propagacion por tick, distorsion gradual, expiracion y cambios por eventos |
| Reputacion y facciones | `rules_engine.md` 20.2-20.3; `world_bible.md` 10, 15 | `Faction`, links de NPC, reputacion con Lucas | 3 facciones aparecen con query amplia | partial | `/api/search/db?q=a` devuelve `factions=3` | G15: ley, testigos, acceso, sospecha |
| Inventario, propiedad y objetos | `rules_engine.md` 21 | Inventario en `GameState`, `Item`, validacion de item existente al agregar | Inventario Lucas vivo; 36 items G6 existen como catalogo base | partial | `audit:hoshimori-economy`: 36/36 items, sin objetos magicos comunes; `turn/apply` rechaza item inexistente al agregar | G17: durabilidad avanzada, crafting, recursos y reparacion profunda |
| Viaje, exploracion y zonas seguras | `rules_engine.md` 22; `world_bible.md` 7, 13 | Docs, strings de zonas en enemigos, ubicaciones core de camino/bosque/colinas sembradas | Locations principales existen; no hay grafo de rutas ni TravelService | partial | `audit:hoshimori-core` OK reportado para locations; sin modelos Route/TravelService | G18 tras economia/misiones base |
| Pipeline de acciones complejas | `rules_engine.md` 23-24 | `turn/apply` procesa patches; no orquestador de pipeline | Patches funcionan si GPT los manda bien | partial | Endpoint existe, pero validacion semantica es incompleta | Mantener GPT como planificador, mover reglas criticas al backend |
| Hoshimori: ubicaciones principales | `world_bible.md` 6.3, 19 | `Location` model; seeds iniciales/world essentials; `seedHoshimoriCore.js` prepara 25 ubicaciones canonicas | 25/25 ubicaciones esperadas vivas | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing locations 0; GameState intacto | Mantener auditoria como regresion; G6/G7 pueden apoyarse en estas locations |
| Hoshimori: roster base 25 NPCs | `world_bible.md` 11 | `seedInitialState` tiene 4; `seedHoshimoriRoster` prepara 21 mas; `seedHoshimoriCore.js` consolida 25 NPCs con rutinas base | 25/25 NPCs esperados vivos | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing NPCs 0; Narek/Pavo/Borin/Liora aparecen en `search/db` | G4: relaciones NPC-NPC, memorias base y conocimiento no omnisciente |
| Hoshimori: red social base | `world_bible.md` 12 | `NpcRelationship`, `seedHoshimoriSocialGraph.js`, `auditHoshimoriSocialGraph.js` | 12/12 relaciones base y 4/4 memorias G4 vivas | seeded_mongodb | `seed:hoshimori-social` OK; `audit:hoshimori-social` OK; GameState Dia 10 12:00, dinero 1470, combates 0; rumores G4 0; romance 0 | Usar como base para G5 rumores; no agregar secretos/romance sin evento canon |
| Hoshimori: rumores base | `world_bible.md` 17, 19; `rules_engine.md` 20.1 | `Rumor`, `seedHoshimoriRumors.js`, `auditHoshimoriRumors.js`, `context/full`, `search/db` | 8/8 rumores base activos vivos | seeded_mongodb | Marcador G5 8/8; no `confirmed`; romance/secretos 0; no todos los NPCs conocen todo; GameState intacto | Implementar propagacion simple por avance de tiempo solo cuando exista world tick |
| Hoshimori: economia base | `rules_engine.md` 8-9, 21; `world_bible.md` 6, 19 | `Item`, `Shop`, `ShopStock`, `seedHoshimoriEconomy.js`, `auditHoshimoriEconomy.js`, endpoints read-only de shops/items | 36/36 items, 9/9 shops, 39/39 stock rows vivos | seeded_mongodb | `audit:hoshimori-economy`: stock no negativo, precios no negativos, owners/locations/factions OK, magia comun 0, GameState intacto | G7/G8 pueden consumir economia; G16 para bancos/deudas/impuestos |
| Region cercana a Hoshimori | `world_bible.md` 13 | Docs indexados; algunas locations core cercanas y enemy zones textuales | Camino del Molino, molino, bosque y colinas base existen como locations core | partial | `audit:hoshimori-core` OK reportado para 25 locations; faltan rutas regionales, aldeas/granjas y rosters externos | G18 y G19 despues de Hoshimori economico/social |
| Regiones y ciudades mayores | `world_bible.md` 14 | Docs indexados | No entidades vivas confirmadas | future_optional | `search/docs` encuentra Valdoria; DB solo faccion Corona | G19 post-Hoshimori |
| Amenazas, fauna y monstruos | `world_bible.md` 16 | `EnemyTemplate`, `seedEnemyTemplates` | 5 enemigos vivos | seeded_mongodb | `search/db?q=lobo` devuelve 1 enemyTemplate; `/api/combat/enemies` devuelve 5 | Ampliar con zonas/loot en G12/G17 |
| Clima y eventos diarios | `world_bible.md` 8; `rules_engine.md` 5.4 | `WorldEvent`; no `WeatherState` | Evento activo supply delay por barro | partial | `activeEventIds: event_d10_supply_delay_mud`; sin weather endpoint | G13 |
| Mundo offscreen / world tick | `rules_engine.md` 2.4; G14 implicito | `/api/world/sync-routines` solo rutinas | No tick integral | partial | No endpoint `/api/world/tick`; rutinas no corridas en vivo para roster ampliado | G14 despues de G2-G7 |
| Busqueda DB | `rules_engine.md` 3.2 | `/api/search/db` busca modelos principales | Funciona | implemented_backend | Queries Narek/lobo/a responden | Mantener; agregar resumen admin read-only si hace falta |
| Busqueda docs | `rules_engine.md` 3.2; ambos docs | `WorldDocumentIndex`, `seedDocuments`, `/api/search/docs` | Funciona con `romance` | seeded_mongodb | `search/docs?q=romance` devuelve 4 docs | Mantener seed docs alineado con archivos |
| Contexto completo | `rules_engine.md` 3.2 | `/api/context/full` junta estado, location, NPCs cercanos, shops, rumors, missions, factions, combat | Funciona y es de alcance cercano | implemented_backend | `context/full` devuelve 4 nearby NPCs y 4 rumores activos relevantes en Grulla | Documentar que no es roster completo |
| Checkpoints y rollback | `rules_engine.md` 3.4 | `Checkpoint`, rutas create/list/get/rollback | Checkpoints vivos; oficial presente | implemented_backend | `/api/checkpoints` lista `checkpoint_d10_1200_1779684235944` | Separar admin/in-game en OpenAPI; no exponer rollback al GPT normal |
| Smoke test | README, `smokeTestRender.js` | `npm run smoke` cubre health/context/search/npc/location/economy/missions/combat/checkpoints | Smoke remoto OK | implemented_backend | Ejecutado OK en G1 | Expandir a tests no mutantes |
| Tests automatizados | `rules_engine.md` 26 | `npm test` sigue placeholder | No aplica | missing | `package.json`: `test` imprime "no test specified" | G21 |
| OpenAPI / GPT Actions | `rules_engine.md` 26 | No se encontro archivo OpenAPI/swagger | No aplica | missing | `rg openapi|swagger` solo encuentra menciones pendientes | G22 |
| Admin/debug seguro | `rules_engine.md` 26 | Checkpoints y scripts utilitarios; no resumen read-only de colecciones | No endpoint de conteo seguro | partial | Se audita con busquedas indirectas | Proponer `/api/admin/coverage-summary`, no implementar en G1 |

## Afirmaciones auditadas

| Afirmacion | Resultado | Evidencia |
|---|---|---|
| La DB viva tiene 25 NPCs de Hoshimori. | VERDADERA tras G2/G3 | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados: 25/25 NPCs, missing NPCs 0; Narek/Pavo/Borin/Liora aparecen en `search/db`. |
| `context/full` devuelve solo NPCs cercanos, no todo el roster. | VERDADERA | `context/full` devuelve 4 NPCs cercanos tras G4/G2-G3: Fern, Joren Pell, Roberto Valen, Yara Mils. |
| Faltan ubicaciones importantes de Hoshimori como Location. | FALSA tras G2/G3 para el core definido | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados: 25/25 locations, missing locations 0. Quedan fuera del core rutas regionales/otras aldeas. |
| Hay modelos que existen pero colecciones vacias. | VERDADERA con limite de evidencia | `Rumor` ya tiene 8 rumores G5 vivos y `NpcMemory` tiene 4 memorias G4 vivas. Aun pueden existir otras colecciones/modelos sin datos completos; sin endpoint de conteo general, esto no prueba matematicamente todas las colecciones. |
| El GPT puede consultar docs completos desde `/api/search/docs`. | VERDADERA | `search/docs?q=romance` devuelve 4 documentos indexados; otras consultas como Valdoria/Bosque tambien devuelven chunks. |
| El combate base esta disponible en Render. | VERDADERA | `/api/combat/enemies` devuelve 5 templates: lobo, rata gigante, avispa roja, bandido menor, jabali gris. |
| No hay combates activos fantasma. | VERDADERA | `/api/combat/encounters/active` devuelve 0. |
| El estado vivo actual coincide con Dia 10 12:00. | VERDADERA | `context/full` confirma `currentDay=10`, `time=12:00`, location y recursos esperados. |

## Revision de repo local

Modelos existentes:

`Character`, `Checkpoint`, `CombatEncounter`, `EnemyTemplate`, `EventLog`, `Faction`, `GameState`, `Item`, `Location`, `Mission`, `Npc`, `NpcMemory`, `RoutineOverride`, `Rumor`, `Shop`, `ShopStock`, `WorldDocumentIndex`, `WorldEvent`.

Cambio G5: `Rumor` ahora incluye `source` para auditar seeds vivos sin depender solo de tags/texto.

Seeds existentes:

`seedInitialState.js`, `seedWorldEssentials.js`, `seedHoshimoriRoster.js`, `seedHoshimoriRoutines.js`, `seedHoshimoriCore.js`, `seedHoshimoriSocialGraph.js`, `seedHoshimoriRumors.js`, `seedHoshimoriEconomy.js`, `seedEnemyTemplates.js`, `seedDocuments.js`, mas scripts de limpieza/reparacion. En G1 no se ejecuto ningun seed; G2/G3/G4/G5/G6 usaron seeds idempotentes.

Rutas existentes:

`/api/context/full`, `/api/turn/apply`, `/api/search/db`, `/api/search/docs`, `/api/npcs/:npcId/full`, `/api/locations/:locationId/full`, `/api/checkpoints`, `/api/world/sync-routines`, `/api/economy/shops`, `/api/economy/shops/:shopId/stock`, `/api/economy/items/:itemId`, `/api/economy/restock-daily`, `/api/missions/*`, `/api/combat/*`.

G5 confirma que `context/full` trae rumores activos por ubicacion/NPC cercano y que `search/db` puede encontrarlos.

G6 confirma que shops principales e items basicos pueden consultarse por endpoints read-only.

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

1. Usar `npm run audit:hoshimori-core`, `npm run audit:hoshimori-social`, `npm run audit:hoshimori-rumors` y `npm run audit:hoshimori-economy` como regresiones read-only antes de G7.
2. Expandir misiones sobre las locations, NPCs, relaciones, rumores y economia ya vivos.
3. Implementar venta/compra transaccional y fiado profundo solo cuando se disene el flujo de acciones economicas.
4. Implementar propagacion avanzada de rumores dentro del world tick, no por tiempo real.
5. Convertir `auditLiveCoverage.js` en chequeo recurrente y, mas adelante, respaldarlo con `/api/admin/coverage-summary`.
