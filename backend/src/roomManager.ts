import { randomUUID } from 'crypto';
import { RoomState, User, VideoState, Role, SyncSnapshot, ActionRequest } from './types';

export const DEFAULT_VIDEO_ID = 'dQw4w9WgXcQ';

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();

  private generateRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result;
    do {
      result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(result));
    return result;
  }

  public createRoom(): string {
    const roomId = this.generateRoomId();
    this.rooms.set(roomId, {
      id: roomId,
      users: new Map(),
      requests: [],
      videoState: {
        videoId: DEFAULT_VIDEO_ID,
        isPlaying: false,
        timeSeconds: 0,
        lastUpdatedAt: Date.now()
      }
    });
    return roomId;
  }

  public getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  public roomExists(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  public addUser(roomId: string, user: User): void {
    this.rooms.get(roomId)?.users.set(user.id, user);
  }

  public removeUser(roomId: string, userId: string): void {
    this.rooms.get(roomId)?.users.delete(userId);
  }

  public getUsers(roomId: string): User[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  public getUser(roomId: string, userId: string): User | undefined {
    return this.rooms.get(roomId)?.users.get(userId);
  }

  public getSerializableParticipants(roomId: string): User[] {
    return this.getUsers(roomId).map(u => ({ id: u.id, username: u.username, role: u.role }));
  }

  public deleteRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  public isUsernameTaken(roomId: string, username: string): boolean {
    return this.getUsers(roomId).some(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public findRoomIdByUserSocket(socketId: string): string | null {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.users.has(socketId)) {
        return roomId;
      }
    }
    return null;
  }

  // ---- Video state -------------------------------------------------------

  public updateVideoState(roomId: string, newState: Partial<VideoState>): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.videoState = { ...room.videoState, ...newState, lastUpdatedAt: Date.now() };
    }
  }

  public getVideoState(roomId: string): VideoState | undefined {
    return this.rooms.get(roomId)?.videoState;
  }

  /** Playback position right now (server clock), extrapolating while playing. */
  public getCurrentTime(roomId: string): number {
    const vs = this.getVideoState(roomId);
    if (!vs) return 0;
    if (!vs.isPlaying) return vs.timeSeconds;
    return vs.timeSeconds + (Date.now() - vs.lastUpdatedAt) / 1000;
  }

  /** What clients need to sync. Uses server-computed time so client clock skew doesn't matter. */
  public getSnapshot(roomId: string): SyncSnapshot | undefined {
    const vs = this.getVideoState(roomId);
    if (!vs) return undefined;
    return {
      videoId: vs.videoId,
      playState: vs.isPlaying ? 'playing' : 'paused',
      currentTime: this.getCurrentTime(roomId)
    };
  }

  // ---- Roles -------------------------------------------------------------

  public updateUserRole(roomId: string, userId: string, newRole: Role): void {
    const user = this.rooms.get(roomId)?.users.get(userId);
    if (user) {
      user.role = newRole;
    }
  }

  /** Who becomes Host when the current Host leaves: first Moderator, else longest-present Participant. */
  public pickNextHost(roomId: string): User | undefined {
    const users = this.getUsers(roomId);
    return users.find(u => u.role === 'Moderator') ?? users.find(u => u.role !== 'Host');
  }

  // ---- Approval requests -------------------------------------------------

  public getRequests(roomId: string): ActionRequest[] {
    return this.rooms.get(roomId)?.requests ?? [];
  }

  public addRequest(roomId: string, req: Omit<ActionRequest, 'id' | 'createdAt'>): ActionRequest | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const full: ActionRequest = { ...req, id: randomUUID(), createdAt: Date.now() };
    room.requests.push(full);
    return full;
  }

  public takeRequest(roomId: string, requestId: string): ActionRequest | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const idx = room.requests.findIndex(r => r.id === requestId);
    if (idx === -1) return undefined;
    return room.requests.splice(idx, 1)[0];
  }

  public removeRequestsByUser(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.requests = room.requests.filter(r => r.userId !== userId);
    }
  }
}
