# isekai-lucas-engine

Backend Node/Express/MongoDB para el motor RPG Isekai Lucas.

## Stack

- Node.js
- Express
- MongoDB Atlas
- Mongoose
- API Key por header x-api-key

## Backend local

Comandos:

cd backend
npm install
npm run dev

## Scripts utiles

npm run check
npm run seed
node src/seeds/seedWorldEssentials.js
node src/seeds/seedDocuments.js

## Endpoints principales

- GET /api/health
- GET /api/context/full
- POST /api/turn/apply
- GET /api/search/db
- GET /api/search/docs
- GET /api/npcs/:npcId/full
- GET /api/locations/:locationId/full
- POST /api/checkpoints
