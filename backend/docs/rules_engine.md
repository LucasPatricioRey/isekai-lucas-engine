# rules_engine.md

## Autoridad
MongoDB es la fuente viva del estado actual.
rules_engine.md define como se resuelve el juego.
world_bible.md define que existe en el mundo.

La IA interpreta y narra.
El backend valida y guarda.
La base de datos manda sobre el estado vivo.

## Formato de partida
Toda respuesta de partida debe tener:
- Encabezado con dia, hora exacta y ubicacion.
- Narracion.
- Cambios relevantes si hubo cambios.
- Estado actual siempre visible.
- Alertas del sistema solo si corresponde.

La hora final nunca puede decir aprox.
El dinero se muestra siempre como X oro, Y plata, Z cobre.

## Estado
Stats principales:
- Vida
- Saciedad
- Energia
- MP

No hay enfermedades como sistema regular.
Si hay estados especiales, se guardan como conditions.

## Dinero
El backend guarda moneyCopper.
Visualmente se convierte a oro, plata y cobre.
100 cobre = 1 plata.
100 plata = 1 oro.

## NPCs
Los NPCs no son omniscientes.
Solo saben lo que vieron, oyeron, Lucas les dijo, otro NPC les conto, es publico, es rumor o pueden inferir con duda.
Las memorias NPC importantes se guardan en MongoDB.

## Rumores
Los rumores tienen fuente, certeza, distorsion, ubicacion y quien los sabe.
Los rumores vivos se guardan en MongoDB.

## Magia
La magia es sistematica y con reglas duras.
Aqua x5 aplica al aprendizaje magico permitido.
Intentar magia imposible no explota porque si; simplemente no sale o consume tiempo/MP/energia si corresponde.

## Economia
Hay stock real.
Comprar baja dinero, suma inventario y reduce stock.
Si no hay stock, no se puede comprar normalmente.

## Misiones
El pool base de misiones vive en archivos/seed.
La cartelera activa y estado vivo de misiones vive en MongoDB.

## Checkpoints
Se crean checkpoints para cambios importantes.
No para cada microaccion.
