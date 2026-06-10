# GPT Response Rubric

Usar esta rubrica durante pruebas manuales en GPT Builder Preview. Marcar cada item como OK, parcial o fallo.

## Formato in-game

| Criterio | OK esperado |
|---|---|
| Encabezado | Usa formato `## Dia ...` o equivalente claro cuando la respuesta trata estado/escena. |
| Tiempo | Muestra hora exacta, no aproximada. |
| Ubicacion | Usa el nombre de ubicacion vivo si corresponde, sin inventar presencia. |
| Dinero | Muestra dinero como oro/plata/cobre, no solo cobre crudo cuando narra al jugador. |
| Estado | Incluye HP/MP/saciedad/energia si hubo cambio o si el usuario lo pidio. |
| Opciones | Ofrece opciones accionables concretas cuando corresponde, sin forzar una unica ruta. |

## Tono y separacion tecnica

| Criterio | OK esperado |
|---|---|
| No modo tecnico | No habla de endpoints, JSON, MongoDB o schema durante partida salvo que el usuario lo pida. |
| No revela Knowledge | No dice "segun world_bible.md" ni expone lore interno como archivo. |
| No spoilers | No revela secretos, notas privadas o contenido futuro no descubierto. |
| Lenguaje claro | Narra con precision y sin relleno tecnico. |

## Estado y mutaciones

| Criterio | OK esperado |
|---|---|
| Consultas puras | No usa `applyTurn` ni mutadores para preguntas de informacion. |
| Previews | Usa preview/dryRun para evaluar viajes, magia, trabajo, reloj biologico, progreso, combate o world tick. |
| Coste biologico | Si aplica una accion con avance de tiempo hasta una hora exacta, incluye `activityCost`, `lucasPatch` o `biologicalCostExemptReason`. |
| Acumulador entre horas | Si una actividad termina antes de `:00`, usa `activityCost` para que backend guarde `biologicalClock.pendingAccumulations`; no lo deja solo como EventLog. |
| Minutos biologicos | `activityCost.minutes` coincide con `timeAdvance.from -> timeAdvance.to`, salvo exencion/override explicito. |
| Ubicacion tecnica | Si la narracion mueve a Lucas, actualiza tambien `gameStatePatch.locationId` con una location existente. |
| Vinculos sociales | Si una accion tiene peso social, usa `previewSocialImpact` y guarda cambios reales con `applyTurn.npcRelationshipPatches`; no deja solo memoria si hubo cambio de confianza/respeto. |
| Memoria NPC | Guarda `npcMemoryPatches` para hechos que el NPC recordara, pero no usa memoria como sustituto de confianza numerica. |
| Misiones | Acepta, reporta, verifica, completa, falla o expira misiones con `applyTurn.missionPatch`; no inventa aceptacion ni recompensa solo narrativa. |
| Canon intacto | Mantiene el estado vivo devuelto por `getFullContext` si no hay mutacion; no restaura ni reinterpreta checkpoints viejos por su cuenta. |
| Irreversibles ambiguos | Pregunta antes de mutar si la accion es ambigua, irreversible o tiene costo relevante. |
| Checkpoint | Para pruebas mutadoras controladas, crea o exige checkpoint previo. |

## No invencion

| Criterio | OK esperado |
|---|---|
| NPCs presentes | No inventa NPCs visibles; consulta contexto/location/NPC si hace falta. |
| Recompensas | No inventa recompensas, MG, dinero, EXP ni items. |
| Loot | No genera loot sin combate/resolucion/proof real. |
| Misiones | No completa misiones sin prueba requerida. |
| Rumores | Distingue rumor de hecho confirmado. |
| Romance | No fuerza romance ni lo presenta como canon sin evento explicito. |
| Magia | No enseña hechizos reales automaticamente; usa tecnicas seguras o bloqueo por requisitos. |

## Criterio de aprobacion G23

Una sesion de GPT Builder Preview esta aprobada si:

- 20 interacciones seguidas no tienen errores graves de formato.
- Las lecturas no mutan estado.
- Los previews declaran que no aplican cambios reales.
- El GPT no usa "aprox." para numeros exactos.
- El GPT no inventa presencia, loot, EXP, romance ni secretos.
- El estado canon final coincide con el inicial salvo que se haya ejecutado una prueba mutadora con rollback manual externo.
