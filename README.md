# plungepalz-places

Cold plunge and sauna location discovery for PlungePalz.

## Project structure

- **/** — Next.js app (Vercel-ready). Runbook: [docs/FRONTEND.md](docs/FRONTEND.md)
- **backend/** — AWS serverless API (Lambda, DynamoDB, Algolia). See [backend/README.md](backend/README.md)

`backend/` is not part of the Next.js app. Do not run frontend commands from there.

## Frontend (repo root)

Requires **Node.js 22** (`.nvmrc` pins 22; `package.json` `engines.node` is `>=22`). `mapbox-gl` does not install cleanly on older Node.

```bash
nvm use
npm install
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3000**. Mock data is the default until `NEXT_PUBLIC_API_BASE_URL` is set. Without a Mapbox token the map shows a placeholder; the list and filters still work.

```bash
npm run lint
npm test
npm run build
npm start
```

Never commit `.env.local`, a real API URL, or a Mapbox token. `.env.example` keeps placeholders only.

## Backend

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests
```
