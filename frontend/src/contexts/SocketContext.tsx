import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

export type Role = 'Host' | 'Moderator' | 'Participant';
export type RequestType = 'play' | 'pause' | 'seek' | 'change_video';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface RoomData {
  roomId: string;
  participants: User[];
}

/** 
 * Shared playback state. 
 * receivedAt and seq help the player figure out what to do when multiple updates fire 
 */
export interface PlaybackState {
  videoId: string;
  playState: 'playing' | 'paused';
  currentTime: number;
  receivedAt: number;
  seq: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: Role;
  text: string;
  timestamp: number;
}

export interface ActionRequest {
  id: string;
  userId: string;
  username: string;
  type: RequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
}

interface SocketContextProps {
  socket: Socket | null;
  isConnected: boolean;
  roomData: RoomData | null;
  setRoomData: React.Dispatch<React.SetStateAction<RoomData | null>>;
  playback: PlaybackState;
  requests: ActionRequest[];
  chatMessages: ChatMessage[];
  leaveRoom: () => void;
  sendChat: (text: string) => void;
}

const DEFAULT_PLAYBACK: PlaybackState = {
  videoId: 'dQw4w9WgXcQ',
  playState: 'paused',
  currentTime: 0,
  receivedAt: 0,
  seq: 0
};

const SocketContext = createContext<SocketContextProps>({
  socket: null,
  isConnected: false,
  roomData: null,
  setRoomData: () => {},
  playback: DEFAULT_PLAYBACK,
  requests: [],
  chatMessages: [],
  leaveRoom: () => {},
  sendChat: () => {},
});

// In production the frontend is normally served by the backend (same origin).
// Set VITE_BACKEND_URL when the frontend is hosted separately (Vercel/Netlify).
const BACKEND_URL: string | undefined =
  import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : undefined);

interface SyncPayload {
  videoId: string;
  playState: 'playing' | 'paused';
  currentTime: number;
}


// oxlint-disable-next-line react/only-export-components
export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>(DEFAULT_PLAYBACK);
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<RoomData | null>(null);
  useEffect(() => {
    roomRef.current = roomData;
  }, [roomData]);

  const leaveRoom = useCallback(() => {
    if (roomRef.current) socketRef.current?.emit('leave_room', {});
    setRoomData(null);
    setRequests([]);
    setChatMessages([]);
    setPlayback(DEFAULT_PLAYBACK);
  }, []);

  const sendChat = useCallback((text: string) => {
    if (socketRef.current) socketRef.current.emit('send_chat', { text });
  }, []);

  useEffect(() => {
    const s = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = s;

    const bump = (patch: Partial<PlaybackState> | ((p: PlaybackState) => Partial<PlaybackState>)) =>
      setPlayback(prev => ({
        ...prev,
        ...(typeof patch === 'function' ? patch(prev) : patch),
        receivedAt: Date.now(),
        seq: prev.seq + 1
      }));

    const applySync = (st: SyncPayload) =>
      bump({ videoId: st.videoId, playState: st.playState, currentTime: st.currentTime });

    const setParticipants = (participants: User[]) =>
      setRoomData(prev => (prev ? { ...prev, participants } : prev));

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => {
      setIsConnected(false);
      if (roomRef.current) toast.error('Connection lost. Please rejoin the room.', { duration: 4000 });
      setRoomData(null);
      setRequests([]);
      setChatMessages([]);
    });

    s.on('room_state', (data: RoomData & { videoState?: SyncPayload; messages?: ChatMessage[] }) => {
      setRoomData({ roomId: data.roomId, participants: data.participants });
      if (data.messages) setChatMessages(data.messages);
      if (data.videoState) applySync(data.videoState);
    });
    s.on('sync_state', applySync);

    s.on('chat_message', (msg: ChatMessage) => {
      setChatMessages(prev => {
        const next = [...prev, msg];
        if (next.length > 100) next.shift();
        return next;
      });
    });

    // when someone plays/pauses/seeks, update local state
    s.on('play', (d: { time: number }) => bump({ playState: 'playing', currentTime: d.time }));
    s.on('pause', (d: { time: number }) => bump({ playState: 'paused', currentTime: d.time }));
    s.on('seek', (d: { time: number }) => bump({ currentTime: d.time }));
    s.on('change_video', (d: { videoId: string }) =>
      bump({ videoId: d.videoId, playState: 'paused', currentTime: 0 })
    );

    // handle users joining/leaving and role changes
    s.on('user_joined', (d: { username: string; participants: User[] }) => {
      setParticipants(d.participants);
      toast(`${d.username} joined the room`, { icon: '👋', duration: 2500 });
    });
    s.on('user_left', (d: { username: string; participants: User[] }) => {
      setParticipants(d.participants);
      toast(`${d.username} left the room`, { icon: '👋', duration: 2500 });
    });
    s.on('role_assigned', (d: { userId: string; username: string; role: Role; participants: User[] }) => {
      setParticipants(d.participants);
      if (d.userId === s.id) {
        toast(d.role === 'Moderator' ? 'You are now a Moderator 🛡' : 'You are now a Participant', { duration: 3500 });
      } else {
        toast(`${d.username} is now a ${d.role === 'Moderator' ? 'Moderator 🛡' : 'Participant'}`, { duration: 3000 });
      }
    });
    s.on('host_transferred', (d: { newHostId: string; newHostUsername: string; reason: string; participants: User[] }) => {
      setParticipants(d.participants);
      if (d.newHostId === s.id) {
        toast('You are now the Host 👑', { duration: 4000 });
      } else {
        toast(`${d.newHostUsername} is now the Host 👑`, { duration: 3500 });
      }
    });
    s.on('participant_removed', (d: { participants: User[] }) => setParticipants(d.participants));

    // Approval flow
    s.on('requests_updated', (d: { requests: ActionRequest[] }) => setRequests(d.requests));
    s.on('request_submitted', () => toast('Request sent — waiting for Host/Moderator approval', { icon: '📨', duration: 3000 }));
    s.on('request_resolved', (d: { userId: string; approved: boolean; resolvedBy: string }) => {
      if (d.userId !== s.id) return;
      if (d.approved) toast.success(`${d.resolvedBy} approved your request`);
      else toast.error(`${d.resolvedBy} declined your request`);
    });

    s.on('socket_error', (err: { code: string; message: string }) => {
      if (err.code === 'KICKED') {
        toast.error('You have been removed from the room.', { duration: 4000 });
        setRoomData(null);
        setRequests([]);
      } else {
        toast.error(err.message, { duration: 3000 });
      }
    });

    // save socket to state so the rest of the app can use it
    // oxlint-disable-next-line react/set-state-in-effect
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, roomData, setRoomData, playback, requests, chatMessages, leaveRoom, sendChat }}>
      {children}
    </SocketContext.Provider>
  );
};
