import React, { useEffect, useRef } from 'react';
import { Check, X, Inbox } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocket } from '../contexts/SocketContext';
import { describeRequest } from '../utils/video';

/** Host / Moderator view (sidebar): approve or reject Participant requests. */
const RequestsPanel: React.FC = () => {
  const { socket, requests } = useSocket();
  const seen = useRef<Set<string> | null>(null);

  // Toast when a new request arrives (not for ones that already existed when we mounted).
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(requests.map(r => r.id));
      return;
    }
    for (const r of requests) {
      if (!seen.current.has(r.id)) {
        seen.current.add(r.id);
        toast(`${r.username} wants to ${describeRequest(r)}`, { icon: '🙋', duration: 3500 });
      }
    }
  }, [requests]);

  const resolve = (requestId: string, approve: boolean) => {
    socket?.emit('resolve_request', { requestId, approve });
  };

  return (
    <div style={{
      borderBottom: '1px solid var(--border)', padding: '12px 12px 14px',
      display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '45%', overflowY: 'auto', flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
        <Inbox size={14} color="var(--text-secondary)" />
        <span style={{ fontWeight: 700, fontSize: '13px' }}>Requests</span>
        <span style={{
          marginLeft: 'auto', background: requests.length ? 'var(--accent-dim)' : 'var(--bg-card)',
          color: requests.length ? 'var(--accent)' : 'var(--text-muted)',
          borderRadius: '20px', padding: '1px 8px', fontSize: '11px', fontWeight: 700
        }}>
          {requests.length}
        </span>
      </div>

      {requests.length === 0 ? (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 8px' }}>
          No pending requests. Participants can ask to play, pause, seek or change the video.
        </div>
      ) : (
        requests.map(r => (
          <div key={r.id} style={{
            background: 'var(--bg-hover)', border: '1px solid var(--accent-dim)',
            borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}>
            <div style={{ fontSize: '12px', overflowWrap: 'anywhere' }}>
              <strong>{r.username}</strong>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>wants to {describeRequest(r)}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-primary btn-sm" onClick={() => resolve(r.id, true)}
                style={{ flex: 1, gap: '4px', fontSize: '11px' }} aria-label={`Approve ${r.username}'s request`}>
                <Check size={12} /> Approve
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => resolve(r.id, false)}
                style={{ flex: 1, gap: '4px', fontSize: '11px' }} aria-label={`Reject ${r.username}'s request`}>
                <X size={12} /> Reject
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default RequestsPanel;
