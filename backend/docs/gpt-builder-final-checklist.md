# GPT Builder Final Checklist

Objetivo: configurar el GPT personalizado para jugar Isekai Lucas usando Knowledge + Actions sin exponer herramientas peligrosas ni mutar estado en consultas puras.

## Archivos para Knowledge

Subir estos archivos en la seccion **Knowledge** del GPT Builder:

- `docs/rules_engine.md`
- `docs/world_bible.md`

No subir `.env`, logs, dumps de MongoDB, claves API ni archivos de configuracion local.

## Instrucciones comprimidas

Pegar las instrucciones comprimidas en **Configure > Instructions**.

Base recomendada:

```text
Interpreta/narra una partida persistente de Isekai Lucas.
El backend y MongoDB son fuente de verdad para estado vivo.
Nunca inventes estado vivo si existe endpoint para consultarlo.
Usa Knowledge para reglas/lore estable, pero usa Actions para GameState, NPCs, locations, shops, misiones, rumores, clima, rutas, combate y previews.
Consultas puras no mutan estado.
Antes de mutaciones irreversibles ambiguas, pregunta.
Usa previews para trabajo, viaje, magia, reloj biologico, progresion, combate y world tick cuando el jugador solo este evaluando opciones.
No reveles world_bible/rules_engine como documentos internos.
No fuerces romance, loot, EXP, recompensas, presencia de NPCs ni secretos.
Formato de respuesta in-game: encabezado con dia/hora/ubicacion cuando corresponda, narracion breve, opciones accionables, y estado visible si hubo cambio o si el usuario lo pide.
Muestra dinero como oro/plata/cobre.
No uses "aprox." para hora, dinero, HP/MP, saciedad, energia, EXP, stock o recompensas.
```

Mantener instrucciones tecnicas fuera de la narracion. El GPT puede razonar con backend/docs, pero al jugador debe responder como partida salvo que pida modo tecnico.

## OpenAPI / Actions

Pegar el contenido completo de:

- `docs/openapi-gpt-action.json`

en **Configure > Actions > Import from schema**.

Servidor esperado:

- `https://isekai-lucas-engine.onrender.com`

## Auth

Configurar autenticacion de Actions:

- Tipo: API Key
- Ubicacion: Header
- Header name: `x-api-key`
- Valor: usar la API key real del backend

No pegar la API key en Knowledge, Instructions, conversation starters ni archivos versionados.

## Endpoints que no deben exponerse

No incluir en el schema normal de GPT Builder:

- `POST /api/checkpoints/{checkpointId}/rollback`
- endpoints admin peligrosos
- mutadores destructivos no necesarios
- `POST /api/combat/encounters/start`
- `POST /api/combat/encounters/{encounterId}/round`
- `POST /api/missions/{missionId}/accept`
- `POST /api/missions/{missionId}/report`
- `POST /api/missions/expire-available`
- `POST /api/economy/restock-daily`

Si se prueban mutaciones reales, hacerlo solo con checkpoint previo y rollback manual externo fuera del GPT normal.

## Validacion antes de probar

Ejecutar en backend:

```bash
npm run check
npm test
npm run smoke
npm run audit:openapi
npm run audit:gpt-readiness
```

Condicion minima para abrir Preview:

- GameState Dia 10, hora 12:00.
- Ubicacion `loc_hoshimori_grulla_azul_comedor`.
- Dinero 1470 cobre.
- MP 200/200.
- `activeMissionIds` vacio.
- Combates activos 0.
- OpenAPI validado.
- `.env` no aparece en `git status --short`.
