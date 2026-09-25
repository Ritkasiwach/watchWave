export type Role = 'Host' | 'Moderator' | 'Participant';
export type PlayState = 'playing' | 'paused';

export interface User {
  id: string; // Socket ID
  username: string;
  role: Role;
}

export interface VideoState {
  videoId: string;
  isPlaying: boolean;
  timeSeconds: number;
  lastUpdatedAt: number; // server timestamp (ms) of the last change
}

/** Snapshot sent to clients: time is already extrapolated to "now" on the server. */
export interface SyncSnapshot {
  videoId: string;
  playState: PlayState;
  currentTime: number;
}

export type RequestType = 'play' | 'pause' | 'seek' | 'change_video';

/** A playback change asked for by a Participant that a Host/Moderator must approve. */
export interface ActionRequest {
  id: string;
  userId: string;
  username: string;
  type: RequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
}

export interface RoomState {
  id: string;
  users: Map<string, User>; // Internal (insertion order = join order)
  videoState: VideoState;
  requests: ActionRequest[];
}

export interface ClientUser {
  id: string;
  username: string;
  role: Role;
}

export interface RoomInfo {
  roomId: string;
  participants: ClientUser[];
}
