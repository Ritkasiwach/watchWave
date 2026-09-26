# 🌊 WatchWave

**Live App:** ` https://watchwave-f34w.onrender.com`
WatchWave is a real-time YouTube watch party app where you can sync playback with your friends. One person creates a room, everyone else joins via a code or invite link, and every play, pause, seek, or video change is perfectly mirrored across the room in real time!

I built this with a smooth, modern oceanic UI (dark navy & red accents) so it doesn't look like your typical generic side project. Made with love by Ritika Siwach. ❤️

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, `react-youtube`, and some beautiful CSS variables for the theme.
- **Backend:** Node.js, Express, and Socket.IO (written in TypeScript).
- **Realtime Magic:** Socket.IO over WebSockets.
- **State Management:** In-memory rooms (kept it fast and simple for the MVP!).

## 👑 Roles & Permissions

To prevent chaos when watching with friends, I added a role system:
- **Host (👑):** The person who creates the room. Has full control over playback, roles, kicking people out, and transferring the host role.
- **Moderator (🛡):** Promoted by the Host. Can also control playback and approve requests from regular viewers.
- **Viewer (👤):** Regular participants. They just sit back and watch, but if they want to pause or change the video, they send a "request" which the Host or Mod can approve or deny.

*(Fun detail: If the Host accidentally closes the tab, the room auto-promotes a Mod to Host so the party doesn't end abruptly!)*

## 💬 Real-Time Chat

Yes, you can chat! I built a shared chatting panel right into the room's sidebar. It keeps a running history so late joiners can see what people were talking about right when they jump in.

## 🚀 How it works under the hood

1. **Single Source of Truth:** The backend `RoomManager` is the boss. Clients don't actually pause their own videos directly—they send a `pause` request to the server, and the server broadcasts a synchronized `pause` event to everyone (including the sender).
2. **Time Extrapolation:** When a new person joins a room that is currently playing, the server calculates exactly where the video *should* be right now based on the server clock, completely bypassing any client clock differences.
3. **Approval Queue:** Viewers who try to seek or change the video add an item to an approval queue on the Host's screen. If the Host clicks "Approve", the server executes the action.

## 💻 Running it Locally

You'll need Node.js 18+.

```bash
# Install everything
npm run install:all

# Start both backend and frontend dev servers
npm run dev:backend
# (In a new terminal)
npm run dev:frontend
```

Now open `http://localhost:5173` and start a party!

## 🚢 Deployment

I designed this to be easily hosted on Render as a single web service. The Express backend serves the built React frontend files directly.

```bash
# Build the production bundle
npm run build

# Start the unified server
npm start
```

## ⚠️ Known Limitations (For now!)

- **Rooms live in memory:** If the server restarts, the active rooms are cleared. I didn't add a database yet to keep it lightweight.
- **Browser Autoplay Policies:** Browsers hate auto-playing unmuted video. Usually, interacting with the "Join" button is enough to get around this, but sometimes you might need to click the video once.
- **Optional features I haven't gotten to yet:** Reactions, persistence, and Redis scaling for multiple server instances.
