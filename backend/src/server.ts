import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './roomManager';
import { User, Role, RequestType, ActionRequest } from './types';
import {
  canControlPlayback,
  canAssignRole,
  canRemoveParticipant,
  canTransferHost,
  canRequestAction,
  canResolveRequest
} from './permissions';

dotenv.config();

// setup and config

// we need this to allow frontend requests from different places (like if frontend is on vercel and backend is on render)
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
const corsOrigin: string[] | boolean = ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS;

const MAX_USERNAME_LENGTH = 20;
const MAX_PENDING_REQUESTS_PER_USER = 3;
const MAX_PENDING_REQUESTS_PER_ROOM = 30;
const ROOM_ID_REGEX = /^[A-Z0-9]{6}$/;
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const REQUEST_TYPES: RequestType[] = ['play', 'pause', 'seek', 'change_video'];

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST'] }));

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

const roomManager = new RoomManager();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/search', async (req, res): Promise<any> => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing search query' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured on server' });
  }

  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${apiKey}`);
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Failed to search YouTube' });
    }
    
    const items = data.items || [];
    const results = items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
    }));
    
    res.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error during search' });
  }
});

// Optionally serve the built frontend from this same server (single-service deploy).
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback so /room/ABC123 works on direct load / refresh
  app.get(/^\/(?!socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
  console.log(`Serving frontend from ${FRONTEND_DIST}`);
}

// util functions

type Ack = (res: Record<string, unknown>) => void;

const isFiniteTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0;

function sendError(socket: Socket, ack: Ack | undefined, code: string, message: string) {
  if (ack) ack({ ok: false, code, message });
  else socket.emit('socket_error', { code, message });
}

/** Emit the pending-request list to every user: privileged users see all, others only their own. */
function broadcastRequests(roomId: string) {
  const all = roomManager.getRequests(roomId);
  for (const u of roomManager.getUsers(roomId)) {
    const list = canResolveRequest(u.role) ? all : all.filter(r => r.userId === u.id);
    io.to(u.id).emit('requests_updated', { requests: list });
  }
}

/** Apply a playback change to server state and broadcast it to the whole room. */
function applyPlayback(
  roomId: string,
  action: { type: RequestType; time?: number; videoId?: string },
  by: string
) {
  switch (action.type) {
    case 'play': {
      const time = isFiniteTime(action.time) ? action.time : roomManager.getCurrentTime(roomId);
      roomManager.updateVideoState(roomId, { isPlaying: true, timeSeconds: time });
      io.to(roomId).emit('play', { time, by });
      break;
    }
    case 'pause': {
      const time = isFiniteTime(action.time) ? action.time : roomManager.getCurrentTime(roomId);
      roomManager.updateVideoState(roomId, { isPlaying: false, timeSeconds: time });
      io.to(roomId).emit('pause', { time, by });
      break;
    }
    case 'seek': {
      const time = isFiniteTime(action.time) ? action.time : 0;
      roomManager.updateVideoState(roomId, { timeSeconds: time }); // keeps isPlaying as-is
      io.to(roomId).emit('seek', { time, by });
      break;
    }
    case 'change_video': {
      const videoId = action.videoId as string;
      roomManager.updateVideoState(roomId, { videoId, isPlaying: false, timeSeconds: 0 });
      io.to(roomId).emit('change_video', { videoId, by });
      break;
    }
  }
}

/** Remove a socket from whatever room it is in, reassigning Host if needed. */
function leaveCurrentRoom(socket: Socket) {
  const roomId = roomManager.findRoomIdByUserSocket(socket.id);
  if (!roomId) return;
  const user = roomManager.getUser(roomId, socket.id);
  if (!user) return;

  roomManager.removeUser(roomId, socket.id);
  roomManager.removeRequestsByUser(roomId, socket.id);
  socket.leave(roomId);

  const remaining = roomManager.getSerializableParticipants(roomId);
  if (remaining.length === 0) {
    roomManager.deleteRoom(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
    return;
  }

  if (user.role === 'Host') {
    const next = roomManager.pickNextHost(roomId);
    if (next) {
      roomManager.updateUserRole(roomId, next.id, 'Host');
      roomManager.removeRequestsByUser(roomId, next.id);
      io.to(roomId).emit('host_transferred', {
        oldHostId: user.id,
        newHostId: next.id,
        newHostUsername: next.username,
        reason: 'host_left',
        participants: roomManager.getSerializableParticipants(roomId)
      });
    }
  }

  io.to(roomId).emit('user_left', {
    userId: user.id,
    username: user.username,
    participants: roomManager.getSerializableParticipants(roomId)
  });
  broadcastRequests(roomId);
}

function joinRoomAs(socket: Socket, roomId: string, user: User) {
  roomManager.addUser(roomId, user);
  socket.join(roomId);
  const participants = roomManager.getSerializableParticipants(roomId);

  // Sent to the joiner only. Includes the current video state so a late joiner starts in sync.
  socket.emit('room_state', {
    roomId,
    participants,
    messages: roomManager.getMessages(roomId),
    videoState: roomManager.getSnapshot(roomId)
  });
  socket.emit('sync_state', roomManager.getSnapshot(roomId));
  socket.emit('requests_updated', {
    requests: canResolveRequest(user.role) ? roomManager.getRequests(roomId) : []
  });

  return participants;
}

// socket stuff

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // wrapper so we don't crash the server if someone sends garbage data
  const on = <P = any>(event: string, handler: (payload: P, ack?: Ack) => void) => {
    socket.on(event, (payload: P, ack?: unknown) => {
      // Clients may omit the payload and pass only an ack callback.
      const cb = typeof ack === 'function' ? (ack as Ack) : typeof payload === 'function' ? (payload as unknown as Ack) : undefined;
      const data = (typeof payload === 'function' ? undefined : payload) as P;
      try {
        handler(data, cb);
      } catch (error) {
        console.error(`Error handling "${event}":`, error);
        sendError(socket, cb, 'INTERNAL_ERROR', 'Something went wrong.');
      }
    });
  };

  /** Returns the caller's room + user record, or null. */
  const getContext = () => {
    const roomId = roomManager.findRoomIdByUserSocket(socket.id);
    if (!roomId) return null;
    const user = roomManager.getUser(roomId, socket.id);
    if (!user) return null;
    return { roomId, user };
  };

  const denyPermission = (message: string) =>
    socket.emit('socket_error', { code: 'PERMISSION_DENIED', message });

  const cleanUsername = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    if (!name || name.length > MAX_USERNAME_LENGTH) return null;
    return name;
  };

  on<{ username: string }>('create_room', (payload, ack) => {
    const username = cleanUsername(payload?.username);
    if (!username) {
      return sendError(socket, ack, 'INVALID_USERNAME', `Username must be 1-${MAX_USERNAME_LENGTH} characters.`);
    }

    leaveCurrentRoom(socket); // a socket can only be in one room

    const roomId = roomManager.createRoom();
    const user: User = { id: socket.id, username, role: 'Host' };
    joinRoomAs(socket, roomId, user);

    if (ack) ack({ ok: true, roomId, user });
  });

  on<{ roomId: string; username: string }>('join_room', (payload, ack) => {
    if (typeof payload?.roomId !== 'string' || !payload.roomId.trim()) {
      return sendError(socket, ack, 'INVALID_ROOM_ID', 'Room ID is required.');
    }
    const username = cleanUsername(payload.username);
    if (!username) {
      return sendError(socket, ack, 'INVALID_USERNAME', `Username must be 1-${MAX_USERNAME_LENGTH} characters.`);
    }

    const roomId = payload.roomId.trim().toUpperCase();
    if (!ROOM_ID_REGEX.test(roomId) || !roomManager.roomExists(roomId)) {
      return sendError(socket, ack, 'ROOM_NOT_FOUND', 'Room does not exist.');
    }

    // Re-joining the same room from the same socket is a no-op, not a duplicate-name error.
    const existing = roomManager.getUser(roomId, socket.id);
    if (existing) {
      if (ack) ack({ ok: true, roomId, user: existing });
      return;
    }

    // we used to prevent duplicate names here, but it's fine if two people are named Bob
    leaveCurrentRoom(socket);

    const user: User = { id: socket.id, username, role: 'Participant' };
    const participants = joinRoomAs(socket, roomId, user);

    socket.to(roomId).emit('user_joined', {
      userId: user.id,
      username: user.username,
      role: user.role,
      user,
      participants
    });

    if (ack) ack({ ok: true, roomId, user });
  });

  // playback controls

  const playbackHandler =
    (type: 'play' | 'pause' | 'seek') =>
    (payload: { time?: number }) => {
      const ctx = getContext();
      if (!ctx) return;
      if (!canControlPlayback(ctx.user.role)) {
        return denyPermission('You do not have permission to control playback. You can send a request instead.');
      }
      if (type === 'seek' && !isFiniteTime(payload?.time)) return;
      applyPlayback(ctx.roomId, { type, time: payload?.time }, ctx.user.username);
    };

  on('play', playbackHandler('play'));
  on('pause', playbackHandler('pause'));
  on('seek', playbackHandler('seek'));

  on<{ videoId: string }>('change_video', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canControlPlayback(ctx.user.role)) {
      return denyPermission('You do not have permission to change the video. You can send a request instead.');
    }
    if (typeof payload?.videoId !== 'string' || !VIDEO_ID_REGEX.test(payload.videoId)) {
      return socket.emit('socket_error', { code: 'INVALID_VIDEO', message: 'Invalid YouTube video ID.' });
    }
    applyPlayback(ctx.roomId, { type: 'change_video', videoId: payload.videoId }, ctx.user.username);
  });

  // handles users asking for permission to change stuff

  on<{ type: RequestType; time?: number; videoId?: string }>('request_action', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canRequestAction(ctx.user.role)) {
      return socket.emit('socket_error', {
        code: 'INVALID_REQUEST',
        message: 'You can control playback directly; no approval needed.'
      });
    }
    if (!payload || !REQUEST_TYPES.includes(payload.type)) {
      return socket.emit('socket_error', { code: 'INVALID_REQUEST', message: 'Unknown request type.' });
    }
    if (payload.type === 'seek' && !isFiniteTime(payload.time)) {
      return socket.emit('socket_error', { code: 'INVALID_REQUEST', message: 'Invalid seek time.' });
    }
    if (payload.type === 'change_video' && !(typeof payload.videoId === 'string' && VIDEO_ID_REGEX.test(payload.videoId))) {
      return socket.emit('socket_error', { code: 'INVALID_VIDEO', message: 'Invalid YouTube video ID.' });
    }

    const pending = roomManager.getRequests(ctx.roomId);
    if (pending.filter(r => r.userId === socket.id).length >= MAX_PENDING_REQUESTS_PER_USER) {
      return socket.emit('socket_error', {
        code: 'TOO_MANY_REQUESTS',
        message: 'You already have several pending requests. Wait for a decision.'
      });
    }
    if (pending.length >= MAX_PENDING_REQUESTS_PER_ROOM) {
      return socket.emit('socket_error', { code: 'TOO_MANY_REQUESTS', message: 'Too many pending requests in this room.' });
    }

    const request = roomManager.addRequest(ctx.roomId, {
      userId: socket.id,
      username: ctx.user.username,
      type: payload.type,
      time: payload.type === 'seek' ? payload.time : undefined,
      videoId: payload.type === 'change_video' ? payload.videoId : undefined
    });
    if (!request) return;

    socket.emit('request_submitted', { request });
    broadcastRequests(ctx.roomId);
  });

  on<{ requestId: string; approve: boolean }>('resolve_request', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canResolveRequest(ctx.user.role)) {
      return denyPermission('Only the Host or a Moderator can approve or reject requests.');
    }
    if (typeof payload?.requestId !== 'string') return;

    const request: ActionRequest | undefined = roomManager.takeRequest(ctx.roomId, payload.requestId);
    if (!request) {
      return socket.emit('socket_error', { code: 'REQUEST_NOT_FOUND', message: 'That request is no longer pending.' });
    }

    const approved = payload.approve === true;
    if (approved) {
      applyPlayback(ctx.roomId, request, request.username);
    }

    io.to(ctx.roomId).emit('request_resolved', {
      requestId: request.id,
      userId: request.userId,
      username: request.username,
      type: request.type,
      approved,
      resolvedBy: ctx.user.username
    });
    broadcastRequests(ctx.roomId);
  });

  // roles

  on<{ userId: string; role: Role }>('assign_role', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canAssignRole(ctx.user.role)) {
      return denyPermission('You do not have permission to assign roles.');
    }

    const targetUser = typeof payload?.userId === 'string' ? roomManager.getUser(ctx.roomId, payload.userId) : undefined;
    if (!targetUser) {
      return socket.emit('socket_error', { code: 'INVALID_PARTICIPANT', message: 'User not found.' });
    }
    if (targetUser.role === 'Host' || (payload.role !== 'Moderator' && payload.role !== 'Participant')) {
      return socket.emit('socket_error', { code: 'INVALID_ROLE_ASSIGNMENT', message: 'This role assignment is not allowed.' });
    }
    if (targetUser.role === payload.role) return;

    roomManager.updateUserRole(ctx.roomId, targetUser.id, payload.role);
    if (payload.role === 'Moderator') {
      roomManager.removeRequestsByUser(ctx.roomId, targetUser.id); // they can act directly now
    }

    io.to(ctx.roomId).emit('role_assigned', {
      userId: targetUser.id,
      username: targetUser.username,
      role: payload.role,
      participants: roomManager.getSerializableParticipants(ctx.roomId)
    });
    broadcastRequests(ctx.roomId);
  });

  on<{ userId: string }>('transfer_host', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canTransferHost(ctx.user.role)) {
      return denyPermission('Only the Host can transfer the Host role.');
    }
    const target = typeof payload?.userId === 'string' ? roomManager.getUser(ctx.roomId, payload.userId) : undefined;
    if (!target || target.id === ctx.user.id) {
      return socket.emit('socket_error', { code: 'INVALID_PARTICIPANT', message: 'Choose another participant.' });
    }

    roomManager.updateUserRole(ctx.roomId, target.id, 'Host');
    roomManager.updateUserRole(ctx.roomId, ctx.user.id, 'Moderator'); // previous host stays privileged
    roomManager.removeRequestsByUser(ctx.roomId, target.id);

    io.to(ctx.roomId).emit('host_transferred', {
      oldHostId: ctx.user.id,
      newHostId: target.id,
      newHostUsername: target.username,
      reason: 'transferred',
      participants: roomManager.getSerializableParticipants(ctx.roomId)
    });
    broadcastRequests(ctx.roomId);
  });

  on<{ userId: string }>('remove_participant', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (!canRemoveParticipant(ctx.user.role)) {
      return denyPermission('You do not have permission to remove participants.');
    }
    if (typeof payload?.userId !== 'string') return;
    if (payload.userId === socket.id) {
      return socket.emit('socket_error', { code: 'INVALID_PARTICIPANT', message: 'Cannot remove yourself.' });
    }

    const targetUser = roomManager.getUser(ctx.roomId, payload.userId);
    if (!targetUser) {
      return socket.emit('socket_error', { code: 'INVALID_PARTICIPANT', message: 'User not found.' });
    }

    roomManager.removeUser(ctx.roomId, targetUser.id);
    roomManager.removeRequestsByUser(ctx.roomId, targetUser.id);

    // Tell the remaining room (and the removed user), then detach the removed socket.
    const participants = roomManager.getSerializableParticipants(ctx.roomId);
    io.to(ctx.roomId).emit('participant_removed', {
      userId: targetUser.id,
      username: targetUser.username,
      participants
    });

    const targetSocket = io.sockets.sockets.get(targetUser.id);
    if (targetSocket) {
      targetSocket.emit('socket_error', { code: 'KICKED', message: 'You have been removed from the room.' });
      targetSocket.leave(ctx.roomId);
    }
    broadcastRequests(ctx.roomId);
  });

  // ---- Chat --------------------------------------------------------------

  on<{ text: string }>('send_chat', payload => {
    const ctx = getContext();
    if (!ctx) return;
    if (typeof payload?.text !== 'string' || !payload.text.trim()) return;

    const message = roomManager.addMessage(ctx.roomId, {
      userId: ctx.user.id,
      username: ctx.user.username,
      role: ctx.user.role,
      text: payload.text.trim().substring(0, 500) // cap length
    });

    if (message) {
      io.to(ctx.roomId).emit('chat_message', message);
    }
  });

  on('leave_room', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

// boot it up

const PORT = Number(process.env.PORT) || 3001;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });
}

export { server, io, roomManager };
