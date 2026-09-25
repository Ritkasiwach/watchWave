import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import type { User } from '../contexts/SocketContext';
import YouTubePlayer from '../components/YouTubePlayer';
import RequestsPanel from '../components/RequestsPanel';
import { Copy, Link2, LogOut, Check, Crown, Shield, User as UserIcon, Users, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  if (role === 'Host') return (
    <span className="badge badge-host"><Crown size={10} />Host</span>
  );
  if (role === 'Moderator') return (
    <span className="badge badge-moderator"><Shield size={10} />Mod</span>
  );
  return (
    <span className="badge badge-participant"><UserIcon size={10} />Viewer</span>
  );
};

const ParticipantCard: React.FC<{
  user: User;
  isSelf: boolean;
  isCurrentUserHost: boolean;
  onMakeModerator: () => void;
  onDemote: () => void;
  onTransferHost: () => void;
  onRemove: () => void;
}> = ({ user, isSelf, isCurrentUserHost, onMakeModerator, onDemote, onTransferHost, onRemove }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div style={{
      background: isSelf ? 'rgba(229,25,58,0.06)' : 'var(--bg-hover)',
      border: `1px solid ${isSelf ? 'rgba(229,25,58,0.2)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-sm)',
      padding: '10px 12px',
      transition: 'background 0.15s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Avatar */}
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%',
          background: isSelf ? 'var(--accent-dim)' : 'var(--bg-card)',
          border: `1px solid ${isSelf ? 'rgba(229,25,58,0.3)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: isSelf ? 'var(--accent)' : 'var(--text-secondary)',
          flexShrink: 0
        }}>
          {user.username[0].toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '13px', fontWeight: 600,
              color: isSelf ? 'var(--text-primary)' : 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {user.username}
            </span>
            {isSelf && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>(you)</span>}
          </div>
          <RoleBadge role={user.role} />
        </div>
      </div>

      {/* Host actions — only shown for other users */}
      {isCurrentUserHost && !isSelf && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
          {user.role === 'Participant' && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: '1 1 45%', fontSize: '11px', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}
              onClick={onMakeModerator}
            >
              <Shield size={11} /> Make Mod
            </button>
          )}
          {user.role === 'Moderator' && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: '1 1 45%', fontSize: '11px', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onClick={onDemote}
            >
              <UserIcon size={11} /> Remove Mod
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: '1 1 45%', fontSize: '11px', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}
            onClick={onTransferHost}
          >
            <Crown size={11} /> Make Host
          </button>
          {!confirmRemove ? (
            <button
              className="btn btn-danger btn-sm"
              style={{ flex: '1 1 45%', fontSize: '11px' }}
              onClick={() => setConfirmRemove(true)}
            >
              Remove
            </button>
          ) : (
            <>
              <button
                className="btn btn-danger btn-sm"
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => { onRemove(); setConfirmRemove(false); }}
              >
                Confirm
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, fontSize: '11px' }}
                onClick={() => setConfirmRemove(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** Shown when someone opens an invite link (/room/CODE) without having joined yet. */
const JoinPrompt: React.FC<{ roomId: string }> = ({ roomId }) => {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = () => {
    if (!username.trim()) return setError('Please enter a username.');
    if (!socket || !isConnected) return setError('Not connected to server. Please wait…');
    setError('');
    setLoading(true);
    socket.emit('join_room', { roomId, username: username.trim() }, (res: { ok: boolean; message?: string }) => {
      setLoading(false);
      if (!res?.ok) setError(res?.message || 'Could not join the room.');
      // On success the server's room_state event puts us in the room and this page re-renders.
    });
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: '24px'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '18px' }}>Join Watch Party</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Room code <code style={{ letterSpacing: '0.1em', color: 'var(--text-primary)' }}>{roomId}</code>
          </div>
        </div>
        <div className="form-group">
          <label className="label">Your Name</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Bob"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            maxLength={20}
            autoFocus
          />
          {error && <div className="error-text">{error}</div>}
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleJoin} disabled={loading || !isConnected}>
          {loading ? <><div className="spinner" /> Joining…</> : <>Join Room <ArrowRight size={16} /></>}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Back to home</button>
      </div>
    </div>
  );
};

const Room: React.FC = () => {
  const { roomId: roomParam } = useParams<{ roomId: string }>();
  const roomId = (roomParam || '').toUpperCase();
  const navigate = useNavigate();
  const { socket, roomData, leaveRoom } = useSocket();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const inRoom = roomData?.roomId === roomId;
  const wasInRoom = useRef(false);

  // If we were in this room and are no longer (kicked / disconnected), go home.
  useEffect(() => {
    if (inRoom) wasInRoom.current = true;
    else if (wasInRoom.current) navigate('/');
  }, [inRoom, navigate]);

  if (!roomData || !inRoom) {
    return <JoinPrompt roomId={roomId} />;
  }

  const { participants } = roomData;
  const currentUser = participants.find(p => p.id === socket?.id);
  const isHost = currentUser?.role === 'Host';
  const isModerator = currentUser?.role === 'Moderator';

  const handleCopy = (type: 'code' | 'link') => {
    const text = type === 'code' ? roomId : `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(type);
        toast.success(type === 'code' ? 'Room code copied!' : 'Invite link copied!', { icon: '📋' });
        setTimeout(() => setCopied(null), 2000);
      },
      () => toast.error('Could not copy. Please copy it manually.')
    );
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden' }}>

      {/* Header */}
      <header className="room-header">
        {/* Left: Logo + Room */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={handleLeave}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff' }}>▶</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em', lineHeight: '1' }}>WatchParty</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>
                by Ritika • <a href="https://github.com/Ritkasiwach" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>GitHub</a> • <a href="https://www.linkedin.com/in/ritikasiwach0202" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>LinkedIn</a>
              </span>
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Room</span>
            <code style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              padding: '3px 10px', borderRadius: '6px', fontSize: '13px',
              fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-primary)'
            }}>{roomId}</code>
          </div>

          {currentUser && <RoleBadge role={currentUser.role} />}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleCopy('code')} style={{ gap: '5px' }}>
            {copied === 'code' ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
            Copy Code
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleCopy('link')} style={{ gap: '5px' }}>
            {copied === 'link' ? <Check size={13} color="var(--green)" /> : <Link2 size={13} />}
            Invite Link
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleLeave} style={{ gap: '5px', color: '#f87171' }}>
            <LogOut size={13} />
            Leave
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="room-body">

        {/* Main — Player */}
        <div className="room-main">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1000px', margin: '0 auto' }}>
            <YouTubePlayer />
          </div>
        </div>

        {/* Sidebar */}
        <div className="room-sidebar">
          {/* Approval queue (Host / Moderator) */}
          {(isHost || isModerator) && <RequestsPanel />}

          {/* Sidebar header */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <Users size={15} color="var(--text-secondary)" />
            <span style={{ fontWeight: 700, fontSize: '14px' }}>
              Participants
            </span>
            <span style={{
              marginLeft: 'auto', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '20px',
              padding: '1px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)'
            }}>
              {participants.length}
            </span>
          </div>

          {/* Participant List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {participants.map(user => (
              <ParticipantCard
                key={user.id}
                user={user}
                isSelf={user.id === socket?.id}
                isCurrentUserHost={isHost}
                onMakeModerator={() => socket?.emit('assign_role', { userId: user.id, role: 'Moderator' })}
                onDemote={() => socket?.emit('assign_role', { userId: user.id, role: 'Participant' })}
                onTransferHost={() => socket?.emit('transfer_host', { userId: user.id })}
                onRemove={() => socket?.emit('remove_participant', { userId: user.id })}
              />
            ))}
          </div>

          {/* Sidebar footer: role legend */}
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: '6px'
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Role Legend
            </div>
            {[
              { badge: <span className="badge badge-host"><Crown size={9}/>Host</span>, desc: 'Full control, roles, remove' },
              { badge: <span className="badge badge-moderator"><Shield size={9}/>Mod</span>, desc: 'Playback + approves requests' },
              { badge: <span className="badge badge-participant"><UserIcon size={9}/>Viewer</span>, desc: 'Watch; asks for changes' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.badge}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
