export type Role = 'Host' | 'Moderator' | 'Participant';
export type PlayState = 'playing' | 'paused';

export interface User {
  id: string; // socket id
  username: string;
  role: Role;
}

export interface VideoState {
  videoId: string;
  isPlaying: boolean;
  timeSeconds: number;
  lastUpdatedAt: number; // needed for extrapolating time
}

// what the client actually gets
export interface SyncSnapshot {
  videoId: string;
  playState: PlayState;
  currentTime: number;
}

export type RequestType = 'play' | 'pause' | 'seek' | 'change_video';

// when a normal user wants to change stuff, they make one of these
export interface ActionRequest {
  id: string;
  userId: string;
  username: string;
  type: RequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: Role;
  text: string;
  timestamp: number;
}

export interface RoomState {
  id: string;
  users: Map<string, User>; 
  videoState: VideoState;
  requests: ActionRequest[];
  messages: ChatMessage[];
}

export interface ClientUser {
  id: string;
  username: string;
  role: Role;
}

export interface RoomInfo {
  roomId: string;
  participants: ClientUser[];
  messages?: ChatMessage[];
}
