# rules_engine.md — Motor Isekai Lucas

Versión: Fase 2 v0.2  
Estado: versión validada por Lucas mediante revisión guiada  
Fuente de migración: Enciclopedia V2 Isekai Lucas + decisiones confirmadas por Lucas durante Fase 1 + validación guiada Fase 2  
Propósito: este archivo define **cómo se resuelve el juego**. No contiene el save vivo completo ni el lore mundial extenso; eso vive en MongoDB y `world_bible.md`.

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

Endpoint conceptual recomendado:

```txt
GET /api/context/full
```

Debe devolver un contexto dinámico amplio y estructurado:

- estado completo de Lucas;
- ubicación actual;
- estado de la zona actual;
- NPCs visibles, audibles, probables y ausentes relevantes;
- rutinas activas;
- memorias relevantes de NPCs involucrados;
- rumores vivos relevantes;
- eventos activos o próximos;
- stock y comercios relevantes;
- misiones relevantes;
- facciones y reputación;
- alertas de coherencia.

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

Al comenzar la Mañana de cada día de partida, el backend debe asegurar **un evento diario generado** para ese día. El evento se guarda en MongoDB como `WorldEvent` y puede empezar en ese mismo bloque o más tarde.

El evento diario usa tres tiradas:

1. **Bloque de inicio**:
   - 1 = Mañana, empieza 06:00;
   - 2 = Mediodía, empieza 12:00;
   - 3 = Tarde, empieza 14:00;
   - 4 = Noche, empieza 18:00.
2. **Importancia**:
   - 1–7 = evento menor/opcional;
   - 8–10 = evento importante, debe atenderse o resolver consecuencias.
3. **Duración**:
   - 1–15 días.

El fin del evento se calcula por bloque. Si un evento empieza Día 11 a la primera hora de Tarde y dura 2 días, termina Día 13 al terminar el bloque de Tarde, es decir a las 18:00. Si empieza en Noche, termina al cierre del bloque de Noche correspondiente.

Estados:

- `scheduled`: el evento ya fue generado, pero todavía no llegó su bloque de inicio;
- `active`: el bloque de inicio ya llegó;
- `resolved`: Lucas/NPCs/backend lo resolvieron;
- `expired`: el tiempo terminó sin resolución;
- `consequences_applied`: las consecuencias ya fueron aplicadas;
- `cancelled`: anulado por corrección/admin.

Eventos menores pueden ignorarse, pero dejan consecuencias leves: oportunidad perdida, rumor deformado, malestar menor, demora chica o pérdida pequeña de confianza práctica.

Eventos importantes deben atenderse. Si vencen sin resolución, dejan consecuencias mayores proporcionales: pérdida real de confianza, peligro de ruta, faltantes, escalada de amenaza, bloqueo temporal o daño offscreen lógico.

La IA puede adaptar el color narrativo del evento según contexto, NPCs, clima, rumores y ubicación, pero el backend decide y guarda el evento. No inventar recompensas, enemigos, objetos mágicos ni cambios mecánicos fuera del evento vivo.

Eventos random suaves pueden usarse como semillas menores. Eventos importantes requieren causa lógica:

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

Si una escena termina entre horas exactas, guardar acumulador del bloque horario activo.

### 6.2 Bonos directos

Aplican inmediatamente, aunque no sea hora exacta:

- comida;
- bebida con efecto;
- poción;
- curación;
- daño;
- coste de MP;
- recuperación especial.

El bono directo no reemplaza el acumulador de actividad.

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

### 16.4 Muerte

Muerte posible y permanente si la situación lo justifica. No matar NPCs importantes de forma barata, pero no usar plot armor si la situación fue letal.

### 16.5 Recompensas

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

### 18.3 Escena viva

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

### 18.4 NPCs genéricos

NPCs genéricos pueden:

- dar ambiente;
- decir una frase simple;
- actuar como testigo anónimo;
- generar o portar rumor anónimo.

No se vuelven persistentes automáticamente. Solo se promueven si Lucas lo decide o si una escena los vuelve realmente importantes.

### 18.5 Memoria NPC

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

### 19.1 Confianza

No subir confianza por color, smalltalk o halagos repetidos. Esto no significa que la confianza nunca suba: si una acción tiene peso social real, debe evaluarse y guardarse como relación viva.

Subir solo si:

- el NPC vio o supo la acción;
- le importa;
- encaja con personalidad;
- no es farmeo social repetitivo;
- tuvo consecuencia emocional o práctica.

Para acciones sociales con posible impacto usar `previewSocialImpact` si está disponible. Si la acción realmente cambia el vínculo, guardar con `applyTurn.npcRelationshipPatches`. `NpcMemory` registra qué recuerda el NPC; no reemplaza el número de confianza/respeto/afecto.

Escala base:

- `+0`: color, smalltalk, gesto amable sin consecuencia, repetición sin contexto nuevo.
- `+1`: ayuda menor relevante, cumplimiento fiable, respeto de límites, detalle útil que el NPC valora.
- `+2`: ayuda clara con consecuencia emocional/práctica, apoyo importante, promesa cumplida, conducta consistente que cambia cómo el NPC ve a Lucas.
- `+3`: favor fuerte, riesgo/coste real para Lucas, defensa de un NPC, reparación importante de daño o evento mayor.
- Valores negativos equivalentes para mentira, presión, humillación, promesa rota, daño, abandono o trabajo negligente.

Topes normales:

- máximo habitual por NPC y escena: `+2`;
- máximo habitual por NPC y día: `+3`;
- eventos mayores, peligro real o escena emocional crítica pueden romper el tope con justificación explícita;
- repetir la misma acción el mismo día guarda memoria si importa, pero no suma confianza otra vez salvo que haya nueva consecuencia.

Diferenciar métricas:

- `trust`: seguridad, honestidad, respeto de límites, constancia, apoyo emocional/práctico.
- `respect`: competencia, responsabilidad, trabajo fiable, valentía, criterio.
- `affection`: calidez personal y apego; es lento, no equivale a romance y no debe subir sin escena personal clara.
- `suspicion`: dudas por contradicción, secretos, presión, mentiras o conducta rara.
- `fear`: amenaza o daño.
- `jealousy`: solo si el contexto social lo justifica; no usar como romance automático.

Umbrales de confianza:

- `0-9`: desconocido/cautela.
- `10-24`: trato básico.
- `25-39`: confianza laboral o comodidad inicial.
- `40-59`: fiable para favores menores y conversaciones más naturales.
- `60-74`: confianza personal y temas privados.
- `75-89`: vínculo profundo.
- `90-100`: confianza excepcional.

Consolidación por memorias:

Si hay varias memorias recientes positivas (`trust_building`, `respect_space`, `helpful`, `reliable_work`, promesas cumplidas) y una nueva escena confirma el patrón, puede sumarse `+1` adicional dentro del tope. Esto representa confianza lenta acumulada, no farmeo.

Registrar memoria dinámica si:

- hubo ganancia/pérdida notable;
- ocurrió bandera emocional positiva/negativa;
- el NPC aprendió algo importante;
- hubo promesa, disculpa, favor o deuda;
- cambia acceso a futuras escenas.

### 19.2 Romance

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

### 19.3 Contacto físico

- Saludo verbal: casi siempre posible.
- Charla: requiere disponibilidad.
- Cumplido leve: depende personalidad/contexto.
- Coqueteo: requiere contexto y puede incomodar.
- Contacto casual: requiere confianza/justificación.
- Abrazo/beso: requiere vínculo claro, señales y contexto.
- Contacto forzado/sorpresivo: consecuencia negativa, no romantizar.

### 19.4 Celos y malentendidos

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

No subir confianza por preguntar o charlar solamente. Si la escena genera ayuda, respeto de límites, confianza práctica o daño social real, aplicar la escala de 19.1.

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
15. Comida de contrato no consume raciones.
16. Acciones relevantes de 10+ minutos deben evaluarse para EXP, pero no toda acción da EXP.
17. Cansancio extremo no es farmeo eficiente.
18. Compañeros pueden morir permanentemente si la situación lo justifica.
19. No matar NPCs importantes de forma barata.
20. El mundo avanza por tiempo de partida, no por tiempo real.

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
18. Backend: primero `context/full`; si falta información, búsqueda profunda en docs/mundo/DB antes de inventar o preguntar.

Estas decisiones son parte del núcleo validado del motor.

