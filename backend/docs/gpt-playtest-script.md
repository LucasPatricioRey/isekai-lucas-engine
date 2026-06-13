# GPT Builder Playtest Script

Objetivo: probar el GPT personalizado en Preview sin romper canon. Las pruebas A y B no deben mutar estado. Las pruebas C solo se hacen con checkpoint previo y rollback manual externo.

## A. Lecturas in-game sin mutacion

Cada prompt debe resolverse con Actions read-only o Knowledge, sin `applyTurn`.

1. `Mostrame el estado actual de Lucas.`
2. `Busca informacion de Fern. Que sabe el backend sobre ella ahora?`
3. `Mostrame la cartelera del gremio de Hoshimori.`
4. `Mostrame rumores cercanos a la ubicacion actual de Lucas.`
5. `Mostrame el stock de Pavo.`
6. `Mostrame rutas disponibles desde La Grulla Azul.`
7. `Mostrame tecnicas magicas basicas seguras que Lucas podria practicar sin aprender un hechizo ofensivo real.`
8. `Mostrame el clima actual de Hoshimori y si afecta rutas cercanas.`

Resultado esperado:

- No cambia dia/hora/dinero/MP/inventario/misiones/combates.
- El GPT usa `getCompactContext` o `getCharacterState` antes de narrar estado vivo.
- El GPT no inventa NPCs presentes.
- El GPT distingue hechos vivos de rumores.
- El GPT no revela texto de `world_bible.md` como documento interno.

## B. Previews sin mutacion

Cada prompt debe usar endpoints preview/dryRun cuando existan y explicar que no aplica cambios reales.

1. `Lucas piensa si le conviene ir al mercado a comprar una racion normal. Evaluame la opcion sin moverlo todavia.`
2. `Previsualiza el viaje de La Grulla Azul al mercado.`
3. `Previsualiza una practica de respiracion de mana de 30 minutos.`
4. `Previsualiza el coste de entrenar moderado 1 hora.`
5. `Previsualiza el world tick de 12:00 a 14:00 sin aplicar cambios.`
6. `Previsualiza una accion de combate. Si no hay encuentro activo, decime claramente que no hay combate activo.`

Resultado esperado:

- No llama mutadores reales.
- No avanza hora real de partida.
- No cambia MP/EXP/dinero/inventario.
- No crea encuentros ni loot.
- Si no hay combate activo, no inventa uno.

## C. Mutaciones reales controladas, solo con checkpoint previo

Estas pruebas no son para el GPT normal sin supervision. Hacerlas solo si se acepta tocar estado temporalmente y existe rollback manual externo preparado.

Preparacion:

1. Crear checkpoint test con una herramienta externa/admin, no desde el GPT normal.
2. Anotar checkpointId.
3. Ejecutar una sola mutacion.
4. Verificar resultado.
5. Hacer rollback manual externo al checkpoint test.
6. Confirmar que el estado canon vuelve exactamente al snapshot anotado antes de la prueba.

Pruebas controladas:

1. `Acepta una mision simple de Porcelana.`
2. `Compra una racion normal a Pavo.`
3. `Almuerza una comida de contrato en La Grulla Azul.`

Resultado esperado:

- El GPT pregunta antes de una mutacion ambigua.
- No hace varias mutaciones mezcladas.
- No entrega recompensa sin prueba.
- No genera EXP/loot inventado.
- Rollback manual externo deja el canon intacto.

## D. C17 playtest narrativo sin mutar canon

Objetivo: comprobar que el GPT narra con mas tension, dialogo vivo y HUD final usando los datos compactos del backend. Estas pruebas empiezan con lectura de contexto y no deben mutar estado salvo que el usuario confirme una accion real.

Antes de probar en GPT Builder Preview, correr en local:

```bash
npm run audit:narrative-scene-playtest
```

Ese audit arma cuatro escenas representativas en memoria, sin tocar MongoDB: entrenamiento con Eddan, cierre de La Grulla Azul, reporte/tramite en gremio y escena solitaria de Lucas cansado.

Prompts manuales recomendados:

1. `Lucas le pide a Eddan seguir practicando daga, pero quiere que lo corrija de verdad y sin sparring real.`
2. `Lucas vuelve al comedor de La Grulla Azul al cierre y le pregunta a Yara si necesita ayuda, con Roberto y Fern cerca.`
3. `Lucas pregunta a Garrick y Mara por el estado del registro y por el mechon gris reportado del borde del bosque.`
4. `Lucas se queda solo en su habitacion al final del dia, cansado, con el asunto del bosque todavia abierto.`

Resultado esperado:

- La escena abre con un anzuelo concreto: objeto, gesto, sonido, cuerpo o interrupcion.
- Los NPCs no responden con una sola frase pobre en entrenamiento, pedido directo, conflicto o decision.
- Cada NPC conserva voz propia segun `dialogueProfile`, `emotionalProfile`, confianza, tarea y conocimiento.
- En grupo, los NPCs reaccionan tambien entre ellos: miradas, interrupciones, mediaciones, silencios o roces.
- En escenas sin NPC, el interes sale del cuerpo de Lucas, el lugar, el clima, objetivos abiertos y tension pendiente.
- El HUD sigue al final y no desaparece.
- No se inventan EXP, loot, dinero, cierre de evento, heridas, romance, resultados de combate ni presencia de NPCs.

## Checklist posterior a cada bloque

Preguntar al GPT:

```text
Confirmame el estado actual exacto de Lucas y si hubo alguna mutacion aplicada.
```

Debe responder con:

- Dia y hora exactos.
- Ubicacion exacta.
- Dinero en oro/plata/cobre.
- HP/MP/saciedad/energia si corresponde.
- Misiones activas.
- Combates activos.
- Si el bloque fue preview/read-only, debe decir que no mutó estado.
