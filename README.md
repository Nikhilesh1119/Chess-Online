# Chess Online

Production-ready chess app with:
- local play
- play vs engine
- online 2-player sessions with realtime moves (Socket.IO)

## Stack
- Frontend: Vite + Tailwind + vanilla JS
- Chess rules: `chess.js`
- Backend: Node.js + Express + Socket.IO

## Local Development
1. Install dependencies:
   - `npm install`
2. Start frontend + backend:
   - `npm run dev`
3. Open:
   - `http://localhost:5173`

## Production Run
1. Build frontend:
   - `npm run build`
2. Start server:
   - `npm start`
3. App runs on:
   - `http://localhost:3001` (or your `PORT`)

Server serves static files from `dist` and also hosts:
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `GET /health`

## Environment Variables
Copy `.env.example` to `.env` if needed.

- `PORT` (default `3001`)
- `VITE_SERVER_URL` (optional; usually not needed now because dev uses Vite proxy)

## Deployment Notes
- Deploy as a Node web service.
- Build command: `npm run build`
- Start command: `npm start`
- Ensure WebSockets are supported by your hosting provider.
- Use `/health` for health checks.

## Online Session Rules
- Max 2 players per session.
- Third join attempt is rejected.
- Moves sync in realtime.
- Illegal moves and wrong-turn moves are blocked server-side.
