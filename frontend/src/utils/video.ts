import type { ActionRequest } from '../contexts/SocketContext';

/** Accepts a full YouTube URL (watch / youtu.be / embed / shorts / live) or a bare 11-char video ID. */
export const extractVideoId = (url: string): string | null => {
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
};

export const formatTime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
};

export const describeRequest = (r: Pick<ActionRequest, 'type' | 'time' | 'videoId'>) => {
  switch (r.type) {
    case 'play': return 'play the video';
    case 'pause': return 'pause the video';
    case 'seek': return `jump to ${formatTime(r.time ?? 0)}`;
    case 'change_video': return `change the video to ${r.videoId}`;
  }
};
