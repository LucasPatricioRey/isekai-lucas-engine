# rules_engine.md — Motor Isekai Lucas

Versión: Fase C17 v1.0 — playtest narrativo representativo, perfiles emocionales NPC y HUD obligatorio
Estado: versión validada por Lucas mediante revisión guiada  
Fuente de migración: Enciclopedia V2 Isekai Lucas + decisiones confirmadas por Lucas durante Fase 1 + validación guiada Fase 2  
Propósito: este archivo define **cómo se resuelve el juego**. No contiene el save vivo completo ni el lore mundial extenso; eso vive en MongoDB y `world_bible.md`.

Actualización v0.3: agrega sistema social ampliado, formato obligatorio de diálogo NPC y libertad creativa controlada para NPCs según personalidad, memoria y conocimiento.
Actualización C9: el contexto compacto normal usa perfiles de proyección, oculta fixtures `testSuite` del canon, expone auditoría read-only `auditState` para modo técnico y formaliza que los archivos de conocimiento del GPT son guía estable, no save vivo.
Actualización C10: agrega auditoria mutante controlada `audit:combat-playtest` sobre `GameState` temporal para verificar sparring, amenaza menor, bloqueo/esquiva, moral enemiga, retirada de Lucas, herida leve/tratamiento y evidencia post-combate sin loot inventado.
Actualización C11: agrega `audit:combat-balance`, suaviza el escalado de críticos, aplica modificadores de arma/equipo defensivo y formaliza chaleco de cuero ligero/escudo simple como equipo común limitado.
Actualización C12: agrega tipos formales de encuentro (`encounterType`), `encounterPolicy`, decision NPC persistida y `audit:combat-behavior` para validar que bandidos, depredadores, criaturas territoriales y sparring actuen por backend.
Actualizacion C13: agrega recuperacion formal de heridas (`combatAdvancedPreviewRecovery`/`combatAdvancedApplyRecovery`), progreso en `InjuryRecord`, bloqueo por sangrado activo y `audit:combat-recovery`.
Actualizacion C14: agrega `dramaticContext` y `dialogueProfile` en contexto compacto para guiar escena novelada, subtexto, voz por NPC, dinamica de grupo y contrato de HUD final sin inventar mecanicas.
Actualizacion C15: agrega `Npc.emotionalProfile`, subtexto emocional en `dialogueProfile`, `scene.relationshipDynamics` para relaciones NPC-NPC cercanas y `audit:npc-emotions`.
Actualizacion C15.1: endurece dialogo NPC para evitar frases minimas pobres y sube rangos base de fundamentos tecnicos de combate de 30 min en habilidades principiantes.
Actualizacion C16: agrega direccion emocional de escena (`dramaticContext.emotionalScene`) y rol dramatico por NPC (`dialogueProfile.dramaticRole`) para sostener anzuelo, mascara, presion, grieta visible y salida sin inventar mecanicas.
Actualizacion C17: agrega `audit:narrative-scene-playtest` para validar, sin mutar canon, entrenamiento con Eddan, escena grupal en La Grulla Azul, tramite/reporte en gremio y escena solitaria de cansancio; las anclas sensoriales distinguen patio, gremio administrativo y habitacion privada.

---

## 0. Regla madre

**La IA interpreta y narra. El backend/motor valida y guarda. MongoDB manda sobre el estado vivo.**

La narración nunca puede regalar resultados mecánicos. La épica no puede superar las reglas, el estado vivo, la lógica del mundo ni las fuentes de conocimiento de los NPCs.

Prohibido inventar sin base:

- dinero;
- EXP;
- MG del gremio;
- loot;
- recompensas;
- contratos;
- misiones activas;
- NPCs nombrados presentes;
- romance;
- objetos mágicos;
- consecuencias mecánicas;
- conocimiento secreto de NPCs;
- curaciones, daños, permisos o recursos no existentes.

Si falta una regla y cambia mucho el resultado, se pregunta. Si la duda es menor, se resuelve de forma conservadora y se deja `Alertas del sistema`.

---

## 1. Jerarquía de autoridad

Cuando haya contradicción, se usa este orden:

1. MongoDB / save vivo actual.
2. Confirmación explícita reciente de Lucas.
3. Reglas anti-conflicto de este archivo.
4. Mecánicas específicas de este archivo.
5. `world_bible.md`.
6. Historial importado y registros viejos.
7. Intuición narrativa.

Reglas especiales:

- El save vivo gana sobre cualquier resumen anterior.
- La regla más específica gana sobre la general.
- Seguridad, consentimiento, propiedad y coherencia ganan sobre recompensa o conveniencia narrativa.
- Consecuencia lógica gana sobre épica fácil.
- Confirmaciones nuevas de Lucas pueden reemplazar límites viejos.

---

## 2. Modo de juego y tono

### 2.1 Entrada del jugador

Lucas puede escribir libremente en lenguaje natural. El sistema debe interpretar intención, separar acciones, detectar objetivos, identificar NPCs involucrados y validar antes de narrar.

No se sugieren opciones al final de cada escena por defecto.

### 2.2 Azar

Usar azar suave solo cuando haya incertidumbre real:

- percepción dudosa;
- riesgo social;
- combate;
- clima;
- encuentros;
- resultados no deterministas;
- rumores;
- reacciones de NPCs con duda real.

No usar azar para quitarle control lógico al jugador ni para inventar tragedias grandes sin base.

### 2.3 Riesgo

Dificultad objetivo: **realista suave**.

Las malas decisiones pueden traer consecuencias, heridas, pérdidas o muerte si las reglas lo justifican. El mundo no debe ser sádico ni castigar cada error chico con brutalidad.

### 2.4 Mundo offscreen

El mundo avanza por **tiempo de partida**, no por tiempo real. Si Lucas no juega durante dos días reales, el mundo no avanza solo.

NPCs, clima, rutinas, rumores, stock, misiones y eventos pueden avanzar aunque Lucas no los mire, pero solo cuando el tiempo de partida avanza y con causalidad lógica.

Prohibido inventar offscreen:

- eventos enormes sin causa;
- tragedias arbitrarias;
- romances no jugados;
- recompensas o misiones resueltas por conveniencia;
- NPCs apareciendo cerca de Lucas “porque sí”.

---

## 3. Backend, MongoDB y lectura de contexto

### 3.1 Fuente viva

MongoDB guarda todo lo dinámico:

- estado de Lucas;
- dinero en cobre total;
- inventario;
- EXP y habilidades;
- heridas y condiciones;
- ubicación y hora;
- eventos activos;
- misiones activas/expiradas/completadas;
- NPCs preparados;
- memoria NPC;
- rumores;
- facciones y reputación;
- stock de comercios;
- estado de ubicaciones;
- checkpoints y rollback.

`rules_engine.md` define cómo resolver. `world_bible.md` define qué existe. MongoDB define qué cambió.

### 3.2 Contexto por turno

Antes de resolver un turno, el GPT debe leer el backend.

Endpoint normal recomendado:

```txt
GET /api/context/compact
```

`context/compact` debe usar `profile=player_scene` por defecto. Para chequeos técnicos se puede usar `profile=mechanical_turn`, `profile=minimal_header` o `includeTechnicalSummary=true`; `context/full` queda para modo técnico/admin cuando el compacto no alcanza.

Debe devolver un contexto dinámico suficiente y estructurado:

- estado resumido de Lucas;
- ubicación actual;
- estado de la zona actual;
- NPCs visibles, audibles, probables y ausentes relevantes;
- rutinas activas;
- memorias relevantes de NPCs involucrados;
- rumores vivos relevantes;
- eventos principales, rumores menores y eventos de fondo separados;
- stock y comercios relevantes;
- misiones relevantes;
- facciones y reputación;
- alertas de coherencia.

El contexto de partida normal no debe exponer fixtures `flags.testSuite === true` ni tags técnicos como `admin_fix`, `repair`, `test` o `former_*`. Si aparecen en modo técnico, no son conocimiento diegético.

Si `context/full` no trae la información necesaria, el GPT no debe inventar. Debe buscar más con endpoints profundos:

```txt
GET /api/docs/search?q=...
GET /api/world/search?q=...
GET /api/db/search?q=...
GET /api/npcs/:id/full
GET /api/locations/:id/full
```

Si aun así falta un dato importante, se pregunta.

### 3.3 Escritura automática

El GPT puede guardar automáticamente si la acción es clara y el backend valida.

Acciones graves o irreversibles:

- muerte;
- mutilación;
- crimen grave;
- deuda enorme;
- abandonar ciudad durante mucho tiempo;
- destruir un vínculo importante;
- romper propiedad ajena importante;
- exponerse a peligro letal.

Si la intención de Lucas es clara, se aplica. Si hay ambigüedad real, se pregunta antes.

### 3.4 Checkpoints y rollback

Guardar checkpoints cuando:

- cambia el día;
- termina una escena larga;
- cambia ubicación mayor;
- hay combate;
- hay cambio importante de dinero/inventario/EXP;
- se crea/termina misión;
- un NPC aprende algo importante;
- cambia una relación/reputación;
- cambia estado de una ubicación;
- hay herida, muerte o consecuencia fuerte.

Cada checkpoint debe permitir volver atrás sin depender de la memoria del chat.

---

## 4. Formato obligatorio de respuesta

La narración puede variar. El bloque mecánico no.

### 4.1 Encabezado obligatorio

Si pasó tiempo:

```md
## Día [número]—[HH:MM anterior]→[HH:MM actual]
**Ubicación:** [ubicación exacta]
```

Si no pasó tiempo:

```md
## Día [número]—[HH:MM actual]
**Ubicación:** [ubicación exacta]
```

Nunca usar en estado final:

- `aprox.`;
- `cerca de`;
- `alrededor de`;
- `más o menos`;
- horarios narrativos no exactos.

### 4.2 Orden obligatorio

1. Encabezado de escena.
2. Narración.
3. `### Cambios relevantes`, solo si hubo cambios.
4. `## Estado actual`, siempre.
5. `### Alertas del sistema`, solo si corresponde.

### 4.3 Plantilla cuando hay actualización

```md
## Día [n]—[HH:MM anterior]→[HH:MM actual]
**Ubicación:** [ubicación exacta]

[Narración]

### Cambios relevantes

**Tiempo:** [HH:MM anterior]→[HH:MM actual]
**Actividad:** [actividad resuelta]
**Coste aplicado:** saciedad [±X], energía [±Y]

**Estado físico:**
Saciedad [antes]/100→[después]/100
Energía [antes]/100→[después]/100

**Progreso obtenido:**
[Habilidad] [fase abreviada].[nivel] [antes]/[req]→[después]/[req] ([+X])

**Subida de nivel/fase:** [sí/no].
**Motivo:** [motivo mecánico breve]

## Estado actual
**Día:** [contador]—[fecha diegética]
**Bloque:** [bloque]
**Hora:** [HH:MM exacto]
**Ubicación:** [ubicación exacta]
**Vida:** [actual]/[máximo]
**Saciedad:** [actual]/[máximo]—[estado]
**Energía:** [actual]/[máximo]—[estado]
**MP:** [actual]/[máximo]
**Dinero:** [X oro, Y plata, Z cobre]
**Evento activo:** [evento o ninguno]
**Situación:** [resumen corto]
**NPCs visibles/cerca:** [lista exacta/lógica]

### Alertas del sistema
[solo si corresponde]
```

### 4.4 Campos opcionales

Agregar solo si cambiaron o son relevantes:

- Inventario;
- EXP;
- confianza;
- reputación;
- misiones;
- heridas;
- condiciones especiales;
- estado mágico;
- acumulador biológico;
- equipo;
- rumores;
- memoria NPC.

Cada campo opcional debe tener motivo.


### 4.5 Formato obligatorio de diálogo NPC

Cuando un NPC hable de forma directa, debe aparecer su nombre o rol antes del mensaje:

```md
Fern: "..."
Roberto: "..."
Yara: "..."
Guardia: "..."
```

Reglas:

- Usar el nombre propio si el NPC es nombrado/persistente y Lucas lo conoce.
- Usar rol simple si es genérico o Lucas no conoce su nombre: `Cliente: "..."`, `Guardia: "..."`, `Vendedora: "..."`.
- No usar guion largo como formato principal para diálogo directo de NPC.
- El texto hablado va entre comillas.
- Si el NPC interrumpe, duda o habla poco, mantener el mismo formato.
- La narración alrededor del diálogo puede describir gestos, silencios, miradas, postura o tono.
- Este formato no autoriza al NPC a revelar secretos ni conocimiento que no tenga.

Ejemplo:

```md
Fern: "No hagas eso aquí."

Fern baja apenas la mirada hacia tus manos, más preocupada por el control del maná que por regañarte.
```

---

## 5. Tiempo exacto y bloques del día

### 5.1 Regla central

Toda acción resuelta termina en una hora exacta `HH:MM`.

Unidad mínima normal: 5 minutos.

Acciones instantáneas o muy breves pueden consumir 0 minutos si no cambian escena ni estado.

Si una acción dura 1–4 minutos y tiene efecto narrativo/social, redondear a 5 minutos.

### 5.2 Prioridad para determinar duración

1. Duración explícita del usuario.
2. Duración fija de regla, misión, ruta o turno.
3. Rutina de NPC u horario de escena.
4. Tabla de duraciones.
5. Si la duda cambia consecuencias importantes, preguntar.
6. Si la duda es menor, usar valor conservador exacto.

### 5.3 Bloques oficiales

| Bloque | Horario |
|---|---:|
| Madrugada | 00:00–06:00 |
| Mañana | 06:00–12:00 |
| Mediodía | 12:00–14:00 |
| Tarde | 14:00–18:00 |
| Noche | 18:00–00:00 |

El estado final siempre muestra el bloque según la hora exacta.

### 5.4 Eventos diarios

Eventos random suaves pueden usarse como semillas menores.

Eventos importantes requieren causa lógica:

- clima;
- facción;
- economía;
- misión;
- rumor;
- rutina;
- acción previa de Lucas;
- tensión política o local.

Mientras haya un evento activo importante, no generar otro enorme por azar.

---

## 6. Reloj biológico suavizado

### 6.1 Regla central

Saciedad y energía por actividad se procesan solo cuando el reloj llega a una hora exacta con minutos `:00`.

Ejemplos procesables:

- 07:00;
- 08:00;
- 14:00;
- 21:00.

Ejemplos no procesables:

- 20:30;
- 20:50;
- 21:20.

Si una escena termina entre horas exactas, guardar acumulador del bloque horario activo. El acumulador pendiente debe persistir en MongoDB/backend como estado mecánico formal, no solo como texto narrativo ni solo como `eventLog`.

### 6.2 Bonos directos

Aplican inmediatamente, aunque no sea hora exacta:

- comida;
- bebida con efecto;
- poción;
- curación;
- daño;
- coste de MP;
- recuperación especial.

El bono directo no reemplaza el acumulador de actividad. Si una comida, descanso o actividad social consume tiempo y termina antes de `:00`, el bonus directo se aplica ahora, pero el tiempo de actividad queda pendiente hasta cerrar el bloque horario.

### 6.3 Costes suavizados por hora

Estos valores reemplazan la versión más dura anterior. Mantienen el sistema, pero reducen costes aproximadamente 25–35%.

| Categoría | Saciedad/h | Energía/h |
|---|---:|---:|
| Sueño profundo | -1 | +12 |
| Dormir incómodo/interrumpido | -1 | +8 |
| Descanso acostado | -2 | +6 |
| Descanso sentado | -2 | +4 |
| Charla tranquila | -2 | +1 |
| Comer tranquilo | -2 | +2 |
| Descanso general | -2 | +4 |
| Actividad normal | -3 | -4 |
| Trabajo normal | -3 | -6 |
| Viaje/caminata suave | -3 | -5 |
| Esfuerzo fuerte | -7 | -11 |
| Trabajo fuerte | -7 | -11 |
| Entreno moderado | -5 | -8 |
| Entreno intenso | -8 | -14 |

### 6.4 Redondeo

Cálculo por bloque cerrado:

```txt
cambio = suma((minutos_categoria / 60) × valor_categoria_por_hora)
```

Redondeo matemático normal:

- +0.5 o más → +1;
- -0.5 o menos → -1;
- valores menores a 0.5 pueden quedar en 0.

### 6.5 Estados de saciedad

| Saciedad | Estado |
|---:|---|
| 71–100 | sin hambre / satisfecho |
| 51–70 | hambre leve |
| 21–50 | hambre fuerte |
| 1–20 | debilidad / mareos |
| 0 | inanición / riesgo de vida |

Saciedad baja afecta concentración y rendimiento si la acción se sostiene.

### 6.6 Estados de energía

| Energía | Efecto |
|---:|---|
| 70–100 | rendimiento normal, EXP ×1.0 |
| 40–69 | rendimiento leve reducido, EXP ×0.9 |
| 20–39 | cansancio serio, EXP ×0.6 y más riesgo |
| 1–19 | agotamiento peligroso, EXP ×0.25 |
| 0 | colapso, no puede trabajar/entrenar normalmente |

Sobrefatiga física:

- Energía < 30: coste físico ×1.25.
- Energía < 15: coste físico ×1.5.

---

## 7. Vida, heridas y condiciones especiales

### 7.1 Vida

Vida representa integridad general. No debe bajar por cansancio normal salvo inanición, heridas, daño, enfermedad especial o efectos graves.

### 7.2 Heridas localizadas

Usar heridas por zona cuando corresponda:

- cabeza;
- rostro;
- cuello;
- torso;
- espalda;
- brazo derecho;
- brazo izquierdo;
- mano derecha;
- mano izquierda;
- pierna derecha;
- pierna izquierda;
- pie derecho;
- pie izquierdo.

Grados sugeridos:

| Grado | Descripción | Efecto |
|---|---|---|
| leve | golpe, corte menor, torcedura leve | molestia, penalización narrativa o pequeña |
| moderada | corte serio, esguince, contusión fuerte | penaliza acciones de esa zona |
| grave | fractura, sangrado fuerte, lesión profunda | riesgo alto, requiere atención |
| crítica | daño potencialmente mortal o incapacitante | vida en riesgo, acción limitada |

No convertir sufrimiento en farmeo eficiente. Vitalidad puede subir por soportar daño real, pero con riesgo proporcional.

### 7.3 Condiciones especiales

No existe sistema regular de enfermedades. Usar `condiciones especiales` solo si hay causa clara:

- veneno;
- maldición;
- quemadura;
- sangrado;
- agotamiento extremo;
- frío severo;
- calor extremo;
- intoxicación;
- efecto mágico externo.

---

## 8. Comidas, raciones y contrato

### 8.1 Regla central

Comida = bonus directo inmediato + tiempo acumulado como `comer tranquilo` si corresponde.

No superar 100 de saciedad o energía.

### 8.2 Valores base

| Comida | Precio | Saciedad | Energía | Tiempo |
|---|---:|---:|---:|---:|
| Agua/infusión | 2–5c | 0 | 0 | 5 min |
| Pan/fruta | 3–6c | variable menor | 0/+1 | 5–10 min |
| Sopa simple | 10–15c | +10/+15 | +1 | 10–15 min |
| Ración pequeña | 20c | +15 | +1 | 5–10 min |
| Ración normal | 40c | +35 | +2 | 10–15 min |
| Comida simple/ligera | 20c | +20 | +2 | 10–15 min |
| Comida normal | 35c | +30 | +5 | 20 min |
| Comida abundante | 50c | +45 | +6 | 25–30 min |
| Comida buena/completa | 65c | +40 | +8 | 25–30 min |

Comida buena vale por calidad, sabor y valor social. No da bonus mágico.

### 8.3 Comida de contrato en La Grulla Azul

- Desayuno/comida ligera: +20 saciedad, +2 energía, coste 0.
- Almuerzo/cena principal: +30 saciedad, +5 energía, coste 0.
- No consume raciones personales.
- No superar máximos.

---

## 9. Dinero, economía y comercio

### 9.1 Moneda

Conversión visible:

```txt
100 cobre = 1 plata
100 plata = 1 oro
```

En MongoDB se guarda como cobre total.

Ejemplo:

```txt
0 oro, 14 plata, 70 cobre = 1470 cobre
```

Mostrar siempre como:

```txt
X oro, Y plata, Z cobre
```

### 9.2 Precios y variación

Los precios base de Hoshimori/región rural pueden variar ±20% por:

- calidad;
- lugar;
- escasez;
- clima;
- regateo;
- urgencia;
- reputación lógica;
- oferta/demanda;
- stock real.

Si la variación cambia mucho la decisión, preguntar o dejar alerta.

### 9.3 Salarios de referencia

| Trabajo | Pago diario aproximado |
|---|---:|
| Subsistencia con comida/techo | 20–60c |
| Peón rural común | 60–90c |
| Posada/mercado común | 80–120c |
| Trabajo bueno/exigente con comidas | 120–170c |
| La Grulla Azul | 140c + comidas |
| Aprendiz artesano | 70–130c |
| Artesano/curandero/escriba | 150–350c |
| Guardia local | 150–300c |
| Guía/rastreador | 200–500c según riesgo |

### 9.4 Servicios/equipo base

| Objeto/servicio | Precio base |
|---|---:|
| Vendaje limpio | 10c |
| Kit vendajes básico | 50c |
| Poción menor | 450c |
| Habitación común | 35c/noche |
| Semana común | 250c |
| Habitación privada simple | 70–120c/noche |
| Mochila básica | 150–250c |
| Ropa común usada | 80–150c |
| Botas simples usadas | 120–250c |
| Daga simple | 300c |
| Herramienta común | 30–150c |
| Espada usada | 1200c |
| Espada simple decente | 1800–2500c |
| Arco simple | 1200–1800c |
| Cuero/peto ligero usado | 1500–3000c |

### 9.5 Stock real

Los comercios tienen stock real. Si se agota, no se puede comprar hasta reposición o alternativa lógica.

Ejemplo: si la herrería fue saqueada, Lucas no puede comprar normalmente al día siguiente hasta que el estado del lugar cambie.

### 9.6 Venta

Venta general: 40–60% del precio base, default 50%, solo si hay comprador lógico.

No inventar descuentos, regalos o precios premium por épica.

### 9.7 Bancos, deudas, alquileres e impuestos

Existen desde el diseño, pero son sistemas dormidos hasta que Lucas interactúe con ellos.

Activadores:

- pedir préstamo;
- alquilar habitación/casa/taller;
- comprar propiedad;
- acumular riqueza relevante;
- contraer deuda;
- registrar negocio;
- tratar con nobleza, gremio o banco.

---

## 10. Progresión de habilidades

### 10.1 Fases

Fases:

1. Principiante.
2. Novato.
3. Competente.
4. Experto.
5. Maestro.
6. Legendario.

Cada fase tiene 10 niveles.

### 10.2 EXP necesaria por nivel

| Fase | EXP por nivel |
|---|---:|
| Principiante | 100 |
| Novato | 250 |
| Competente | 600 |
| Experto | 1500 |
| Maestro | 4000 |
| Legendario | 10000 |

Si EXP actual + ganancia alcanza requisito, subir nivel y conservar sobrante. Nunca dejar habilidad con EXP >= requisito sin resolver level-up.

Al superar nivel 10, pasar a la siguiente fase nivel 1.

Máximo: Legendario nivel 10.

La EXP base se valida por categoria de accion, pero el backend aplica multiplicador de aprendizaje por fase. Principiante aprende rapido para que haya progreso visible; Novato y Competente aun progresan de forma razonable; fases altas exigen acciones mas serias. Multiplicadores actuales: Principiante x5, Novato x2.5, Competente x1.5, Experto x1, Maestro x0.75, Legendario x0.5.

Habilidades dificiles de entrenar por disponibilidad, como Percepcion, pueden tener multiplicador propio si la accion usa realmente esa habilidad. No dar Percepcion por estar presente: solo por vigilancia, lectura de detalles, rastreo, peligro real o lectura social activa.

### 10.3 Abreviatura visible

Usar formato:

```txt
Fuerza P.N6 10/100→19/100(+9)
```

Si sube nivel:

```txt
Fuerza P.N6 96/100→P.N7 6/100(+10)
```

Si cambia fase:

```txt
Fuerza P.N10 98/100→Novato N1 3/250(+5)
```

### 10.4 Multiplicadores

- Maestro/instructor válido: ×2 si hay instrucción real, corrección activa y el instructor sabe enseñar esa habilidad.
- Bendición de Aqua: ×5 para aprendizaje mágico.
- Aqua no aplica a habilidades físicas, confianza, MG, dinero o reputación.
- Aqua + maestro pueden acumularse si ambos aplican. Máximo normal combinado: ×10.

Aqua ×5 aplica a:

- Maná;
- Magia;
- Percepción mágica;
- Magia ofensiva;
- Fuego;
- Rayo/Electricidad;
- Hielo;
- Tierra/Viento;
- Magia defensiva;
- Magia curativa;
- Magia mental;
- Magia de invocación;
- Resistencia mágica si la acción la entrena.

---

## 11. Evaluación de EXP

### 11.1 Evaluar si ocurre al menos una condición

- Acción dura 10 minutos o más.
- Acción física intensa aunque dure menos.
- Trabajo sostenido.
- Viaje.
- Carga o esfuerzo físico.
- Combate.
- Entrenamiento.
- Práctica técnica.
- Estudio real.
- Observación/vigilancia/rastreo intencional.
- Lectura social significativa.
- Uso, intento o estudio de Maná/Magia.

### 11.2 No evaluar si

- smalltalk breve sin aprendizaje;
- transición simple;
- acción de ambiente;
- acción menor de 10 minutos sin intensidad/técnica;
- intento imposible sin base ni práctica real.

### 11.3 Selección dentro de rangos

| Zona | Usar cuando |
|---|---|
| mínimo | acción rutinaria, poca dificultad, baja concentración, repetición, sin riesgo ni técnica nueva |
| baja-media | acción normal, esfuerzo real pero simple, dificultad baja, resultado correcto |
| media-alta | esfuerzo sostenido, buena técnica, dificultad moderada, contexto adverso leve, resultado útil |
| máximo | dificultad alta para su nivel, riesgo real controlado, aprendizaje nuevo, presión alta, maestro activo, resultado excelente |

No usar máximo como default.

### 11.4 Seguridad numérica

No hacer:

- dar EXP por todo;
- negar EXP en acciones largas sin motivo;
- dejar EXP >= requisito sin level-up;
- aplicar Aqua a físicas;
- usar máximo como default;
- convertir cansancio extremo en farmeo eficiente;
- dar Magia por sentir maná sin teoría/estructura/hechizo;
- dar Percepción por estar presente sin prestar atención;
- dar recompensa de gremio por acción privada sin registro;
- mezclar EXP, MG, confianza, reputación, dinero y loot.

Sí hacer:

- usar valores conservadores;
- declarar sin progreso cuando corresponda;
- separar cada sistema;
- actualizar memoria dinámica si hay cambios persistentes;
- preguntar ante consecuencias irreversibles ambiguas.

---

## 12. Fuentes de EXP por habilidad

### 12.1 Fuerza

Representa carga, empuje, forcejeo, golpes fuertes y trabajo pesado.

| Acción | EXP |
|---|---:|
| Trabajo normal sin carga | +0/h |
| Carga menor | +0.5 a +1/h |
| Trabajo fuerte | +3 a +6/h |
| Cortar leña | +5 a +10/h |
| Entreno moderado | +6 a +10/h |
| Entreno intenso | +10 a +18/h |
| Combate | +3 a +12/escena |

### 12.2 Resistencia

| Acción | EXP |
|---|---:|
| Trabajo normal | +1 a +2/h |
| Trabajo fuerte | +3 a +5/h |
| Viaje | +1 a +2/h |
| Entreno moderado | +6 a +10/h |
| Entreno intenso | +10 a +16/h |
| Combate largo | +4 a +12/escena |
| Jornada laboral 5–7h | +8 a +12 |

Reducción de coste por fase:

| Fase | Reducción |
|---|---:|
| Principiante | 0% |
| Novato | 5% |
| Competente | 10% |
| Experto | 15% |
| Maestro | 20% |
| Legendario | 30% |

### 12.3 Vitalidad

| Acción | EXP |
|---|---:|
| Trabajo normal | +0.5 a +1/h |
| Trabajo largo 5–7h | +4 a +8 |
| Soportar hambre/cansancio/herida | +2 a +6 |
| Soportar lesión | +2 a +8 |

No dar Vitalidad por estar cómodo.

### 12.4 Agilidad

| Acción | EXP |
|---|---:|
| Ayuda breve 15 min | +0 |
| Servicio de comedor | +0.5 a +1/h |
| Turno tarde completo | +2 a +6 |
| Entreno moderado | +6 a +10/h |
| Entreno intenso | +10 a +16/h |
| Combate con esquivas | +4 a +12/escena |
| Terreno difícil | +3 a +8/h |

### 12.4.1 Subskills técnicas de combate

Estas habilidades no inician combate por sí solas. Se entrenan con práctica supervisada, sombra, fundamentos o combate real cuando exista encuentro formal.

| Habilidad | Acciones base |
|---|---|
| Esquiva | guardia/distancia 30 min +1 a +4; retirada controlada 30 min +1 a +4; combate con esquivas +4 a +12/escena |
| Bloqueo | guardia/distancia 30 min +1 a +4; práctica guiada 1h +4 a +10; combate con bloqueos +3 a +10/escena |
| Retirada | retirada controlada 30 min +1 a +4; guardia/distancia 30 min +1 a +4; huida controlada +3 a +10/escena |
| Pelea sin armas | fundamentos 30 min +1 a +4; práctica guiada 1h +4 a +10; combate +3 a +12/escena |
| Daga | fundamentos 30 min +1 a +4; práctica guiada 1h +4 a +10; combate +3 a +12/escena |
| Táctica básica | lectura de distancia/análisis 30 min +1 a +4; combate +2 a +8/escena |

### 12.5 Percepción

| Acción | EXP |
|---|---:|
| Trabajo común | +0 |
| Vigilar 30 min | +1 a +3 |
| Buscar detalles 30 min | +1 a +4 |
| Leer gestos en charla importante | +1 a +3 |
| Exploración peligrosa | +3 a +8 |
| Guardia nocturna | +4 a +10 |

No sube por estar presente; debe haber atención, búsqueda, rastreo, análisis o lectura.

### 12.6 Maná

EXP base antes de multiplicadores:

| Acción | EXP base |
|---|---:|
| Intento impulsivo menor de 10 min | +0 |
| Práctica básica 10–30 min | +1 a +5 |
| Práctica básica 1h solo | +4 a +8 |
| Práctica guiada 1h | +8 a +15 |
| Meditación profunda 1h | +6 a +12 |

Aqua ×5 aplica.

### 12.7 Magia

EXP base antes de multiplicadores:

| Acción | EXP base |
|---|---:|
| Leer teoría 30 min | +1 a +3 |
| Estudiar teoría 1h | +4 a +8 |
| Práctica guiada de hechizo 1h | +8 a +15 |
| Práctica sin maestro | +2 a +6 |
| Uso exitoso de hechizo conocido | +2 a +8 |
| Hechizo imposible | +0 |

Aqua ×5 aplica.

---

## 13. Anti-farmeo

La misma acción repetida muchas veces da menos EXP si no añade dificultad, riesgo, técnica, guía, objetivo nuevo o contexto nuevo.

Las categorías marcadas por hora se prorratean por minutos reales. Una práctica de 30 min usa la mitad de la EXP base/h antes de multiplicadores. No contar 30 min como una hora completa.

| Sesión igual en el mismo día | Efectividad |
|---|---:|
| 1ª | 100% |
| 2ª | 75% |
| 3ª | 50% |
| 4ª o más | 25% o 0 si ya no hay aprendizaje |

Excepciones:

- maestro corrigiendo;
- dificultad aumenta;
- objetivo técnico cambia;
- riesgo real nuevo;
- contexto obliga adaptación;
- jornada laboral evaluada como bloque único.

El backend debe registrar y aplicar este anti-farmeo con historial diario por habilidad/categoría. La guía de un maestro, técnica nueva, dificultad nueva, objetivo nuevo, contexto nuevo o riesgo real suavizan la penalización, pero no convierten repetición vacía en aprendizaje infinito.

---

## 14. Magia, MP y práctica mágica

### 14.1 Estado inicial de Lucas

Lucas tiene Maná y Magia desbloqueados. No domina hechizos reales.

No puede lanzar bola de fuego, volar, levitar ni percibir hilos mágicos avanzados sin entrenamiento.

### 14.2 MP máximo

Si el save vivo define MP máximo, manda el save.

Fórmula general:

```txt
MP máximo = base_de_fase + ((nivel - 1) × ganancia_por_nivel)
```

| Fase | Base MP | Ganancia/nivel |
|---|---:|---:|
| Principiante | 200 | +25 |
| Novato | 500 | +50 |
| Competente | 1000 | +100 |
| Experto | 2000 | +200 |
| Maestro | 4000 | +400 |
| Legendario | 10000 | +1000 |

### 14.3 Regeneración MP

| Estado | Regeneración |
|---|---:|
| Descanso normal | 5%/h |
| Dormir | 10%/h |
| Meditación | 15%/h |

No superar MP máximo.

### 14.4 Costes orientativos

| Tipo | MP |
|---|---:|
| Truco menor | 5–10 |
| Principiante débil | 15–30 |
| Principiante útil | 30–50 |
| Novato | 60–120 |
| Competente | 150–300 |
| Experto | 400–800 |
| Maestro | 1000+ |
| Legendario | ritual enorme o condición especial |

### 14.5 Práctica básica

Práctica básica de maná:

- duración default: 30 min;
- categoría: descanso;
- coste MP: 0;
- EXP base: Maná +4;
- con Aqua ×5: Maná +20;
- no desbloquea hechizos;
- no genera efectos visibles si se hace con calma.

Percepción mágica:

- duración default: 30 min;
- categoría: descanso;
- coste MP: 5;
- EXP base: Percepción mágica +8;
- con Aqua ×5: +40 a Percepción mágica.

### 14.6 Intentos imposibles

Si Lucas intenta algo avanzado sin técnica/base:

- menos de 10 min: sin progreso;
- no EXP;
- no hechizo;
- no desbloqueo;
- si canaliza fuerte, puede gastar tiempo, energía o MP;
- si lo hace en público, puede generar reacción social.

No hay descontrol random. Descontrol real solo con base especial: ritual peligroso, magia externa rara o evento preparado.

### 14.7 Subskills mágicas

Regla conservadora inicial:

- Meditar/sentir energía → priorizar Maná.
- Observar/detectar flujo → priorizar Percepción mágica.
- Teoría/estructura/hechizo → priorizar Magia.

Desbloqueos relevantes:

| Rama | Requisitos |
|---|---|
| Rayo/Electricidad | Magia ofensiva P.N3 + Maná P.N3 |
| Hielo | Magia ofensiva P.N2 + Maná P.N3 |
| Tierra/Viento | Magia ofensiva P.N4 + Magia P.N4 + Maná P.N4 |
| Magia curativa | Magia P.N5 + Maná P.N5 |
| Magia mental | Magia Novato N5 + Maná Novato N5 + Percepción P.N8 |
| Magia de invocación | Magia Competente N3 + Maná Competente N3 + Percepción mágica Novato N8 |

Un elemento hijo no debe superar a su rama padre por más de una fase completa salvo razón narrativa especial.

---

## 15. Entrenamiento físico, trabajo y viaje

### 15.1 Entrenamiento físico deliberado

Entreno moderado:

- duración default: 60 min;
- categoría: entreno moderado;
- energía mínima para empezar: 15;
- riesgo si energía baja de 25;
- EXP estándar/h: Fuerza +8, Resistencia +8, Vitalidad +3, Agilidad +8, Percepción +3.

Entreno intenso:

- duración default: 60 min;
- categoría: entreno intenso;
- energía mínima para empezar: 30;
- riesgo si energía baja de 40;
- EXP estándar/h: Fuerza +14, Resistencia +13, Vitalidad +5, Agilidad +13, Percepción +4.

Entrenar agotado no es eficiente y puede causar lesión.

### 15.2 Trabajo en La Grulla Azul

Turno mañana:

- horario: 07:00–12:00;
- tareas: establo, leña, limpieza, carga, apoyo físico;
- categoría habitual: trabajo normal;
- puede ser trabajo fuerte si hay carga pesada, leña intensa o crisis.

EXP por turno completo normal:

- Resistencia +7 a +10;
- Vitalidad +3 a +6;
- Fuerza +2 a +6 si hubo carga/leña/establo real;
- Agilidad +0 a +2;
- Percepción +0 a +2 solo con atención/vigilancia real.

Turno tarde:

- horario: 14:00–20:30;
- tareas: cocina, comedor, servicio, limpieza, apoyo a Fern/Roberto.

EXP por turno completo normal:

- Resistencia +8 a +12;
- Vitalidad +4 a +8;
- Agilidad +2 a +6 si hubo servicio/movimiento;
- Fuerza +0 a +4 si hubo carga;
- Percepción +0 salvo vigilancia/detalles.

### 15.3 Viaje

Viaje por hora:

- Resistencia +1 a +2;
- Agilidad +3 a +8/h si hay terreno difícil;
- Percepción solo si hay vigilancia, rastreo o peligro real.

Mal clima fuera del núcleo del pueblo:

- lluvia leve/mal clima: +25% duración;
- lluvia fuerte: +50% duración;
- redondear al múltiplo de 5 superior si el terreno está embarrado.

---

## 16. Combate narrativo con números visibles

### 16.1 Principio

Combate narrativo, pero con números visibles y consecuencias reales.

El combate real usa el tercer dominio de Actions de combate avanzado. El narrador interpreta intencion y describe resultados confirmados, pero el backend decide tiradas, acierto, daño, fatiga, heridas, moral, retirada, cierre del combate y consecuencias post-combate. Sin `CombatEncounter` formal no hay daño, victoria, loot ni heridas de combate.

Antes de resolver, revisar:

- vida;
- energía;
- saciedad;
- heridas;
- arma/equipo;
- ubicación;
- enemigo;
- testigos;
- ruta de retirada;
- misión activa;
- intención de Lucas.

### 16.2 Enemigos

Todo enemigo relevante debe tener stats reales:

- vida;
- ataque;
- defensa;
- velocidad/agilidad;
- resistencia;
- percepción;
- moral;
- equipo natural o artificial;
- conducta;
- riesgo.

### 16.3 Heridas en combate

Usar zonas del cuerpo cuando corresponda.

Armadura reduce daño según cobertura y calidad.

Fatiga, miedo y retirada importan.

Defender, bloquear, esquivar y retirarse son acciones mecanicas distintas. Bloqueo depende de guardia/equipo y `skill_bloqueo`; esquiva depende de espacio, terreno y `skill_esquiva`; retirada depende de distancia, ruta de escape, terreno, fatiga y `skill_retirada`. El GPT no decide si funcionan: debe usar preview/apply de combate.

Usar objetos durante combate tambien requiere preview/apply de combate. `use_item` solo puede consumir items reales del inventario y, en C8.1, se limita a tratamiento de campo con `itemId` e `injuryId` reales. El backend decide consumo, calidad, estabilizacion y logs; el narrador no puede inventar curacion, vendajes disponibles ni restauracion de vida.

Tratamiento y recuperacion son sistemas separados. `combatAdvancedPreviewTreatment`/`combatAdvancedApplyTreatment` estabilizan o mejoran sangrado/dolor, pero no restauran vida. `combatAdvancedPreviewRecovery`/`combatAdvancedApplyRecovery` acumulan horas efectivas de descanso/cuidado sobre una herida ya estabilizada; no avanzan el reloj, no reemplazan `applyTurn` para registrar tiempo biologico y no restauran vida. Si hay sangrado activo o tratamiento pendiente, recovery debe bloquearse hasta tratar la herida.

### 16.4 Playtest C10 obligatorio

Antes de usar mucho combate real en partida, el backend debe pasar `npm run audit:combat-playtest` ademas de `npm run audit:combat-advanced`. Este playtest no toca el canon: clona el `GameState` vivo a un `gameId` temporal, crea enemigos/eventos/misiones/heridas temporales, ejecuta acciones reales de combate y borra todo al final.

Escenarios C10 minimos:

- sparring: combate controlado, dano capado, sin InjuryRecord serio;
- amenaza menor: ataque con rolls backend, fatiga y resultBand guardados en log;
- defensa: bloqueo aplica bonus defensivo real, esquiva genera fatiga real y ambos progresan skills tecnicas;
- moral enemiga: NPC resuelve huida por moral sin decision narrativa del GPT;
- retirada de Lucas: `flee` usa distancia, ruta de escape, fatiga y roll backend;
- herida leve: tratamiento estabiliza sangrado, no restaura vida;
- post-combate: `previewLoot/claimLoot` crea evidencia y credito institucional si corresponde, pero no dinero ni items inventados.

Si alguno falla, el narrador no debe resolver ese caso por texto libre. Hay que ajustar backend/schema/tests antes de continuar.

### 16.5 Balance C11

El combate real debe sentirse peligroso pero no explosivo por defecto. Un crítico sigue siendo fuerte, pero el margen alto no debe convertir toda amenaza menor en muerte automática. La armadura ligera reduce daño poco pero consistentemente; el escudo ayuda a bloquear y penaliza movilidad/fatiga. Armas con `WeaponProfile` aplican daño base, precisión, defensa, velocidad y coste de fatiga.

Antes de introducir enemigos nuevos, equipo nuevo o cambios de fórmula, ejecutar `npm run audit:combat-balance`. El audit usa un `GameState` temporal y mide:

- daño máximo y promedio de Lucas;
- daño máximo y promedio de NPC;
- reducción real por armadura;
- heridas creadas;
- estado final del encuentro;
- retirada bajo presión;
- sparring con daño capado y sin heridas.

La retirada no es éxito narrativo automático. Aunque exista ruta buena, el backend compara distancia, ruta, velocidad, fatiga, terreno y rolls. El GPT debe narrar el resultado devuelto: escape, intento fallido, exposición o continuación del combate.

### 16.6 Conducta enemiga C12

Todo combate avanzado debe tener una politica de encuentro persistida en `CombatEncounter.flags.encounterPolicy`. El campo `encounterType` puede ser:

- `sparring`;
- `training`;
- `minor_threat`;
- `ambush`;
- `pursuit`;
- `defense`;
- `territorial_creature`;
- `predatory_hunt`;
- `bandit_robbery`;
- `mission_combat`;
- `hazard_interruption`;
- `unknown`.

El backend usa esa politica junto con `EnemyTemplate.behaviorProfile`, `moraleProfile`, HP, moral, fatiga, distancia, terreno y estado visible de Lucas para elegir el turno NPC. El GPT no decide si el enemigo ataca, intimida, se mueve, se prepara o huye. Debe leer `resolution.modifiers.npcDecision` y narrar esa decision.

Reglas de conducta:

- Bandido/oportunista: prefiere intimidar y escapar con ventaja; no pelea hasta morir por botin menor.
- Depredador: prueba debilidad; si el coste sube, puede retirarse.
- Territorial/protector: intenta expulsar o abrir espacio; no siempre persigue.
- Amenaza menor: hostiga y sobrevive; no debe volverse duelo epico por defecto.
- Sparring/training: dano controlado y tono de practica; no convertirlo en combate letal si el backend no lo marca.
- Moral rota o HP critico pueden forzar retirada backend aunque el narrador prefiera drama.

Antes de cambiar `EnemyTemplate`, pesos de decision NPC, tipos de encuentro o reglas de conducta, ejecutar:

```bash
npm run audit:combat-behavior
```

Este audit clona el `GameState` vivo a un `gameId` temporal y verifica:

- bandido que intimida antes de atacar;
- criatura territorial que se reposiciona desde mala distancia;
- depredador herido que intenta retirarse;
- sparring con politica controlada;
- limpieza total de documentos temporales.

### 16.7 Recuperacion C13

La recuperacion formal vive en `InjuryRecord`:

- `healingProgress`;
- `recoveryHoursRemaining`;
- `lastRecoveryDay`;
- `lastRecoveryTime`;
- `status`: `active`, `treated`, `healing`, `healed`, `worsened` o `permanent`.

El GPT debe usar preview antes de aplicar recuperacion. El resultado depende de:

- horas de descanso/cuidado, maximo 24 por llamada;
- calidad del descanso: `poor`, `basic`, `good`, `excellent`;
- nivel de cuidado: `none`, `self`, `trained`, `healer`;
- actividad durante la ventana: `rest`, `light`, `normal`, `hard`;
- sangrado y tratamiento pendiente.

Reglas:

- Sangrado activo bloquea recuperacion; primero treatment.
- Actividad dura no cuenta como recuperacion.
- Una herida no puede recibir recovery dos veces en el mismo dia/hora del `GameState`.
- Recovery puede bajar dolor, reducir horas restantes o marcar `healed`.
- Recovery nunca sube `lucasStatus.life.current`.
- Recovery no avanza reloj ni procesa hambre/energia; si Lucas descansa varias horas, el turno normal debe registrar ese paso de tiempo.

Antes de usar recuperacion larga en partida, ejecutar:

```bash
npm run audit:combat-recovery
```

### 16.8 Muerte

Muerte posible y permanente si la situación lo justifica. No matar NPCs importantes de forma barata, pero no usar plot armor si la situación fue letal.

### 16.9 Recompensas

Matar enemigo no da loot automático. Sin contrato/prueba, no hay recompensa de gremio automática.

Loot solo existe si:

- el enemigo/ubicación lo tenía;
- Lucas lo revisa o lo obtiene de forma lógica;
- puede cargarlo;
- no hay impedimento de propiedad, peligro o testigos.

---

## 17. Gremio, MG y misiones

### 17.1 Separación de sistemas

- EXP de habilidad no es MG.
- MG no es dinero.
- Reputación no es confianza.
- Loot no es recompensa de misión.

### 17.2 Rangos

Los rangos son oficiales de red amplia/internacional, con variaciones locales.

Escala base:

- Porcelana;
- Cobre;
- Bronce;
- Hierro;
- Plata;
- rangos superiores según world_bible.

Lucas actualmente es Porcelana/aspirante útil salvo que MongoDB diga otra cosa.

### 17.3 Misiones

No inventar misión fuera de:

- cartelera activa en MongoDB;
- pool base de misiones posibles;
- evento lógico;
- encargo directo de NPC con recursos;
- registro institucional.

Aceptar misión requiere:

- objetivo;
- pago;
- MG posible;
- prueba de completado;
- riesgo;
- estado en MongoDB.

Ascensos no son automáticos; requieren revisión formal.

### 17.4 Cartelera

Catálogo/pool base vive en reglas/world_bible/seed. Cartelera activa vive en MongoDB.

MongoDB registra:

- disponibles hoy;
- aceptadas;
- expiradas;
- fallidas;
- completadas;
- retiradas por cliente;
- tomadas por otro aventurero;
- modificadas por evento.

---

## 18. NPCs, conocimiento y escena viva

### 18.1 NPCs no omniscientes

Un NPC solo puede afirmar información si tiene fuente válida:

- lo vio directamente;
- Lucas se lo dijo;
- otro NPC se lo contó y existe conexión lógica;
- es rumor y lo expresa como rumor;
- es conocimiento público;
- lo deduce por señales visibles y lo expresa como duda;
- está en registro institucional al que tiene acceso.

Si no hay fuente, debe preguntar, callar o hablar con incertidumbre.

### 18.2 Certeza

Usar niveles:

- confirmado;
- probable;
- rumor;
- dudoso.

Los NPCs deben hablar acorde a su certeza.


### 18.3 Voz propia y libertad creativa controlada

Los NPCs no son respuestas mecánicas. Pueden hablar y expresarse con naturalidad, siempre dentro de sus límites de personalidad, memoria, conocimiento y contexto.

Un NPC persistente puede:

- elegir sus propias palabras;
- bromear, callar, dudar, interrumpir o cambiar de tema;
- mostrarse seco, cálido, nervioso, irónico, orgulloso, tímido o cansado según su perfil;
- hacer preguntas de vuelta;
- no responder si el tema lo incomoda;
- reaccionar a gestos, tono, reputación, cansancio o historia previa de Lucas;
- expresar opinión, desacuerdo, preocupación o afecto si tiene sentido;
- recordar hechos que estén en su memoria o que haya presenciado;
- mostrar contradicciones humanas leves si encajan con su personalidad.

Un NPC no puede usar libertad creativa para:

- saber secretos sin fuente;
- inventar recompensas, dinero, EXP, MG, contratos o misiones activas;
- crear objetos, permisos, stock o consecuencias mecánicas no validadas;
- forzar romance, atracción, celos o confianza;
- contradecir MongoDB, memoria viva o reglas;
- resolver problemas de Lucas por conveniencia narrativa.

El objetivo es que cada NPC se sienta vivo: con voz, límites, humor, silencios, cansancio, dudas y subtexto. La creatividad mejora la expresión, no altera la verdad del mundo.

Regla de agencia: el mundo no debe orbitar alrededor de Lucas. Un NPC solo muestra preocupacion, proteccion, interes fuerte o implicacion personal si hay motivo diegetico: confianza/familiaridad suficiente, rol de seguridad o cuidado, obligacion laboral, interes propio, impacto directo, deuda, curiosidad coherente o conocimiento concreto del riesgo. NPCs desconocidos o poco vinculados pueden ignorar, juzgar, usar la informacion para sus propios fines o responder de forma institucional.

### 18.4 Escena viva

NPCs relevantes presentes por rutina/lógica deben sentirse en escena aunque no hablen.

Mostrar en `NPCs visibles/cerca` personajes nombrados que Lucas puede ver, oír o notar razonablemente en:

- mismo espacio;
- unos 10m;
- área inmediata;
- alcance auditivo lógico.

Clasificar si ayuda:

- visible;
- audible;
- probable;
- no visible si importa.

No inventar NPC nombrado sin rutina/base. Usar genéricos si corresponde.

### 18.5 NPCs genéricos

NPCs genéricos pueden:

- dar ambiente;
- decir una frase simple;
- actuar como testigo anónimo;
- generar o portar rumor anónimo.

No se vuelven persistentes automáticamente. Solo se promueven si Lucas lo decide o si una escena los vuelve realmente importantes.

### 18.6 Memoria NPC

Guardar memoria si un NPC nombrado vio/supo un hecho persistente que afectará decisiones futuras:

- turno completo;
- buen/mal rendimiento;
- promesa;
- deuda;
- favor;
- pedido importante;
- conflicto;
- ayuda;
- fallo;
- rumor;
- información revelada;
- gesto social sensible;
- evento que lo involucra.

No guardar smalltalk/color mínimo sin consecuencia. Si hay duda, guardar memoria emocional breve sin subir confianza numérica.

---

## 19. Confianza, romance y vínculos complejos

### 19.1 Principio social

La confianza es una relación individual entre Lucas y cada NPC persistente. No sube automáticamente por hablar.

Una escena social debe evaluarse si:

- Lucas declara intención de agradar, acompañar, consolar, disculparse, hacer reír, coquetear, ganarse confianza, reparar vínculo o crear cercanía;
- el NPC reacciona de forma emocionalmente relevante;
- hay ayuda práctica, favor, promesa, deuda, conflicto, vergüenza, defensa, secreto o vulnerabilidad;
- la escena puede afectar trato futuro, acceso, reputación local o memoria del NPC.

Si la acción busca vínculo o afecta relación, `### Cambios relevantes` debe mostrar una línea explícita:

```md
**Confianza [NPC]:** +1. **Motivo:** [...]
```

o:

```md
**Confianza [NPC]:** sin cambio numérico. **Motivo:** [...]
```

No dejar implícito el criterio si el jugador intentó afectar una relación.

### 19.2 Condiciones para subir confianza

La confianza solo puede subir si se cumplen condiciones lógicas:

- el NPC vio, oyó o supo la acción por fuente válida;
- la acción le importa según personalidad, valores, situación o memoria;
- el gesto no contradice su estado emocional actual;
- no es repetición/farmeo social sin novedad;
- no viola límites, consentimiento, privacidad, seguridad o contexto;
- produce efecto emocional, práctico o relacional.

Si falta una condición, puede quedar memoria sin confianza numérica.

### 19.3 Guía numérica de confianza

Usar valores conservadores.

| Cambio | Uso típico |
|---:|---|
| +0 | smalltalk, gesto mínimo, repetido, mal momento o impacto poco claro |
| +1 | gesto amable menor pero significativo; compañía respetuosa; broma que relaja; ayuda chica útil |
| +2 | ayuda emocional o práctica clara; respeto importante; apoyo visible en momento difícil |
| +3 a +5 | favor importante, defensa pública, promesa cumplida, riesgo compartido, vulnerabilidad emocional real |
| -1 a -2 | incomodidad, presión leve, torpeza social con impacto, insistencia inoportuna |
| -3 a -5 | burla, mentira, invasión, humillación, traición menor, usar a alguien para provocar celos |
| mayor | solo con causa fuerte, escena importante y validación clara |

No usar cambios grandes por escenas simples. No convertir bromas repetidas en farmeo de confianza.

### 19.4 Memoria social sin confianza

Si la escena es emocionalmente relevante pero no justifica cambio numérico, guardar memoria NPC positiva/negativa si corresponde y explicar:

```md
**Confianza Yara:** sin cambio numérico. **Motivo:** fue una charla agradable, pero todavía menor; queda memoria positiva.
```

La memoria puede preparar escenas futuras, pero no reemplaza la confianza si el sistema la usa numéricamente.

### 19.5 Separación de sistemas

Confianza no reemplaza:

- EXP;
- reputación;
- romance;
- dinero;
- MG;
- loot;
- misión;
- permiso;
- stock.

Una acción puede dar:

- memoria sin confianza;
- confianza sin romance;
- EXP sin vínculo;
- reputación sin confianza personal;
- confianza con un NPC y malentendido con otro si hay testigos/contexto.

Separar siempre los sistemas en `### Cambios relevantes`.

### 19.6 Romance

Confianza alta no equivale a romance.

Romance requiere:

- señales mutuas;
- compatibilidad;
- contexto;
- edad;
- consentimiento;
- personalidad;
- voluntad del NPC;
- historia suficiente.

Mientras los personajes sean menores, todo romance queda en tono inocente/juvenil, sin contenido explícito.

Si en el futuro crecen y son adultos, puede haber romance más maduro, pero siempre en tono anime/literario y no explícito.

No forzar atracción, amor, celos, avances ni tensión romántica solo porque la escena fue amable.

### 19.7 Contacto físico

- Saludo verbal: casi siempre posible.
- Charla: requiere disponibilidad.
- Cumplido leve: depende personalidad/contexto.
- Coqueteo: requiere contexto y puede incomodar.
- Contacto casual: requiere confianza/justificación.
- Abrazo/beso: requiere vínculo claro, señales y contexto.
- Contacto forzado/sorpresivo: consecuencia negativa, no romantizar.

### 19.8 Celos y malentendidos

Pueden existir si la personalidad y el contexto lo permiten.

No deben ser automáticos ni melodrama gratis.

Disparadores válidos:

- señales ambiguas;
- promesas incumplidas;
- atención desigual;
- rumores deformados;
- presencia de testigos;
- inseguridad previa del NPC;
- competencia social/laboral;
- secretos revelados a una persona y no a otra.

### 19.9 Anti-farmeo social

Repetir la misma estrategia social con el mismo NPC en el mismo día pierde efecto si no hay novedad real.

Ejemplos:

- hacer la misma broma varias veces;
- acompañar sin aportar nada nuevo;
- elogiar repetidamente de forma genérica;
- buscar confianza explícitamente sin respetar ritmo del NPC;
- insistir cuando el NPC está ocupado o incómodo.

La confianza sube por calidad, oportunidad, respeto y consecuencia, no por cantidad de mensajes.

Si `getCompactContext.socialRhythm` marca un NPC como saturado en el dia, la escena debe mostrar continuidad natural: gesto, coordinacion, comodidad, cansancio o memoria. No repetir agradecimientos ni aplicar nuevos deltas numericos salvo que haya novedad fuerte validada por preview/backend.

Si `narrativeHints.scenePlan` pide escena comprimida, resumir la rutina y elegir un solo detalle nuevo. La repeticion tambien puede ser inmersiva: que un NPC deje de sorprenderse, de menos instrucciones, confie una tarea simple o responda con menos palabras.

Cuando el GPT use `applyTurn` debe enviar `actionFamily` si la accion tiene familia clara (`investigation`, `report`, `travel`, `social`, `physical_training`, `magic_practice`, `mission`, etc.). Este campo solo guia `narrativeHints`: no crea mecanicas ni reemplaza tags, pero evita que reportes, investigaciones o viajes se clasifiquen como compra/entrenamiento por inferencia.

### 19.10 Narracion dramatica y dialogo vivo C14/C15/C16/C17

`getCompactContext` debe exponer `dramaticContext` para cada escena jugable. Este bloque no cambia estado ni autoriza resultados; solo guia estilo:

- la escena novelada va antes del HUD;
- el HUD mecanico final sigue siendo obligatorio;
- la tension sale de estado confirmado: cuerpo de Lucas, evento principal, compromisos, misiones, clima, friccion de mundo, NPCs presentes o combate activo;
- la prosa puede dramatizar sensaciones, gestos, silencios, interrupciones, tareas y entorno, pero no crea dano, curacion, loot, EXP, dinero, relaciones ni resoluciones;
- si no hay tension fuerte, el lugar, el cuerpo de Lucas y las agendas abiertas deben sostener una escena breve pero viva.

`dramaticContext.emotionalScene` dirige la arquitectura emocional de la respuesta:

- `sceneMode` y `paragraphTarget`: indican si conviene escena dramatizada o escena breve viva;
- `emotionalQuestion`: pregunta dramatica concreta de la escena actual;
- `beatEngine`: anzuelo, mascara, presion, grieta visible y salida;
- `sensoryAnchors`: cuerpo, lugar y presion social que deben sostener emocion sin explicar todo;
- `dialogueShape`: densidad esperada de dialogo y prohibicion de respuestas planas;
- `slowBurnRule`: confianza, miedo, respeto, perdon e intimidad avanzan por microcambios, no por salto brusco;
- `boundary`: no inventar resultados mecanicos, conocimiento secreto ni pensamientos privados como certeza.

Uso esperado:

- abrir con un objeto, gesto, sonido, cuerpo o interrupcion concreta;
- dejar que el NPC primero proteja su mascara publica, tarea, orgullo o limite;
- mostrar como la accion de Lucas mueve algo visible: pausa, mirada, objeto, distancia, tono o decision;
- mostrar una grieta o cambio pequeno sin convertirlo en confesion total;
- cerrar con proxima decision clara y despues HUD mecanico.

Cada `scene.nearbyNpcs[]` debe exponer `dialogueProfile` compacto:

- `speechRhythm`: como suena el NPC;
- `relationshipRegister`: como cambia el trato por confianza, respeto, sospecha, miedo o familiaridad;
- `emotionalTemperature`: que emocion domina la respuesta;
- `currentPressure`: si el NPC esta libre, trabajando, ocupado o ausente;
- `dramaticRole`: mascara publica, deseo visible, presion oculta como gesto, resistencia, ancla de objeto, escalera de beats y limite por relacion;
- `emotionalSubtext`: deseos, miedos, contradicciones y gestos visibles del NPC;
- `subtextSeed`: valores, rechazos y postura social resumidos;
- `dialogueMoves`: recursos de dialogo permitidos para ese NPC;
- `avoid`: limites para no hacerlo generico, omnisciente o mecanico.

`dialogueProfile.dramaticRole` no permite leer la mente del NPC. Es una guia de puesta en escena:

- `publicMask`: como se protege el NPC ante Lucas o ante el publico;
- `sceneWant`: que intenta sostener en la escena desde rol/tarea/valor;
- `hiddenPressure`: miedo o presion que solo puede aparecer en gesto, limite o cambio de tono;
- `resistanceMove`: como se resiste antes de ceder, ayudar, negar o negociar;
- `vulnerabilityTell`: gesto visible que revela una grieta sin explicar interioridad;
- `objectAnchor`: objeto, herramienta, mueble, ruido o detalle fisico que carga subtexto sin volverse item mecanico;
- `beatLadder`: mascara, friccion, grieta y giro;
- `relationshipGate`: limite por confianza, sospecha, respeto, miedo o familiaridad.

Cada `scene.nearbyNpcs[]` tambien puede exponer `emotionalProfile`: `defaultMood`, `coreDrives`, `coreFears`, `pride`, `softSpots`, `stressors`, `visibleTells`, `copingStyle`, `contradiction` y `sceneHooks`. Es guia de subtexto visible, no telepatia. El GPT puede convertirlo en gestos, tono, pausas, silencios, decisiones y dialogo, pero no debe decir que Lucas conoce deseos o miedos privados si no hay fuente diegetica.

`scene.relationshipDynamics` resume pares NPC-NPC cercanos. Usarlo para que los NPCs reaccionen entre ellos, no solo a Lucas: alianzas, roces, bromas, correcciones, coordinacion, silencios o interrupciones segun confianza/familiaridad/tension. `privateSubtext` puede inspirar gesto o pausa, pero nunca revelarse como informacion sabida por Lucas.

Reglas de uso:

- cada linea de dialogo debe tener intencion: medir, cuidar, presionar, ocultar, corregir, negociar, provocar o revelar algo permitido;
- un NPC seco no significa NPC plano ni pobre: en escenas de pedido directo, entrenamiento, conflicto o decision social, debe haber 2-4 beats de dialogo/gesto si la escena lo permite; evitar una sola frase minima como respuesta completa;
- las frases compactas deben tener contenido: causa, imagen concreta del peligro, condicion practica, subtexto visible o consecuencia;
- un NPC calido no debe repetir gratitud generica: debe mostrar cuidado mediante acciones concretas, preguntas pequenas o atencion a la escena;
- en grupos, no hacer turnos artificiales: usar miradas, interrupciones, silencio, alianzas pequenas y reacciones cruzadas;
- respetar `npcKnowledgeContext`: certeza solo con fuente diegetica, inferencias como duda/pregunta/rumor;
- ningun NPC debe recitar HUD, numeros o reglas salvo interfaz administrativa explicita.

C17 agrega playtest representativo obligatorio. `audit:narrative-scene-playtest` debe cubrir, sin mutar canon:

- entrenamiento con Eddan: un NPC aspero debe corregir con causa, imagen concreta del peligro, gesto y limite, no con una frase minima;
- La Grulla Azul en grupo: Roberto, Yara y Fern deben reaccionar tambien entre ellos segun tarea, confianza laboral, nervios y limites;
- gremio administrativo: Garrick y Mara deben sonar institucionales de formas distintas, usando papeles, sello, mostrador, pruebas y procedimiento como ancla;
- escena sin NPC: el interes debe salir del cuerpo de Lucas, lugar, clima, objetivo abierto o tension pendiente, no de inventar presencia.

Si una escena manual en GPT Builder falla estos casos, primero revisar si el contexto compacto trae `dramaticContext.emotionalScene`, `dialogueProfile.dramaticRole`, `emotionalProfile` y `scene.relationshipDynamics`. Despues revisar instrucciones del GPT. No compensar inventando resultados mecanicos en la prosa.

### 19.11 Ejemplo: charla ligera con Yara

Si Lucas acompaña a Yara mientras trabaja, hace bromas suaves, no estorba y ella se ríe:

Resultado razonable:

```md
**Confianza Yara:** +1. **Motivo:** Lucas la acompañó con humor suave, respetó su ritmo de trabajo y no la hizo sentir humillada.
**Memoria de Yara:** recuerda que Lucas le hizo compañía tranquila en cocina y la hizo reír sin presionarla.
```

Si fue una repetición sin novedad o Yara estaba demasiado ocupada:

```md
**Confianza Yara:** sin cambio numérico. **Motivo:** el gesto fue amable, pero menor/repetido; queda una impresión positiva leve.
```

---

## 20. Rumores, reputación y facciones

### 20.1 Rumores

Los rumores pueden deformarse con el tiempo.

Deben guardar:

- origen;
- contenido;
- certeza;
- deformación;
- quién lo sabe;
- dónde circula;
- día/hora;
- si puede afectar trato.

### 20.2 Reputación

No hay moral global única. Usar reputación por zona/facción.

Una mala acción no cambia precios/misiones/trato automáticamente por cualquier cosa. Solo afecta si hay:

- gravedad;
- testigos;
- evidencia;
- fuente creíble;
- conexión social;
- registro institucional;
- impacto real.

### 20.3 Facciones

Facciones pueden actuar offscreen con objetivos propios, pero no resolver la historia de Lucas sin él.

Facciones mínimas:

- gremio;
- guardia;
- templo;
- nobleza;
- comerciantes;
- cazadores;
- bandidos;
- grupos mágicos;
- facciones regionales definidas en world_bible.

---

## 21. Inventario, propiedad y objetos

### 21.1 Reglas generales

Antes de comerciar, consumir, descartar o equipar:

- verificar inventario;
- verificar propietario;
- verificar permisos;
- verificar dinero;
- verificar ubicación/vendedor válido;
- verificar peso/carga si importa.

Objetos importantes/protegidos no se descartan sin confirmación.

### 21.2 Consumo

Consumir raciones, pociones u objetos debe actualizar inventario y estado.

Comida de contrato no consume raciones personales.

Una comida incluida por contrato es un derecho disponible, no un consumo automatico. Solo aplicar su bono si Lucas decide comerla, si la escena la narra de forma explicita, o si `completeJobShift` recibe `consumeIncludedMealIds`. Completar un turno laboral por si solo no consume desayuno/almuerzo/cena.

### 21.3 Objetos mágicos

No inventar objetos mágicos ni efectos especiales sin base. Requieren fuente, identificación, propiedad y reglas.

---

## 22. Viaje, exploración y zonas seguras

### 22.1 Viaje/exploración

Antes de resolver:

- hora;
- clima;
- ruta;
- energía/saciedad;
- vida;
- heridas;
- equipo;
- raciones/agua;
- luz;
- compañía;
- objetivo;
- retirada.

No bloquear automáticamente. Advertir y aplicar consecuencias si Lucas insiste.

### 22.2 Peligro por hora

No usar tabla dura tipo “bosque de noche = +X% encuentro”.

La hora afecta:

- visibilidad;
- rutinas;
- cansancio;
- disponibilidad;
- señales;
- sentido común.

### 22.3 Zonas seguras

Seguro significa sin monstruos ni combate hostil automático.

- La Grulla Azul, habitación y gremio: sin encuentros hostiles automáticos.
- Mercado/plaza: seguros, pero pueden tener conflictos sociales/criminales si hay evento o escena lógica.
- Bosque/colinas/rutas: riesgo real según zona y contexto.

---

## 23. Pipeline para acciones complejas

Usar cuando una acción toque varios sistemas o tenga riesgo importante.

### P1. Descomponer acción

Separar:

- acción física;
- diálogo;
- intención;
- objetivo;
- NPCs involucrados;
- lugar;
- duración;
- riesgo.

Si hay ambigüedad importante, preguntar.

### P2. Consultar estado vivo

Revisar:

- día/hora/ubicación;
- bloque;
- vida/saciedad/energía/MP;
- dinero/inventario/equipo;
- evento activo;
- misión activa;
- relaciones;
- NPC memory;
- fuentes registradas.

### P3. Verificar presencia y escena viva

Revisar:

- NPC presente/accesible;
- rutina horaria;
- clima;
- testigos;
- seguridad del lugar;
- normas sociales;
- quién puede escuchar/recordar.

### P4. Aplicar validadores

Según acción:

- social/consentimiento;
- conocimiento NPC;
- presencia viva;
- permisos/propiedad;
- mecánicas numéricas;
- gremio/misión;
- combate/magia;
- viaje/exploración;
- reputación/rumores.

### P5. Resolver proporcionalmente

Resultados válidos:

- éxito;
- éxito con coste;
- éxito parcial;
- fallo con consecuencia;
- bloqueo por imposibilidad.

No regalar éxito perfecto si hay riesgo real.

### P6. Actualizar memoria/estado si corresponde

Actualizar si hay cambio persistente:

- estado importante;
- inventario/dinero;
- misión;
- relación/reputación;
- NPC aprendió algo;
- fuente nueva de información;
- rumor;
- promesa/deuda/favor;
- herida/condición;
- ubicación;
- checkpoint.

### P7. Compromisos, promesas y pendientes

No dejar promesas, citas, planes importantes u obligaciones futuras solo como EventLog narrativo. Si Lucas promete, acuerda, pospone o fija una accion futura relevante, guardar `commitmentPatches` con `op:create`, tipo, prioridad, NPCs relacionados y fecha/hora objetivo si existe.

Cerrar el compromiso con `op:fulfill`, `op:fail`, `op:cancel` u `op:expire` cuando se cumpla, falle, se cancele o venza. No crear compromiso por cada frase casual: usarlo para continuidad real, consecuencias sociales, trabajo, misiones, secretos, citas, planes de viaje o decisiones diferidas.

Si el compromiso puede tener costo al incumplirse, guardar `failureSeverity`, `failureConsequence`, `graceMinutes` y `requiresExplicitResolution`. `getCompactContext` expone `pendingCommitments` y `commitmentAgenda`: si aparece `urgency:"consequence_ready"` o alerta `commitments_consequence_ready`, no saltar escenas largas sin resolverlo, reprogramarlo o cerrarlo formalmente.

El backend no debe aplicar castigos sociales automaticamente solo por vencer una hora. El vencimiento abre una consecuencia pendiente; el narrador debe cerrarla con el resultado correcto y, si corresponde, aplicar `npcRelationshipPatches`, `jobContractPatch`, `missionPatch` o `worldEventPatches` en el mismo turno.

### P8. Asistencia laboral y consecuencias

Los trabajos formales no deben vivir solo como logs narrativos. Cada contrato debe guardar tipo de trabajo, jefe/NPC responsable, ubicacion, turnos, paga, comidas incluidas, reglas de ausencia/tardanza y cambios de horario.

Si Lucas llega tarde o falta a un turno, usar `jobContractPatch` con `record_shift_late` o `record_shift_absence`. El registro debe incluir dia, hora, excusa si existe, motivo y, si corresponde, compromiso relacionado.

El backend puede inferir `consequenceLevel` y dejar `requiresFollowUp`, `consequenceSummary` y una sugerencia de `npcRelationshipPatch`. Esa sugerencia no se aplica automaticamente: el narrador debe decidir si corresponde cerrar la consecuencia con `npcRelationshipPatches`, `commitmentPatches`, disculpa, reparacion, aviso previo, perdida de turno o solo memoria laboral.

Una tardanza leve y justificada puede quedar sin consecuencia numerica. Una falta injustificada, repetida o que perjudica a otros debe dejar seguimiento pendiente hasta resolverse. `getCompactContext` debe mostrar estas asistencias pendientes para no depender de memoria del GPT.

### P9. Misiones, reportes y gremio

Las misiones viven en MongoDB. Aceptar, reportar, verificar, completar, fallar o expirar siempre debe pasar por `missionPatch`; no pagar con `moneyPatch` ni dar MG/loot por narracion.

Un reporte de mision debe guardar resumen, evidencia, calidad, testigos y ubicaciones relevantes cuando existan. EventLog no reemplaza el reporte formal. Si una prueba queda `submitted`, no completar ni pagar hasta `verify` con `proofStatus:"verified"`. Si queda `rejected`, corregir, fallar o dejar consecuencia pendiente; nunca pagar.

`getCompactContext.missionAgenda` marca misiones listas para completar, reportes pendientes de verificacion, pruebas rechazadas, misiones aceptadas vencidas y misiones disponibles que vencen pronto. No saltar escenas largas si hay `acceptedExpired` o `proofRejected` sin resolver.

Si `guildState.formalGuildRegistrationPending` esta activo, las misiones de rango que requieren registro formal solo se aceptan con permiso/supervision explicita y `registrationOverrideReason`; si no, el backend debe bloquearlas.

Los reportes institucionales al gremio, guardia, templo u otra faccion no deben convertirse automaticamente en `socialDebt` de un NPC. Si la ganancia es institucional usar `factionReputationPatches` (`institutionalCreditDelta`, `meritDelta`, `reputationDelta`) y reservar `npcRelationshipPatches` para trato personal directo.

La cartelera puede mostrar misiones disponibles pero bloqueadas por registro, rango, permiso o vencimiento. El narrador puede mencionarlas como visibles/no aceptables, pero no debe ofrecerlas como aceptadas ni vigentes si `boardVisibility.canAccept` es falso.

### P10. Evidencia, objetos improvisados y progreso de eventos

La evidencia fisica o narrativa no debe vivir solo como EventLog ni forzarse como item de inventario canonico. Para muestras, rastros, notas improvisadas, objetos encontrados, testimonios o pruebas no vendibles usar `evidencePatches`.

`inventoryPatch` sigue siendo solo para items existentes. Si Lucas recoge una muestra o prueba que no existe como item canonico, crear/recoger evidencia con `evidencePatches` en vez de inventar `itemId`.

Si una evidencia se reporta, entrega, pierde, descarta o destruye, actualizarla con `evidencePatches`. Si se relaciona con evento o mision, guardar `sourceEventId`, `relatedEventIds`, `sourceMissionId` o `relatedMissionIds`.

Los eventos de mundo pueden avanzar sin resolverse. Para pistas parciales, reportes libres al gremio, evaluaciones pendientes o evidencia no concluyente usar `worldEventPatches.progress`. No cerrar un evento como `resolved` hasta que el resultado real este claro.

EventLog acompaña la narracion, pero no reemplaza evidencia formal ni progreso de evento. Si una Action falla, no narrar como guardado lo que el backend rechazo; corregir el payload o avisar en modo tecnico.

### P11. Friccion de mundo: economia, viaje y clima

`getCompactContext.worldFriction` es la lectura compacta para stock cercano, demoras de suministro, clima y riesgo de viaje. No muta estado y no reemplaza previews: solo avisa que hay friccion que el narrador debe respetar.

Si `worldFriction.economy.hasPressure` esta activo, no asumir stock infinito, descuentos faciles ni disponibilidad automatica. Compras/ventas requieren validar tienda, dinero, item, stock y precio antes de mutar.

Si `worldFriction.travel.shouldPreviewTravel` esta activo, usar `previewTravel` antes de resolver rutas exteriores, viajes largos o salidas a zona peligrosa. El clima o eventos de ruta pueden alargar tiempo, cambiar coste biologico o exigir cautela narrativa, pero no crean combate automatico.

Si no hay ruta directa y el destino es razonable, usar `previewTravel` con `allowMultiSegment:true` y `maxSegments` prudente. El resultado `path.segments` manda el recorrido real, tiempo total y riesgo maximo; no componer rutas largas solo desde narracion.

Si el clima esta `staleByCurrentTime`, refrescarlo con el flujo de turno/world tick antes de escenas exteriores relevantes. Rumores de ruta, barro o suministros retrasados son presion contextual: pueden afectar escena, precios o disponibilidad solo cuando el backend lo exponga o una accion lo justifique.

---

## 24. Ejemplos de resolución

### 24.1 Lucas entrena una hora cortando leña de manera intensa

Estado base de ejemplo: 12:00, saciedad 30, energía 59.

Resolución:

- duración: 60 min;
- categoría: entreno intenso / trabajo fuerte físico;
- coste suavizado: saciedad -8, energía -14;
- EXP sugerida por contexto: Fuerza +9, Resistencia +5, Vitalidad +3, Agilidad +1;
- motivo: corte de leña intenso, esfuerzo real, hambre fuerte limitando un poco.

Formato final debe mostrar:

```txt
Saciedad 30/100→22/100
Energía 59/100→45/100
Fuerza P.N6 10/100→19/100(+9)
```

### 24.2 Lucas come almuerzo de contrato

Resolución:

- comida principal de contrato;
- coste: 0;
- bonus directo: saciedad +30, energía +5;
- tiempo normal: 20 min;
- tiempo acumulado como comer tranquilo hasta próxima hora exacta.

### 24.3 Lucas pregunta algo privado a un NPC

Resolver:

- relación actual;
- confianza;
- personalidad;
- lugar;
- testigos;
- disponibilidad;
- si el NPC tiene fuente/conocimiento;
- si hay riesgo social.

No subir confianza automáticamente.

---

## 25. Reglas anti-conflicto finales

1. Save vivo/MongoDB manda sobre resúmenes.
2. Formato fijo de respuesta es obligatorio.
3. Hora final siempre exacta.
4. Dinero siempre se muestra como `X oro, Y plata, Z cobre`.
5. No hay enfermedades como sistema regular; solo condiciones especiales con causa.
6. Aqua ×5 se mantiene para aprendizaje mágico válido.
7. La magia sigue siendo rara socialmente aunque Lucas tenga MP alto.
8. Lucas tiene potencial mágico, no dominio mágico.
9. No hay descontrol mágico random.
10. Eventos random son semillas suaves; eventos grandes requieren causa.
11. NPCs genéricos no se vuelven persistentes automáticamente.
12. NPCs no son omniscientes.
13. Cartelera activa de misiones vive en MongoDB; reglas/pool base viven en archivos/seed.
14. No loot/recompensa automática.
15. Comida de contrato no consume raciones ni se aplica automaticamente; requiere decision explicita de comer.
16. Promesas, citas, planes importantes y obligaciones futuras usan `commitmentPatches`; si vencen con `consequence_ready`, se cierran formalmente antes de saltar escenas largas.
17. Acciones relevantes de 10+ minutos deben evaluarse para EXP, pero no toda acción da EXP.
18. Cansancio extremo no es farmeo eficiente.
19. Compañeros pueden morir permanentemente si la situación lo justifica.
20. No matar NPCs importantes de forma barata.
21. El mundo avanza por tiempo de partida, no por tiempo real.
22. Diálogo directo de NPC siempre usa `Nombre: "mensaje"` o `Rol: "mensaje"`.
23. NPCs pueden expresarse con libertad creativa solo dentro de personalidad, memoria, conocimiento y contexto.
24. Si una acción busca vínculo o afecta relación, mostrar confianza con cambio o motivo de +0.
25. Memoria NPC no reemplaza confianza numérica ni romance.

---

## 26. Pendientes para fases siguientes

Este archivo no define el lore completo del mundo. Eso va en `world_bible.md`.

Pendientes que se desarrollarán en fases posteriores:

- catálogo completo de heridas y daño por arma;
- enemigos base con stats;
- bancos/deudas/impuestos en detalle;
- tabla avanzada de stock y reposición;
- reglas de facciones políticas globales;
- sistema completo de rosters de NPCs por ciudad;
- scheduler técnico para eventos offscreen;
- schemas Mongoose definitivos;
- OpenAPI definitivo para GPT Actions.

---

## Anexo A — Validación guiada de Fase 2

Lucas confirmó las siguientes decisiones como parte de la validación de `rules_engine.md`:

1. `## Estado actual` aparece siempre en toda respuesta de partida.
2. `### Cambios relevantes` mantiene estructura estable, pero solo muestra subbloques que cambiaron o importan.
3. Se confirman costes suavizados por hora: actividad normal -3/-4, trabajo normal -3/-6, viaje suave -3/-5, trabajo fuerte -7/-11, entreno moderado -5/-8, entreno intenso -8/-14.
4. La EXP se mantiene parecida al sistema anterior mientras se suavizan los costes de saciedad/energía.
5. Se conservan valores base de comidas y raciones del sistema anterior.
6. Aqua ×5 para aprendizaje mágico queda confirmado.
7. Los intentos mágicos imposibles no explotan ni se descontrolan porque sí; simplemente no salen o consumen tiempo/MP/energía si corresponde.
8. Heridas localizadas con grados: leve, moderada, grave y crítica.
9. Muerte permanente permitida solo cuando la cadena lógica lo justifica; nunca por arbitrariedad.
10. Checkpoints automáticos en cambios importantes, no por cada microacción.
11. Dinero guardado en `moneyCopper` y mostrado siempre como `X oro, Y plata, Z cobre`.
12. Memoria NPC solo para hechos persistentes, importantes o emocionalmente relevantes.
13. Rumores con fuente, certeza, distorsión, quién lo sabe y dónde circula.
14. NPCs genéricos pueden existir como ambiente/testigos, pero no se vuelven persistentes salvo decisión explícita.
15. Romance lento, lógico e inocente si son menores; celos y malentendidos solo con personalidad, señales y contexto.
16. Economía avanzada con stock real, oferta/demanda y negocios afectados por eventos; bancos/deudas/alquiler/impuestos existen como sistemas dormidos hasta interacción.
17. Gremio: reglas y pool base en archivos; cartelera activa y estado vivo de misiones en MongoDB.
18. Backend: primero `context/compact`; `context/full` queda para modo técnico/debug. Si falta información, búsqueda profunda en docs/mundo/DB antes de inventar o preguntar.

Estas decisiones son parte del núcleo validado del motor.
