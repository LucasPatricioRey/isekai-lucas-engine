# world_bible.md — Isekai Lucas

Versión: Fase 3 v0.2  
Estado: versión validada por Lucas mediante revisión guiada  
Uso: archivo de conocimiento/lore estable. No guarda estado vivo.  
Continuidad canon inicial: Día 10, 12:00, La Grulla Azul, Hoshimori.

---

## 0. Propósito y autoridad

Este archivo define **qué existe en el mundo**: regiones, países, culturas, instituciones, rutas, lugares, facciones, NPCs base, amenazas, economía de mundo, calendarios, costumbres, rumores base y tensiones de fondo.

Este archivo **no reemplaza** a `rules_engine.md` ni a MongoDB.

Jerarquía final:

1. MongoDB/save vivo: estado actual, ubicación, dinero, inventario, EXP, heridas, eventos, memorias NPC, rumores vivos, stock, misiones activas.
2. Confirmaciones explícitas de Lucas.
3. `rules_engine.md`: cómo se resuelve el juego.
4. `world_bible.md`: qué existe y cómo es el mundo.
5. Historial importado anterior.

Reglas de uso:

- No inventar países, ciudades importantes, facciones, dioses, NPCs persistentes o eventos enormes si este archivo ya define una base aplicable.
- Si falta detalle de una zona lejana, expandir desde la base existente, no contradecirla.
- Hoshimori es la región inicial detallada, pero no es el centro obligatorio del juego.
- Lucas puede irse y no volver; el mundo debe sostenerlo.
- Las rutinas, rumores, disponibilidad y consecuencias vivas se guardan en MongoDB.
- Este archivo puede tener rosters preparados, pero el estado actual de esos NPCs se consulta en backend.

---

## 1. Identidad general del mundo

### 1.1 Nombre del continente

El continente principal se llama **Asterion**.

Asterion es un continente de clima variado, tecnología medieval funcional, magia rara pero real, gremios profesionales, nobles regionales, rutas peligrosas y conflictos políticos de baja y media intensidad.

No existen razas no humanas como sociedades jugables o políticas. Hay humanos de distintas culturas, regiones y clases sociales. Sí existen animales, monstruos, bestias mágicas y anomalías.

### 1.2 Tono

El tono del mundo combina:

- Fantasía medieval seria.
- Isekai con sistema visible.
- Vida cotidiana realista.
- Instituciones con burocracia.
- Economía con stock, rutas y escasez.
- Política/nobleza con intereses propios.
- Magia sistemática y limitada por aprendizaje.
- Riesgo realista suave: consecuencias reales sin sadismo arbitrario.

### 1.3 Tecnología

Nivel general:

- Agricultura manual y animal.
- Herrería medieval.
- Molinos, carros, puentes de madera/piedra, caminos comerciales.
- Pergamino/papel simple según región y costo.
- Medicina básica: vendajes, hierbas, suturas simples, reposo, curanderos.
- No hay electricidad, pólvora común, vapor industrial ni tecnología moderna masiva.

Conocimiento moderno de Lucas puede ayudar a razonar, entrenar, organizar o mejorar procesos, pero no permite saltos tecnológicos sin materiales, herramientas, pruebas y contexto.

### 1.4 Magia en la sociedad

La magia existe, pero no es cotidiana para la mayoría.

Percepción social:

- Aldeas pequeñas: respeto, miedo leve, rumores.
- Ciudades: aceptación institucional limitada.
- Nobleza: interés político y militar.
- Gremio: pragmatismo y control.
- Templo: cautela espiritual.
- Mercado: curiosidad, temor si hay peligro.

No hay objetos mágicos comunes. Un objeto mágico real debe tener origen, dueño, costo, rareza y registro o rumor.

### 1.5 Aqua

Aqua existe como elemento especial ligado a Lucas y al sistema. Para el mundo común, Aqua **no es una deidad pública conocida** ni una figura institucional activa.

Uso estable:

- Aqua puede funcionar como notificación/sistema privado para Lucas.
- No aparece físicamente salvo eventos de origen ya establecidos.
- No interviene para resolver problemas.
- No entrega recompensas improvisadas.
- No conversa libremente con NPCs.
- Su bendición de aprendizaje mágico ×5 pertenece a reglas, no al lore público.

---

## 2. Calendario, estaciones y tiempo cultural

### 2.1 Año local

Año de 360 días.

4 estaciones, 12 meses, 30 días por mes.

### 2.2 Estaciones y meses

**Brote — primavera húmeda**
1. Rocío Nuevo
2. Flor Serena
3. Canto Verde

**Sol Alto — verano**
4. Trigo Dorado
5. Brasa Clara
6. Río Largo

**Hoja Caída — otoño**
7. Vendimia Gris
8. Viento Ocre
9. Niebla Baja

**Escarcha — invierno**
10. Luna Fría
11. Pino Blanco
12. Silencio Azul

### 2.3 Fecha de continuidad inicial

- Día mecánico: Día 10.
- Fecha diegética: 10 de Rocío Nuevo.
- Estación: Brote.
- Ubicación inicial: Hoshimori, La Grulla Azul.
- Hora inicial: 12:00.
- Estado vivo: se consulta en MongoDB.

### 2.4 Festividades locales conocidas

**Mercado de Primer Rocío**  
Día 1 de cada mes. Mercado ampliado, comerciantes visitantes, más rumores y testigos. No implica descuentos automáticos.

**Vigilia de la Llama Serena**  
Día 15 de Rocío Nuevo, Flor Serena, Vendimia Gris y Luna Fría. Velas, memoria de fallecidos, promesas, reflexión y apoyo comunitario.

**Feria de Canto Verde**  
Últimos 3 días de Canto Verde. Música, comida, visitas de pueblos cercanos y escenas sociales.

**Día del Pan Compartido**  
Día 10 de Trigo Dorado. Costumbre comunitaria de compartir comida básica. Puede afectar reputación si Lucas participa con lógica.

**Festival de la Cosecha Gris**  
Días 27–30 de Vendimia Gris. Cosecha, mercado rural, relatos de ancianos, trueques y agradecimientos.

**Noche de Silencio Azul**  
Día 30 de Silencio Azul. Cierre de año. Silencio, memoria, promesas y velas.

---

## 3. Mapa político de Asterion

Asterion tiene varios poderes humanos. No todos están en guerra abierta, pero todos tienen intereses.

### 3.1 Reino de Valdoria

Tipo: monarquía feudal pragmática.  
Capital: **Valdoria Alta**.  
Región inicial: Hoshimori pertenece a la **Marca Verde Oriental** de Valdoria.  
Tono: agrícola, fronterizo, burocrático, relativamente estable.  
Fortalezas: producción de grano, madera, gremios locales, rutas internas.  
Problemas: bandidaje rural, nobles menores ambiciosos, rutas mal mantenidas, frontera con bosques y colinas peligrosas.  
Relación con magia: regulada, útil, pero observada con cautela.

Hoshimori no es políticamente importante, pero pertenece al sistema fiscal y legal de Valdoria. La nobleza no interviene a diario, pero existe.

### 3.2 Ducados de Caerhall

Tipo: confederación de ducados montañosos.  
Capital de facto: **Bastión Caerhall**.  
Tono: militar, minero, frío, orgulloso.  
Fortalezas: hierro, piedra, armas, ingenieros de fortificación, mercenarios disciplinados.  
Problemas: disputas entre duques, minas peligrosas, monstruos de caverna, deudas por guerra.  
Relación con Valdoria: aliados tensos y competidores comerciales.

### 3.3 Liga Mercantil de Míradel

Tipo: ciudades portuarias y mercantes.  
Ciudad principal: **Puerto Míradel**.  
Tono: comercial, cosmopolita, calculador.  
Fortalezas: barcos, bancos, contratos, importaciones, telas, sal, especias.  
Problemas: corrupción, piratería, competencia entre casas mercantes, espionaje.  
Relación con magia: compra servicios mágicos si son rentables.

### 3.4 Principado de Aurensia

Tipo: principado noble con academias mágicas.  
Capital: **Aurenna**.  
Tono: elegante, académico, elitista.  
Fortalezas: teoría mágica, escribas, bibliotecas, tutores, diplomacia.  
Problemas: clasismo, secretos académicos, rivalidades de familias mágicas.  
Relación con Lucas: potencial futuro si busca formación mágica formal.

### 3.5 Frontera de Nárveth

Tipo: zona fronteriza dura con fuertes, aldeas pobres y rutas peligrosas.  
Ciudad principal: **Fuerte Nárveth**.  
Tono: áspero, militarizado, supervivencia.  
Fortalezas: exploradores, cazadores, soldados de frontera.  
Problemas: ataques de bandidos, bestias, clima extremo, abandono político.  
Uso narrativo: arcos de peligro, escoltas, guerra menor, supervivencia.

### 3.6 Dominio de Lythara

Tipo: dominio agrícola-ribereño gobernado por una red de casas nobles menores.  
Ciudad principal: **Lythara del Río**.  
Tono: fértil, diplomático, religioso, lleno de intrigas suaves.  
Fortalezas: vino, pan, pesca, barcazas, templos.  
Problemas: impuestos, disputas de herencia, rumores cortesanos, control de puentes.  
Relación con Valdoria: socio comercial y rival en cosechas.

### 3.7 Tierras Libres de Errain

Tipo: pueblos, clanes humanos y asentamientos independientes.  
Centro informal: **Cruce de Errain**.  
Tono: libre, peligroso, informal.  
Fortalezas: rutas alternativas, guías, cazadores, mercados grises.  
Problemas: poca ley, bandidaje, deudas, duelos, contratos privados.  
Uso narrativo: libertad, riesgo social, misiones fuera del gremio.

---

## 4. Instituciones continentales y regionales

### 4.1 Red del Gremio

El gremio opera como una red semiprofesional entre regiones.

Funciones:

- Registrar encargos.
- Evaluar aventureros/voluntarios.
- Coordinar patrullas y recolecciones.
- Mantener expedientes.
- Evitar que novatos mueran por exceso de confianza.
- Proteger su reputación ante clientes y autoridades.

Rangos oficiales en gran parte de Asterion:

1. Porcelana
2. Cobre
3. Bronce
4. Hierro
5. Plata
6. Oro
7. Platino
8. Mithril
9. Oricalco
10. Adamantita

Variaciones locales:

- Valdoria: burocrático, reportes y pruebas.
- Caerhall: más marcial, evalúa disciplina.
- Míradel: contratos precisos y multas.
- Aurensia: exige certificados para magia.
- Errain: más informal, pero menos protección.

### 4.2 Guardia local

Cada región tiene guardias con recursos limitados. En pueblos como Hoshimori, la guardia evita pánico y mantiene orden, pero no puede resolver todo.

La guardia puede:

- Intervenir en crímenes públicos.
- Tomar denuncias.
- Coordinar con el gremio.
- Controlar peleas y disturbios.
- Bloquear zonas peligrosas.

No puede:

- Saber secretos sin fuente.
- Resolver misiones de Lucas.
- Aparecer instantáneamente en zonas alejadas.
- Perdonar delitos graves sin consecuencia.

### 4.3 Consejos locales

Los pueblos suelen tener consejos con escribanos, ancianos, propietarios y representantes de oficios. No siempre hay un alcalde fuerte.

Funciones:

- Registros.
- Pequeños impuestos.
- Disputas vecinales.
- Coordinación de trabajos comunitarios.
- Pedidos al gremio/guardia.
- Contacto con nobles regionales.

### 4.4 Templos de la Llama Serena

Religión local extendida en Valdoria y Lythara.

Principios:

- Memoria de los muertos.
- Calma ante pérdidas.
- Promesas honestas.
- Auxilio básico.
- Comunidad.

No es una iglesia milagrosa. No revive muertos ni cura heridas graves por magia gratuita. Puede ofrecer reposo, velas, consejo, vendajes, infusiones y contactos.

### 4.5 Casas mercantes

Red de comerciantes, prestamistas, transportistas y almacenes.

Funciones:

- Stock.
- Precios.
- Rutas.
- Préstamos.
- Transporte.
- Contratos.

Pueden influir en pueblos si controlan suministros.

### 4.6 Bancos y crédito

Sistema dormido hasta que Lucas interactúe.

Existen principalmente en ciudades y rutas comerciales. En pueblos pequeños puede haber:

- Prestamistas.
- Crédito de tienda.
- Deudas de posada.
- Contratos firmados por consejo.
- Garantías de gremio.

Regla de mundo:

- La deuda afecta reputación.
- El préstamo tiene interés.
- Incumplir puede cerrar servicios o generar intervención legal.
- No se activa contra Lucas si no interactúa con el sistema.

---

## 5. Economía de mundo

### 5.1 Moneda

Moneda visible:

- 100 cobre = 1 plata.
- 100 plata = 1 oro.

MongoDB guarda dinero como cobre total. El mundo lo entiende en monedas físicas.

### 5.2 Economía rural de Valdoria

Productos comunes:

- Grano.
- Pan.
- Leña.
- Pieles.
- Herramientas.
- Hierbas.
- Raciones.
- Tela simple.
- Animales de granja.
- Servicios de posada.

Factores de precio:

- Clima.
- Estación.
- Stock.
- Rutas.
- Reputación.
- Urgencia.
- Calidad.
- Guerra.
- Bandidaje.
- Impuestos.

### 5.3 Cadenas de suministro

Ejemplos:

- Hoshimori depende de granjas, molino, leñadores y comerciantes de ruta.
- La herrería depende de hierro, carbón, cuero y encargos.
- La posada depende de grano, carne, verduras, leña y manos de trabajo.
- El mercado depende de viajeros, clima y seguridad de rutas.
- El gremio depende de clientes, reportes, fondos y reputación.

Si una cadena se rompe, el mundo lo refleja.

Ejemplo: si bandidos saquean la herrería, el estado de la herrería cambia, Borin cambia rutina, el stock cae, los precios suben y las misiones/rumores relacionados aparecen.

---

## 6. Región inicial: Hoshimori

### 6.1 Resumen

Hoshimori es un pueblo grande rural de frontera tranquila en la Marca Verde Oriental de Valdoria.

Población aproximada: 500–700 habitantes.  
Gobierno: consejo local difuso, guardia local y coordinación con el gremio.  
Economía: agricultura, madera, pieles, comida, comercio menor, encargos y viajeros.  
Magia: rara; se sabe que existe, pero verla no es cotidiano.  
Tecnología: medieval simple; sin objetos mágicos comunes.  
Religión: Llama Serena y espiritualidad local.  
Normas: trabajo, palabra dada, discreción, respeto por oficios y no causar problemas públicos.

### 6.2 Tono de Hoshimori

Hoshimori no es una capital ni un centro heroico. Es un lugar de trabajo, rumores pequeños, vínculos cotidianos y peligros cercanos si se sale del núcleo seguro.

La gente recuerda lo que ve. Los rumores viajan por posada, mercado, templo, gremio y guardia.

### 6.3 Ubicaciones principales

#### La Grulla Azul

Posada principal de Hoshimori.

Servicios:
- Comida.
- Camas simples.
- Bebidas suaves.
- Rumores de viajeros.
- Trabajo informal.
- Comidas de contrato para empleados.

Figuras clave:
- Roberto Valen.
- Fern.
- Yara Mils.
- Brann ocasionalmente.

Ambiente:
- Madera cálida.
- Olor a pan, sopa y brasas.
- Clientes de ruta.
- Mesas gastadas.
- Lluvia visible desde ventanas en mal clima.

Riesgo:
- Bajo.
- No hay combate hostil automático.
- Muchos testigos en sala/comedor.

#### Habitación de Lucas

Espacio simple dentro de La Grulla Azul.

Uso:
- Dormir.
- Ordenar inventario.
- Reflexionar.
- Práctica mental/mágica segura y discreta.

Límites:
- No entrenamientos destructivos.
- No magia peligrosa.
- No generar NPCs presentes sin causa.

#### Gremio local

Edificio modesto.

Servicios:
- Registro.
- Cartelera.
- Reportes.
- Evaluaciones.
- Encargos menores.
- Patio de práctica.
- Expedientes.

Figuras clave:
- Garrick Thorne.
- Mara Vell.
- Eddan Rusk.

Ambiente:
- Mostrador.
- Tablón de encargos.
- Archivos.
- Patio de entrenamiento.
- Olor a cuero, tinta, madera y sudor.

#### Mercado de Hoshimori

Zona comercial con alimentos, raciones, telas, herramientas, hierbas y mercancía básica.

Figuras:
- Pavo.
- Borin.
- Sella.
- Liora.
- Irma.

Riesgo:
- Seguro en general.
- Puede haber conflictos sociales, robos menores, rumores y discusiones si hay causa.

#### Plaza de Hoshimori

Centro social del pueblo.

Elementos:
- Fuente sencilla.
- Bancos.
- Anuncios.
- Paso de aldeanos.
- Niños, clientes, vendedores ambulantes.

Uso:
- Información pública.
- Escenas sociales.
- Anuncios del consejo.
- Rumores.

No es buena zona para secretos.

#### Templo de la Llama Serena

Pequeño santuario local.

Figura clave:
- Narek.

Servicios:
- Reposo.
- Velas.
- Consejo.
- Primeros auxilios simples.
- Infusiones.
- Memoria comunitaria.

No ofrece milagros gratuitos.

#### Herrería de Borin

Taller de herramientas, clavos, reparaciones, cuchillos, herraduras, piezas de carro y armas simples.

Figura clave:
- Borin.

Depende de:
- Hierro.
- Carbón.
- Leña.
- Cuero.
- Pedidos del gremio/guardia.

Si sufre saqueo o falta de suministros, el stock y servicios cambian en MongoDB.

#### Taller de Sella

Costura, ropa común, arreglos, mantas, capas simples.

Figura clave:
- Sella.

#### Puesto de Liora

Hierbas, infusiones, ungüentos simples, vendas y remedios básicos.

Figura clave:
- Liora.

#### Camino del Molino

Ruta rural hacia granjas y molino de Oren.

Riesgo:
- Bajo/medio según hora, clima y tramo.

Uso:
- Entregas.
- Rumores de ruta.
- Lobos aislados.
- Carreteros.
- Problemas de barro.

#### Molino de Oren

Molino rural que procesa grano para Hoshimori y granjas cercanas.

Figura clave:
- Oren.

Si hay problemas de molino, la posada y mercado pueden sufrir escasez.

#### Bosque de los Susurros

Bosque húmedo con borde transitable y profundidad peligrosa.

Zonas:
- Borde: riesgo medio.
- Zona media: riesgo medio/alto.
- Profundidad: alto riesgo para novatos.

Uso:
- Rastros.
- Lobos.
- Jabalíes.
- Criaturas raras.
- Actividad mágica baja/inestable.
- Misterios.
- Origen del despertar mágico de Lucas.

#### Colinas Grises

Zona pedregosa al norte.

Elementos:
- Viento frío.
- Grietas.
- Cuevas menores.
- Rutas poco usadas.
- Avispas rojas.
- Ratas gigantes.
- Posibles bandidos o criaturas de cueva.

Riesgo:
- Medio.

---

## 7. Rutas y distancias prácticas

### 7.1 Rutas internas de Hoshimori

- La Grulla Azul ↔ habitación de Lucas: 5 min.
- Comedor ↔ cocina de La Grulla Azul: 1–2 min.
- Comedor ↔ entrada/establo pequeño de la posada: 3 min.
- La Grulla Azul ↔ Plaza de Hoshimori: 10 min.
- La Grulla Azul ↔ Mercado de Hoshimori: 15 min.
- Habitación de Lucas ↔ Mercado de Hoshimori: 20 min.
- Plaza ↔ Mercado: 8 min.
- Plaza ↔ Gremio: 12 min.
- Plaza ↔ Templo: 8 min.
- Plaza ↔ Herrería de Borin: 10 min.
- Mercado ↔ Herrería: 5 min.
- Mercado ↔ Taller de Sella: 6 min.
- Mercado ↔ Puesto de Liora: 2 min dentro del mercado.
- Gremio ↔ Patio de entrenamiento: 2 min.
- Gremio ↔ Templo: 15 min.

### 7.2 Rutas exteriores cercanas

- La Grulla Azul ↔ Gremio local: 20 min.
- La Grulla Azul ↔ inicio del Camino del Molino: 25 min.
- Camino del Molino, inicio ↔ Molino de Oren: 45 min.
- Mercado ↔ granjas cercanas: 40–60 min según granja.
- La Grulla Azul ↔ Bosque de los Susurros: 90 min.
- Borde del Bosque ↔ zona media: 30–45 min adicionales.
- Zona media ↔ profundidad peligrosa: 45–90 min adicionales.
- La Grulla Azul ↔ base de Colinas Grises: 2 h 30 min.
- Base de Colinas Grises ↔ cuevas menores: 30–60 min adicionales.

### 7.3 Modificadores de viaje

- Lluvia leve/mal clima fuera del núcleo del pueblo: +25%.
- Lluvia fuerte fuera del núcleo: +50%.
- Carga pesada o heridos: puede aumentar duración.
- Noche/oscuridad: afecta visibilidad y orientación.
- El peligro no se determina por tabla automática de hora; depende de zona, contexto, evento, rutina y sentido común.

---

## 8. Clima de Hoshimori y efectos

### 8.1 Despejado

- Viajes normales.
- Mercado activo.
- Más gente en plaza.
- Bosque con visibilidad normal.

### 8.2 Nublado

- Ambiente apagado.
- Viajes normales o +10% si amenaza lluvia.
- Más conversaciones interiores.

### 8.3 Lluvia leve / mal clima pasajero

- Viajes a pie +25% fuera del núcleo.
- Menos gente en mercado/plaza.
- Más clientes refugiados en posada.
- Bosque húmedo/resbaladizo.
- Entrenamiento exterior incómodo.

### 8.4 Lluvia fuerte

- Viajes +50% fuera del núcleo.
- Mercado reducido.
- Mayor riesgo de resbalar en bosque/colinas.
- Más actividad en posada.
- Posibles retrasos de suministros.

### 8.5 Niebla

- Visibilidad reducida.
- Rutas y bosque se sienten más peligrosos.
- Rumores y malentendidos aumentan.

### 8.6 Frío

- Peor descanso al aire libre.
- Mayor coste narrativo si falta ropa adecuada.
- Mercado puede cerrar antes.

### 8.7 Calor

- Cansancio físico aumenta en trabajos fuertes.
- Sed se maneja narrativamente salvo situación extrema.

---

## 9. Cultura y normas locales

### 9.1 Conducta pública

La gente valora:

- Trabajar bien.
- Cumplir palabra.
- No causar escándalos.
- Respetar oficios.
- Pagar deudas.
- Ayudar sin presumir.
- Informar peligros.

La gente rechaza:

- Robar.
- Mentir en reportes.
- Pelear en la posada.
- Avergonzar a alguien públicamente.
- Usar magia peligrosa en zonas pobladas.
- Incumplir promesas importantes.

### 9.2 Rumores

Canales:

- Posada.
- Mercado.
- Gremio.
- Templo.
- Guardia.
- Camino del Molino.
- Clientes viajeros.

Los rumores pueden cambiar con el tiempo. MongoDB guarda versión viva, fuente, distorsión y alcance.

### 9.3 Magia pública

Mostrar magia sin control puede causar:

- Curiosidad.
- Temor.
- Rumor.
- Intervención de guardia/gremio si parece peligrosa.
- Interés de gente con conocimientos mágicos.

---

## 10. Facciones locales de Hoshimori

### 10.1 La Grulla Azul

Tipo: posada/trabajo/comida/red social.  
Figura clave: Roberto Valen.  
Intereses: reputación, seguridad, comida, camas, clientes, empleados confiables.  
Conflictos: clientes problemáticos, clima, falta de personal, rumores.

### 10.2 Gremio local

Tipo: institución de encargos.  
Figuras: Garrick, Mara, Eddan.  
Intereses: rutas seguras, registros, novatos vivos, encargos menores, reputación institucional.  
Limitación: Hoshimori no es sede importante.

### 10.3 Guardia de Hoshimori

Tipo: orden público.  
Figura visible: Kael.  
Intereses: calma, rutas, evitar pánico, proteger mercado.  
Limitación: pocos efectivos.

### 10.4 Mercado

Tipo: economía local.  
Figuras: Pavo, Borin, Sella, Liora, Irma.  
Intereses: precios, abastecimiento, seguridad, clientes, reputación.

### 10.5 Templo de la Llama Serena

Tipo: apoyo espiritual/social.  
Figura clave: Narek.  
Intereses: calma, memoria comunitaria, apoyo a heridos, cuidado de pobres.

### 10.6 Consejo local

Tipo: autoridad comunitaria.  
Figura posible: Celia Dorn.  
Intereses: registros, impuestos, resolución de disputas, coordinación con guardia/gremio.

---

## 11. NPCs base de Hoshimori

Esta sección define la base estable. La confianza, memoria concreta, ubicación exacta actual y cambios vivos van a MongoDB.

### 11.1 Roberto Valen

Edad: 42.  
Rol: dueño/encargado de La Grulla Azul.  
Ubicación habitual: La Grulla Azul.  
Personalidad: directo, práctico, trabajador, protector sin sentimentalismo, duro con vagos, justo con quien cumple.  
Habla: frases cortas, tono seco, humor gastado.  
Valores: responsabilidad, palabra dada, trabajo bien hecho, cuidar la posada.  
Tolera: errores honestos, cansancio razonable, preguntas directas, esfuerzo.  
Rechaza: mentiras, robo, peleas en la posada, faltar sin avisar, excusas flojas.  
Rutina base: 05:30–07:00 organiza cocina/desayuno; 07:00–11:00 controla sala/proveedores/trabajo; 11:00–14:00 cuentas/compras; 14:00–20:30 supervisa turno; 20:30–22:30 cierre parcial; 22:30–00:00 cierre final si hay clientes.  
Objetivos: mantener la posada estable, segura y rentable; encontrar trabajadores confiables; evitar escándalos.

### 11.2 Fern

Edad: 15.  
Rol: trabajadora reservada de La Grulla Azul; talento mágico latente/alto.  
Ubicación habitual: La Grulla Azul, cocina/comedor/habitaciones de trabajo.  
Personalidad: seria, reservada, observadora, prudente, sensible bajo control.  
Habla: breve, directa, a veces seca, pero no cruel.  
Valores: discreción, control, responsabilidad, seguridad.  
Tolera: respeto, honestidad, ayuda sin presión, silencio cómodo.  
Rechaza: invasión, gestos exagerados, insistencia romántica temprana, magia imprudente.  
Rutina base: mañana/tarde tareas de posada; noche cierre y descanso.  
Objetivos: estabilidad, control de sí misma, proteger su espacio emocional, aprender sin exponerse.  
Ganchos: consejo mágico prudente, vínculo lento, mirada crítica ante imprudencia.

### 11.3 Yara Mils

Edad: 16.  
Rol: aprendiz/ayudante de cocina y posada.  
Ubicación habitual: cocina, comedor, mercado por provisiones.  
Personalidad: amable, nerviosa, trabajadora, tímida si la atención es directa, un poco celosa cuando empieza a sentir apego o inseguridad.  
Habla: suave, frases cortas cuando se siente observada; más natural en confianza.  
Valores: sentirse útil, no ser humillada, que respeten su esfuerzo, no sentirse reemplazada o ignorada.  
Tolera: bromas ligeras, ayuda genuina, compañía tranquila.  
Rechaza: presión, burla pública, coqueteo brusco, que la usen para provocar celos o que la comparen de forma cruel.  
Rutina base: mañana apoya cocina; mediodía limpieza/comidas; tarde cocina/servicio; noche cierre.  
Objetivos: mejorar, ser tomada en serio, evitar retos de Roberto, entender qué lugar ocupa en sus vínculos.  
Ganchos: amistad laboral, confianza lenta, malentendidos suaves si se siente desplazada, celos juveniles leves si el contexto y la personalidad lo justifican.

### 11.4 Garrick Thorne

Edad: 38.  
Rol: coordinador de voluntarios/contacto del gremio.  
Ubicación habitual: gremio, rutas cercanas, patio.  
Personalidad: firme, razonable, institucional, protector de novatos.  
Habla: claro, serio, con advertencias prácticas.  
Valores: reportes honestos, preparación, responsabilidad.  
Rechaza: exageraciones, imprudencia, mentiras en misión.  
Rutina base: mañana registros/rutas; tarde coordinación; noche reportes.  
Objetivos: mantener novatos vivos y rutas funcionales.

### 11.5 Mara Vell

Edad: 31.  
Rol: administradora/escribana del gremio.  
Ubicación habitual: mostrador/archivos del gremio.  
Personalidad: ordenada, precisa, algo fría, justa si se respetan procedimientos.  
Habla: formal, seca, muy concreta.  
Valores: registros, pruebas, puntualidad, claridad.  
Rechaza: papeles incompletos, excusas, gente que toca archivos.  
Rutina base: abre registros por la mañana; cartelera y expedientes al mediodía; cierres por la tarde.  
Ganchos: puede ayudar a Lucas si presenta reportes claros.

### 11.6 Eddan Rusk

Edad: 45.  
Rol: instructor/evaluador físico del gremio.  
Ubicación habitual: patio del gremio.  
Personalidad: exigente, frontal, veterano cansado, justo.  
Habla: áspero, sin adornos.  
Valores: técnica, disciplina, retirada inteligente.  
Rechaza: fanfarronería, ataques sin plan, novatos suicidas.  
Rutina base: evaluaciones, sparring, mantenimiento de equipo.  
Ganchos: evaluación de combate, entrenamiento básico, crítica útil.

### 11.7 Brann

Edad: 18.  
Rol: ayudante ocasional de carga/mozo temporal.  
Ubicación habitual: posada, mercado, gremio ocasional.  
Personalidad: ruidoso, competitivo, algo inseguro bajo bromas.  
Habla: bromista, provocador suave.  
Valores: fuerza, reconocimiento, paga rápida.  
Rechaza: que lo humillen frente a otros.  
Ganchos: rivalidad laboral, humor, errores por orgullo.

### 11.8 Pavo

Edad: 50.  
Rol: vendedor de alimentos/raciones.  
Ubicación habitual: mercado.  
Personalidad: charlatán, negociador, atento a rumores.  
Habla: rápido, vendedor, exagera sin mentir del todo.  
Valores: clientes, margen, información.  
Rechaza: regateo agresivo, deuda sin garantía.  
Ganchos: rumores de mercado, precios variables, stock.

### 11.9 Borin

Edad: 47.  
Rol: herrero.  
Ubicación habitual: herrería.  
Personalidad: gruñón, metódico, orgulloso del oficio.  
Habla: pocas palabras, metáforas de metal.  
Valores: buen pago, herramientas cuidadas, respeto por el oficio.  
Rechaza: tocar herramientas sin permiso, pedir armas fiadas.  
Ganchos: reparaciones, stock, encargos de herramientas, consecuencias si la herrería es afectada.

### 11.10 Sella

Edad: 34.  
Rol: costurera/tendera de telas.  
Ubicación habitual: taller del mercado.  
Personalidad: observadora, paciente, chismosa moderada.  
Habla: amable pero precisa.  
Valores: presentación, cuidado, discreción rentable.  
Ganchos: ropa, rumores sociales, encargos pequeños.

### 11.11 Liora

Edad: 29.  
Rol: herborista.  
Ubicación habitual: puesto de hierbas.  
Personalidad: tranquila, intuitiva, algo misteriosa sin ser mágica necesariamente.  
Habla: pausado, con preguntas.  
Valores: calma, salud, plantas, pago justo.  
Ganchos: vendajes, infusiones, rumores de bosque, remedios simples.

### 11.12 Narek

Edad: 52.  
Rol: cuidador del Templo de la Llama Serena.  
Ubicación habitual: templo.  
Personalidad: sereno, compasivo, firme ante mentiras graves.  
Habla: bajo, pausado, reflexivo.  
Valores: memoria, calma, promesas, duelo.  
Ganchos: consejo, primeros auxilios, rituales comunitarios.

### 11.13 Kael

Edad: 36.  
Rol: guardia visible de Hoshimori.  
Ubicación habitual: plaza, mercado, rutas cercanas.  
Personalidad: cansado, pragmático, protector del orden.  
Habla: directo, con tono de advertencia.  
Valores: no crear pánico, resolver conflictos sin escalar.  
Ganchos: denuncias, peleas, bandidos, control de rumores.

### 11.14 Celia Dorn

Edad: 40.  
Rol: escribana del consejo local.  
Ubicación habitual: sala de registros/plaza.  
Personalidad: formal, diplomática, cuidadosa.  
Habla: educada, burocrática.  
Valores: documentos, acuerdos, reputación del pueblo.  
Ganchos: impuestos, permisos, registros, deudas formales.

### 11.15 Irma

Edad: 63.  
Rol: vecina/vendedora ocasional/historiadora oral.  
Ubicación habitual: mercado, templo, plaza.  
Personalidad: curiosa, dramática, afectuosa si cae bien.  
Habla: cuenta historias, mezcla rumor y recuerdo.  
Valores: memoria, juventud respetuosa, pan caliente.  
Ganchos: rumores de luces en bosque, memoria local.

### 11.16 Sael Nyra

Edad: 19.  
Rol: aventurera novata recurrente.  
Ubicación habitual: gremio, posada, rutas simples.  
Personalidad: ambiciosa, simpática, algo imprudente.  
Habla: energética, vende bien sus logros.  
Valores: ascenso, reconocimiento, compañeros útiles.  
Ganchos: party temporal, rivalidad, misiones menores.

### 11.17 Oren

Edad: 48.  
Rol: molinero.  
Ubicación habitual: molino del Camino del Molino.  
Personalidad: práctico, preocupado por rutas y clima.  
Habla: campesino directo.  
Valores: grano, maquinaria, familia, seguridad de caminos.  
Ganchos: retrasos, harina, problemas de suministro.

### 11.18 Tessa

Edad: 27.  
Rol: carretera/transportista local.  
Ubicación habitual: entrada del pueblo, mercado, camino del molino.  
Personalidad: franca, resistente, desconfiada con desconocidos.  
Habla: áspero, con humor seco.  
Ganchos: rutas, bandidos, retrasos, transporte.

### 11.19 Hilda Fen

Edad: 55.  
Rol: panadera.  
Ubicación habitual: horno cercano al mercado.  
Personalidad: maternal con límites, severa con deudores.  
Habla: cálida hasta que la hacen enojar.  
Ganchos: pan, escasez de harina, rumores de madrugada.

### 11.20 Rulan Veck

Edad: 22.  
Rol: aprendiz de guardia.  
Ubicación habitual: plaza/guardia.  
Personalidad: correcto, inseguro, quiere demostrar valor.  
Habla: formal de más.  
Ganchos: errores por nervios, testigo de incidentes, entrenamiento.

### 11.21 Merek Sol

Edad: 44.  
Rol: curtidor/pieles.  
Ubicación habitual: borde del mercado/taller.  
Personalidad: reservado, huele a cuero y humo, honesto si le pagan.  
Ganchos: pieles, animales, rastros, compras de recursos.

### 11.22 Nia

Edad: 13.  
Rol: recadera ocasional.  
Ubicación habitual: plaza, mercado, posada.  
Personalidad: rápida, curiosa, algo imprudente.  
Ganchos: mensajes, rumores inocentes, testigo inesperado.

### 11.23 Doran

Edad: 60.  
Rol: ex leñador.  
Ubicación habitual: plaza, Camino del Molino.  
Personalidad: terco, nostálgico, observador.  
Ganchos: rutas antiguas, clima, advertencias del bosque.

### 11.24 Maelis

Edad: 24.  
Rol: ayudante del templo.  
Ubicación habitual: templo, mercado por hierbas.  
Personalidad: gentil, firme, muy atenta al dolor ajeno.  
Ganchos: primeros auxilios, conflictos de fe, rumores de heridos.

### 11.25 Joren Pell

Edad: 33.  
Rol: comerciante de paso frecuente.  
Ubicación habitual: La Grulla Azul, mercado, rutas.  
Personalidad: educado, calculador, miedoso ante violencia.  
Ganchos: noticias de otras ciudades, suministros, precios.

---

## 12. Red social base de Hoshimori

### 12.1 Núcleo de La Grulla Azul

Roberto ↔ Fern  
Vínculo: jefe/empleada confiable.  
Circula: trabajo, horarios, problemas de posada.  
No circula fácil: secretos personales o magia profunda.

Roberto ↔ Yara  
Vínculo: jefe/aprendiz.  
Circula: tareas, errores, rendimiento, horarios.  
Tono: corrección seca y protección práctica.

Fern ↔ Yara  
Vínculo: compañeras de posada.  
Circula: trabajo, cansancio, comentarios simples.  
No circula fácil: emociones íntimas, secretos de Lucas.

Yara ↔ Brann  
Vínculo: compañeros ocasionales.  
Riesgo: bromas que incomodan si Brann presiona.

### 12.2 Núcleo de gremio

Garrick ↔ Mara  
Confianza funcional alta.  
Circula: expedientes, voluntarios, reportes.

Garrick ↔ Eddan  
Vínculo: coordinador/evaluador.  
Circula: riesgos, disciplina, entrenamiento.

Mara ↔ Eddan  
Vínculo: burocracia vs práctica.  
Puede haber tensión por novatos imprudentes.

Sael ↔ Gremio  
Busca oportunidades y reconocimiento. Puede exagerar si no se la controla.

### 12.3 Núcleo mercado

Pavo ↔ Sella  
Intercambian rumores de clientes.

Borin ↔ Pavo  
Relación práctica; Borin detesta exageraciones.

Liora ↔ Narek  
Comparten preocupación por heridos y remedios.

Hilda ↔ Oren  
Dependencia de harina/pan. Si el molino falla, Hilda se ve afectada.

### 12.4 Guardia/consejo

Kael ↔ Celia  
Guardia y registros. Celia quiere papeles; Kael quiere resolver sin pánico.

Kael ↔ Garrick  
Coordinación ante amenazas menores.

---

## 13. Región cercana a Hoshimori

### 13.1 Granjas de la Marca Verde

Asentamientos dispersos que abastecen al pueblo.

Productos:
- Trigo.
- Verduras.
- Huevos.
- Leche.
- Leña.
- Lana menor.

Riesgos:
- Lluvia.
- Animales.
- Rutas embarradas.
- Pequeños robos.
- Lobos aislados.

### 13.2 Aldea de Mizuho Bajo

Pequeña aldea ribereña a varias horas de Hoshimori.

Tono: pescadores, barcazas pequeñas, arrozales húmedos.  
Función: comida, rutas de agua, rumores de río.  
NPCs preparados:
- Ren Kaito, barquero.
- Misa Toren, curandera de río.
- Daito, pescador anciano.
- Lina, niña recadera.
- Soren, guardia de puente.

### 13.3 Puesto de Linder

Puesto de control entre Hoshimori y rutas mayores.

Tono: guardias, carros, peajes menores.  
Función: control de rutas, noticias de Valdoria.  
NPCs preparados:
- Varek Hoss, sargento.
- Mina El, escribana de peaje.
- Tor Brava, carretero.
- Elian, joven guía.

### 13.4 Cantera Vieja

Cantera abandonada parcialmente.

Riesgo: medio.  
Amenazas: derrumbes, animales, ladrones ocasionales, ratas gigantes.  
Uso: misiones de búsqueda, materiales, rumores.

---

## 14. Ciudades y regiones mayores preparadas

Estas zonas existen desde el inicio. No se detallan al nivel de Hoshimori hasta que Lucas se acerque, pero no son inventadas desde cero.

### 14.1 Valdoria Alta

Capital del Reino de Valdoria.

Tono: murallas, palacio, gremio mayor, archivos, impuestos, nobleza funcional y corrupción moderada.  
Funciones: política, justicia, registros, comercio mayor.  
Facciones:
- Corte real.
- Archivo de Sellos.
- Gremio Mayor de Valdoria.
- Guardia Real.
- Casas nobles menores.
- Bancos de Míradel con oficinas.

NPCs principales preparados:
- Reina Althea Valenor: monarca prudente.
- Lord Caelum Orst: noble de frontera, ambicioso.
- Ser Darius Venn: capitán de Guardia Real.
- Ilyra Morn: escribana de archivos.
- Tomas Grell: banquero mercantil.
- Selene Arv: tutora mágica registrada.
- Vicar Othran: templo mayor de Llama Serena.
- Jessa Karr: informante de mercado.

### 14.2 Bastión Caerhall

Ciudad fortaleza minera.

Tono: piedra, hierro, disciplina, frío.  
Funciones: armas, metal, mercenarios, defensa de montaña.  
Facciones:
- Ducado de Caerhall.
- Sindicato de mineros.
- Forjadores juramentados.
- Gremio marcial.
- Compañías de escolta.

NPCs preparados:
- Duque Roderic Caer: gobernante duro.
- Maestra Forja Elna Brask: herrera famosa.
- Capitán Harl Voss: militar.
- Ciro Dann: minero líder.
- Freya Holt: médica de fortaleza.
- Brikka Norn: prestamista de mineros.
- Sander Pell: aprendiz expulsado.
- Osk Var: guía de cuevas.

### 14.3 Puerto Míradel

Ciudad portuaria de la Liga Mercantil.

Tono: mar, dinero, contratos, deuda, rumores extranjeros.  
Funciones: comercio exterior, bancos, sal, especias, telas, información.  
Facciones:
- Casas mercantes.
- Bancos.
- Capitanes de barco.
- Aduana.
- Gremio portuario.
- Mercado gris.

NPCs preparados:
- Dama Nerissa Vale: líder mercante.
- Aron Flet: banquero.
- Capitán Sulo Marr: naviero.
- Vera Quinn: aduanera.
- Kesia Lorn: tejedora de lujo.
- Milo Senn: mensajero callejero.
- Padre Halren: templo del puerto.
- Basto Reik: cobrador de deudas.

### 14.4 Aurenna

Capital del Principado de Aurensia.

Tono: academias, jardines, torres, nobleza mágica.  
Funciones: enseñanza mágica, teoría, bibliotecas, registros de hechizos.  
Facciones:
- Casa principesca.
- Círculo de tutores.
- Biblioteca de Aurenna.
- Gremio regulado de magia.
- Nobles académicos.

NPCs preparados:
- Príncipe Elian Aurens: gobernante joven y educado.
- Maestra Calith Rae: tutora de teoría mágica.
- Sira Vellune: bibliotecaria estricta.
- Jorvan Tel: noble arrogante.
- Mireya Solm: aprendiz brillante.
- Orven Dael: inspector de magia pública.
- Nalia Cresth: médica arcana.
- Reth Koval: copista pobre.

### 14.5 Fuerte Nárveth

Frontera militar.

Tono: barro, sangre vieja, viento, guardias cansados.  
Funciones: defensa, patrullas, escoltas, refugio de aldeas.  
Facciones:
- Comandancia del fuerte.
- Exploradores de frontera.
- Refugiados rurales.
- Gremio de riesgo.
- Contrabandistas.

NPCs preparados:
- Comandante Ysold Brand: líder severa.
- Tarek Finn: explorador.
- Luma Ors: médica de campaña.
- Hakon Drav: herrero militar.
- Nessa Vale: huérfana recadera.
- Cain Rudd: contrabandista.
- Elric Sorn: sacerdote agotado.
- Bera Kint: cocinera del fuerte.

### 14.6 Lythara del Río

Ciudad ribereña fértil.

Tono: puentes, vino, barcazas, templos, intriga suave.  
Funciones: comida, vino, transporte fluvial, festivales.  
Facciones:
- Casas ribereñas.
- Templo de la Llama Serena.
- Barqueros.
- Gremio de escoltas.
- Consejo de puentes.

NPCs preparados:
- Lady Maren Lys: noble ribereña.
- Doval Rinn: barquero jefe.
- Salia Fenn: sacerdotisa.
- Piero Mal: comerciante de vino.
- Enna Tal: cantora de feria.
- Rusk Lann: guardia de puente.
- Velia Or: contadora de impuestos.
- Mikel Dorn: ladrón menor.

### 14.7 Cruce de Errain

Centro informal de Tierras Libres.

Tono: caminos, polvo, tratos, libertad peligrosa.  
Funciones: guías, contratos privados, mercado gris, rutas alternativas.  
Facciones:
- Guías libres.
- Prestamistas.
- Bandas pequeñas.
- Posadas independientes.
- Gremio débil.

NPCs preparados:
- Ral Kest: guía famoso.
- Dama Sorna: dueña de posada.
- Tibo Karr: prestamista.
- Marn: cazador silencioso.
- Irel Vos: mensajera.
- Gant Ro: duelista barato.
- Nera Linn: curandera sin licencia.
- Pell Hark: vendedor de mapas.

---

## 15. Facciones mayores de Asterion

### 15.1 Corona de Valdoria

Objetivo: estabilidad, impuestos, rutas seguras, control de nobles.  
Conflictos: nobles fronterizos, falta de fondos, presión mercantil.  
Relación con Lucas: indirecta al inicio.

### 15.2 Casas Nobles Menores

Objetivo: tierras, prestigio, matrimonios, impuestos, favores.  
Varían entre funcionales, corruptas y protectoras.  
Pueden convertirse en aliados o problemas.

### 15.3 Red del Gremio

Objetivo: contratos, seguridad, reputación y control de riesgos.  
No es caridad ni ejército privado de Lucas.

### 15.4 Bancos de Míradel

Objetivo: deuda, inversión, comercio, garantías.  
Pueden ayudar o atrapar con contratos.

### 15.5 Círculo de Aurensia

Objetivo: conocimiento mágico, control académico, prestigio.  
Interés potencial en Lucas si descubre su talento.

### 15.6 Guardia y Milicias

Objetivo: orden, protección local, no quedar superadas.  
Limitadas por personal, dinero y política.

### 15.7 Bandas y Bandidos

No son una sola facción. Pueden surgir por pobreza, oportunidad, guerra o rutas débiles.

Bandas iniciales:
- Los Cuchillos del Barro: asaltan rutas embarradas.
- Mano de Tiza: falsificadores menores.
- Perros de Nárveth: desertores y ladrones de frontera.

### 15.8 Templo de la Llama Serena

Objetivo: memoria, calma, asistencia social, legitimidad moral.  
No busca controlar el mundo, pero puede influir en reputación.

---

## 16. Amenazas, fauna y monstruos

No existen razas no humanas políticas. Las amenazas no humanas son fauna, bestias, monstruos o anomalías.

### 16.1 Animales comunes

- Lobos.
- Jabalíes.
- Osos raros en zonas profundas.
- Ciervos.
- Caballos.
- Perros.
- Ratas.
- Aves de rapiña.

### 16.2 Bestias peligrosas

**Lobos de borde**  
Zonas: bosques/rutas.  
Peligro: bajo/medio en grupo.  
Conducta: evitan grupos grandes, atacan aislados/heridos.

**Jabalí gris**  
Zonas: bosque y granjas.  
Peligro: medio si se lo provoca.  
Conducta: carga brutal.

**Ratas gigantes**  
Zonas: cuevas, sótanos, graneros abandonados.  
Peligro: bajo/medio en número.  
Recursos: piel pobre, dientes, prueba de subyugación si contrato lo pide.

**Avispas rojas**  
Zonas: Colinas Grises, madera podrida, cuevas secas.  
Peligro: medio.  
Conducta: territoriales.

### 16.3 Anomalías mágicas menores

**Luces del Bosque**  
Zonas: Bosque de los Susurros.  
Peligro: variable.  
Conducta: atraen, confunden, no siempre hostiles.  
No deben convertirse automáticamente en tesoro o hechizo.

**Eco de Maná**  
Zonas: bosque profundo, ruinas, lugares de muerte.  
Peligro: bajo/medio.  
Uso: pistas, percepción mágica, misterio.

**Niebla Fría**  
Zonas: rutas al amanecer/noche.  
Peligro: orientación y rumor.  
Uso: tensión, no combate automático.

### 16.4 Humanos hostiles

- Bandidos.
- Ladrones de mercado.
- Falsificadores.
- Matones de deuda.
- Desertores.
- Contrabandistas.

Los humanos hostiles tienen motivaciones. No aparecen solo para dar combate.

---

## 17. Rumores base y semillas de eventos

Estos rumores son potenciales. MongoDB decide cuáles están activos, quién los sabe y cómo se deforman.

### 17.1 Hoshimori

- Se retrasaron suministros por barro residual.
- Hay luces raras en el Bosque de los Susurros.
- Un lobo fue visto cerca del Camino del Molino.
- Borin se quejó por falta de carbón bueno.
- El gremio busca voluntarios para tareas post-lluvia.
- Yara parece estar trabajando más tarde de lo normal algunos días.
- Fern sabe más de magia de lo que aparenta, pero pocos lo dirían con certeza.
- Sael busca compañeros para una misión menor.
- Irma dice que el bosque “habla” después de la lluvia.

### 17.2 Valdoria

- La corte discute impuestos de rutas.
- Una casa noble menor quiere más control sobre gremios.
- Hay presión para registrar magos más estrictamente.
- Algunas aldeas se quejan de falta de guardias.

### 17.3 Caerhall

- Mineros desaparecieron en un túnel viejo.
- Se están comprando armas más rápido de lo normal.
- Un duque acusa a otro de retener hierro.

### 17.4 Míradel

- Los bancos subieron intereses.
- Barcos llegaron tarde.
- Hay piratas o eso dicen los comerciantes que quieren subir precios.

### 17.5 Aurensia

- Una academia perdió un manuscrito.
- Familias mágicas discuten por tutorías.
- Se busca talento no registrado.

---

## 18. Gremio y misiones como mundo estable

El catálogo base y la filosofía del gremio existen en `rules_engine.md` y seeds estáticos. La cartelera activa se guarda en MongoDB.

### 18.1 Misiones Porcelana potenciales

- Mensaje al templo.
- Ordenar tablón de encargos.
- Ayuda con cajas de suministros.
- Llevar lista de compras a Borin.
- Limpieza post-lluvia.
- Repartir avisos del mercado.
- Ayudar a Yara con provisiones si se registra.
- Buscar herramienta perdida.
- Acompañar a Irma con cargas.
- Vigilar mercancía durante descanso del vendedor.
- Copiar registro simple para Mara.

### 18.2 Misiones Cobre potenciales

- Buscar rastros de lobos cerca del camino.
- Recolectar musgo medicinal común.
- Inspeccionar sótano por ruidos.
- Entrega sellada al consejo local.
- Vigilia de ruta al atardecer.

### 18.3 Misiones Bronce potenciales

- Patrulla del borde del Bosque de los Susurros.
- Investigar luces en el bosque.
- Evaluación de sparring oficial.
- Escolta simple a ruta cercana.
- Subyugación menor con prueba clara.

Misiones superiores existen, pero no son para Lucas actual como líder.

---

## 19. Estado inicial estático de lugares importantes

El estado vivo se guarda en MongoDB, pero el estado base de inicio es:

### La Grulla Azul

Estado base: operativa.  
Evento inicial asociado: retraso de suministros por barro residual durante Mediodía Día 10.  
Dueño: Roberto.  
Empleados/recurrentes: Fern, Yara, Brann ocasional, Lucas actualmente contratado.

### Gremio local

Estado base: operativo.  
Cartelera: depende de MongoDB.  
Lucas: aspirante útil/Porcelana, registro formal completo pendiente.

### Mercado

Estado base: operativo, afectado por clima si corresponde.  
Stock: depende de MongoDB.

### Herrería

Estado base: operativa.  
Dueño: Borin.  
Stock inicial: herramientas comunes, reparaciones, piezas, armas simples limitadas.

### Templo

Estado base: operativo.  
Servicios: apoyo social, velas, primeros auxilios simples.

### Bosque de los Susurros

Estado base: borde transitable, profundidad peligrosa.  
Actividad mágica baja/inestable.  
No entrar profundo sin preparación lógica.

---

## 20. Regla de expansión futura

Cuando Lucas viaje a una zona ya nombrada:

1. Consultar este archivo.
2. Consultar MongoDB para estado vivo.
3. Si faltan NPCs secundarios, crear desde plantillas coherentes.
4. No contradecir política, economía, clima, rutas o facciones ya definidas.
5. Agregar nuevos NPCs persistentes solo si pertenecen al roster preparado o Lucas decide que importan.
6. Registrar cambios vivos en MongoDB, no en este archivo.

---

## 21. Plantilla para nuevas ciudades/regiones

Nombre:  
Tipo:  
País/reino:  
Población aproximada:  
Gobierno:  
Economía:  
Facciones:  
Riesgos:  
Relación con magia:  
Lugares clave:  
NPCs preparados:  
Rutas:  
Rumores base:  
Eventos potenciales:  

---

## 22. Plantilla para NPC persistente

Nombre:  
Edad:  
Rol:  
Ubicación habitual:  
Personalidad:  
Habla:  
Valores:  
Tolera:  
Rechaza:  
Rutina base:  
Objetivos:  
Visual:  
Conexiones mínimas:  
Información que puede circular:  
Información que no debería circular:  
Ganchos:  
Secretos opcionales:  

---

## 23. Plantilla para facción

Nombre:  
Tipo:  
Alcance:  
Objetivos:  
Recursos:  
Límites:  
Aliados:  
Rivales:  
Relación con Lucas:  
Rumores asociados:  
Consecuencias posibles:  

---

## 24. Plantilla para amenaza

Nombre:  
Tipo: animal/bestia/anomalía/humano hostil.  
Zonas:  
Señales:  
Conducta:  
Peligro:  
Motivación:  
Recursos posibles:  
Requiere contrato para recompensa: sí/no.  
Notas:  

---

## 25. Notas de diseño cerradas

- Hoshimori no es una capital ni un mundo entero, pero está bien detallado.
- Asterion existe desde el principio para evitar inventar países sobre la marcha.
- Los NPCs preparados pueden crecer con MongoDB; los genéricos no.
- La economía debe sentirse viva, pero no asfixiar la aventura.
- La magia es rara y sistemática.
- Las facciones tienen intereses propios.
- Los eventos grandes necesitan causa.
- El mundo avanza por tiempo de partida, no por tiempo real.

---

## Anexo A — Validación guiada de Fase 3

Lucas confirmó las siguientes decisiones para `world_bible.md`:

1. Continente principal: Asterion.
2. Hoshimori pertenece al Reino de Valdoria, en la Marca Verde Oriental.
3. Se confirman los grandes poderes iniciales: Valdoria, Caerhall, Míradel, Aurensia, Nárveth, Lythara y Errain.
4. No hay razas no humanas políticas o jugables; sí hay monstruos, bestias y anomalías mágicas.
5. Aqua no es una diosa pública conocida; queda ligada al sistema privado de Lucas.
6. Se confirma el Templo de la Llama Serena como religión/culto local.
7. La nobleza será mixta: funcional, corrupta o ambiciosa según casa/persona/contexto.
8. Nivel de oscuridad: medio-alto, pero no grimdark.
9. Inspiración estética: fantasía europea medieval con sensibilidad anime/isekai y nombres suaves/japoneses en zonas como Hoshimori.
10. Hoshimori queda confirmado como pueblo grande rural de 500–700 habitantes.
11. El roster inicial de Hoshimori queda confirmado con aproximadamente 25 NPCs base.
12. Fern mantiene perfil reservado/prudente/mágico; Yara queda como amable/tímida/trabajadora y un poco celosa si el contexto lo justifica.
13. Ciudades lejanas quedan con rosters principales iniciales, ampliables cuando Lucas se acerque.
14. La magia es rara, respetada y algo temida; más regulada en ciudades, más rumor en pueblos.
15. El gremio es una red continental con rangos comunes y variaciones locales.
16. Bancos/deudas existen sobre todo en ciudades/rutas comerciales; en pueblos hay prestamistas, crédito de tienda o deudas de posada.
17. Amenazas confirmadas: animales, bestias, anomalías y humanos hostiles.
18. Rumores base confirmados; su versión viva se guarda en MongoDB.
19. Nombres de ciudades/regiones confirmados: Valdoria Alta, Bastión Caerhall, Puerto Míradel, Aurenna, Fuerte Nárveth, Lythara del Río y Cruce de Errain.
20. Fase 3 queda validada para pasar a Fase 4.

