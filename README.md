# Kahoot-style Join + Lobby (original)

Next.js (TypeScript) + Tailwind app with a **Join** screen and a **Lobby** screen.

## Run locally

```bash
npm run dev
```

- Web app: `http://localhost:3000`
- WebSocket server: `ws://localhost:3001`

## Demo rooms (JSON)

Edit `src/data/rooms.json` to change available game PINs and titles.

## Optional config

- `NEXT_PUBLIC_WS_URL` (example: `ws://localhost:3001`)

## Build

```bash
npm run build
npm start
```
