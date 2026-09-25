# YouTube Watch Party

Watch YouTube videos in sync with friends. One person creates a room, everyone else joins with a code or link, and play / pause / seek / video changes are mirrored to the whole room in real time over WebSockets (Socket.IO). Rooms have roles: the **Host** and **Moderators** control playback; **Participants** watch and can *request* changes that a Host/Moderator approves.

**Live URL:** `https://<your-app>.onrender.com` &nbsp;← _replace with your deployed URL after following [Deploy](#deploy-render-recommended)_

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite, `react-youtube` (YouTube IFrame API), `react-router-dom`, `react-hot-toast`, `lucide-react` |
| Backend | Node.js + Express + Socket.IO (TypeScript) |
| Realtime | Socket.IO (WebSocket transport, polling fallback) |
| State | In-memory rooms (no database needed for the MVP) |

## Folder structure

```
.
├── package.json          # root scripts: build / start / test (used by Render/Railway)
├── render.yaml           # Render Blueprint (single web service)
├── backend/
│   ├── src/
│   │   ├── server.ts        # Express + Socket.IO, event handlers, validation
│   │   ├── roomManager.ts   # rooms, users, video state, approval queue
│   │   ├── permissions.ts   # role → permission rules
│   │   └── types.ts
│   ├── tests/integration.test.ts   # Socket.IO end-to-end tests (14)
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── contexts/SocketContext.tsx   # socket, room + playback + request state
    │   ├── components/YouTubePlayer.tsx # IFrame player + role-aware controls
    │   ├── components/RequestsPanel.tsx # Host/Mod approval queue
    │   ├── pages/Home.tsx, Room.tsx     # create/join, room UI (incl. join-by-link)
    │   └── utils/video.ts               # URL parsing, time formatting
    ├── vercel.json, public/_redirects   # SPA rewrites if hosted on Vercel/Netlify
    └── .env.example
```

## Roles & permissions

| Action | Host | Moderator | Participant |
|---|:-:|:-:|:-:|
| Play / pause / seek / change video | ✅ | ✅ | ❌ – sends a **request** |
| Approve / reject participant requests | ✅ | ✅ | ❌ |
| Assign roles (Participant ⇄ Moderator) | ✅ | ❌ | ❌ |
| Remove participants | ✅ | ❌ | ❌ |
| Transfer Host | ✅ | ❌ | ❌ |

- The room creator is the Host; joiners default to Participant.
- Transferring Host makes the previous Host a Moderator. If the Host leaves/disconnects, the room auto-promotes the first Moderator (else the longest-present Participant) so the room is never leaderless.
- **Enforcement is server-side**: every event is checked in `server.ts` via `permissions.ts` before it changes state. The UI only hides/relabels controls.

## Architecture overview (how WebSockets fit in)

1. Each browser opens **one Socket.IO connection**. Rooms map to Socket.IO rooms; the room state lives in `RoomManager` on the server, which is the **single source of truth** (video id, play state, position, participants + roles, pending requests).
2. A client action (e.g. Host clicks *Pause*) is emitted as an event (`pause {time}`). The server checks the sender's role, updates the room's state, then broadcasts (`pause`) to **everyone in the room, sender included**. Clients never change the player from their own click – they only react to server events, so all players follow the same ordered stream.
3. Late joiners receive `room_state` + `sync_state` containing the video id, play state and a position the **server has already extrapolated to "now"**, so client clock skew doesn't matter. The client also ignores drift < 0.75 s to avoid stutter.
4. Participants emit `request_action`; the server queues it and pushes `requests_updated` to Host/Moderators. `resolve_request {approve}` applies it through the same code path as a direct action and broadcasts the result.
5. Role changes / removals / host transfer are broadcast with the full participants list so every UI re-renders roles and enables/disables controls immediately.

### Socket events

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `create_room` | C→S | `{username}` (ack) | creator becomes Host |
| `join_room` | C→S | `{roomId, username}` (ack) | joiner becomes Participant |
| `leave_room` | C→S | – | |
| `room_state` / `sync_state` | S→C | `{videoId, playState, currentTime}` (+ participants) | sent to a joiner |
| `play` / `pause` / `seek` | C→S (Host/Mod) then S→room | `{time}` | server broadcasts with `by` |
| `change_video` | C→S (Host/Mod) then S→room | `{videoId}` | resets to paused at 0:00 |
| `request_action` | C→S (Participant) | `{type: play\|pause\|seek\|change_video, time?, videoId?}` | queued for approval |
| `resolve_request` | C→S (Host/Mod) | `{requestId, approve}` | approve → applied + broadcast |
| `requests_updated`, `request_submitted`, `request_resolved` | S→C | queue / result | |
| `assign_role` | C→S (Host) | `{userId, role: Moderator\|Participant}` | |
| `transfer_host` | C→S (Host) | `{userId}` | |
| `remove_participant` | C→S (Host) | `{userId}` | target gets `socket_error` code `KICKED` |
| `user_joined`, `user_left`, `role_assigned`, `host_transferred`, `participant_removed` | S→room | includes `participants` | |
| `socket_error` | S→C | `{code, message}` | e.g. `PERMISSION_DENIED` |

## Environment variables

There are **no secrets or API keys** required (the YouTube IFrame API needs no key).

| Variable | Where | Required | Purpose |
|---|---|---|---|
| `PORT` | backend | no (platform sets it) | Listen port, default `3001` |
| `FRONTEND_URL` | backend | only if frontend is on a **different origin** | Comma-separated allowed origins for CORS/Socket.IO, e.g. `https://my-app.vercel.app` |
| `FRONTEND_DIST` | backend | no | Path to built frontend; default `../frontend/dist` |
| `VITE_BACKEND_URL` | frontend | only if frontend is on a **different origin** | Backend URL, e.g. `https://my-backend.onrender.com`. **Baked in at build time.** |

Copy the `.env.example` files to `.env` if you need to set any locally. Leave `VITE_BACKEND_URL` empty in single-service deployments so the app talks to its own origin.

## Run locally

Requires Node.js ≥ 18.

```bash
# 1) Install
npm run install:all        # or: (cd backend && npm install) && (cd frontend && npm install)

# 2) Start backend (http://localhost:3001) and frontend (http://localhost:5173) in two terminals
npm run dev:backend
npm run dev:frontend
```

Open http://localhost:5173, create a room, then open the invite link in another browser/incognito window to join.

### Production-style run (single server)

```bash
npm run build      # installs deps, builds frontend/dist and backend/dist
npm start          # http://localhost:3001 serves the API, WebSockets AND the React app
```

### Tests & lint

```bash
npm test           # backend: 14 Socket.IO integration tests (roles, approval flow, host transfer, validation…)
npm run lint       # frontend (oxlint)
```

## Deploy (Render, recommended)

The backend serves the built React app, so **one Render Web Service** is enough (same origin → no CORS setup, WebSockets work out of the box).

1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → select the repo (uses `render.yaml`).
   *Or* **New → Web Service** manually with: Build Command `npm run build`, Start Command `npm start`, Health Check Path `/health`, env `NODE_VERSION=20`.
3. Deploy, open the `https://….onrender.com` URL, and paste it at the top of this README.

**Railway:** New Project → Deploy from GitHub; it picks up the root `package.json` (`npm run build` / `npm start`). Generate a public domain under Settings → Networking.

### Alternative: split hosting (Vercel/Netlify frontend + Render/Railway backend)

1. Deploy the backend (`backend/` as root; build `npm ci --include=dev && npm run build`, start `npm start`) and set `FRONTEND_URL=https://your-frontend-url`.
2. Deploy `frontend/` (build `npm run build`, output `dist`) with `VITE_BACKEND_URL=https://your-backend-url`. `vercel.json` / `public/_redirects` already provide the SPA rewrite so `/room/CODE` links work.

## Limitations

- **Rooms live in memory.** A server restart (or Render free-tier spin-down after inactivity) drops all rooms. Persistent rooms would need a database.
- **Single instance.** Scaling horizontally needs the Socket.IO Redis adapter + sticky sessions (not implemented).
- Identity is the socket connection: refreshing the page or losing the connection removes you from the room; rejoin with the link/code. A removed user can rejoin with the invite link (no ban list).
- Browsers may block autoplay until you've interacted with the page; joining via the button counts as interaction. Some videos disallow embedding, in which case a toast is shown.
- Not implemented (optional bonuses): chat, reactions, authentication, Redis scaling.
