# Secret Audit Guide

Do not commit `.env` or `backend/.env`.

The backend currently requires these variables:

- `API_KEY`: required by protected API routes and GPT Actions.
- `MONGODB_URI`: required for MongoDB connection, seeds and audits.

Safe audit flow:

1. Keep real values only in local `.env`, `backend/.env`, Render environment variables, or the secure environment store of the audit runner.
2. Use `.env.example` and `backend/.env.example` to verify required variable names.
3. For Codex/Codex Pro local audits, allow the agent to read local ignored `.env` files, but never print their values.
4. For remote CI or another machine, configure the same variables as secrets in that environment instead of committing them.
5. If a secret is ever pushed by mistake, rotate it immediately and purge/rewrite repository history before treating it as private again.

Recommended checks for a large audit:

```bash
cd backend
npm run audit:openapi
npm run audit:openapi-compact
npm run audit:state-hygiene
npm run seed:documents
```

When using live MongoDB, prefer read-only audits unless the phase explicitly requires controlled mutation.
