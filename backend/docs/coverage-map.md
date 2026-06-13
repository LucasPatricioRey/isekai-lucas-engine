# G1 Coverage Map - Isekai Lucas Engine

Fecha de auditoria: 2026-05-25  
Backend vivo auditado: `https://isekai-lucas-engine.onrender.com`  
Modo G1 original: solo lectura. Actualizaciones posteriores G2/G3/G4/G5/G6/G7/G8-G13/G18/G14-base/G21/G22/G23 ejecutaron seeds idempotentes, tests read-only, previews read-only o documentacion operativa. G23.2 agrega una migracion idempotente y acotada del acumulador biologico pendiente detectado en partida real.

Actualizacion C10: `src/utils/auditCombatPlaytest.js` agrega una auditoria mutante controlada de combate avanzado. Clona el `GameState` vivo a un `gameId` temporal, crea fixtures marcadas como test, ejecuta escenarios reales de sparring, amenaza menor, bloqueo, esquiva, moral enemiga, retirada, tratamiento de herida y evidencia post-combate, y borra todos los documentos temporales al finalizar.

Actualizacion C11: `src/utils/auditCombatBalance.js` agrega matriz temporal de balance con rata, lobo, bandido, jabali y sparring. El servicio aplica `WeaponProfile.defenseModifier/speedModifier/fatigueCostModifier`, reduccion simple por armadura equipada, criticos suavizados, y nuevos equipos comunes limitados: `item_chaleco_cuero_ligero` y `item_escudo_madera_simple`.

Actualizacion C12: `src/utils/auditCombatBehavior.js` agrega matriz temporal de conducta enemiga. El servicio persiste `encounterType`/`encounterPolicy`, expone `latestNpcDecision`, y resuelve turnos NPC por backend usando arquetipo, moral, HP, fatiga, distancia, tipo de encuentro y modo controlado.

Actualizacion C13: `src/utils/auditCombatRecovery.js` agrega recuperacion formal de heridas. `InjuryRecord` guarda progreso/horas restantes, el Action de combate expone recovery preview/apply, y el backend bloquea recuperacion con sangrado activo o aplicacion duplicada en el mismo timestamp.

Actualizacion C14: `context/compact` expone `dramaticContext` y `scene.nearbyNpcs[].dialogueProfile`. El narrador conserva HUD obligatorio al final, pero recibe direccion compacta de tension de escena, voz por NPC, registro segun relacion, subtexto, limites y dinamica de grupo. `src/utils/auditNarrativeDrama.js` valida que los perfiles existan y sigan compactos.

Actualizacion C15: `Npc` agrega `emotionalProfile`; `NpcRelationship` agrega tono emocional, tension publica, subtexto privado, hints y limites. `context/compact` expone `scene.nearbyNpcs[].emotionalProfile`, `dialogueProfile.emotionalSubtext` y `scene.relationshipDynamics` para escenas grupales donde los NPCs reaccionan entre ellos. `src/seeds/seedHoshimoriNpcEmotions.js` y `src/utils/auditNpcEmotions.js` cubren los 25 NPCs base y 12 pares NPC-NPC de Hoshimori.

Actualizacion C15.1: se endurece la regla de dialogo seco para evitar frases minimas pobres y se suben los rangos base de fundamentos tecnicos de combate de 30 min (`skill_daga`, bloqueo, esquiva, retirada, pelea sin armas y tactica basica) de 1-4 a 3-6 EXP base por bloque.

Actualizacion C16: `context/compact` expone `dramaticContext.emotionalScene` y `scene.nearbyNpcs[].dialogueProfile.dramaticRole`. El GPT recibe una arquitectura de escena emocional: anzuelo, mascara publica, presion, grieta visible, objeto/ancla sensorial y salida, manteniendo HUD y limites mecanicos.

Actualizacion C17: `src/utils/auditNarrativeScenePlaytest.js` agrega playtest read-only de cuatro escenas representativas: entrenamiento con Eddan, cierre grupal de La Grulla Azul, reporte/tramite en gremio y escena solitaria de cansancio. Tambien ajusta anclas sensoriales para distinguir patio de entrenamiento, gremio administrativo y habitacion privada.

## Resumen ejecutivo

G1 compara tres niveles:

1. Texto canonico en `docs/rules_engine.md` y `docs/world_bible.md`.
2. Representacion en repo: modelos, seeds, servicios, rutas, smoke tests y docs indexables.
3. Representacion viva en Render/MongoDB usando endpoints protegidos por `x-api-key`.

Hallazgo principal: el repo ya tiene una base tecnica amplia y, tras G2/G3/G4/G5/G6/G7/G8-G13/G18/G14-base/G21/G22/G23/G23.2, MongoDB vivo contiene el nucleo de Hoshimori: 25 NPCs esperados, 25 ubicaciones principales, 12 relaciones NPC-NPC base, 4 memorias canonicas base, 8 rumores base activos, 36 items economicos, 9 shops, 39 filas de stock, 11 misiones iniciales, 1 contrato laboral activo de Lucas en La Grulla Azul, 12 disciplinas magicas, 7 tecnicas/plantillas magicas base, 23 rutas de viaje de Hoshimori y 1 clima simple regional de Dia 10. Ademas existen servicios/endpoints de preview para reloj biologico, progresion de EXP, practica magica segura, acciones de combate, viaje, clima, world tick/offscreen y OpenAPI de GPT Actions alineado. `npm test` cubre flujos read-only/preview, rechazos seguros, hardening de turnos y acumuladores biologicos persistentes. El estado vivo actual de partida esta en Dia 10 13:10, ubicacion `loc_hoshimori_grulla_azul`, dinero 1470, MP 200/200, 1 mision activa y combates activos 0. Lo que todavia no cubre el 100% del texto son completar turnos reales con pago, validacion estricta de EXP dentro de cada accion, venta/compra transaccional completa, propagacion avanzada de rumores, relaciones avanzadas/romance, secretos, cadenas de misiones, practica magica mutadora, desbloqueo real de hechizos, viaje real mutador, encuentros aleatorios avanzados, clima avanzado y world tick apply real.

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
| Checkpoint oficial | `checkpoint_d10_1200_1779723391623` | presente |

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

## Actualizacion G7

Se agregaron herramientas para sembrar y auditar la cartelera inicial del gremio de Hoshimori:

- `src/seeds/seedHoshimoriMissions.js`
- `src/utils/auditHoshimoriMissions.js`
- scripts `seed:hoshimori-missions` y `audit:hoshimori-missions`

Tambien se amplio la lectura de cartelera para filtros read-only:

- `GET /api/missions/board?riskLevel=...`
- `GET /api/missions/board?sourceFactionId=...`

El smoke test ahora exige:

- `GET /api/missions/board` con varias misiones vivas.
- `GET /api/missions/mission_d10_grulla_delivery_guild`

Contenido vivo sembrado:

- 11 misiones iniciales disponibles: la mision original `mission_d10_cleanup_post_rain` mas 10 encargos nuevos.
- Rangos: Porcelana y Cobre.
- Riesgos: `none`, `low` y una inspeccion Cobre `medium`; ninguna mision disponible de riesgo alto/extremo.
- Tipos cubiertos: entrega simple, apoyo de mercado, ayuda por barro, reporte del molino, inspeccion de huellas, entrega de vendajes, informe visual del borde del bosque, scout opcional de ratas, traslado menor para Borin y aviso civico.
- Todas tienen `proofRequired`, `proofStatus: pending`, recompensas moderadas en cobre/MG y referencias a NPCs, locations, facciones, items, shops, rumores o enemigos existentes.
- No hay misiones de romance, secretos privados, recompensas magicas, abandono de Hoshimori ni aceptacion/completado automatico.

Resultado vivo tras ejecutar G7 con `MONGODB_URI`:

- `npm run check`: OK.
- `npm run seed:hoshimori-missions`: OK.
- `npm run smoke`: OK.
- `npm run audit:hoshimori-missions`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- `activeMissionIds` sigue vacio.
- Combates activos: 0.
- Misiones G7 esperadas: 11/11.
- Misiones G7 con marcador: 11/11.
- `mission_d10_cleanup_post_rain` sigue viva y disponible.
- Referencias faltantes de facciones/NPCs/locations/items/enemigos/rumores/shops: 0.
- Misiones con romance, secretos privados o recompensa magica: 0.

## Actualizacion G8-G10

Se agrego la base tecnica combinada para trabajos, necesidades biologicas y progresion de habilidades:

- `src/models/JobContract.js`
- `src/seeds/seedHoshimoriJobs.js`
- `src/services/jobService.js`
- `src/services/biologicalClockService.js`
- `src/services/skillProgressionService.js`
- `src/utils/auditHoshimoriJobs.js`
- `src/utils/auditBiologicalClock.js`
- `src/utils/auditSkillProgression.js`
- scripts `seed:hoshimori-jobs`, `audit:hoshimori-jobs`, `audit:biological-clock`, `audit:skill-progression`

Endpoints nuevos protegidos por API key:

- `GET /api/jobs/contracts/active`
- `GET /api/jobs/shifts/available`
- `POST /api/jobs/shifts/:shiftId/preview`
- `POST /api/jobs/shifts/:shiftId/complete`
- `POST /api/needs/activity-cost/preview`
- `POST /api/progression/skills/preview`

G8 contenido vivo sembrado:

- 1 contrato laboral activo: `job_contract_lucas_grulla_azul_d10`.
- Lugar: La Grulla Azul.
- Empleador: Roberto Valen.
- Pago base: 140 cobre/dia.
- Turno manana: 07:00-12:00.
- Turno tarde: 14:00-20:30.
- Comidas de contrato: comida ligera/desayuno +20 saciedad/+2 energia; comida principal +30 saciedad/+5 energia.
- Tareas tipicas y reglas de ausencia documentadas en el contrato.
- No se modifica `GameState`; los previews indican explicitamente `willMutateGameState: false`.

G9 contenido tecnico:

- Servicio central con categorias de actividad de `rules_engine.md` 6.3.
- Costes por hora confirmados: actividad normal -3/-4, trabajo normal -3/-6, viaje suave -3/-5, trabajo fuerte -7/-11, entreno moderado -5/-8, entreno intenso -8/-14.
- Labels centralizados para saciedad y energia.
- Preview de bloque biologico sin aplicar automaticamente al GameState.

G10 contenido tecnico:

- Servicio central con fases, EXP por fase, level-up y cambio de fase.
- Validacion basica por habilidad/categoria para Fuerza, Resistencia, Vitalidad, Agilidad, Percepcion, Mana y Magia.
- Preview de multiplicadores: maestro x2, Aqua x5 solo magico, energia baja reduce EXP.
- Estructura TODO para anti-farmeo real cuando exista historial diario.
- No reemplaza todavia la mutacion de `turn/apply`; queda como preview/validacion central.

Resultado vivo tras ejecutar G8-G10 con `MONGODB_URI` y backend local apuntando a MongoDB vivo:

- `npm run check`: OK.
- `npm run seed:hoshimori-jobs`: OK.
- `npm run smoke`: OK contra backend local con endpoints nuevos.
- `npm run audit:hoshimori-jobs`: OK.
- `npm run audit:biological-clock`: OK.
- `npm run audit:skill-progression`: OK.
- `npm run audit:coverage`: OK.
- `npm run audit:hoshimori-core`: OK.
- `npm run audit:hoshimori-social`: OK.
- `npm run audit:hoshimori-rumors`: OK.
- `npm run audit:hoshimori-economy`: OK.
- `npm run audit:hoshimori-missions`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- `activeMissionIds` sigue vacio.
- Combates activos: 0.
- Previews de trabajo/necesidades/EXP no mutan estado.

## Actualizacion G11

Se agrego la base jugable segura para magia en modo catalogo y preview:

- `src/models/MagicDiscipline.js`
- `src/models/MagicTechnique.js`
- `src/models/CharacterMagicKnowledge.js`
- `src/seeds/seedMagicBasics.js`
- `src/services/magicService.js`
- `src/controllers/magicController.js`
- `src/routes/magicRoutes.js`
- `src/utils/auditMagicBasics.js`
- scripts `seed:magic-basics` y `audit:magic-basics`

Endpoints nuevos protegidos por API key:

- `GET /api/magic/disciplines`
- `GET /api/magic/techniques`
- `GET /api/magic/techniques/:techniqueId`
- `POST /api/magic/practice/preview`

Contenido vivo sembrado:

- 12 disciplinas/rutas: Mana, Magia, Percepcion magica, Magia ofensiva, Fuego, Rayo/Electricidad, Hielo, Tierra/Viento, Magia defensiva, Magia curativa, Magia mental y Magia de invocacion.
- 6 tecnicas/ejercicios seguros iniciales: respiracion de mana basica, sentir flujo interno, meditacion de mana, percepcion magica basica, teoria de estructura magica principiante y canalizacion segura en reposo.
- 1 plantilla bloqueada de referencia ofensiva (`technique_locked_offensive_spark`) para probar requisitos sin ensenar un hechizo real.
- No se siembra conocimiento magico aprendido en `CharacterMagicKnowledge`.
- No se crean objetos magicos.

Resultado vivo tras ejecutar G11 con `MONGODB_URI` y backend local apuntando a MongoDB vivo:

- `npm run check`: OK.
- `npm run seed:magic-basics`: OK.
- `npm run smoke`: OK contra backend local con endpoints nuevos.
- `npm run audit:magic-basics`: OK.
- `npm run audit:coverage`: OK.
- `npm run audit:hoshimori-core`: OK.
- `npm run audit:hoshimori-social`: OK.
- `npm run audit:hoshimori-rumors`: OK.
- `npm run audit:hoshimori-economy`: OK.
- `npm run audit:hoshimori-missions`: OK.
- `npm run audit:hoshimori-jobs`: OK.
- `npm run audit:biological-clock`: OK.
- `npm run audit:skill-progression`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- MP actual sigue 200/200.
- `activeMissionIds` sigue vacio.
- Combates activos: 0.
- Preview de respiracion de mana funciona sin mutar estado.
- Preview de percepcion magica basica funciona sin mutar estado.
- Aqua x5 aplica solo a aprendizaje magico y no a habilidades fisicas.
- Tecnica ofensiva bloqueada no puede practicarse sin requisitos.
- Hechizos avanzados aprendidos: 0.
- Objetos magicos G11 creados: 0.

## Actualizacion G12/G18/G14 base

Se agrego una base controlada para combate avanzado, rutas de viaje y world tick/offscreen en modo preview:

- `src/services/combatActionService.js`
- `src/services/travelService.js`
- `src/services/worldTickService.js`
- `src/models/TravelRoute.js`
- `src/seeds/seedHoshimoriRoutes.js`
- `src/controllers/travelController.js`
- `src/routes/travelRoutes.js`
- `src/utils/auditCombatAdvanced.js`
- `src/utils/auditHoshimoriRoutes.js`
- `src/utils/auditWorldTick.js`
- scripts `seed:hoshimori-routes`, `audit:combat-advanced`, `audit:hoshimori-routes` y `audit:world-tick`

Endpoints nuevos protegidos por API key:

- `GET /api/combat/actions`
- `POST /api/combat/encounters/:encounterId/actions/preview`
- `GET /api/travel/routes`
- `GET /api/travel/routes/:routeId`
- `POST /api/travel/preview`
- `POST /api/world/tick/preview`

Contenido vivo sembrado por G18:

- 23 rutas de Hoshimori confirmadas en MongoDB.
- Rutas internas, urbanas, camino del molino, borde/zona media/profundidad del Bosque de los Susurros y Colinas Grises.
- Cada ruta tiene origen/destino, minutos base, tipo, peligro, terreno, bidireccionalidad, modificadores, source/tags y notas.

Cobertura G12:

- 9 acciones disponibles: `attack`, `defend`, `dodge`, `retreat`, `intimidate`, `use_item`, `cast_magic_preview`, `surrender`, `protect`.
- Los previews validan combate activo o fixture in-memory, vida/energia/saciedad/heridas, item requerido cuando aplica y coste esperado.
- Los previews no aplican dano, no cierran combate, no crean loot y no mutan `GameState`.

Cobertura G18:

- `previewTravel` calcula duracion, llegada esperada, riesgo y warnings sin mutar estado.
- Grulla Azul -> mercado: 15 min.
- Grulla Azul -> gremio: 20 min.
- Grulla Azul -> borde del Bosque de los Susurros: 90 min.
- Mal clima/lluvia leve exterior aplica +25% y redondea a multiplo de 5.
- No crea encuentros aleatorios.

Cobertura G14 base:

- `previewWorldTick` calcula rutinas NPC candidatas, misiones disponibles que vencerian, restock diario si cambia el dia, rumores candidatos, eventos activos que terminan y combates activos.
- No avanza por tiempo real.
- No crea rumores, romance, eventos grandes ni recompensas.
- No muta `GameState` ni colecciones en dryRun.

Resultado vivo tras ejecutar G12/G18/G14-base con `MONGODB_URI` y backend local apuntando a MongoDB vivo:

- `npm run check`: OK.
- `npm run seed:hoshimori-routes`: OK.
- `npm run audit:hoshimori-routes`: OK.
- `npm run audit:combat-advanced`: OK.
- `npm run audit:world-tick`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- MP actual sigue 200/200.
- `activeMissionIds` sigue vacio.
- Combates activos finales: 0.
- Rumores, relaciones romance, eventos y logs no cambiaron durante world tick preview.

## Actualizacion G13/G21/G22

Se agrego clima simple, tests de regresion y OpenAPI para GPT Actions:

- `src/models/WeatherState.js`
- `src/seeds/seedHoshimoriWeather.js`
- `src/services/weatherService.js`
- `src/controllers/weatherController.js`
- `src/routes/weatherRoutes.js`
- `src/utils/auditHoshimoriWeather.js`
- `src/tests/apiReadOnly.test.js`
- `src/tests/apiPreviews.test.js`
- `src/tests/apiTestClient.js`
- `docs/openapi-gpt-action.json`
- `src/utils/auditOpenApiCoverage.js`
- scripts `seed:hoshimori-weather`, `audit:hoshimori-weather`, `test`, `test:read-only`, `test:previews` y `audit:openapi`

Endpoints nuevos protegidos por API key:

- `GET /api/weather/current`
- `POST /api/weather/effects/preview`

Contenido vivo sembrado por G13:

- 1 estado de clima regional: `weather_hoshimori_d10_post_rain_mud`.
- Region: `region_hoshimori`.
- Condicion actual: `cloudy`, con barro residual y retraso menor de suministros.
- Efecto de ruta exterior fangosa: multiplicador de viaje 1.25.
- Warnings de visibilidad para bosque/colinas.
- Sin tormenta enorme, sin evento grande y sin mutar `GameState`.

Cobertura G21:

- `npm test` usa Node test runner nativo con concurrencia 1.
- Tests read-only: health, context, search DB/docs, NPC full, location full, shops/stock/items, missions board/detail, combat, travel, magic, weather y checkpoints.
- Tests preview/rechazo: jobs, reloj biologico, skill progression, practica magica, combate fixture, travel preview, weather preview, world tick preview, item inexistente y tiempo hacia atras.
- Los tests comparan snapshots canonicos antes/despues y verifican que los previews/rechazos no muten estado.

Cobertura G22:

- `docs/openapi-gpt-action.json` documenta endpoints de lectura/preview para context, search, NPC, location, turn apply, economy, missions, combat, travel, world tick preview, jobs, needs, progression, magic, weather y checkpoints.
- El schema usa `x-api-key` como `ApiKeyAuth`.
- No expone rollback ni mutadores peligrosos como aceptar/reportar misiones, iniciar combate, aplicar ronda de combate, expirar misiones o restock diario.
- `auditOpenApiCoverage.js` verifica 36 operaciones incluidas, exclusiones deliberadas y seguridad del schema.

Resultado vivo tras ejecutar G13/G21/G22 con `MONGODB_URI` y backend local apuntando a MongoDB vivo:

- `npm run check`: OK.
- `npm run seed:hoshimori-weather`: OK.
- `npm test`: OK, 10/10 subtests tras hardening posterior.
- `npm run smoke`: OK.
- `npm run audit:hoshimori-weather`: OK.
- `npm run audit:openapi`: OK.
- `npm run audit:coverage`: OK.
- `npm run audit:hoshimori-core`: OK.
- `npm run audit:hoshimori-social`: OK.
- `npm run audit:hoshimori-rumors`: OK.
- `npm run audit:hoshimori-economy`: OK.
- `npm run audit:hoshimori-missions`: OK.
- `npm run audit:hoshimori-jobs`: OK.
- `npm run audit:biological-clock`: OK.
- `npm run audit:skill-progression`: OK.
- `npm run audit:magic-basics`: OK.
- `npm run audit:hoshimori-routes`: OK.
- `npm run audit:combat-advanced`: OK.
- `npm run audit:world-tick`: OK.
- GameState sigue Dia 10, hora 12:00, ubicacion `loc_hoshimori_grulla_azul_comedor`.
- `moneyCopper` sigue 1470.
- MP actual sigue 200/200.
- `activeMissionIds` sigue vacio.
- Combates activos finales: 0.
- Weather/travel/world tick previews no mutaron estado.

## Actualizacion G23

Se agrego documentacion de cierre para validar el GPT personalizado en ChatGPT Builder sin tocar canon innecesariamente:

- `docs/gpt-builder-final-checklist.md`
- `docs/gpt-playtest-script.md`
- `docs/gpt-response-rubric.md`
- `src/utils/auditGptReadiness.js`
- script `audit:gpt-readiness`

Cobertura documental:

- Lista explicita de archivos para Knowledge: `docs/rules_engine.md` y `docs/world_bible.md`.
- Ubicacion donde pegar instrucciones comprimidas.
- Ubicacion donde importar `docs/openapi-gpt-action.json`.
- Configuracion de auth: API Key en header `x-api-key`.
- Lista de endpoints que no deben exponerse: rollback, admin peligroso y mutadores destructivos/no necesarios.
- Playtest separado entre lecturas sin mutacion, previews sin mutacion y mutaciones reales controladas solo con checkpoint previo y rollback manual externo.
- Rubrica de respuesta para formato, tono, estado, no invencion, previews y mutaciones ambiguas.

Cobertura tecnica:

- `audit:gpt-readiness` valida que existan OpenAPI, Knowledge docs, coverage map y docs G23.
- Valida que OpenAPI incluya endpoints criticos y excluya rollback.
- Consulta endpoints criticos read-only.
- Confirma estado vivo jugable, dinero 1470, MP 200/200 y combates activos 0 sin exigir volver a un checkpoint viejo si la partida ya avanzo.
- Imprime prompts sugeridos para GPT Builder Preview.

Estado G23:

- Documentacion y readiness tecnico quedan completos.
- La validacion final de UX requiere pruebas manuales en GPT Builder Preview usando `docs/gpt-playtest-script.md` y `docs/gpt-response-rubric.md`.

## Actualizacion hardening rollback/applyTurn

Se corrigieron dos fallos criticos detectados en partida real:

- Rollback a `checkpoint_d10_1200_1779723391623` devolvia HTTP 500 por un hook de `NpcRelationship` incompatible con la version actual de Mongoose (`next is not a function`).
- `applyTurn` podia avanzar tiempo/viaje sin coste biologico declarativo, sin ubicacion tecnica y con riesgo de mutacion parcial si fallaba `EventLog`.

Cambios aplicados:

- `NpcRelationship.pre("validate")` ya no depende de callback `next`.
- Rollback ahora prevalida `GameState` y colecciones del snapshot antes de borrar/restaurar.
- Rollback usa transaction cuando MongoDB la soporta y devuelve errores con `{ ok:false, error, details }` sin secretos.
- Checkpoints viejos que no tengan colecciones nuevas preservan esas colecciones en lugar de borrarlas.
- Checkpoints nuevos incluyen tambien knowledge magico, disciplinas, tecnicas, rutas y clima.
- `EventLog.source` acepta fuentes tecnicas: `system_correction`, `mechanical_audit`, `backend_validation`, `admin_fix`.
- `applyTurn` prevalida `EventLog` antes de tocar estado.
- `applyTurn` usa transaction para GameState, logs y patches soportados.
- `applyTurn` acepta `activityCost` y calcula saciedad/energia con `biologicalClockService`.
- `applyTurn` acepta `gameStatePatch.locationId` y valida que la location exista.
- `applyTurn` rechaza avances a hora exacta `:00` sin `activityCost`, `lucasPatch` o `biologicalCostExemptReason`.
- `previewTravel` devuelve `biologicalCostPreview` con categoria, minutos, deltas, estado actual/proyectado y si procesa en frontera horaria.
- `audit:checkpoint-rollback` prueba checkpoint oficial, mutacion controlada, rollback temporal y restauracion final canonica.

Evidencia:

- `npm test` OK: 10/10 subtests.
- `apiTurnHardening.test.js` confirma `previewTravel` La Grulla Azul -> Gremio 20 min desde 12:40 a 13:00 con coste -1 saciedad/-2 energia.
- `apiTurnHardening.test.js` confirma que `applyTurn` aplica `activityCost`, actualiza `locationId`, rechaza hora exacta sin coste/exencion y rechaza `EventLog.source` invalido sin mutar.
- `apiTurnHardening.test.js` confirma que `system_correction` es aceptado.
- `rollback` al checkpoint oficial funciona con el codigo local y deja estado canon intacto.

## Tabla de cobertura

Estados usados:

- `implemented_backend`: hay modelo/ruta/servicio funcional, no necesariamente todo el contenido.
- `seeded_mongodb`: hay datos confirmados vivos en MongoDB.
- `indexed_docs_only`: existe en docs indexados, pero no como entidad/sistema vivo.
- `partial`: existe parte del sistema, pero falta contenido o validacion critica.
- `missing`: no hay implementacion suficiente para que el backend lo sostenga.
- `future_optional`: conviene postergar hasta que el juego lo necesite.
- `completed-docs`: documentacion y checklist listos; validacion final es manual fuera del backend.

| Area / seccion | Fuente en docs | Representacion en repo | Representacion en MongoDB vivo | Estado | Evidencia | Proxima accion recomendada |
|---|---|---|---|---|---|---|
| Autoridad, regla madre y no inventar | `rules_engine.md` 0-3, 25 | Docs indexados, `context/full`, `search/db`, `search/docs`, `turn/apply` | API responde health/context/search | partial | Smoke OK; docs search OK; backend no fuerza todas las reglas narrativas | Mantener como instrucciones GPT + agregar validadores solo donde haya estado vivo |
| Formato obligatorio de respuesta | `rules_engine.md` 4 | No hay renderer/formato backend; solo docs | Indexado en docs | indexed_docs_only | No hay modelo/ruta de formato | Resolver en instrucciones GPT; no meter en MongoDB salvo logs/estado |
| Tiempo exacto y bloques | `rules_engine.md` 5 | `GameState.time`, `block`, `turnController.getBlockFromTime`, `worldTickService` preview; `applyTurn` exige coste biologico/exencion al llegar a `:00` | Dia 10 13:10, bloque Mediodia | partial | `audit:biological-clock` confirma tiempo vivo; `audit:world-tick` preview no muta estado; tests rechazan avance a hora exacta sin coste/exencion | G14 futuro: world tick apply real, avance de dia y reglas de cambio de dia integradas |
| Reloj biologico suavizado | `rules_engine.md` 6 | `GameState.biologicalClock.pendingAccumulations`, `biologicalClockService`, endpoint preview `/api/needs/activity-cost/preview`; `applyTurn.activityCost` acumula entre horas y procesa al llegar a `:00` | Pendiente formal vivo: 10 min `esfuerzo_fuerte` en bloque 13:00-14:00 | implemented_backend | `audit:biological-clock` OK; `audit:biological-accumulator` OK; tests confirman persistencia, procesamiento horario y no doble coste | Extender integracion a viaje real, turnos reales y world tick apply cuando existan esos mutadores |
| Vida, heridas y condiciones | `rules_engine.md` 7 | `GameState.lucasStatus`, `InjuryRecord`, heridas/condiciones, combate agrega heridas, treatment/recovery preview/apply | Sin heridas activas | partial | C13: `audit:combat-recovery` OK, recovery no restaura vida, bloquea sangrado activo y sincroniza resumen legacy de Lucas | Siguiente: enfermedad/infeccion, curanderos con coste real y recuperacion integrada al avance de tiempo |
| Comidas, raciones y contrato | `rules_engine.md` 8 | `Item`, `JobContract`, `seedHoshimoriJobs.js`, `jobService`, previews de turno | Alimentos base vivos; contrato activo de La Grulla Azul vivo con comidas de contrato | seeded_mongodb | G8: contrato `job_contract_lucas_grulla_azul_d10`, comida ligera +20/+2 y principal +30/+5; preview no muta GameState | G8 futuro: completar turno real con pago/comida y validaciones de ausencia |
| Dinero y comercio basico | `rules_engine.md` 9 | `Item`, `Shop`, `ShopStock`, `economyService`, `shopStockPatches`, `GET /api/economy/shops`, `GET /api/economy/items/:itemId` | 9 shops vivos, 36 items, 39 stocks | seeded_mongodb | `seed:hoshimori-economy` OK; `audit:hoshimori-economy` OK; Borin/Liora/Sella/Hilda/Merek consultables | G6 futuro/G16: venta transaccional, fiado profundo, precios variables sofisticados, bancos/deudas/impuestos |
| Bancos, deudas, alquileres, impuestos | `rules_engine.md` 9.7, `world_bible.md` 4.6 | No hay modelos especificos `Loan/Debt/Rental/Tax/BankAccount` | No confirmado vivo | future_optional | Solo docs y algunas facciones; sin endpoints | Postergar hasta G16 |
| Progresion de habilidades y EXP | `rules_engine.md` 10-13 | Skills embebidas en `GameState`; `skillProgressionService`; endpoint preview `/api/progression/skills/preview`; `turn/apply.skillPatch` usa el mismo validador de rango/categoria/multiplicadores y puede inferir duracion desde `timeAdvance` | Skills de Lucas vivas; previews G10 no mutantes | partial | `audit:skill-progression` OK: level-up, cambio de fase, Aqua solo magico, energia baja reduce EXP, estado intacto; tests de hardening rechazan `skillPatch` sin categoria/fuera de rango y cubren duracion inferida | Siguiente: agregar anti-farmeo real con historial diario mas granular |
| Magia, MP y practica | `rules_engine.md` 14; `world_bible.md` 1.4, 9.3 | MP, skills `skill_mana`/`skill_magia`, `knownSpells`, `MagicDiscipline`, `MagicTechnique`, `CharacterMagicKnowledge`, `magicService`, endpoints `/api/magic/*`, `turn/apply.magicPractice`, `turn/apply.magicPatches` | MP 200/200, `knownSpells: []`, 12 disciplinas G11, 7 tecnicas/plantillas G11, 0 hechizos avanzados aprendidos | partial | `seed:magic-basics` OK; `audit:magic-basics` OK; previews no mutan; `magicPractice` requiere tiempo/coste y puede consumir MP/EXP sin aprender hechizos; hardening cubre `unlock_skill`, bloqueo por requisitos y practica de chispa conocida | Siguiente: maestro/instructor profundo, catalogo de hechizos y reaccion social avanzada |
| Entrenamiento fisico, trabajo y viaje | `rules_engine.md` 15 | `JobContract`, `jobService`, previews de turnos; `TravelRoute`, `travelService`, travel preview; deltas por `turn/apply` | Trabajo actual formalizado como contrato G8; 23 rutas G18 vivas | partial | `audit:hoshimori-jobs` OK y `audit:hoshimori-routes` OK; previews no mutan | G8 futuro para completar turnos reales; G18 futuro para viaje real mutador |
| Combate narrativo con numeros | `rules_engine.md` 16; `world_bible.md` 16 | `EnemyTemplate`, `CombatEncounter`, `combatService`, `combatActionService`, rutas `/api/combat/*` | 5 enemigos vivos; 0 combates activos | partial | `audit:combat-advanced`, `audit:combat-playtest`, `audit:combat-balance`, `audit:combat-behavior` y `audit:combat-recovery` OK: backend resuelve acciones, bloqueo/esquiva, retirada, moral, heridas, armadura, evidencia, tipos de encuentro, decision NPC, recuperacion y `use_magic` conocido con MP/rolls backend | Siguiente: multiples enemigos, estados tacticos mas profundos y tablas de evidencia/loot por zona |
| Gremio, MG y misiones | `rules_engine.md` 17; `world_bible.md` 18 | `Mission`, `missionService`, rutas board/accept/report/expire; `turn/apply.missionPatch` soporta `accept/report/verify/complete/fail/expire` con recompensa idempotente | Misiones vivas con estados `available/expired/completed`; recompensas en dinero/items/MG formales al completar | implemented_backend | `audit:hoshimori-missions` OK; tests de hardening cubren accept/report, rechazo de complete sin `verified`, verify, complete con pago unico y reintento idempotente | G14-G15 futuro: cadenas, consecuencias/reputacion por faccion y resoluciones complejas de prueba |
| NPCs, conocimiento, escena viva | `rules_engine.md` 18; `world_bible.md` 11 | `Npc`, `NpcMemory`, `RoutineOverride`, `NpcRelationship`, `getNpcFull`; seeds core/social/rumors/emotions preparados | 25 NPCs de Hoshimori vivos; 4 memorias G4 vivas; rumores G5 distribuidos por NPC/location; C15 agrega emotionalProfile a los 25 NPCs; C17 prueba escenas representativas sin mutar canon | partial | `audit:hoshimori-core`, `audit:hoshimori-social`, `audit:hoshimori-rumors`, `audit:narrative-drama`, `audit:npc-emotions` y `audit:narrative-scene-playtest` | Ampliar memoria privada solo con canon verificable; no hacer NPCs omniscientes |
| Relaciones, confianza, romance | `rules_engine.md` 19; `world_bible.md` 12 | `relationshipWithLucas` en `Npc`; `NpcRelationship` para NPC-NPC con tono emocional/hints C15; `NpcSocialLedger` para caps diarios/antifarmeo; `socialProfileService` pondera personality/values/tolerates/rejects/socialProfile; `dailyEventSocialService` conecta eventos diarios con vinculos; `socialRelationshipStateService` deriva acceso/riesgos/bloqueos; lecturas en context/npc/search | 12 relaciones NPC-NPC base de Hoshimori vivas; vinculos Lucas-NPC con trust/familiarity/respect/affection/suspicion/fear/jealousy/socialDebt; contexto compacto expone perfil social, relationshipState, emotionalProfile, emotionalSubtext y scene.relationshipDynamics | partial | `audit:hoshimori-social`, `audit:npc-emotions`; tests de `previewSocialImpact`, perfil NPC, caps diarios, relationshipState y consecuencias sociales de eventos diarios | Mantener romance fuera hasta que haya canon explicito; ampliar tensiones/secretos solo por eventos |
| Rumores y propagacion | `rules_engine.md` 20.1; `world_bible.md` 17 | `Rumor` con `source`, `applyRumorPatches`, `seedHoshimoriRumors.js`, `auditHoshimoriRumors.js`; search/context consultan rumores | 8 rumores G5 activos vivos; contexto y busqueda los ven | seeded_mongodb | `seed:hoshimori-rumors` OK; `audit:hoshimori-rumors` OK; `context/full` muestra 4 rumores relevantes; `search/db?q=barro` y `search/db?q=Bosque` encuentran rumores | G5 avanzado/G14: propagacion por tick, distorsion gradual, expiracion y cambios por eventos |
| Reputacion y facciones | `rules_engine.md` 20.2-20.3; `world_bible.md` 10, 15 | `Faction`, links de NPC, reputacion con Lucas | 3 facciones aparecen con query amplia | partial | `/api/search/db?q=a` devuelve `factions=3` | G15: ley, testigos, acceso, sospecha |
| Inventario, propiedad y objetos | `rules_engine.md` 21 | Inventario en `GameState`, `Item`, validacion de item existente al agregar | Inventario Lucas vivo; 36 items G6 existen como catalogo base | partial | `audit:hoshimori-economy`: 36/36 items, sin objetos magicos comunes; `turn/apply` rechaza item inexistente al agregar | G17: durabilidad avanzada, crafting, recursos y reparacion profunda |
| Viaje, exploracion y zonas seguras | `rules_engine.md` 22; `world_bible.md` 7, 13 | `TravelRoute`, `travelService`, endpoints `/api/travel/routes` y `/api/travel/preview`; integracion read-only con `weatherService`; `biologicalCostPreview` | 23 rutas G18 vivas; travel preview funcional; clima actual puede modificar rutas exteriores | seeded_mongodb | `seed:hoshimori-routes` OK; `audit:hoshimori-routes` OK; test Grulla->Gremio desde 12:40 llega 13:00 con coste -1/-2; `audit:hoshimori-weather` OK: Camino del Molino con barro residual redondea a 35 min | G18 futuro: viaje real mutador completo y encuentros aleatorios avanzados |
| Pipeline de acciones complejas | `rules_engine.md` 23-24 | `turn/apply` procesa patches; no orquestador de pipeline | Patches funcionan si GPT los manda bien | partial | Endpoint existe, pero validacion semantica es incompleta | Mantener GPT como planificador, mover reglas criticas al backend |
| Hoshimori: ubicaciones principales | `world_bible.md` 6.3, 19 | `Location` model; seeds iniciales/world essentials; `seedHoshimoriCore.js` prepara 25 ubicaciones canonicas | 25/25 ubicaciones esperadas vivas | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing locations 0; GameState intacto | Mantener auditoria como regresion; G6/G7 pueden apoyarse en estas locations |
| Hoshimori: roster base 25 NPCs | `world_bible.md` 11 | `seedInitialState` tiene 4; `seedHoshimoriRoster` prepara 21 mas; `seedHoshimoriCore.js` consolida 25 NPCs con rutinas base | 25/25 NPCs esperados vivos | seeded_mongodb | `seed:hoshimori-core` OK y `audit:hoshimori-core` OK reportados; missing NPCs 0; Narek/Pavo/Borin/Liora aparecen en `search/db` | G4: relaciones NPC-NPC, memorias base y conocimiento no omnisciente |
| Hoshimori: red social base | `world_bible.md` 12 | `NpcRelationship`, `seedHoshimoriSocialGraph.js`, `auditHoshimoriSocialGraph.js` | 12/12 relaciones base y 4/4 memorias G4 vivas | seeded_mongodb | `seed:hoshimori-social` OK; `audit:hoshimori-social` OK; GameState Dia 10 12:00, dinero 1470, combates 0; rumores G4 0; romance 0 | Usar como base para G5 rumores; no agregar secretos/romance sin evento canon |
| Hoshimori: rumores base | `world_bible.md` 17, 19; `rules_engine.md` 20.1 | `Rumor`, `seedHoshimoriRumors.js`, `auditHoshimoriRumors.js`, `context/full`, `search/db` | 8/8 rumores base activos vivos | seeded_mongodb | Marcador G5 8/8; no `confirmed`; romance/secretos 0; no todos los NPCs conocen todo; GameState intacto | Implementar propagacion simple por avance de tiempo solo cuando exista world tick |
| Hoshimori: economia base | `rules_engine.md` 8-9, 21; `world_bible.md` 6, 19 | `Item`, `Shop`, `ShopStock`, `seedHoshimoriEconomy.js`, `auditHoshimoriEconomy.js`, endpoints read-only de shops/items | 36/36 items, 9/9 shops, 39/39 stock rows vivos | seeded_mongodb | `audit:hoshimori-economy`: stock no negativo, precios no negativos, owners/locations/factions OK, magia comun 0, GameState intacto | G7/G8 pueden consumir economia; G16 para bancos/deudas/impuestos |
| Hoshimori: cartelera inicial del gremio | `rules_engine.md` 17; `world_bible.md` 18-19 | `Mission`, `seedHoshimoriMissions.js`, `auditHoshimoriMissions.js`, filtros read-only por `riskLevel`/`sourceFactionId` en board | 11/11 misiones G7 vivas y disponibles | seeded_mongodb | Board API devuelve 11; detalle `mission_d10_grulla_delivery_guild` OK; no high/extreme, no romance/secretos/recompensas magicas; GameState y combates intactos | G8 puede apoyarse en encargos no combativos; G14/G15 para expiracion/consecuencias offscreen |
| Hoshimori: trabajo en La Grulla Azul | `rules_engine.md` 8, 15; `world_bible.md` 6, 11 | `JobContract`, `seedHoshimoriJobs.js`, `jobService`, `GET /api/jobs/contracts/active`, `GET /api/jobs/shifts/available`, `POST /api/jobs/shifts/:shiftId/preview`, `POST /api/jobs/shifts/:shiftId/complete` | 1 contrato activo vivo con 2 turnos | seeded_mongodb | `seed:hoshimori-jobs` OK; `audit:hoshimori-jobs` OK; `completeJobShift` aplica tiempo/pago/coste con ledger idempotente; comida de contrato solo si se envia `consumeIncludedMealIds` | Mantener EXP de skills separada via previewSkillProgression/applyTurn validado |
| Region cercana a Hoshimori | `world_bible.md` 13 | Docs indexados; locations core cercanas, enemy zones textuales y rutas G18 | Camino del Molino, molino, bosque y colinas base existen como locations core; rutas principales vivas | partial | `audit:hoshimori-core` OK para 25 locations; `audit:hoshimori-routes` OK para 23 rutas; faltan aldeas/granjas y rosters externos | G19 para regiones/rosters externos; G18 futuro para ruta regional larga |
| Regiones y ciudades mayores | `world_bible.md` 14 | Docs indexados | No entidades vivas confirmadas | future_optional | `search/docs` encuentra Valdoria; DB solo faccion Corona | G19 post-Hoshimori |
| Amenazas, fauna y monstruos | `world_bible.md` 16 | `EnemyTemplate`, `seedEnemyTemplates`, previews G12 de acciones contra fixtures | 5 enemigos vivos | seeded_mongodb | `search/db?q=lobo` devuelve 1 enemyTemplate; `/api/combat/enemies` devuelve 5; `audit:combat-behavior` valida bandido, jabali, lobo y sparring con conducta backend | Ampliar zonas/loot en C13/C14 sin loot automatico |
| Clima y eventos diarios | `world_bible.md` 8; `rules_engine.md` 5.4 | `WorldEvent`, `WeatherState`, `weatherService`, endpoints `/api/weather/current` y `/api/weather/effects/preview` | 1 WeatherState G13 vivo para Hoshimori; evento activo supply delay por barro | seeded_mongodb | `seed:hoshimori-weather` OK; `audit:hoshimori-weather` OK: condicion `cloudy`, barro residual +25% en rutas fangosas, GameState intacto | G13 futuro: pronostico, clima por tick, frio/calor y efectos mas profundos en rutinas/stock |
| Mundo offscreen / world tick | `rules_engine.md` 2.4; G14 implicito | `/api/world/sync-routines`; `worldTickService`; endpoint `/api/world/tick/preview` | Preview 12:00->14:00 calcula rutinas, misiones, restock, rumores, eventos y combates sin mutar | partial | `audit:world-tick` OK: 25 NPCs revisados, 0 misiones vencidas antes de 18:00, rumores/eventos/logs sin cambios, combates 0 | G14 futuro: apply real con transaccion, bloqueo por combate activo, integracion con `applyTurn` y checkpoints |
| Busqueda DB | `rules_engine.md` 3.2 | `/api/search/db` busca modelos principales | Funciona | implemented_backend | Queries Narek/lobo/a responden | Mantener; agregar resumen admin read-only si hace falta |
| Busqueda docs | `rules_engine.md` 3.2; ambos docs | `WorldDocumentIndex`, `seedDocuments`, `/api/search/docs` | Funciona con `romance` | seeded_mongodb | `search/docs?q=romance` devuelve 4 docs | Mantener seed docs alineado con archivos |
| Contexto completo | `rules_engine.md` 3.2 | `/api/context/full` junta estado, location, NPCs cercanos, shops, rumors, missions, factions, combat | Funciona y es de alcance cercano | implemented_backend | `context/full` devuelve 4 nearby NPCs y 4 rumores activos relevantes en Grulla | Documentar que no es roster completo |
| Checkpoints y rollback | `rules_engine.md` 3.4 | `Checkpoint`, rutas create/list/get/rollback; rollback transaccional con prevalidacion y compatibilidad con snapshots viejos | Checkpoints vivos; oficial `checkpoint_d10_1200_1779723391623` presente | implemented_backend | `npm test` y `audit:checkpoint-rollback` confirman rollback oficial y estado final canonico; colecciones nuevas ausentes se preservan | Mantener rollback fuera del OpenAPI normal; usarlo solo en auditorias/admin |
| Smoke test | README, `smokeTestRender.js` | `npm run smoke` cubre health/context/search/npc/location/economy/missions/jobs/needs/progression/magic/weather/travel/combat/world tick/checkpoints | Smoke OK contra backend local con DB viva para endpoints G8-G13/G18/G14-base | implemented_backend | Smoke ampliado con `/api/weather/current`, `/api/weather/effects/preview`, `/api/travel/routes`, `/api/combat/actions` y `/api/world/tick/preview` | Repetir remoto tras redeploy de Render |
| Tests automatizados | `rules_engine.md` 26 | Node test runner nativo; `src/tests/apiReadOnly.test.js`, `src/tests/apiPreviews.test.js`, `src/tests/apiTurnHardening.test.js`, `src/tests/apiBiologicalAccumulator.test.js`, `src/tests/apiTestClient.js` | Tests usan MongoDB vivo y `gameId` temporales para mutaciones controladas | implemented_backend | `npm test` OK: 32/32 subtests; cubre read-only, previews, scopes de API key, mission lifecycle, rechazo sin coste biologico, EventLog invalido atomico, source tecnico y acumuladores persistentes | Ampliar a pruebas transaccionales para compra/venta cuando exista mutador final seguro |
| OpenAPI / GPT Actions | `rules_engine.md` 26 | `docs/openapi-gpt-action.json`; `auditOpenApiCoverage.js`; script `audit:openapi` | No aplica como estado MongoDB; documenta API publica protegida | implemented_backend | `audit:openapi` OK: 36 operaciones incluidas, rollback/admin/mutadores peligrosos excluidos, `ApiKeyAuth` presente | G23: probar en GPT Builder Preview y ajustar instrucciones/formato |
| UX/formato final y GPT Builder | `rules_engine.md` 4, 25-26 | `gpt-builder-final-checklist.md`, `gpt-playtest-script.md`, `gpt-response-rubric.md`, `auditGptReadiness.js` | No aplica como entidad MongoDB; readiness verifica estado canon vivo | completed-docs | `audit:gpt-readiness` valida archivos, OpenAPI, endpoints criticos, estado canon y prompts sugeridos | Ejecutar pruebas manuales en GPT Builder Preview y corregir instrucciones si aparecen fallos de formato |
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

`Character`, `CharacterMagicKnowledge`, `Checkpoint`, `CombatEncounter`, `EnemyTemplate`, `EventLog`, `Faction`, `GameState`, `Item`, `JobContract`, `Location`, `MagicDiscipline`, `MagicTechnique`, `Mission`, `Npc`, `NpcMemory`, `NpcRelationship`, `RoutineOverride`, `Rumor`, `Shop`, `ShopStock`, `TravelRoute`, `WeatherState`, `WorldDocumentIndex`, `WorldEvent`.

Cambio G5: `Rumor` ahora incluye `source` para auditar seeds vivos sin depender solo de tags/texto.

Seeds existentes:

`seedInitialState.js`, `seedWorldEssentials.js`, `seedHoshimoriRoster.js`, `seedHoshimoriRoutines.js`, `seedHoshimoriCore.js`, `seedHoshimoriSocialGraph.js`, `seedHoshimoriRumors.js`, `seedHoshimoriEconomy.js`, `seedHoshimoriMissions.js`, `seedHoshimoriJobs.js`, `seedMagicBasics.js`, `seedHoshimoriRoutes.js`, `seedHoshimoriWeather.js`, `seedEnemyTemplates.js`, `seedDocuments.js`, mas scripts de limpieza/reparacion. En G1 no se ejecuto ningun seed; G2/G3/G4/G5/G6/G7/G8/G11/G13/G18 usaron seeds idempotentes.

Rutas existentes:

`/api/context/full`, `/api/turn/apply`, `/api/search/db`, `/api/search/docs`, `/api/npcs/:npcId/full`, `/api/locations/:locationId/full`, `/api/checkpoints`, `/api/world/sync-routines`, `/api/world/tick/preview`, `/api/economy/shops`, `/api/economy/shops/:shopId/stock`, `/api/economy/items/:itemId`, `/api/economy/restock-daily`, `/api/missions/*`, `/api/combat/*`, `/api/jobs/*`, `/api/needs/activity-cost/preview`, `/api/progression/skills/preview`, `/api/magic/*`, `/api/travel/*`, `/api/weather/*`.

G5 confirma que `context/full` trae rumores activos por ubicacion/NPC cercano y que `search/db` puede encontrarlos.

G6 confirma que shops principales e items basicos pueden consultarse por endpoints read-only.

G7 confirma que `GET /api/missions/board` y `GET /api/missions/:missionId` pueden consultar una cartelera inicial viva sin aceptar misiones. La cartelera se puede filtrar por `rank`, `locationId`, `riskLevel` y `sourceFactionId`.

G8-G10 confirman que jobs, needs y progression exponen endpoints read-only/dryRun. G11 confirma que magia expone catalogo y preview read-only. G12/G18/G14-base confirman acciones de combate, viaje y world tick en preview. G13 confirma clima consultable y preview de efectos. G23.2 confirma acumuladores biologicos persistentes en `turn/apply`. Todavia no hay mutador real de completar turno, practica magica real, viaje real, world tick apply ni integracion obligatoria de EXP en `turn/apply`.

Smoke test:

`src/utils/smokeTestRender.js` existe y cubre health, context, search, npc, location, economy, missions, detalle de mision estable, jobs, preview de necesidades, preview de skills, catalogo magico, clima, rutas de viaje, acciones de combate, world tick preview, combat y checkpoints. Fue ejecutado durante G1 y ampliado en G6/G7/G8-G13/G18/G14-base.

Readiness GPT Builder:

`src/utils/auditGptReadiness.js` valida archivos de Knowledge/docs/OpenAPI/G23, endpoints criticos, estado canon y prompts sugeridos para Preview. No muta estado.

Docs indexados:

`seedDocuments.js` indexa `docs/rules_engine.md` y `docs/world_bible.md` en `WorldDocumentIndex`. La API viva confirma busqueda por `/api/search/docs`.

OpenAPI:

`docs/openapi-gpt-action.json` existe y cubre endpoints de lectura/preview protegidos por `x-api-key`. El middleware acepta `API_KEY` legacy y puede separar `GAMEPLAY_API_KEY`, `ADMIN_READONLY_API_KEY` y `ADMIN_WRITE_API_KEY`; rollback/restock/combat real/sync y mutadores directos de misiones quedan bajo scope `admin-write`. `npm run audit:openapi` valida cobertura esperada, exclusiones deliberadas y seguridad.

G23.1 - GPT Actions hardening:

| Area / seccion | Fuente en docs | Representacion en repo | Representacion en MongoDB vivo | Estado | Evidencia | Proxima accion recomendada |
|---|---|---|---|---|---|---|
| Schema compacto GPT Builder | `docs/gpt-builder-final-checklist.md` | `docs/openapi-gpt-action-compact.json`, `audit:openapi-compact` | No aplica, schema documental | implemented_backend | Compact con hasta 30 operaciones, `missionPatch`, parches de economia/memoria y exclusiones peligrosas. | Pegar este schema, no el full, en GPT Builder normal. |
| Modo tecnico seguro | `docs/gpt-builder-final-checklist.md` | `docs/openapi-gpt-action-admin-extra.json` | Solo lectura contra endpoints extra de debug/admin | partial | Schema admin-extra opcional solo GET/read-only, sin operationIds duplicados con compact; incluye lectura directa de WorldEvents y `adminGetStateAudit`. | Mantener mutadores peligrosos fuera del narrador y dejar reparaciones para modo admin externo/Codex. |
| Matriz full vs compact | `docs/gpt-actions-operation-matrix.md` | Tabla comparativa full/compact con tipo y dominio | No aplica | implemented_backend | Documenta operaciones incluidas/excluidas y que misiones usan `applyTurn.missionPatch`. | Revisar en cada cambio de endpoints. |
| Misiones por applyTurn | `docs/openapi-gpt-action-compact.json` | `applyTurn.missionPatch` acepta `accept`, `report`, `verify`, `complete`, `fail` y `expire` dentro de transaccion | Mutacion real solo cuando GPT llama `applyTurn`; direct mission mutators quedan admin-write | implemented_backend | Tests cubren prueba requerida, verificacion, pago unico, limpieza de `activeMissionIds` y reintento idempotente. | Agregar reputacion/faccion avanzada cuando exista modelo formal. |
| Minutos biologicos estrictos | `rules_engine.md` reloj biologico | `activityCost.minutes` debe coincidir con `timeAdvance`, salvo exencion/override validado | Protege estado vivo contra coste duplicado o insuficiente | implemented_backend | Test rechaza mismatch sin mutar estado. | Mantener la regla en GPT instructions: usar previewTravel y copiar minutos/coste. |

G23.2 - Biological Accumulator Persistence Fix:

| Area / seccion | Fuente en docs | Representacion en repo | Representacion en MongoDB vivo | Estado | Evidencia | Proxima accion recomendada |
|---|---|---|---|---|---|---|
| Acumuladores biologicos persistentes | `rules_engine.md` reloj biologico estricto | `GameState.biologicalClock.pendingAccumulations`, `turnController.applyBiologicalClockForTurn`, `context/full` | Pendiente vivo `bioacc_log_1779761547269_izdlv6`: Dia 10, bloque 13:00-14:00, `esfuerzo_fuerte`, 10 min | implemented_backend | `audit:biological-accumulator` migro idempotentemente el EventLog oculto de la carrera y confirmo `contextPendingCount=1`. | Cuando el bloque cierre a 14:00, `applyTurn` debe procesarlo y marcarlo `processed`. |
| Procesamiento en hora exacta | `rules_engine.md` costes por hora | `applyTurn.activityCost` acumula entre horas y procesa pendientes al llegar a `:00` | No depende de recentEventLogs ni memoria de chat | implemented_backend | `apiBiologicalAccumulator.test.js` cubre comida 12:00->12:20, carrera 13:00->13:10, cierre 13:10->14:00, multiples actividades y no doble proceso. | Extender a turnos reales/travel real cuando existan mutadores finales. |
| OpenAPI compacto sin exceder limite | GPT Actions compact | `ActivityCostInput.processingMode=auto`, `sourceEventLogId`; hasta 30 operaciones | No aplica | implemented_backend | `audit:openapi-compact` OK dentro del limite de 30 operaciones. | Pegar schema compacto actualizado en GPT Builder. |

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

1. Usar `npm test`, `npm run audit:gpt-readiness`, `npm run audit:hoshimori-core`, `npm run audit:hoshimori-social`, `npm run audit:hoshimori-rumors`, `npm run audit:hoshimori-economy`, `npm run audit:hoshimori-missions`, `npm run audit:hoshimori-jobs`, `npm run audit:biological-clock`, `npm run audit:skill-progression`, `npm run audit:magic-basics`, `npm run audit:combat-advanced`, `npm run audit:combat-playtest`, `npm run audit:combat-balance`, `npm run audit:combat-behavior`, `npm run audit:hoshimori-routes`, `npm run audit:hoshimori-weather`, `npm run audit:world-tick` y `npm run audit:openapi` como regresiones.
2. Implementar completar turnos reales solo con validadores de horario, pago, comida, ausencia, EventLog y pruebas con rollback/checkpoint.
3. Extender el acumulador biologico persistente a viaje real, turnos reales y world tick apply cuando existan esos mutadores, manteniendo procesamiento solo en horas exactas `:00`.
4. Agregar anti-farmeo real de habilidades con historial diario y enlazar practica magica mutadora solo cuando tenga prerequisitos/efectos formalizados.
5. Implementar practica magica mutadora solo con validacion de MP, requisitos, EventLog, aprendizaje explicito y pruebas con rollback/checkpoint.
6. Implementar viaje real mutador solo con validacion de rutas, reloj biologico, hora/llegada, encuentros explicitamente controlados y checkpoint/rollback de test.
7. Implementar world tick apply real con transaccion, bloqueo por combate activo, expiracion de misiones y restock controlado.
8. Implementar venta/compra transaccional y fiado profundo solo cuando se disene el flujo de acciones economicas.
9. Implementar propagacion avanzada de rumores y expiracion/consecuencias de misiones dentro del world tick, no por tiempo real.
10. Probar `docs/openapi-gpt-action.json` en GPT Builder Preview con `docs/gpt-playtest-script.md` y puntuar respuestas con `docs/gpt-response-rubric.md`.
11. Convertir `auditLiveCoverage.js` en chequeo recurrente y, mas adelante, respaldarlo con `/api/admin/coverage-summary`.
